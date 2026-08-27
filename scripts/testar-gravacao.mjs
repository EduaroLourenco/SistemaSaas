/**
 * Testa a gravação de promoções contra o banco de verdade, e desfaz no
 * fim.
 *
 * Existe porque "erro desconhecido" não dava onde olhar. Rodar aqui o
 * mesmo caminho da rota mostra a mensagem do Postgres inteira — com
 * código e dica — em vez de esperar outra tentativa do usuário.
 *
 * Apaga o que criou ao terminar: um processamento de teste no histórico
 * apareceria como decisão real na tela.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { processarPlanilha } from "./lib/processar.mjs";

const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_KEY;
const OPERACAO = "00000000-0000-0000-0000-000000000101";

const h = {
  apikey: CHAVE,
  authorization: `Bearer ${CHAVE}`,
  "content-type": "application/json",
};

async function api(caminho, opc = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1${caminho}`, {
    ...opc,
    headers: { ...h, ...(opc.headers ?? {}) },
  });
  const txt = await r.text();
  if (!r.ok) {
    let detalhe = txt;
    try {
      const j = JSON.parse(txt);
      detalhe = [j.message, j.code && `(código ${j.code})`, j.details, j.hint]
        .filter(Boolean)
        .join(" ");
    } catch {}
    throw new Error(`${r.status} em ${caminho}\n     ${detalhe}`);
  }
  return txt ? JSON.parse(txt) : null;
}

async function lerTudo(caminho) {
  const t = [];
  for (let o = 0; ; o += 1000) {
    const j = caminho.includes("?") ? "&" : "?";
    const p = await api(`${caminho}${j}limit=1000&offset=${o}`);
    t.push(...p);
    if (p.length < 1000) return t;
  }
}

/* ── Fórmula base ─────────────────────────────────────────── */

const [itensBase, precos] = await Promise.all([
  lerTudo("/formula_base_itens?select=mlb,tipo_anuncio,comissao_padrao"),
  lerTudo("/formula_base_precos?select=chave_tipo,chave,comissao,preco"),
]);

const baseMlb = new Map();
for (const i of itensBase) {
  baseMlb.set(String(i.mlb), {
    tipo: i.tipo_anuncio === "premium" ? "Premium" : "Clássico",
    padrao: Number(i.comissao_padrao),
  });
}
const precosSKU = new Map();
const precosMLB = new Map();
for (const p of precos) {
  const alvo = p.chave_tipo === "mlb" ? precosMLB : precosSKU;
  const linha = alvo.get(String(p.chave)) ?? {};
  linha[Math.round(Number(p.comissao) * 1000) / 1000] = Number(p.preco);
  alvo.set(String(p.chave), linha);
}
const formulaData = { baseMlb, precosSKU, precosMLB };

/* ── Processa ─────────────────────────────────────────────── */

const linhas = [];
for (const caminho of process.argv.slice(2)) {
  const r = await processarPlanilha(
    readFileSync(caminho),
    basename(caminho),
    formulaData,
    0
  );
  linhas.push(...r.linhas);
}
console.log(`${linhas.length} linhas processadas\n`);

/* ── Grava, etapa por etapa ───────────────────────────────── */

let procId = null;
const campanhasCriadas = [];

async function etapa(nome, fn) {
  process.stdout.write(`  ${nome} ... `);
  try {
    const r = await fn();
    console.log("OK");
    return r;
  } catch (e) {
    console.log("FALHOU");
    console.log(`     ${e.message}`);
    throw e;
  }
}

try {
  const aprovados = linhas.filter((l) => l.aprovado).length;

  const [proc] = await etapa("registrar processamento", () =>
    api("/processamentos_promocao", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        operacao_id: OPERACAO,
        itens_lidos: linhas.length,
        itens_aprovados: aprovados,
        itens_reprovados: linhas.length - aprovados,
        desconto_extra: 0,
        arquivos: process.argv.slice(2).map((c) => basename(c)),
        status: "concluida",
      }),
    })
  );
  procId = proc.id;

  const [canal] = await etapa("achar o canal", () =>
    api("/canais?select=id&nome=eq.Mercado%20Livre")
  );

  const nomes = [...new Set(linhas.map((l) => l.campanha).filter(Boolean))];
  const porNome = new Map();
  await etapa(`criar ${nomes.length} campanha(s)`, async () => {
    for (const nome of nomes) {
      const achadas = await api(
        `/campanhas?select=id&operacao_id=eq.${OPERACAO}&nome=eq.${encodeURIComponent(nome)}`
      );
      if (achadas.length) {
        porNome.set(nome, achadas[0].id);
        continue;
      }
      const [nova] = await api("/campanhas", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          operacao_id: OPERACAO,
          canal_id: canal.id,
          nome,
          tem_reducao_tarifa: linhas.some(
            (l) => l.campanha === nome && l.tipoCampanha === "Com Redução"
          ),
          ativa: true,
        }),
      });
      porNome.set(nome, nova.id);
      campanhasCriadas.push(nova.id);
    }
  });

  const codigos = [...new Set(linhas.map((l) => l.mlb.toUpperCase()))];
  const porCodigo = new Map();
  await etapa(`buscar ${codigos.length} anúncios`, async () => {
    for (let i = 0; i < codigos.length; i += 200) {
      const lista = codigos.slice(i, i + 200).map((c) => `"${c}"`).join(",");
      for (const a of await api(
        `/anuncios?select=id,codigo_externo&codigo_externo=in.(${lista})`
      )) {
        porCodigo.set(a.codigo_externo.toUpperCase(), a.id);
      }
    }
  });

  const historico = linhas.map((l) => ({
    operacao_id: OPERACAO,
    processamento_id: procId,
    anuncio_id: porCodigo.get(l.mlb.toUpperCase()) ?? null,
    mlb: l.mlb,
    sku: l.sku || null,
    campanha: l.campanha || "—",
    tipo_anuncio: /premium/i.test(l.tipoAnuncio) ? "premium" : "classico",
    tipo_campanha: l.tipoCampanha,
    preco_tabela: l.precoTabela || null,
    preco_oferta: l.precoOferta,
    preco_piso: l.precoPiso || null,
    preco_com_extra: l.precoComExtra,
    reducao_tarifa: l.reducaoTarifa,
    status_aprovacao: l.aprovado ? "aprovado" : "reprovado",
    motivo: l.motivo || null,
    tags: l.tags,
  }));

  await etapa(`gravar ${historico.length} linhas de histórico`, async () => {
    for (let i = 0; i < historico.length; i += 400) {
      await api("/historico_promocoes", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(historico.slice(i, i + 400)),
      });
    }
  });

  // Mesma escolha da aplicação: uma decisão por (campanha, anúncio).
  const escolhidos = new Map();
  for (const l of linhas) {
    const anuncioId = porCodigo.get(l.mlb.toUpperCase());
    const campanhaId = porNome.get(l.campanha);
    if (!anuncioId || !campanhaId) continue;
    const chave = `${campanhaId}|${anuncioId}`;
    const ja = escolhidos.get(chave);
    if (ja) {
      const melhora = l.aprovado && !ja.aprovado;
      const igual = l.aprovado === ja.aprovado;
      const maisAlta = (l.precoOferta ?? 0) > (ja.precoOferta ?? 0);
      if (!melhora && !(igual && maisAlta)) continue;
    }
    escolhidos.set(chave, l);
  }

  const itens = [...escolhidos.entries()]
    .map(([chave, l]) => ({
      _chave: chave,
      operacao_id: OPERACAO,
      campanha_id: chave.split("|")[0],
      anuncio_id: chave.split("|")[1],
      preco_tabela: l.precoTabela || null,
      preco_oferta: l.precoOferta,
      preco_sugerido: l.precoPropostoML,
      decisao: l.aprovado ? "participar" : "nao_participar",
      decidido_em: new Date().toISOString(),
      motivo: l.motivo || null,
    }));

  await etapa(`gravar ${itens.length} itens de campanha`, async () => {
    for (let i = 0; i < itens.length; i += 400) {
      await api("/campanha_itens?on_conflict=campanha_id,anuncio_id", {
        method: "POST",
        headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
        body: JSON.stringify(
          itens.slice(i, i + 400).map(({ _chave, ...resto }) => resto)
        ),
      });
    }
  });

  console.log("\nGRAVAÇÃO COMPLETA — o caminho funciona.");
} finally {
  if (procId) {
    process.stdout.write("\nlimpando o teste ... ");
    await api(`/historico_promocoes?processamento_id=eq.${procId}`, { method: "DELETE" });
    for (const id of campanhasCriadas) {
      await api(`/campanha_itens?campanha_id=eq.${id}`, { method: "DELETE" });
      await api(`/campanhas?id=eq.${id}`, { method: "DELETE" });
    }
    await api(`/processamentos_promocao?id=eq.${procId}`, { method: "DELETE" });
    console.log("feito");
  }
}
