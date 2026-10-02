/**
 * Com redução de tarifa: o que aceitar, o que recusar, e até onde dá para
 * baixar o preço no painel.
 *
 * ── Por que o menor preço não sai de uma fórmula ──
 *
 * Nesta campanha a comissão do anúncio é abatida pela contribuição do
 * canal, e o motor calcula a faixa de comissão com
 * `reduzida = SALE_FEE / preço final`. Como o SALE_FEE é fixo — conferido
 * nos dados: é uma porcentagem do preço CHEIO, não do final —, baixar o
 * preço aumenta a fração abatida, derruba a faixa de comissão e derruba
 * também o preço de tabela daquela faixa.
 *
 * Os dois se movem juntos, e por isso a aprovação NÃO é monotônica no
 * preço: existe preço reprovado com outro aprovado abaixo dele. Partir da
 * proposta e descer até reprovar devolve um mínimo falso — foi o erro que
 * escondeu R$ 108 de desconto num item em setembro. Daí a varredura
 * começar no piso e subir: o primeiro preço aprovado é o menor de verdade.
 *
 * A decisão de aceitar ou recusar sai do MESMO `processItem` que a tela
 * usa. Nada é reimplementado aqui.
 *
 * ── Ressalva ──
 *
 * O melhor preço assume que o canal mantém a contribuição dele ao mudar o
 * preço no painel. Se ele recalcular, o número se desloca.
 *
 * Uso:
 *   node scripts/local/melhor-preco-reducao.mjs "<planilha.xlsx>"
 */
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "../../node_modules/jiti/lib/jiti.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ENTRADA = process.argv[2];
if (!ENTRADA) {
  console.log('Uso: node scripts/local/melhor-preco-reducao.mjs "<planilha.xlsx>"');
  process.exit(1);
}

for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) {
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}

const { createRequire } = await import("node:module");
const req = createRequire(RAIZ + "/");
const ExcelJS = req("exceljs");
const { createClient } = req("@supabase/supabase-js");
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

/* `carregarFormulaBase` lê com o cliente de sessão; fora de uma requisição
   entra o de serviço, que lê a mesma coisa. */
const stub = path.join(RAIZ, "node_modules", ".cache", "servidor-stub.cjs");
fs.mkdirSync(path.dirname(stub), { recursive: true });
fs.writeFileSync(
  stub,
  `const { createRequire } = require("node:module");
const { createClient } = createRequire(${JSON.stringify(RAIZ + "/")})("@supabase/supabase-js");
let c = null;
const cli = () => (c ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }));
module.exports = { clienteServidor: async () => cli(), usuarioAtual: async () => null };
`
);
const vazio = path.join(RAIZ, "node_modules", ".cache", "vazio.cjs");
fs.writeFileSync(vazio, "module.exports = {};\n");

const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": vazio, "@/lib/supabase/servidor": stub },
});
const { carregarFormulaBase } = await jiti.import(RAIZ + "/src/lib/dados/formula-base.ts");
const { processarPlanilha } = await jiti.import(RAIZ + "/src/lib/planilhas/processar.ts");
const { processItem, getPrecoTabela, CONFIG_PADRAO } = await jiti.import(
  RAIZ + "/src/lib/planilhas/motor-promocoes.ts"
);

const base = await carregarFormulaBase();
console.log(`fórmula ${base.vigenteDe}: ${base.itens} itens, ${base.precos} preços`);

/* ── A decisão, pelo processador da tela ────────────────── */

const nomeArquivo = path.basename(ENTRADA);
const proc = await processarPlanilha(fs.readFileSync(ENTRADA), nomeArquivo, base.dados, 0);
const porLinha = new Map(proc.linhas.map((l) => [l.linha, l]));
console.log(`linhas: ${proc.linhas.length}`);

/* ── Os números crus da planilha ────────────────────────── */

const txt = (v) =>
  v == null ? "" : typeof v === "object" ? String(v.result ?? v.text ?? "") : String(v);
const num = (v) => {
  const x = Number(String(txt(v)).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : null;
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ENTRADA);
const ws = wb.getWorksheet("Promoções");
const COL = {};
for (let c = 1; c <= ws.columnCount; c++) COL[txt(ws.getCell(1, c).value).trim().toUpperCase()] = c;

const itens = [];
for (let r = 2; r <= ws.rowCount; r++) {
  const mlb = txt(ws.getCell(r, COL.ITEM_ID).value).trim().toUpperCase();
  if (!/^MLB\d+/.test(mlb)) continue;
  itens.push({
    linha: r,
    mlb,
    sku: txt(ws.getCell(r, COL.SKU).value).trim(),
    titulo: txt(ws.getCell(r, COL.TITLE).value).trim(),
    original: num(ws.getCell(r, COL.ORIGINAL_PRICE).value),
    proposta: num(ws.getCell(r, COL.FINAL_PRICE).value),
    saleFee: num(ws.getCell(r, COL.SALE_FEE).value),
    status: txt(ws.getCell(r, COL.STATUS).value).trim(),
    promo: txt(ws.getCell(r, COL.PROMO_NAME).value).trim(),
    tipoPromo: txt(ws.getCell(r, COL.PROMO_TYPE).value).trim(),
    candidato: COL.CANDIDATE_ID ? txt(ws.getCell(r, COL.CANDIDATE_ID).value).trim() : "",
  });
}

/* ── Receita, para a ordenação ──────────────────────────── */

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

const [pedidos, pedidoItens, anuncios] = await Promise.all([
  todas("pedidos", "id,data,cancelado"),
  todas("pedido_itens", "codigo_externo,pedido_id,quantidade,total"),
  todas("anuncios", "codigo_externo,vendidos_total,estoque,status"),
]);

const dataDoPedido = new Map(pedidos.filter((p) => !p.cancelado).map((p) => [p.id, p.data]));
const HOJE = new Date();
const corte90 = new Date(HOJE.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);

const receita = new Map();
for (const i of pedidoItens) {
  const d = dataDoPedido.get(i.pedido_id);
  if (!d) continue;
  const k = String(i.codigo_externo).toUpperCase();
  const r = receita.get(k) ?? { total: 0, d90: 0, un: 0, un90: 0 };
  r.total += Number(i.total ?? 0);
  r.un += Number(i.quantidade ?? 0);
  if (d >= corte90) {
    r.d90 += Number(i.total ?? 0);
    r.un90 += Number(i.quantidade ?? 0);
  }
  receita.set(k, r);
}
const doCanal = new Map(anuncios.map((a) => [String(a.codigo_externo).toUpperCase(), a]));

/* ── O menor preço que o canal ainda aprova ─────────────── */

const FAIXAS = [0.045, 0.055, 0.065, 0.075, 0.085, 0.095, 0.105, 0.115, 0.125, 0.135, 0.145, 0.155, 0.165];

function aprovado(it, preco) {
  const r = processItem(
    it.mlb, it.sku, it.saleFee, preco, it.original, base.dados,
    "SIM", "NAO", 0, CONFIG_PADRAO
  );
  return r.action === "SIM";
}

/**
 * Varre DE BAIXO PARA CIMA, porque a aprovação não é monotônica.
 *
 * O piso vem da menor tabela que o item tem em qualquer faixa, com a
 * tolerância de 5% do canal — abaixo disso nenhuma faixa aprova. Passo
 * grosso primeiro, refino de um centavo depois.
 */
function menorPrecoAprovado(it) {
  if (!it.proposta || !it.original || !it.saleFee) return null;

  let menorTabela = Infinity;
  for (const f of FAIXAS) {
    const t = getPrecoTabela(base.dados, it.sku, it.mlb, f);
    if (t != null && t < menorTabela) menorTabela = t;
  }
  if (!Number.isFinite(menorTabela)) return null;

  const piso = Math.max(0.01, Math.floor(menorTabela * (1 - CONFIG_PADRAO.descontoMinimo) * 100) / 100);
  /*
   * O teto é o preço CHEIO, não a proposta.
   *
   * Parando na proposta, o item recusado não devolvia nada — e é justamente
   * nele que o número interessa: quanto o preço teria de SUBIR para a
   * margem fechar. Com o teto no cheio, a mesma varredura responde as duas
   * perguntas, e quem compara com a proposta decide qual é o caso.
   */
  const teto = it.original;
  if (piso > teto) return null;

  const PASSO = 0.5;
  for (let p = piso; p <= teto + 1e-9; p = Math.round((p + PASSO) * 100) / 100) {
    if (!aprovado(it, p)) continue;
    // Refina para trás, de centavo em centavo.
    let melhor = p;
    for (let q = Math.round((p - PASSO + 0.01) * 100) / 100; q < p; q = Math.round((q + 0.01) * 100) / 100) {
      if (q >= piso && aprovado(it, q)) { melhor = q; break; }
    }
    return Math.round(melhor * 100) / 100;
  }
  return null;
}

console.log("varrendo o menor preço aprovado...");
let comGanho = 0;
for (const it of itens) {
  const l = porLinha.get(it.linha);
  it.decisao = l?.decisao ?? "";
  it.aprovadoAgora = l?.aprovado ?? false;
  it.tabela = l?.precoTabela ?? null;
  it.tags = (l?.tags ?? []).join(", ");
  it.jaParticipando = /participando/i.test(it.status);

  /* Linha já no ar não se mexe: trocar um acordo em vigor tira o anúncio
     da campanha até o canal reavaliar. */
  it.menor = it.jaParticipando ? null : menorPrecoAprovado(it);

  /*
   * O mesmo número responde duas perguntas opostas, e o que decide qual é
   * a comparação com a proposta do canal:
   *
   *   menor <= proposta  ->  sobra margem; dá para baixar e ficar mais
   *                          competitivo sem furar a tabela;
   *   menor >  proposta  ->  a proposta está abaixo do que a margem
   *                          aguenta; para aceitar, o preço tem de subir.
   */
  if (it.menor == null || it.proposta == null) {
    it.situacaoPreco = it.jaParticipando ? "Já no ar — não mexer" : "Sem tabela para calcular";
    it.podeBaixar = null;
    it.podeBaixarPct = null;
  } else if (it.menor <= it.proposta + 0.005) {
    it.situacaoPreco = "Dá para baixar";
    it.podeBaixar = it.proposta - it.menor;
    it.podeBaixarPct = it.proposta ? it.podeBaixar / it.proposta : null;
  } else {
    it.situacaoPreco = "Proposta abaixo da margem";
    it.podeBaixar = null;
    it.podeBaixarPct = null;
    it.precisaSubir = it.menor - it.proposta;
  }

  it.descontoProposta = it.original ? 1 - it.proposta / it.original : null;
  it.descontoMelhor = it.menor != null && it.original ? 1 - it.menor / it.original : null;

  const r = receita.get(it.mlb);
  it.receita90 = r?.d90 ?? 0;
  it.receitaTotal = r?.total ?? 0;
  it.unidades90 = r?.un90 ?? 0;
  it.vendidosCanal = Number(doCanal.get(it.mlb)?.vendidos_total ?? 0);
  it.estoque = doCanal.get(it.mlb)?.estoque ?? null;

  if (it.podeBaixar != null && it.podeBaixar > 0.5) comGanho++;
}

console.log(`com espaço para baixar o preço: ${comGanho} de ${itens.filter((i) => !i.jaParticipando).length} decidíveis`);

/* ── Ordem: receita primeiro, como pedido ───────────────── */

itens.sort(
  (a, b) =>
    b.receita90 - a.receita90 ||
    b.receitaTotal - a.receitaTotal ||
    (b.podeBaixar ?? 0) - (a.podeBaixar ?? 0)
);

const resumo = itens.reduce((m, i) => ((m[i.decisao || "—"] = (m[i.decisao || "—"] ?? 0) + 1), m), {});
console.log("decisão: " + JSON.stringify(resumo));

/* ── A planilha ─────────────────────────────────────────── */

const TINTA = "FF1F2430";
const SUAVE = "FF6B7280";
const LINHA = "FFE5E7EB";
const FUNDO = "FFF3F4F6";

const out = new ExcelJS.Workbook();
out.creator = "Plataforma Probel";
const aba = out.addWorksheet("Com redução — decisão", {
  views: [{ state: "frozen", xSplit: 2, ySplit: 4 }],
});

const COLS = [
  { h: "SKU", k: "sku", w: 11 },
  { h: "MLB", k: "mlb", w: 15 },
  { h: "Produto", k: "titulo", w: 44 },
  { h: "Receita 90d", k: "receita90", w: 13, fmt: "#,##0.00" },
  { h: "Receita total", k: "receitaTotal", w: 13, fmt: "#,##0.00" },
  { h: "Un. 90d", k: "unidades90", w: 9, fmt: "#,##0" },
  { h: "Vendidos no canal", k: "vendidosCanal", w: 11, fmt: "#,##0" },
  { h: "Estoque", k: "estoque", w: 9, fmt: "#,##0" },
  { h: "Campanha", k: "promo", w: 26, suave: true },
  { h: "Status", k: "status", w: 14, suave: true },
  { h: "Decisão", k: "decisao", w: 16, forte: true },
  { h: "Preço cheio", k: "original", w: 12, fmt: "#,##0.00" },
  { h: "Proposta do ML", k: "proposta", w: 13, fmt: "#,##0.00" },
  { h: "Desc. proposto", k: "descontoProposta", w: 12, fmt: "0.0%" },
  { h: "Tabela", k: "tabela", w: 12, fmt: "#,##0.00" },
  { h: "Melhor preço possível", k: "menor", w: 14, fmt: "#,##0.00", forte: true },
  { h: "Desc. no melhor", k: "descontoMelhor", w: 13, fmt: "0.0%" },
  { h: "Situação do preço", k: "situacaoPreco", w: 24, forte: true },
  { h: "Pode baixar R$", k: "podeBaixar", w: 12, fmt: "#,##0.00" },
  { h: "Pode baixar %", k: "podeBaixarPct", w: 11, fmt: "0.0%" },
  { h: "Teria que subir R$", k: "precisaSubir", w: 13, fmt: "#,##0.00" },
  { h: "Redução do canal", k: "saleFee", w: 13, fmt: "#,##0.00", suave: true },
  { h: "Observações", k: "tags", w: 26, suave: true },
];
aba.columns = COLS.map((c) => ({ key: c.k, width: c.w }));

aba.mergeCells(1, 1, 1, COLS.length);
const t1 = aba.getCell(1, 1);
t1.value = "Promoções com redução de tarifa — 2ª conta (venda a prazo)";
t1.font = { size: 13, bold: true, color: { argb: TINTA } };
aba.getRow(1).height = 22;

aba.mergeCells(2, 1, 2, COLS.length);
aba.getCell(2, 1).value =
  `${itens.length} linhas · ` +
  Object.entries(resumo).map(([k, v]) => `${k}: ${v}`).join("  ·  ") +
  `   |   ${comGanho} com espaço para mais desconto   |   fórmula ${base.vigenteDe}   |   ` +
  HOJE.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
aba.getCell(2, 1).font = { size: 9, color: { argb: SUAVE } };

aba.mergeCells(3, 1, 3, COLS.length);
aba.getCell(3, 1).value =
  "Nesta campanha só se aceita ou recusa — o preço se muda pelo PAINEL. " +
  '"Melhor preço" é o menor que a tabela ainda aprova; linha "Participando" já está no ar e não deve ser mexida.';
aba.getCell(3, 1).font = { size: 9, italic: true, color: { argb: SUAVE } };

const cab = aba.getRow(4);
COLS.forEach((c, i) => {
  const cel = cab.getCell(i + 1);
  cel.value = c.h;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDO } };
  cel.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: LINHA } } };
});
cab.height = 26;

const TOM_DEC = {
  "Aplicar proposta": "FF15803D",
  Participar: "FF1D4ED8",
  "Não aplicar": "FFB45309",
  "Não participar": "FFB45309",
};

for (const it of itens) {
  const linha = aba.addRow(it);
  linha.height = 15;
  COLS.forEach((c, i) => {
    const cel = linha.getCell(i + 1);
    cel.font = { size: 9, color: { argb: c.suave ? SUAVE : TINTA } };
    if (c.fmt) { cel.numFmt = c.fmt; cel.alignment = { horizontal: "right" }; }
    if (c.forte) cel.font = { size: 9, bold: true, color: { argb: TINTA } };
    cel.border = { bottom: { style: "hair", color: { argb: LINHA } } };
  });
  linha.getCell(COLS.findIndex((c) => c.k === "decisao") + 1).font = {
    size: 9, bold: true, color: { argb: TOM_DEC[it.decisao] ?? SUAVE },
  };
  /* Ganho relevante em destaque: é a lista de trabalho do painel. */
  if ((it.podeBaixar ?? 0) > 0.5) {
    for (const k of ["menor", "podeBaixar", "podeBaixarPct"]) {
      linha.getCell(COLS.findIndex((c) => c.k === k) + 1).font = {
        size: 9, bold: true, color: { argb: "FF15803D" },
      };
    }
  }
}

aba.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS.length } };

const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Com-reducao-2a-conta-decisao.xlsx";
await out.xlsx.writeFile(destino);
console.log("\n\u2713 " + destino);

/* A planilha para enviar ao canal sai do processador, sem edição manual. */
const paraEnviar = "C:/Users/dudu4/Downloads/processado_" + nomeArquivo.replace(/\.xlsx$/i, "") + ".xlsx";
fs.writeFileSync(paraEnviar, proc.buffer);
console.log("\u2713 " + paraEnviar + "  (para enviar ao Meli)");
