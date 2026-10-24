/**
 * O dado real que a tela de Automações vai mostrar, num arquivo só.
 *
 * Serve para desenhar a tela fora do app, como manda `docs/agents/telas.md`:
 * carrossel montado com 36 promoções de verdade, tabela com item de verdade,
 * e o nosso piso ao lado do que o canal pede.
 *
 * Varre a promoção inteira (o canal pagina de 50 em 50 por `search_after`,
 * com cursor que expira em 5 minutos — por isso a varredura é de uma vez só,
 * aqui no servidor, e não entre cliques do usuário).
 *
 * Uso: node scripts/local/dados-automacoes.mjs [--max 400]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const raiz = fileURLToPath(new URL("../../", import.meta.url));
for (const l of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const MAX = Number(process.argv[process.argv.indexOf("--max") + 1]) || 400;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const API = "https://api.mercadolibre.com";
const nm = (s) => String(s ?? "").trim().toUpperCase();

async function token(integ) {
  const { data: bruto } = await sb.rpc("integracao_segredo_ler", { p_ref: integ.credencial_ref });
  const s = bruto ? JSON.parse(bruto) : null;
  if (!s?.refresh_token) return null;
  if (s.access_token && s.expira_em && new Date(s.expira_em).getTime() > Date.now() + 60_000) return s.access_token;
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: process.env.MELI_APP_ID, client_secret: process.env.MELI_CLIENT_SECRET, refresh_token: s.refresh_token }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  await sb.rpc("integracao_segredo_gravar", { p_ref: integ.credencial_ref, p_nome: `integracao_${integ.id}`, p_segredo: JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expira_em: new Date(Date.now() + j.expires_in * 1000).toISOString() }) });
  return j.access_token;
}
const get = async (caminho, tk) => {
  const r = await fetch(API + caminho, { headers: { authorization: `Bearer ${tk}`, accept: "application/json" } });
  if (!r.ok) return null;
  return r.json();
};

const pag = async (montar) => {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await montar().range(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};

const { data: integs } = await sb.from("integracoes").select("id,operacao_id,conta_canal_id,credencial_ref").eq("provedor", "mercado_livre").not("conta_canal_id", "is", null);
const { data: contas } = await sb.from("contas_canal").select("id,nome,identificador,operacao_id");
const { data: ops } = await sb.from("operacoes").select("id,nome");

/* ── O nosso lado: anúncio, tipo e piso da Fórmula base ── */
const anuncios = await pag(() => sb.from("anuncios").select("codigo_externo,sku_canal,titulo,status,estoque,preco_atual,conta_canal_id,operacao_id,tipo,foto"));
const itensBase = await pag(() => sb.from("formula_base_itens").select("operacao_id,mlb,tipo_anuncio,vigente_de"));
const precosBase = await pag(() => sb.from("formula_base_precos").select("operacao_id,chave_tipo,chave,comissao,preco,vigente_de"));

const vigPorOp = new Map();
for (const p of precosBase) {
  const atual = vigPorOp.get(p.operacao_id);
  if (!atual || String(p.vigente_de) > atual) vigPorOp.set(p.operacao_id, String(p.vigente_de));
}
const tabela = new Map(); // operacao|tipo|chave -> {comissao: preco}
for (const p of precosBase) {
  if (String(p.vigente_de) !== vigPorOp.get(p.operacao_id)) continue;
  const k = `${p.operacao_id}|${p.chave_tipo}|${nm(p.chave)}`;
  const g = tabela.get(k) ?? {};
  g[Math.round(Number(p.comissao) * 1000) / 1000] = Number(p.preco);
  tabela.set(k, g);
}
const tipoBase = new Map(itensBase.map((i) => [`${i.operacao_id}|${nm(i.mlb)}`, i.tipo_anuncio]));
const porMlb = new Map(anuncios.map((a) => [nm(a.codigo_externo), a]));

/** A comissão cheia do anúncio: 16,5% no premium, 11,5% no clássico. */
function comissaoCheia(mlb) {
  const a = porMlb.get(nm(mlb));
  if (!a) return null;
  const tipo = tipoBase.get(`${a.operacao_id}|${nm(mlb)}`) ?? a.tipo ?? "classico";
  return String(tipo).toLowerCase().startsWith("prem") ? 0.165 : 0.115;
}
const tabelaDo = (mlb) => {
  const a = porMlb.get(nm(mlb));
  if (!a) return null;
  return tabela.get(`${a.operacao_id}|mlb|${nm(mlb)}`) ?? tabela.get(`${a.operacao_id}|sku|${nm(a.sku_canal)}`) ?? null;
};
/** O piso do anúncio na comissão cheia. */
function piso(mlb) {
  const c = comissaoCheia(mlb);
  return c == null ? null : tabelaDo(mlb)?.[c] ?? null;
}
/**
 * O piso quando o CANAL entra com parte.
 *
 * Num pré-acordo com 9 pontos de rebate, a comissão efetiva não é 16,5%:
 * é 7,5%, e o preço certo é o daquela faixa. Comparar com o piso cheio
 * marcaria o pré-acordo inteiro como abaixo do piso — que foi exatamente
 * o que a primeira versão desta tela fez, com as 96 linhas em vermelho.
 *
 * A faixa cai de 1 em 1 ponto, com meio ponto de deslocamento, então a
 * mais próxima é o que se busca.
 */
function pisoComRebate(mlb, meliPct) {
  const cheia = comissaoCheia(mlb);
  const t = tabelaDo(mlb);
  if (cheia == null || !t) return null;
  if (!meliPct) return t[cheia] ?? null;
  const alvo = cheia - Number(meliPct) / 100;
  let melhor = null;
  for (const b of Object.keys(t).map(Number)) {
    if (melhor == null || Math.abs(b - alvo) < Math.abs(melhor - alvo)) melhor = b;
  }
  return melhor == null ? null : t[melhor];
}
/** Em que faixa de comissão cai um preço — null = fora da tabela. */
function faixa(mlb, preco) {
  const a = porMlb.get(nm(mlb));
  if (!a || !preco) return null;
  const t = tabela.get(`${a.operacao_id}|mlb|${nm(mlb)}`) ?? tabela.get(`${a.operacao_id}|sku|${nm(a.sku_canal)}`);
  if (!t) return null;
  let f = null;
  for (const b of Object.keys(t).map(Number).sort((x, y) => x - y)) if (preco >= t[b] - 0.01) f = b;
  return f;
}

/* As faixas de comissão da Fórmula base, uma vez só: 4,5% a 20,5%. */
const BANDAS = [...new Set(precosBase.map((p) => Math.round(Number(p.comissao) * 1000) / 1000))].sort((a, b) => a - b);
const saida = { bandas: BANDAS, geradoEm: new Date().toISOString(), contas: [], promocoes: [] };
for (const integ of integs) {
  const conta = contas.find((c) => c.id === integ.conta_canal_id);
  const op = ops.find((o) => o.id === integ.operacao_id);
  const nomeConta = conta?.nome ?? integ.conta_canal_id;
  const tk = await token(integ);
  if (!tk) { console.log(`${nomeConta}: sem token`); continue; }
  let vendedor = conta?.identificador ?? (await get("/users/me", tk))?.id;
  if (!vendedor) continue;

  saida.contas.push({ id: integ.conta_canal_id, nome: nomeConta, operacao: integ.operacao_id, operacaoNome: op?.nome ?? "", vendedor: String(vendedor) });

  const r = await get(`/seller-promotions/users/${vendedor}?app_version=v2`, tk);
  for (const p of r?.results ?? []) {
    const itens = [];
    let cursor = null;
    for (let volta = 0; volta < 30 && itens.length < MAX; volta++) {
      const q = `promotion_type=${p.type}&app_version=v2&limit=50${cursor ? `&search_after=${encodeURIComponent(cursor)}` : ""}`;
      const pg = await get(`/seller-promotions/promotions/${p.id}/items?${q}`, tk);
      if (!pg?.results?.length) break;
      itens.push(...pg.results);
      cursor = pg.paging?.searchAfter ?? pg.paging?.search_after ?? null;
      if (!cursor) break;
    }
    const linhas = itens.map((it) => {
      const mlb = it.id;
      const a = porMlb.get(nm(mlb));
      const pr = Number(it.price) || null;
      const ps = piso(mlb);
      return {
        mlb,
        sku: a?.sku_canal ?? null,
        titulo: a?.titulo ?? null,
        foto: a?.foto ?? null,
        statusAnuncio: a?.status ?? null,
        estoque: a?.estoque ?? null,
        status: it.status,
        precoCanal: pr,
        precoCheio: Number(it.original_price) || null,
        minimoCanal: it.min_discounted_price ?? null,
        maximoCanal: it.max_discounted_price ?? null,
        sugerido: it.suggested_discounted_price ?? null,
        meliPct: it.meli_percentage ?? null,
        sellerPct: it.seller_percentage ?? null,
        ofertaId: it.offer_id ?? it.ref_id ?? null,
        estoqueCampanha: it.stock ?? null,
        subTipo: it.sub_type ?? null,
        percentualFixo: it.fixed_percentage ?? null,
        inicio: it.start_date ?? null,
        fim: it.end_date ?? null,
        piso: ps,
        pisoComRebate: pisoComRebate(mlb, it.meli_percentage),
        comissaoCheia: comissaoCheia(mlb),
        faixaDoPreco: faixa(mlb, pr ?? it.suggested_discounted_price),
        temTabela: tabelaDo(mlb) != null,
        /* A linha inteira da Fórmula base, alinhada com `bandas` no topo.
           Vai junto porque a tela recalcula a faixa a cada mexida na folga:
           sem ela, a coluna que decide ficaria presa ao preço do canal. */
        precos: BANDAS.map((b) => tabelaDo(mlb)?.[b] ?? null),
      };
    });
    saida.promocoes.push({
      id: p.id, tipo: p.type, subTipo: p.sub_type ?? null, nome: p.name ?? null, status: p.status,
      inicio: p.start_date ?? null, fim: p.finish_date ?? null, prazo: p.deadline_date ?? null,
      beneficios: p.benefits ?? null,
      conta: nomeConta, contaId: integ.conta_canal_id, operacao: integ.operacao_id,
      itens: linhas,
      truncado: linhas.length >= MAX,
    });
    console.log(`${nomeConta.padEnd(28)} ${String(p.id).padEnd(16)} ${String(p.type).padEnd(22)} ${String(linhas.length).padStart(4)} itens`);
  }
}

writeFileSync("scratchpad/automacoes.json", JSON.stringify(saida, null, 2));
const n = saida.promocoes.reduce((s, p) => s + p.itens.length, 0);
console.log(`\n${saida.promocoes.length} promoções · ${n} itens · scratchpad/automacoes.json`);
