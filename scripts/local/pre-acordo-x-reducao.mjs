/**
 * Pré-acordo contra a campanha de redução de tarifas: onde empurrar o desconto.
 *
 * ── A lógica ──
 *
 * Na campanha "Com redução de tarifas" o que o canal concede é a REDUÇÃO DA
 * COMISSÃO (o `MELI_AMOUNT`, que é o `SALE_FEE` abatido). O DESCONTO é nosso,
 * e desde que a porcentagem passou a ser editável não é mais preciso aceitar
 * o preço que eles propõem: dá para empurrar o desconto até o melhor preço
 * que ainda cabe na margem, com a redução já embutida.
 *
 * Então, para um anúncio que está nas duas coisas, a pergunta deixa de ser
 * "o preço do pré-acordo saiu?" e passa a ser:
 *
 *     empurrando o desconto na campanha de redução, eu chego ao preço do
 *     pré-acordo — ou perto o bastante para valer?
 *
 * Quando chega, dá para fazer agora e parar de esperar liberação. Onde o
 * pré-acordo é mais agressivo, a diferença diz se vale a espera.
 *
 * ── De onde vem cada número ──
 *
 * acordado            a aba do pré-acordo do mês
 * no ar hoje          regra de preço da API (conferir-ofertas-api.mjs)
 * proposta do ML      a campanha de redução, como o canal mandou
 * melhor possível     a varredura do piso para cima (melhor-preco-reducao.mjs),
 *                     que é não-monotônica porque a tarifa reduzida é fixa em
 *                     R$ e a comissão efetiva muda com o preço final
 * redução do canal    o abatimento de comissão em R$, o que de fato é deles
 * receita             do banco, janela de 4 meses, para ordenar por peso
 *
 * Uso:
 *   node scripts/local/pre-acordo-x-reducao.mjs "<pre-acordo.xlsx>" "<aba>"
 *
 * Ambiente:
 *   REDUCOES  planilhas de "melhor-preco-reducao.mjs", separadas por ";"
 *   API       planilha de "conferir-ofertas-api.mjs"
 *   MESES     tamanho da janela de receita (padrão 4)
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const req = createRequire(RAIZ + "/");
const ExcelJS = req("exceljs");
const { createClient } = req("@supabase/supabase-js");

for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ARQUIVO = process.argv[2] ?? "C:/Users/dudu4/Downloads/Controle Probel 2026 (2).xlsx";
const ABA = process.argv[3] ?? "08-PRÉ-ACORDO OUTUBRO";
const API = process.env.API ?? "C:/Users/dudu4/Downloads/Ofertas-na-API.xlsx";
const MESES = Number(process.env.MESES ?? 4);
const REDUCOES = (process.env.REDUCOES ??
  ["C:/Users/dudu4/Downloads/Com-reducao-04-10-quanto-baixar.xlsx", "C:/Users/dudu4/Downloads/Com-reducao-2a-conta-decisao.xlsx"].join(";")
).split(";").map((s) => s.trim()).filter(Boolean);

const txt = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return String(v.result ?? v.text ?? v.richText?.map((r) => r.text).join("") ?? "");
  return String(v);
};
const num = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && typeof v.result === "number") return v.result;
  const s = txt(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const x = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(x) ? x : null;
};
const SP = { timeZone: "America/Sao_Paulo" };
const R = (v) => (v == null ? "—" : (v < 0 ? "-" : "") + "R$ " + Math.abs(v).toFixed(2));
const Rk = (v) => (v == null ? "—" : "R$ " + Math.round(v).toLocaleString("pt-BR"));

/* ── 1. O pré-acordo ── */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ARQUIVO);
const ws = wb.getWorksheet(ABA) ?? wb.worksheets[0];
let cab = 0;
for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
  const linha = [];
  for (let c = 1; c <= ws.columnCount; c++) linha.push(txt(ws.getCell(r, c).value).trim().toUpperCase());
  if (linha.includes("SKU") && linha.includes("MLB")) { cab = r; break; }
}
const acordo = new Map();
for (let r = cab + 1; r <= ws.rowCount; r++) {
  const mlb = txt(ws.getCell(r, 2).value).trim();
  if (!/^MLB\d+/.test(mlb)) continue;
  const linha = {
    mlb,
    sku: txt(ws.getCell(r, 1).value).trim(),
    nome: txt(ws.getCell(r, 3).value).trim(),
    tipo: txt(ws.getCell(r, 4).value).trim(),
    rebate: num(ws.getCell(r, 6).value),
    mes: num(ws.getCell(r, 7).value),
    retorno: txt(ws.getCell(r, 8).value).trim(),
  };
  const atual = acordo.get(mlb);
  if (!atual || (linha.mes != null && (atual.mes == null || linha.mes < atual.mes))) acordo.set(mlb, linha);
}
console.log(`pré-acordo: ${acordo.size} anúncios`);

/* ── 2. A tabela de piso por rebate ── */
const tabelaRebate = new Map();
{
  const wr = wb.worksheets.find((w) => /rebate/i.test(w.name) && /pre[cç]/i.test(w.name));
  if (wr) {
    for (let r = 2; r <= wr.rowCount; r++) {
      const m = txt(wr.getCell(r, 1).value).trim();
      if (!/^MLB\d+/.test(m)) continue;
      tabelaRebate.set(m, { 5: num(wr.getCell(r, 6).value), 6: num(wr.getCell(r, 7).value), 7: num(wr.getCell(r, 8).value), 8: num(wr.getCell(r, 9).value) });
    }
  }
}

/* ── 3. O preço de hoje ── */
const hoje = new Map();
if (fs.existsSync(API)) {
  const wa = new ExcelJS.Workbook();
  await wa.xlsx.readFile(API);
  const wsa = wa.worksheets[0];
  const cabA = [];
  for (let c = 1; c <= wsa.columnCount; c++) cabA.push(txt(wsa.getCell(5, c).value));
  const I = (n) => cabA.indexOf(n) + 1;
  for (let r = 6; r <= wsa.rowCount; r++) {
    const m = txt(wsa.getCell(r, I("MLB")).value).trim();
    if (!/^MLB\d+/.test(m)) continue;
    hoje.set(m, { estado: txt(wsa.getCell(r, I("Mês: situação")).value), valor: num(wsa.getCell(r, I("Mês: configurado")).value), cheio: num(wsa.getCell(r, I("Preço cheio")).value) });
  }
} else console.log(`aviso: não achei ${API}`);

/* ── 4. A campanha de redução, por anúncio: a melhor opção ── */
const reducao = new Map();
for (const arq of REDUCOES) {
  if (!fs.existsSync(arq)) { console.log(`aviso: não achei ${arq}`); continue; }
  const wc = new ExcelJS.Workbook();
  await wc.xlsx.readFile(arq);
  const wsc = wc.worksheets[0];
  /* o cabeçalho é a linha que tem SKU e MLB */
  let cr = 0;
  for (let r = 1; r <= Math.min(10, wsc.rowCount); r++) {
    const l = [];
    for (let c = 1; c <= wsc.columnCount; c++) l.push(txt(wsc.getCell(r, c).value).trim().toUpperCase());
    if (l.includes("SKU") && l.includes("MLB")) { cr = r; break; }
  }
  if (!cr) { console.log(`aviso: ${arq.split("/").pop()} sem cabeçalho`); continue; }
  const cabC = [];
  for (let c = 1; c <= wsc.columnCount; c++) cabC.push(txt(wsc.getCell(cr, c).value).trim());
  const I = (n) => cabC.indexOf(n) + 1;
  let n = 0;
  for (let r = cr + 1; r <= wsc.rowCount; r++) {
    const m = txt(wsc.getCell(r, I("MLB")).value).trim();
    if (!/^MLB\d+/.test(m)) continue;
    const cand = {
      proposta: num(wsc.getCell(r, I("Proposta do ML")).value),
      melhor: num(wsc.getCell(r, I("Melhor preço possível")).value),
      tabela: num(wsc.getCell(r, I("Tabela")).value),
      cheio: num(wsc.getCell(r, I("Preço cheio")).value),
      reducaoCanal: num(wsc.getCell(r, I("Redução do canal")).value),
      descProposto: num(wsc.getCell(r, I("Desc. proposto")).value),
      descMelhor: num(wsc.getCell(r, I("Desc. no melhor")).value),
      situacao: txt(wsc.getCell(r, I("Situação do preço")).value).trim(),
      decisao: txt(wsc.getCell(r, I("Decisão")).value).trim(),
      status: txt(wsc.getCell(r, I("Status")).value).trim(),
      podeBaixar: num(wsc.getCell(r, I("Pode baixar R$")).value),
      obs: txt(wsc.getCell(r, I("Observações")).value).trim(),
      receita90: num(wsc.getCell(r, I("Receita 90d")).value),
      estoque: num(wsc.getCell(r, I("Estoque")).value),
    };
    /*
     * Entre as candidaturas do anúncio fica a de melhor preço alcançável.
     * Onde a varredura não achou preço (proposta já no ar, ou sem folga), o
     * alcançável é a própria proposta.
     */
    const alvo = cand.melhor ?? cand.proposta;
    if (alvo == null) continue;
    const atual = reducao.get(m);
    if (!atual || alvo < (atual.melhor ?? atual.proposta ?? Infinity)) reducao.set(m, cand);
    n++;
  }
  console.log(`redução: ${n} candidaturas em "${arq.split("/").pop()}"`);
}

/* ── 5. Receita da janela e estoque, do banco ── */
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
const [pedidos, itens, canais, contas, anuncios] = await Promise.all([
  todas("pedidos", "id,data,conta_canal_id,cancelado"),
  todas("pedido_itens", "pedido_id,codigo_externo,quantidade,preco_unitario"),
  todas("canais", "id,codigo"),
  todas("contas_canal", "id,nome,canal_id"),
  todas("anuncios", "codigo_externo,status,estoque,conta_canal_id"),
]);
const idML = canais.filter((c) => c.codigo === "mercado_livre").map((c) => c.id);
const setML = new Set(contas.filter((c) => idML.includes(c.canal_id)).map((c) => c.id));
const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
const pedML = new Map(pedidos.filter((p) => !p.cancelado && setML.has(p.conta_canal_id)).map((p) => [p.id, p]));
const banco = new Map(anuncios.map((a) => [String(a.codigo_externo).toUpperCase(), a]));

const corte = new Date(Date.now() - MESES * 30 * 86400_000).toISOString().slice(0, 10);
const rec = new Map(), un = new Map();
for (const it of itens) {
  const p = pedML.get(it.pedido_id);
  if (!p || String(p.data) < corte) continue;
  const m = String(it.codigo_externo).toUpperCase();
  rec.set(m, (rec.get(m) ?? 0) + Number(it.quantidade) * Number(it.preco_unitario));
  un.set(m, (un.get(m) ?? 0) + Number(it.quantidade));
}
console.log(`receita: janela de ${MESES} meses, desde ${corte}`);

/* ── 6. O cruzamento ── */
const PERTO = 0.03;
const linhas = [];
for (const [mlb, a] of acordo) {
  const d = reducao.get(mlb);
  if (!d) continue; /* só quem está nas duas coisas */
  const h = hoje.get(mlb);
  const b = banco.get(mlb);
  const nivel = a.rebate != null ? Math.round(a.rebate * 100) : null;
  const piso = nivel != null ? (tabelaRebate.get(mlb)?.[nivel] ?? null) : null;
  const alcancavel = d.melhor ?? d.proposta;
  const vsAcordo = alcancavel != null && a.mes != null ? alcancavel - a.mes : null;
  const vsAcordoPct = vsAcordo != null && a.mes ? vsAcordo / a.mes : null;
  const vsHoje = alcancavel != null && h?.valor != null ? alcancavel - h.valor : null;
  linhas.push({
    sku: a.sku, mlb, nome: a.nome, tipo: a.tipo,
    conta: b ? (nomeConta.get(b.conta_canal_id) ?? "") : "",
    estoque: b?.estoque ?? d.estoque ?? null,
    receita: rec.get(mlb) ?? 0,
    unidades: un.get(mlb) ?? 0,
    rebateTxt: nivel != null ? `${nivel}%` : "",
    retorno: a.retorno,
    acordado: a.mes,
    piso,
    estadoHoje: h?.estado ?? "—",
    hoje: h?.valor ?? null,
    hojeMenosAcordo: h?.valor != null && a.mes != null ? h.valor - a.mes : null,
    cheio: d.cheio ?? h?.cheio ?? null,
    propostaML: d.proposta,
    descProposto: d.descProposto,
    alcancavel,
    descAlcancavel: d.descMelhor ?? d.descProposto,
    reducaoCanal: d.reducaoCanal,
    reducaoPct: d.reducaoCanal != null && d.cheio ? d.reducaoCanal / d.cheio : null,
    situacaoReducao: d.situacao,
    statusCampanha: d.status,
    vsAcordo, vsAcordoPct, vsHoje,
    veredito:
      alcancavel == null || a.mes == null
        ? "falta dado"
        : vsAcordoPct <= 1e-9
          ? "EMPURRAR — a redução chega ao acordo ou melhor"
          : vsAcordoPct <= PERTO
            ? `EMPURRAR — fica a ${(vsAcordoPct * 100).toFixed(1)}% do acordo`
            : `esperar — redução fica ${(vsAcordoPct * 100).toFixed(0)}% acima do acordo`,
  });
}
linhas.sort((x, y) => y.receita - x.receita);

const empurrar = linhas.filter((l) => l.veredito.startsWith("EMPURRAR"));
console.log(`\n${linhas.length} anúncios estão no pré-acordo E na campanha de redução`);
console.log(`  dá para empurrar o desconto e chegar ao acordo (ou a 3% dele): ${empurrar.length}`);
console.log(`  receita de ${MESES} meses nesses: ${Rk(empurrar.reduce((s, l) => s + l.receita, 0))} de ${Rk(linhas.reduce((s, l) => s + l.receita, 0))}`);

console.log(`\nORDENADO POR RECEITA DE ${MESES} MESES\n`);
console.log("  SKU          MLB            receita   un   acordado    no ar hoje   proposta ML   alcançável   vs acordo   redução canal   o que fazer");
for (const l of linhas.slice(0, 30)) {
  console.log(
    `  ${String(l.sku || "—").padEnd(11)}  ${l.mlb}  ${Rk(l.receita).padStart(9)}  ${String(l.unidades).padStart(3)}  ` +
    `${R(l.acordado).padStart(10)}  ${R(l.hoje).padStart(12)}  ${R(l.propostaML).padStart(12)}  ${R(l.alcancavel).padStart(11)}  ` +
    `${(l.vsAcordoPct != null ? (l.vsAcordoPct > 0 ? "+" : "") + (l.vsAcordoPct * 100).toFixed(1) + "%" : "—").padStart(9)}  ` +
    `${R(l.reducaoCanal).padStart(13)}   ${l.veredito}`
  );
}

/* ── 7. A planilha ── */
const TINTA = "FF1F2430", SUAVE = "FF6B7280", RISCO = "FFE5E7EB", FUNDO = "FFF3F4F6";
const out = new ExcelJS.Workbook();
out.creator = "Plataforma Probel";
const aba = out.addWorksheet("Pre-acordo x reducao", { views: [{ state: "frozen", xSplit: 2, ySplit: 5 }] });
const COLS = [
  { h: "SKU", k: "sku", w: 12 },
  { h: "MLB", k: "mlb", w: 15 },
  { h: "Produto", k: "nome", w: 40 },
  { h: "Tipo", k: "tipo", w: 9 },
  { h: "Conta", k: "conta", w: 20, suave: true },
  { h: `Receita ${MESES} meses`, k: "receita", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Unidades", k: "unidades", w: 9, fmt: "#,##0" },
  { h: "Estoque", k: "estoque", w: 9, fmt: "#,##0" },
  { h: "Rebate pedido", k: "rebateTxt", w: 11 },
  { h: "Retorno do Meli", k: "retorno", w: 22, suave: true },
  { h: "ACORDADO (mês)", k: "acordado", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Seu piso", k: "piso", w: 12, fmt: "#,##0.00", suave: true },
  { h: "Situação no Meli", k: "estadoHoje", w: 15 },
  { h: "NO AR HOJE", k: "hoje", w: 12, fmt: "#,##0.00", forte: true },
  { h: "No ar − acordado", k: "hojeMenosAcordo", w: 13, fmt: "#,##0.00" },
  { h: "Preço cheio", k: "cheio", w: 12, fmt: "#,##0.00", suave: true },
  { h: "Proposta do ML", k: "propostaML", w: 12, fmt: "#,##0.00" },
  { h: "Desconto proposto", k: "descProposto", w: 11, fmt: "0.0%", suave: true },
  { h: "ALCANÇÁVEL empurrando", k: "alcancavel", w: 14, fmt: "#,##0.00", forte: true },
  { h: "Desconto no alcançável", k: "descAlcancavel", w: 12, fmt: "0.0%" },
  { h: "Alcançável − acordado", k: "vsAcordo", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Alcançável − acordado %", k: "vsAcordoPct", w: 12, fmt: "0.0%", forte: true },
  { h: "Alcançável − no ar", k: "vsHoje", w: 13, fmt: "#,##0.00" },
  { h: "REDUÇÃO do canal R$", k: "reducaoCanal", w: 13, fmt: "#,##0.00", forte: true },
  { h: "Redução sobre o cheio", k: "reducaoPct", w: 12, fmt: "0.00%" },
  { h: "O que fazer", k: "veredito", w: 42, forte: true },
  { h: "Situação na redução", k: "situacaoReducao", w: 24, suave: true },
  { h: "Status da campanha", k: "statusCampanha", w: 15, suave: true },
];
aba.columns = COLS.map((c) => ({ key: c.k, width: c.w }));
aba.mergeCells(1, 1, 1, COLS.length);
aba.getCell(1, 1).value = "Pré-acordo contra a campanha de redução de tarifas — onde empurrar o desconto";
aba.getCell(1, 1).font = { size: 13, bold: true, color: { argb: TINTA } };
aba.getRow(1).height = 22;
aba.mergeCells(2, 1, 2, COLS.length);
aba.getCell(2, 1).value =
  `${linhas.length} anúncios nas duas coisas · ${empurrar.length} dá para empurrar · ordenado por receita de ${MESES} meses · ${new Date().toLocaleString("pt-BR", SP)}`;
aba.getCell(2, 1).font = { size: 9, color: { argb: SUAVE } };
aba.mergeCells(3, 1, 4, COLS.length);
aba.getCell(3, 1).value =
  'Na campanha de redução o canal concede a REDUÇÃO DA COMISSÃO; o DESCONTO é seu e a porcentagem é editável. ' +
  'ALCANÇÁVEL é o melhor preço que o desconto consegue atingir ainda cabendo na margem, com a redução embutida — não é a proposta do canal. ' +
  'Quando o ALCANÇÁVEL chega ao ACORDADO (ou a até 3% dele), dá para fazer agora e não depender da liberação.';
aba.getCell(3, 1).font = { size: 9, italic: true, color: { argb: "FF8A5A06" } };
aba.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };
aba.getRow(3).height = 28;
const linhaCab = aba.getRow(5);
COLS.forEach((c, k) => {
  const cel = linhaCab.getCell(k + 1);
  cel.value = c.h;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDO } };
  cel.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: RISCO } } };
});
linhaCab.height = 30;
for (const l of linhas) {
  const linha = aba.addRow(l);
  linha.height = 15;
  COLS.forEach((c, k) => {
    const cel = linha.getCell(k + 1);
    cel.font = { size: 9, color: { argb: c.suave ? SUAVE : TINTA } };
    if (c.fmt) { cel.numFmt = c.fmt; cel.alignment = { horizontal: "right" }; }
    if (c.forte) cel.font = { size: 9, bold: true, color: { argb: TINTA } };
    cel.border = { bottom: { style: "hair", color: { argb: RISCO } } };
    if (l.veredito.startsWith("EMPURRAR")) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
  });
  const pinta = (chave, cor) => {
    const i = COLS.findIndex((c) => c.k === chave);
    if (i >= 0) linha.getCell(i + 1).font = { size: 9, bold: true, color: { argb: cor } };
  };
  const cor = l.veredito.startsWith("EMPURRAR") ? "FF15803D" : l.veredito === "falta dado" ? "FF6B7280" : "FFB45309";
  pinta("veredito", cor);
  pinta("vsAcordoPct", cor);
  pinta("vsAcordo", cor);
  if (l.hojeMenosAcordo != null && l.hojeMenosAcordo > 0.5) pinta("hojeMenosAcordo", "FFB91C1C");
}
aba.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: COLS.length } };
const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Pre-acordo-x-reducao.xlsx";
await out.xlsx.writeFile(destino);
console.log(`\n\u2713 ${destino}`);
