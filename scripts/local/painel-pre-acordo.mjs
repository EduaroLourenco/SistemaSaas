/**
 * Uma aba com tudo sobre o pré-acordo: acordado, praticado, configurado,
 * o que o Meli respondeu e até onde dá para baixar no painel.
 *
 * Junta cinco fontes que antes eram cinco planilhas:
 *
 *   1. a aba de pré-acordo do Controle — os três preços combinados e a
 *      RESPOSTA DO MELI, que é o "por que não subiu";
 *   2. `/items/{id}/prices` — as regras de preço configuradas, com janela,
 *      que é o que diz se a promoção está ativa, programada ou não existe;
 *   3. o multiget de `/items` — preço de vitrine, preço cheio e estoque;
 *   4. o banco — receita, conta e situação do anúncio;
 *   5. a análise das campanhas com redução — o menor preço que a tabela
 *      ainda aprova, para a segunda comparação.
 *
 * Por que uma aba só: cada arquivo separado obrigava a cruzar MLB na mão, e
 * é no cruzamento que a decisão aparece — "não subiu porque o Meli pôs numa
 * campanha massiva" só se vê com as duas colunas lado a lado.
 *
 * Uso:
 *   node scripts/local/painel-pre-acordo.mjs "<Controle.xlsx>" "<aba>"
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const req = createRequire(RAIZ + "/");
const ExcelJS = req("exceljs");
const { createClient } = req("@supabase/supabase-js");

for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) {
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ARQUIVO = process.argv[2];
const ABA = process.argv[3];
if (!ARQUIVO || !ABA) {
  console.log('Uso: node scripts/local/painel-pre-acordo.mjs "<Controle.xlsx>" "<aba>"');
  process.exit(1);
}

/** Onde cada CLI dono guarda o access token já renovado. */
const TOKENS = [
  "C:/Users/dudu4/OneDrive/Desktop/Meli+/.meli/token.json",
  "C:/Users/dudu4/OneDrive/Desktop/apis/Mercado Livre Principal/.meli/token.json",
];
/** Saídas da análise de campanhas com redução, para o melhor preço. */
const ANALISES_REDUCAO = [
  "C:/Users/dudu4/Downloads/Com-reducao-04-10-quanto-baixar.xlsx",
  "C:/Users/dudu4/Downloads/Com-reducao-2a-conta-decisao.xlsx",
];

const txt = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    return String(v.result ?? v.text ?? v.richText?.map((r) => r.text).join("") ?? "");
  }
  return String(v);
};
const num = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const s = txt(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const x = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(x) ? x : null;
};
const dia = (ms) =>
  ms == null ? "" : new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

const AGORA = Date.now();

/* ══ 1. O acordo, com a resposta do Meli ═══════════════════ */

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA);
if (!ws) {
  console.log(`Aba "${ABA}" não existe. Abas: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  process.exit(1);
}

/*
 * A tabela de preço por rebate, da aba irmã.
 *
 * O rebate É a redução da comissão: Clássico 11,5% com rebate de 7% faz o
 * Meli cobrar 4,5%. A coluna "Rebate de 7%" já tem esses 4,5% dentro, e por
 * isso é mais barata que a de 5%. Não são duas contas, é a mesma.
 *
 * Serve para conferir se o preço mínimo que entrou no acordo é o que a
 * tabela do rebate PEDIDO permite — e em outubro quinze linhas Clássico com
 * rebate de 7% vieram 11,1% acima, que é exatamente dividir a tabela por
 * 0,9.
 */
const tabelaRebate = new Map();
{
  const wr = wb.worksheets.find((w) => /rebate/i.test(w.name) && /pre[cç]/i.test(w.name));
  if (wr) {
    for (let r = 2; r <= wr.rowCount; r++) {
      const mlb = txt(wr.getCell(r, 1).value).trim();
      if (!/^MLB\d+/.test(mlb)) continue;
      tabelaRebate.set(mlb, { 5: num(wr.getCell(r, 6).value), 6: num(wr.getCell(r, 7).value), 7: num(wr.getCell(r, 8).value), 8: num(wr.getCell(r, 9).value) });
    }
    console.log(`tabela por rebate: ${tabelaRebate.size} MLBs (aba "${wr.name}")`);
  } else {
    console.log('aviso: não achei a aba "Preços por rebate" — as colunas de tabela sairão vazias');
  }
}

let cab = 0;
for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
  const linha = [];
  for (let c = 1; c <= ws.columnCount; c++) linha.push(txt(ws.getCell(r, c).value).trim().toUpperCase());
  if (linha.includes("SKU") && linha.includes("MLB")) { cab = r; break; }
}
if (!cab) { console.log("Não achei o cabeçalho (preciso de SKU e MLB)."); process.exit(1); }

/**
 * O que a resposta do Meli quer dizer, em categoria.
 *
 * O texto é digitado à mão e varia em caixa e acento ("INATIVO", "inativo",
 * "crível 602,23", "CRÍVEL 461.13"). Categorizar é o que torna a coluna
 * filtrável — e o valor do crível é a contraproposta do canal, que vale
 * comparar com o que se pediu.
 */
function lerRetorno(bruto) {
  const s = bruto.trim();
  if (!s) return { classe: "Sem resposta", crivel: null };
  const n = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  if (/crivel/.test(n)) {
    // "CRÍVEL 1923,67" e "CRÍVEL 461.13" — vírgula e ponto como decimal.
    const m = s.match(/([\d.]+,\d+|\d+\.\d+|\d+)\s*$/);
    return { classe: "Crível menor que o pedido", crivel: m ? num(m[1]) : null };
  }
  if (/campanha massiva/.test(n)) return { classe: "Meli pôs em campanha massiva", crivel: null };
  if (/campanha cadastrada/.test(n)) return { classe: "Cadastrada pelo Meli", crivel: null };
  if (/agd|aguard/.test(n)) return { classe: "Aguardando liberação do Meli", crivel: null };
  if (/margem negativa/.test(n)) return { classe: "Margem negativa (Meli)", crivel: null };
  if (/inativo/.test(n)) return { classe: "Anúncio inativo", crivel: null };
  if (/rebate menor/.test(n)) return { classe: "Subiu com rebate menor", crivel: null };
  return { classe: "Outro — ver texto", crivel: null };
}

/** A marca, do começo do título. Serve para filtrar linha de produto. */
function marcaDoTitulo(titulo) {
  const n = titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const m of ["boa forma", "prodormir", "proinove", "promixe", "prohotel", "probel"]) {
    if (n.includes(m)) return m.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "";
}

const itens = [];
for (let r = cab + 1; r <= ws.rowCount; r++) {
  const mlb = txt(ws.getCell(r, 2).value).trim().toUpperCase();
  if (!/^MLB\d+/.test(mlb)) continue;
  const nome = txt(ws.getCell(r, 3).value).trim();
  const retorno = txt(ws.getCell(r, 8).value).trim();
  const lido = lerRetorno(retorno);
  itens.push({
    sku: txt(ws.getCell(r, 1).value).trim(),
    mlb,
    nome,
    marca: marcaDoTitulo(nome),
    tipo: txt(ws.getCell(r, 4).value).trim(),
    acMes: num(ws.getCell(r, 7).value),
    acRelampago: num(ws.getCell(r, 11).value),
    acOfertaDia: num(ws.getCell(r, 15).value),
    /*
     * O rebate é POR ANÚNCIO, não por patamar. Em outubro: 32 linhas a 5%,
     * 28 a 7%, 2 a 6%. A primeira versão disto rotulava as colunas como
     * "Mês (5%)" / "Oferta dia (6%)" / "Relâmpago (7%)", como se o patamar
     * definisse o rebate, e mentia em 30 das 63 linhas.
     *
     * (No bloco da oferta do dia o cabeçalho da planilha troca os nomes: a
     * coluna 16 traz o valor em R$ e a 17 a porcentagem.)
     */
    rebMes: num(ws.getCell(r, 6).value),
    rebRelampago: num(ws.getCell(r, 12).value),
    rebOfertaDia: num(ws.getCell(r, 17).value),
    retornoMeli: retorno,
    retornoClasse: lido.classe,
    crivelMeli: lido.crivel,
    retornoDia: txt(ws.getCell(r, 18).value).trim(),
    datas: [19, 20, 21, 22, 23]
      .map((c) => {
        const v = ws.getCell(r, c).value;
        const d = v instanceof Date ? v : v ? new Date(txt(v)) : null;
        return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null;
      })
      .filter(Boolean)
      .join(", "),
  });
}
console.log(`${ABA}: ${itens.length} anúncios`);

/* ══ 2. Banco: conta, receita, situação ════════════════════ */

const todas = async (t, c) => {
  const s = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await sb.from(t).select(c).range(d, d + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    s.push(...data);
    if (data.length < 1000) break;
  }
  return s;
};

const [anuncios, contas, pedidos, pedidoItens] = await Promise.all([
  todas("anuncios", "codigo_externo,status,conta_canal_id,estoque,preco_atual,url"),
  todas("contas_canal", "id,nome,identificador"),
  todas("pedidos", "id,data,cancelado"),
  todas("pedido_itens", "codigo_externo,pedido_id,total,quantidade"),
]);

const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
const vendedorDaConta = new Map(
  contas.filter((c) => c.identificador).map((c) => [c.id, String(c.identificador)])
);
const porMlb = new Map(anuncios.map((a) => [String(a.codigo_externo).toUpperCase(), a]));

const dataPedido = new Map(pedidos.filter((p) => !p.cancelado).map((p) => [p.id, p.data]));
const corte90 = new Date(AGORA - 90 * 86_400_000).toISOString().slice(0, 10);
const receita = new Map();
for (const i of pedidoItens) {
  const d = dataPedido.get(i.pedido_id);
  if (!d) continue;
  const k = String(i.codigo_externo).toUpperCase();
  const a = receita.get(k) ?? { total: 0, d90: 0, un90: 0 };
  a.total += Number(i.total ?? 0);
  if (d >= corte90) { a.d90 += Number(i.total ?? 0); a.un90 += Number(i.quantidade ?? 0); }
  receita.set(k, a);
}

/* ══ 3. O melhor preço das análises de redução ═════════════ */

const melhorNoPainel = new Map();
for (const arq of ANALISES_REDUCAO) {
  if (!fs.existsSync(arq)) continue;
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(arq);
  const s = w.worksheets[0];
  const h = [];
  for (let c = 1; c <= s.columnCount; c++) h.push(txt(s.getCell(4, c).value).trim());
  const iMlb = h.indexOf("MLB") + 1;
  const iMenor = h.indexOf("Melhor preço possível") + 1;
  const iSit = h.indexOf("Situação do preço") + 1;
  if (!iMlb || !iMenor) continue;
  for (let r = 5; r <= s.rowCount; r++) {
    const mlb = txt(s.getCell(r, iMlb).value).trim().toUpperCase();
    const menor = num(s.getCell(r, iMenor).value);
    const sit = iSit ? txt(s.getCell(r, iSit).value).trim() : "";
    if (!mlb || menor == null || sit !== "Dá para baixar") continue;
    const atual = melhorNoPainel.get(mlb);
    if (atual == null || menor < atual) melhorNoPainel.set(mlb, menor);
  }
}
console.log(`melhor preço no painel, das análises de redução: ${melhorNoPainel.size} anúncios`);

/* ══ 4. API: regras de preço, vitrine e estoque ════════════ */

const H = new Map();
for (const caminho of TOKENS) {
  if (!fs.existsSync(caminho)) continue;
  const t = JSON.parse(fs.readFileSync(caminho, "utf8").replace(/^\uFEFF/, ""));
  if (Date.parse(t.createdAt ?? 0) + (t.expires_in ?? 21600) * 1000 < AGORA + 60_000) {
    console.log(`\u2717 token vencido em ${caminho}`);
    console.log("  Rode o CLI daquela pasta primeiro: node ./src/cli.mjs me");
    process.exit(1);
  }
  H.set(String(t.user_id), { Authorization: "Bearer " + t.access_token, Accept: "application/json" });
}
if (!H.size) { console.log("\u2717 nenhum token encontrado."); process.exit(1); }

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ordemToken = (mlb) => {
  const conta = porMlb.get(mlb)?.conta_canal_id;
  const dono = conta ? vendedorDaConta.get(conta) : null;
  const dele = dono ? H.get(dono) : null;
  return dele ? [dele, ...[...H.values()].filter((h) => h !== dele)] : [...H.values()];
};

/* 4a. Vitrine e estoque, em multiget por conta. */
const vivo = new Map();
const grupos = new Map();
for (const it of itens) {
  const conta = porMlb.get(it.mlb)?.conta_canal_id;
  const dono = (conta ? vendedorDaConta.get(conta) : null) ?? "?";
  if (!grupos.has(dono)) grupos.set(dono, []);
  grupos.get(dono).push(it.mlb);
}
for (const [dono, lista] of grupos) {
  const tentar = H.has(dono) ? [H.get(dono)] : [...H.values()];
  const ids = [...new Set(lista)];
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    for (const h of tentar) {
      const r = await fetch(
        `https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,price,original_price,status,available_quantity`,
        { headers: h }
      );
      if (!r.ok) continue;
      for (const item of await r.json()) {
        if (item.code === 200 && item.body?.id) vivo.set(String(item.body.id).toUpperCase(), item.body);
      }
      await espera(300);
    }
  }
}
console.log(`vitrine e estoque: ${vivo.size} de ${new Set(itens.map((i) => i.mlb)).size}`);

/* 4b. Regras de preço, uma chamada por anúncio. */
let lidas = 0;
for (const it of itens) {
  it.regras = null;
  for (const h of ordemToken(it.mlb)) {
    const r = await fetch(`https://api.mercadolibre.com/items/${it.mlb}/prices`, { headers: h });
    if (r.ok) { it.regras = (await r.json()).prices ?? []; lidas++; break; }
    await espera(180);
  }
  await espera(240);
}
console.log(`regras de preço: ${lidas} de ${itens.length}`);

/* ══ 5. Classificar cada patamar pela janela ═══════════════ */

function tipoDeJanela(horas, inicio, mesAcordo) {
  if (horas == null) return "sem data";
  if (horas <= 6) return "rel";
  if (horas <= 26) return "dia";
  if (horas < 21 * 24) return "outra";
  if (mesAcordo == null || inicio == null) return "mes";
  const d = new Date(inicio);
  return d.getUTCFullYear() * 12 + d.getUTCMonth() === mesAcordo ? "mes" : "outra";
}

for (const it of itens) {
  for (const r of it.regras ?? []) {
    r.ini = r.conditions?.start_time ? Date.parse(r.conditions.start_time) : null;
    r.fim = r.conditions?.end_time ? Date.parse(r.conditions.end_time) : null;
    r.horas = r.ini != null && r.fim != null ? (r.fim - r.ini) / 3600000 : null;
  }
}

/* O mês do acordo sai das próprias regras longas, não do nome da aba. */
const votos = new Map();
for (const it of itens) {
  for (const r of it.regras ?? []) {
    if (r.type === "standard" || r.horas == null || r.horas < 21 * 24 || r.ini == null) continue;
    const d = new Date(r.ini);
    if (d.getUTCDate() > 3) continue;
    const k = d.getUTCFullYear() * 12 + d.getUTCMonth();
    votos.set(k, (votos.get(k) ?? 0) + 1);
  }
}
let MES = null;
for (const [k, v] of votos) if (MES == null || v > votos.get(MES)) MES = k;
console.log(
  "mês do acordo: " +
    (MES == null ? "?" : new Date(Date.UTC(Math.floor(MES / 12), MES % 12, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }))
);

const PERTO = 0.75;
const QUASE = 0.02;

function avaliar(alvo, regras, qual) {
  if (alvo == null) return { estado: "", preco: null, dif: null, vigencia: "" };
  const minhas = (regras ?? []).filter((p) => p.type !== "standard" && p.janela === qual);
  if (!minhas.length) {
    return {
      estado: (regras ?? []).some((p) => p.type !== "standard") ? "Não criada" : "Nenhuma promoção",
      preco: null, dif: null, vigencia: "",
    };
  }
  const bate = minhas.filter((p) => Math.abs(p.amount - alvo) <= PERTO);
  const esc = bate.length ? (bate.find((p) => p.vigente) ?? bate.find((p) => p.futura) ?? bate[0]) : null;
  if (esc) {
    return {
      estado: esc.vigente ? "Ativa" : esc.futura ? "Programada" : "Encerrada",
      preco: esc.amount, dif: 0, vigencia: `${dia(esc.ini)} a ${dia(esc.fim)}`,
    };
  }
  const perto = minhas.reduce((m, p) => (m == null || Math.abs(p.amount - alvo) < Math.abs(m.amount - alvo) ? p : m), null);
  const erro = Math.abs(perto.amount - alvo) / alvo;
  return {
    estado: erro <= QUASE ? "Preço quase certo" : "Preço diferente",
    preco: perto.amount, dif: perto.amount - alvo, vigencia: `${dia(perto.ini)} a ${dia(perto.fim)}`,
  };
}

const ROTULO = { mes: "mês", dia: "1 dia", rel: "relâmp", outra: "outra campanha", "sem data": "sem data" };

for (const it of itens) {
  for (const r of it.regras ?? []) {
    r.janela = r.type === "standard" ? "padrao" : tipoDeJanela(r.horas, r.ini, MES);
    r.vigente = (!r.ini || AGORA >= r.ini) && (!r.fim || AGORA <= r.fim);
    r.futura = r.ini != null && AGORA < r.ini;
  }

  it.mes = avaliar(it.acMes, it.regras, "mes");
  it.dia = avaliar(it.acOfertaDia, it.regras, "dia");
  it.rel = avaliar(it.acRelampago, it.regras, "rel");

  /* O acordo respeita a tabela do rebate que foi pedido? */
  it.rebMesTxt = it.rebMes != null ? `${Math.round(it.rebMes * 100)}%` : "";
  const tb = tabelaRebate.get(it.mlb);
  it.tabelaDoRebate = tb && it.rebMes != null ? (tb[Math.round(it.rebMes * 100)] ?? null) : null;
  it.acordoMenosTabela = it.tabelaDoRebate != null && it.acMes != null ? it.acMes - it.tabelaDoRebate : null;
  it.acordoMenosTabelaPct =
    it.acordoMenosTabela != null && it.tabelaDoRebate ? it.acordoMenosTabela / it.tabelaDoRebate : null;
  it.acordoBateTabela =
    it.acordoMenosTabelaPct == null
      ? ""
      : Math.abs(it.acordoMenosTabelaPct) < 0.005
        ? "Bate"
        : it.acordoMenosTabelaPct > 0
          ? "ACORDO ACIMA DA TABELA"
          : "Acordo abaixo da tabela";

  const v = vivo.get(it.mlb);
  const b = porMlb.get(it.mlb);
  it.vitrine = v?.price != null ? Number(v.price) : b?.preco_atual != null ? Number(b.preco_atual) : null;
  it.cheio = v?.original_price != null ? Number(v.original_price) : null;
  it.estoque = v?.available_quantity ?? b?.estoque ?? null;
  it.situacao = v?.status ?? b?.status ?? "não encontrado";
  it.conta = b ? (nomeConta.get(b.conta_canal_id) ?? "") : "";
  it.emOferta = it.cheio != null && it.vitrine != null && it.cheio > it.vitrine + 0.01 ? "Sim" : "Não";

  const r = receita.get(it.mlb);
  it.receita90 = r?.d90 ?? 0;
  it.receitaTotal = r?.total ?? 0;
  it.unidades90 = r?.un90 ?? 0;

  /* Vitrine contra o acordo — "está muito distante?" */
  it.difVitrine = it.vitrine != null && it.acMes != null ? it.vitrine - it.acMes : null;
  it.difVitrinePct = it.difVitrine != null && it.acMes ? it.difVitrine / it.acMes : null;

  /* Segunda comparação: o menor preço que a tabela aprova no painel. */
  it.melhorPainel = melhorNoPainel.get(it.mlb) ?? null;
  it.difPainelAcordo = it.melhorPainel != null && it.acMes != null ? it.melhorPainel - it.acMes : null;
  it.difPainelVitrine = it.melhorPainel != null && it.vitrine != null ? it.melhorPainel - it.vitrine : null;

  it.todas = (it.regras ?? [])
    .filter((p) => p.type !== "standard")
    .map((p) => `${p.amount.toFixed(2)} [${ROTULO[p.janela] ?? p.janela}] ${p.futura ? "prog" : !p.vigente ? "fim" : "ativa"} ${dia(p.ini)}-${dia(p.fim)}`)
    .join("   ·   ");

  /*
   * A linha de ação, que é o ponto da planilha: junta o que o canal
   * respondeu com o que de fato está configurado. "Não criada" com resposta
   * "campanha massiva" não é pendência — é decisão do canal.
   */
  const pedidos3 = [it.acMes, it.acOfertaDia, it.acRelampago].filter((x) => x != null).length;
  const prontos = [it.mes, it.dia, it.rel].filter((x) => x.estado === "Ativa" || x.estado === "Programada").length;

  /*
   * O crível muda a leitura de "está abaixo do acordo".
   *
   * O Meli contrapropõe um teto — o "crível" — e o Eduardo anota na própria
   * aba. Onde o configurado bate com esse crível, não há erro nenhum: foi
   * negociado e aceito. A primeira versão disto marcava 16 linhas como
   * URGENTE, e 15 eram preço negociado entre −0,6% e −1,9%; só uma estava
   * de fato furada. Gritar nas dezesseis esconde a única que importa.
   */
  const perto = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= Math.max(0.75, Math.abs(b) * tol);
  it.bateCrivel =
    it.crivelMeli != null && it.mes.preco != null
      ? perto(it.mes.preco, it.crivelMeli, 0.01) ? "Sim" : "Não"
      : "";

  /*
   * O corte é em 2% do acordo, não em centavos.
   *
   * Com meio real de tolerância, quinze linhas entre −0,6% e −1,9% viravam
   * alarme — e nessa faixa a diferença é arredondamento do canal, não
   * margem perdida. A que importa estava a −6,1%, e ficava no meio das
   * outras. Dois por cento separa ruído de decisão.
   */
  it.mesDifPct = it.mes.dif != null && it.acMes ? it.mes.dif / it.acMes : null;
  const abaixoMaterial = it.mesDifPct != null && it.mesDifPct < -0.02;
  const abaixoLeve = it.mesDifPct != null && it.mesDifPct < -0.002 && !abaixoMaterial;

  if (it.situacao !== "active") it.acao = "Anúncio " + (it.situacao === "paused" ? "pausado" : it.situacao);
  else if (it.mes.estado === "Ativa" && prontos === pedidos3) it.acao = "Tudo certo";
  else if (abaixoMaterial && it.bateCrivel === "Sim") it.acao = "Negociado abaixo — é o crível do Meli";
  else if (abaixoMaterial) it.acao = "URGENTE: abaixo do acordo, sem crível que explique";
  else if (abaixoLeve) it.acao = "Levemente abaixo (arredondamento)";
  else if (it.mes.estado === "Preço diferente") it.acao = "Corrigir o preço do mês";
  else if (it.retornoClasse === "Meli pôs em campanha massiva") it.acao = "Meli recusou — pôs em campanha massiva";
  else if (it.retornoClasse === "Crível menor que o pedido") it.acao = "Meli contrapropôs — ver crível";
  else if (it.retornoClasse === "Margem negativa (Meli)") it.acao = "Meli recusou — margem negativa";
  else if (it.retornoClasse === "Aguardando liberação do Meli") it.acao = "Aguardando o Meli";
  else if (it.mes.estado === "Ativa") it.acao = "Mês ok — falta oferta do dia/relâmpago";
  else if (it.mes.estado === "Nenhuma promoção") it.acao = "Cobrar: nada criado";
  else it.acao = "Cobrar: promoção do mês não criada";
}

/* Ordem: o que precisa de ação, e dentro disso por receita. */
const PESO = {
  "URGENTE: abaixo do acordo, sem crível que explique": 0,
  "Negociado abaixo — é o crível do Meli": 1,
  "Corrigir o preço do mês": 2,
  "Cobrar: nada criado": 2,
  "Cobrar: promoção do mês não criada": 3,
  "Meli contrapropôs — ver crível": 4,
  "Aguardando o Meli": 5,
  "Meli recusou — margem negativa": 6,
  "Meli recusou — pôs em campanha massiva": 7,
  "Mês ok — falta oferta do dia/relâmpago": 8,
  "Levemente abaixo (arredondamento)": 8.5,
  "Tudo certo": 9,
};
itens.sort((a, b) => (PESO[a.acao] ?? 10) - (PESO[b.acao] ?? 10) || b.receita90 - a.receita90);

const resumo = itens.reduce((m, i) => ((m[i.acao] = (m[i.acao] ?? 0) + 1), m), {});
console.log("\nação:");
for (const [k, v] of Object.entries(resumo).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

/* ══ 6. A planilha ════════════════════════════════════════ */

const TINTA = "FF1F2430";
const SUAVE = "FF6B7280";
const RISCO = "FFE5E7EB";

/* Uma cor por bloco, como pedido: a vista muda de assunto junto com a cor. */
const BLOCOS = {
  ident: { nome: "Anúncio", fundo: "FFF3F4F6" },
  acordo: { nome: "Pré-acordo combinado", fundo: "FFE0EAFB" },
  hoje: { nome: "Praticado hoje na vitrine", fundo: "FFDFF3E6" },
  config: { nome: "O que está configurado no Meli", fundo: "FFFDF0D5" },
  painel: { nome: "Até onde dá para baixar no painel", fundo: "FFEDE2F8" },
  acao: { nome: "Decisão", fundo: "FFF8E1E4" },
};

const COLS = [
  { h: "Ação", k: "acao", w: 34, b: "acao", forte: true },
  { h: "SKU", k: "sku", w: 11, b: "ident" },
  { h: "MLB", k: "mlb", w: 15, b: "ident" },
  { h: "Produto", k: "nome", w: 40, b: "ident" },
  { h: "Marca", k: "marca", w: 11, b: "ident" },
  { h: "Tipo", k: "tipo", w: 9, b: "ident" },
  { h: "Conta", k: "conta", w: 20, b: "ident", suave: true },
  { h: "Situação", k: "situacao", w: 10, b: "ident", suave: true },
  { h: "Estoque", k: "estoque", w: 9, b: "ident", fmt: "#,##0" },
  { h: "Receita 90d", k: "receita90", w: 12, b: "ident", fmt: "#,##0.00" },
  { h: "Un. 90d", k: "unidades90", w: 8, b: "ident", fmt: "#,##0" },

  { h: "Rebate pedido", k: "rebMesTxt", w: 11, b: "acordo", forte: true },
  { h: "Preço mínimo do mês", k: "acMes", w: 13, b: "acordo", fmt: "#,##0.00" },
  { h: "Tabela desse rebate", k: "tabelaDoRebate", w: 13, b: "acordo", fmt: "#,##0.00" },
  { h: "Acordo − tabela", k: "acordoMenosTabela", w: 12, b: "acordo", fmt: "#,##0.00", forte: true },
  { h: "Acordo − tabela %", k: "acordoMenosTabelaPct", w: 12, b: "acordo", fmt: "0.0%", forte: true },
  { h: "Acordo respeita a tabela?", k: "acordoBateTabela", w: 22, b: "acordo", forte: true },
  { h: "Oferta do dia", k: "acOfertaDia", w: 12, b: "acordo", fmt: "#,##0.00" },
  { h: "Relâmpago", k: "acRelampago", w: 12, b: "acordo", fmt: "#,##0.00" },
  { h: "Resposta do Meli", k: "retornoClasse", w: 28, b: "acordo", forte: true },
  { h: "Crível que o Meli deu", k: "crivelMeli", w: 13, b: "acordo", fmt: "#,##0.00" },
  { h: "Configurado bate com o crível?", k: "bateCrivel", w: 13, b: "acordo" },
  { h: "Texto da resposta", k: "retornoMeli", w: 26, b: "acordo", suave: true },
  { h: "Datas da oferta", k: "datas", w: 22, b: "acordo", suave: true },

  { h: "Preço na vitrine", k: "vitrine", w: 13, b: "hoje", fmt: "#,##0.00", forte: true },
  { h: "Preço cheio", k: "cheio", w: 12, b: "hoje", fmt: "#,##0.00" },
  { h: "Em oferta?", k: "emOferta", w: 10, b: "hoje" },
  { h: "Vitrine − acordo", k: "difVitrine", w: 13, b: "hoje", fmt: "#,##0.00" },
  { h: "Distância %", k: "difVitrinePct", w: 11, b: "hoje", fmt: "0.0%" },

  { h: "Mês: situação", k: "mesEstado", w: 17, b: "config", forte: true },
  { h: "Mês: configurado", k: "mesPreco", w: 13, b: "config", fmt: "#,##0.00" },
  { h: "Mês: dif.", k: "mesDif", w: 11, b: "config", fmt: "#,##0.00" },
  { h: "Mês: dif. %", k: "mesDifPct", w: 10, b: "config", fmt: "0.0%" },
  { h: "Mês: vigência", k: "mesVig", w: 14, b: "config", suave: true },
  { h: "Oferta dia", k: "diaEstado", w: 15, b: "config" },
  { h: "Relâmpago", k: "relEstado", w: 15, b: "config" },
  { h: "Todas as promoções configuradas", k: "todas", w: 56, b: "config", suave: true },

  { h: "Melhor preço no painel", k: "melhorPainel", w: 14, b: "painel", fmt: "#,##0.00", forte: true },
  { h: "Painel − acordo", k: "difPainelAcordo", w: 13, b: "painel", fmt: "#,##0.00" },
  { h: "Painel − vitrine", k: "difPainelVitrine", w: 13, b: "painel", fmt: "#,##0.00" },
];

const out = new ExcelJS.Workbook();
out.creator = "Plataforma Probel";
const aba = out.addWorksheet("Pré-acordo — visão completa", {
  views: [{ state: "frozen", xSplit: 3, ySplit: 6 }],
});
aba.columns = COLS.map((c) => ({ key: c.k, width: c.w }));

aba.mergeCells(1, 1, 1, COLS.length);
aba.getCell(1, 1).value = `Pré-acordo ${ABA} — acordado, praticado, configurado e o que o Meli respondeu`;
aba.getCell(1, 1).font = { size: 13, bold: true, color: { argb: TINTA } };
aba.getRow(1).height = 22;

aba.mergeCells(2, 1, 2, COLS.length);
aba.getCell(2, 1).value =
  `${itens.length} anúncios · vitrine e regras de preço lidas da API em ` +
  new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) +
  `   |   ` + Object.entries(resumo).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join("  ·  ");
aba.getCell(2, 1).font = { size: 9, color: { argb: SUAVE } };

aba.mergeCells(3, 1, 3, COLS.length);
aba.getCell(3, 1).value =
  "Ativa = valendo agora · Programada = aceita, começa depois · Preço diferente = existe a oferta do mês, em outro valor · " +
  "Não criada = o anúncio tem promoção, mas não a do acordo · Nenhuma promoção = nada configurado";
aba.getCell(3, 1).font = { size: 9, italic: true, color: { argb: SUAVE } };

aba.mergeCells(4, 1, 4, COLS.length);
aba.getCell(4, 1).value =
  '"Melhor preço no painel" vem da análise das campanhas com redução de tarifa: é o menor preço que a tabela ainda aprova. ' +
  "Só existe para os anúncios que estão numa dessas campanhas.";
aba.getCell(4, 1).font = { size: 9, italic: true, color: { argb: SUAVE } };

/* Banda de bloco. */
const banda = aba.getRow(5);
let i = 0;
while (i < COLS.length) {
  const b = COLS[i].b;
  let j = i;
  while (j + 1 < COLS.length && COLS[j + 1].b === b) j++;
  aba.mergeCells(5, i + 1, 5, j + 1);
  const cel = aba.getCell(5, i + 1);
  cel.value = BLOCOS[b].nome;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.alignment = { horizontal: "center" };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLOCOS[b].fundo } };
  i = j + 1;
}
banda.height = 17;

const linhaCab = aba.getRow(6);
COLS.forEach((c, k) => {
  const cel = linhaCab.getCell(k + 1);
  cel.value = c.h;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLOCOS[c.b].fundo } };
  cel.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: RISCO } } };
});
linhaCab.height = 28;

const TOM_ESTADO = {
  Ativa: "FF15803D",
  Programada: "FF1D4ED8",
  "Preço quase certo": "FF92400E",
  "Preço diferente": "FFB45309",
  "Não criada": "FFB91C1C",
  "Nenhuma promoção": "FFB91C1C",
  Encerrada: SUAVE,
};
const TOM_ACAO = {
  "URGENTE: abaixo do acordo, sem crível que explique": "FF991B1B",
  "Negociado abaixo — é o crível do Meli": "FF92400E",
  "Levemente abaixo (arredondamento)": SUAVE,
  "Corrigir o preço do mês": "FFB45309",
  "Cobrar: nada criado": "FFB91C1C",
  "Cobrar: promoção do mês não criada": "FFB91C1C",
  "Meli contrapropôs — ver crível": "FF92400E",
  "Aguardando o Meli": "FF1D4ED8",
  "Tudo certo": "FF15803D",
  "Mês ok — falta oferta do dia/relâmpago": "FF15803D",
};

for (const it of itens) {
  const linha = aba.addRow({
    ...it,
    mesEstado: it.mes.estado, mesPreco: it.mes.preco, mesDif: it.mes.dif, mesVig: it.mes.vigencia,
    diaEstado: it.dia.estado, relEstado: it.rel.estado,
  });
  linha.height = 15;
  COLS.forEach((c, k) => {
    const cel = linha.getCell(k + 1);
    cel.font = { size: 9, color: { argb: c.suave ? SUAVE : TINTA } };
    if (c.fmt) { cel.numFmt = c.fmt; cel.alignment = { horizontal: "right" }; }
    if (c.forte) cel.font = { size: 9, bold: true, color: { argb: TINTA } };
    cel.border = { bottom: { style: "hair", color: { argb: RISCO } } };
    /* Fundo clarinho do bloco, para a vista não se perder nas 33 colunas. */
    if (c.b === "painel" || c.b === "acao") {
      cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.b === "painel" ? "FFF7F2FD" : "FFFDF5F6" } };
    }
  });
  const pinta = (chave, mapa, valor) => {
    const idx = COLS.findIndex((c) => c.k === chave);
    if (idx < 0) return;
    const cor = mapa[valor];
    if (cor) linha.getCell(idx + 1).font = { size: 9, bold: true, color: { argb: cor } };
  };
  pinta("acao", TOM_ACAO, it.acao);
  pinta("mesEstado", TOM_ESTADO, it.mes.estado);
  pinta("diaEstado", TOM_ESTADO, it.dia.estado);
  pinta("relEstado", TOM_ESTADO, it.rel.estado);

  const TOM_TABELA = {
    "ACORDO ACIMA DA TABELA": "FFB91C1C",
    "Acordo abaixo da tabela": "FFB45309",
    Bate: "FF15803D",
  };
  pinta("acordoBateTabela", TOM_TABELA, it.acordoBateTabela);
  pinta("acordoMenosTabela", TOM_TABELA, it.acordoBateTabela);
  pinta("acordoMenosTabelaPct", TOM_TABELA, it.acordoBateTabela);

  /* Fora de estoque pesa tanto quanto preço errado: não vende de qualquer jeito. */
  if (it.estoque != null && Number(it.estoque) <= 0) {
    linha.getCell(COLS.findIndex((c) => c.k === "estoque") + 1).font = {
      size: 9, bold: true, color: { argb: "FFB91C1C" },
    };
  }
  if (it.situacao !== "active") {
    linha.getCell(COLS.findIndex((c) => c.k === "situacao") + 1).font = {
      size: 9, bold: true, color: { argb: "FFB45309" },
    };
  }
}

aba.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: COLS.length } };

const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Pre-acordo-visao-completa.xlsx";
await out.xlsx.writeFile(destino);
console.log("\n\u2713 " + destino);
