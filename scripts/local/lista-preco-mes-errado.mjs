/**
 * Os anúncios cuja promoção do mês existe, mas em outro valor.
 *
 * É a lista para a conversa com o consultor, e ela carrega a ressalva que
 * importa: `/items/{id}/prices` diz VALOR e PERÍODO de cada regra, e não diz
 * de qual campanha ela é. O endpoint que diria — `/seller-promotions/*` —
 * responde 403 para esta aplicação.
 *
 * Então "a promoção do mês está no valor errado" é leitura de janela, não
 * certeza de campanha. Onde o anúncio tem MAIS DE UMA promoção, a leitura é
 * duvidosa: uma delas pode ser de outra campanha que também cobre outubro.
 * Essa é a coluna "Confiança".
 *
 * Uso:
 *   node scripts/local/lista-preco-mes-errado.mjs "<painel pré-acordo.xlsx>"
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ExcelJS = createRequire(RAIZ + "/")("exceljs");

const ENTRADA = process.argv[2] ?? "C:/Users/dudu4/Downloads/Pre-acordo-visao-completa.xlsx";
if (!fs.existsSync(ENTRADA)) {
  console.log("Não achei " + ENTRADA);
  console.log("Gere primeiro com: node scripts/local/painel-pre-acordo.mjs \"<Controle.xlsx>\" \"<aba>\"");
  process.exit(1);
}

const txt = (v) =>
  v == null ? "" : typeof v === "object" ? String(v.result ?? v.text ?? "") : String(v);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ENTRADA);
const ws = wb.worksheets[0];

const cab = [], banda = [];
let atual = "";
for (let c = 1; c <= ws.columnCount; c++) {
  cab.push(txt(ws.getCell(6, c).value));
  const b = txt(ws.getCell(5, c).value);
  if (b) atual = b;
  banda.push(atual);
}
const I = (n) => cab.indexOf(n) + 1;
const colBanda = (b, f) => {
  for (let c = 1; c <= ws.columnCount; c++) if (banda[c - 1] === b && cab[c - 1] === f) return c;
  return -1;
};
const iSit = colBanda("O que está configurado no Meli", "Mês: situação");
const iCfg = colBanda("O que está configurado no Meli", "Mês: configurado");
const iDif = colBanda("O que está configurado no Meli", "Mês: dif.");
const iVig = colBanda("O que está configurado no Meli", "Mês: vigência");

const linhas = [];
for (let r = 7; r <= ws.rowCount; r++) {
  if (txt(ws.getCell(r, iSit).value) !== "Preço diferente") continue;
  const todas = txt(ws.getCell(r, I("Todas as promoções configuradas")).value);
  /* Quantas promoções o anúncio tem. Mais de uma = leitura duvidosa. */
  const quantas = todas ? todas.split("·").length : 0;
  const acordado = Number(ws.getCell(r, I("Mês (5%)")).value) || 0;
  const configurado = Number(ws.getCell(r, iCfg).value) || 0;
  const dif = Number(ws.getCell(r, iDif).value) || 0;
  linhas.push({
    sku: txt(ws.getCell(r, 2).value) || txt(ws.getCell(r, I("SKU")).value),
    mlb: txt(ws.getCell(r, I("MLB")).value),
    produto: txt(ws.getCell(r, I("Produto")).value),
    conta: txt(ws.getCell(r, I("Conta")).value),
    estoque: Number(ws.getCell(r, I("Estoque")).value) ?? null,
    receita90: Number(ws.getCell(r, I("Receita 90d")).value) || 0,
    acordado,
    configurado,
    dif,
    difPct: acordado ? dif / acordado : 0,
    lado: dif > 0 ? "Acima do acordado" : "Abaixo do acordado",
    vigencia: txt(ws.getCell(r, iVig).value),
    respostaMeli: txt(ws.getCell(r, I("Resposta do Meli")).value),
    promocoes: todas,
    confianca: quantas > 1 ? "Confirmar no painel" : "Única promoção",
  });
}

/* Acima primeiro — é o que custa posição —, e dentro disso o maior desvio. */
linhas.sort(
  (a, b) => (a.lado === b.lado ? Math.abs(b.dif) - Math.abs(a.dif) : a.lado === "Acima do acordado" ? -1 : 1)
);

const acima = linhas.filter((l) => l.lado === "Acima do acordado");
const abaixo = linhas.filter((l) => l.lado === "Abaixo do acordado");
const duvidosos = linhas.filter((l) => l.confianca !== "Única promoção");

console.log(`${linhas.length} anúncios com a promoção do mês em outro valor`);
console.log(`  acima do acordado:  ${acima.length}  (soma R$ ${acima.reduce((s, l) => s + l.dif, 0).toFixed(2)})`);
console.log(`  abaixo do acordado: ${abaixo.length}  (soma R$ ${abaixo.reduce((s, l) => s + l.dif, 0).toFixed(2)})`);
console.log(`  com mais de uma promoção (confirmar no painel): ${duvidosos.length}`);

/* ── a planilha ── */
const TINTA = "FF1F2430", SUAVE = "FF6B7280", RISCO = "FFE5E7EB", FUNDO = "FFF3F4F6";
const out = new ExcelJS.Workbook();
out.creator = "Plataforma Probel";
const aba = out.addWorksheet("Preço do mês em outro valor", {
  views: [{ state: "frozen", xSplit: 2, ySplit: 5 }],
});

const COLS = [
  { h: "SKU", k: "sku", w: 11 },
  { h: "MLB", k: "mlb", w: 15 },
  { h: "Produto", k: "produto", w: 42 },
  { h: "Conta", k: "conta", w: 20, suave: true },
  { h: "Estoque", k: "estoque", w: 9, fmt: "#,##0" },
  { h: "Receita 90d", k: "receita90", w: 12, fmt: "#,##0.00" },
  { h: "Acordado", k: "acordado", w: 12, fmt: "#,##0.00" },
  { h: "Configurado no Meli", k: "configurado", w: 14, fmt: "#,##0.00", forte: true },
  { h: "Diferença", k: "dif", w: 11, fmt: "#,##0.00", forte: true },
  { h: "Dif. %", k: "difPct", w: 9, fmt: "0.0%" },
  { h: "Para que lado", k: "lado", w: 19, forte: true },
  { h: "Vigência", k: "vigencia", w: 14, suave: true },
  { h: "Confiança da leitura", k: "confianca", w: 18 },
  { h: "Resposta do Meli", k: "respostaMeli", w: 26, suave: true },
  { h: "Todas as promoções no anúncio", k: "promocoes", w: 56, suave: true },
];
aba.columns = COLS.map((c) => ({ key: c.k, width: c.w }));

aba.mergeCells(1, 1, 1, COLS.length);
aba.getCell(1, 1).value = "Promoção do mês criada em outro valor — lista para o consultor";
aba.getCell(1, 1).font = { size: 13, bold: true, color: { argb: TINTA } };
aba.getRow(1).height = 22;

aba.mergeCells(2, 1, 2, COLS.length);
aba.getCell(2, 1).value =
  `${linhas.length} anúncios · ${acima.length} acima do acordado · ${abaixo.length} abaixo · ` +
  `lido das regras de preço da API em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
aba.getCell(2, 1).font = { size: 9, color: { argb: SUAVE } };

aba.mergeCells(3, 1, 3, COLS.length);
aba.getCell(3, 1).value =
  "ACIMA do acordado = a promoção está menos agressiva do que você negociou; você vende mais caro e perde posição. " +
  "ABAIXO = fura a sua margem.";
aba.getCell(3, 1).font = { size: 9, italic: true, color: { argb: SUAVE } };

aba.mergeCells(4, 1, 4, COLS.length);
aba.getCell(4, 1).value =
  'RESSALVA: a API diz o valor e o período de cada promoção, e não diz de qual campanha ela é (o endpoint que diria responde 403 para este aplicativo). ' +
  'Onde "Confiança" pede confirmação, o anúncio tem mais de uma promoção e uma delas pode ser de outra campanha — confira o nome da campanha no painel do Meli.';
aba.getCell(4, 1).font = { size: 9, italic: true, color: { argb: "FF8A5A06" } };
aba.getRow(4).height = 26;
aba.getCell(4, 1).alignment = { wrapText: true, vertical: "top" };

const linhaCab = aba.getRow(5);
COLS.forEach((c, k) => {
  const cel = linhaCab.getCell(k + 1);
  cel.value = c.h;
  cel.font = { size: 9, bold: true, color: { argb: TINTA } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FUNDO } };
  cel.alignment = { vertical: "middle", horizontal: c.fmt ? "right" : "left", wrapText: true };
  cel.border = { bottom: { style: "thin", color: { argb: RISCO } } };
});
linhaCab.height = 26;

for (const l of linhas) {
  const linha = aba.addRow(l);
  linha.height = 15;
  COLS.forEach((c, k) => {
    const cel = linha.getCell(k + 1);
    cel.font = { size: 9, color: { argb: c.suave ? SUAVE : TINTA } };
    if (c.fmt) { cel.numFmt = c.fmt; cel.alignment = { horizontal: "right" }; }
    if (c.forte) cel.font = { size: 9, bold: true, color: { argb: TINTA } };
    cel.border = { bottom: { style: "hair", color: { argb: RISCO } } };
  });
  const pinta = (chave, cor) => {
    const i = COLS.findIndex((c) => c.k === chave);
    if (i >= 0) linha.getCell(i + 1).font = { size: 9, bold: true, color: { argb: cor } };
  };
  const cor = l.lado === "Abaixo do acordado" ? "FFB91C1C" : "FFB45309";
  pinta("lado", cor);
  pinta("dif", cor);
  if (l.confianca !== "Única promoção") pinta("confianca", "FF8A5A06");
}

aba.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: COLS.length } };

const destino = process.env.SAIDA ?? "C:/Users/dudu4/Downloads/Preco-do-mes-em-outro-valor.xlsx";
await out.xlsx.writeFile(destino);
console.log("\n\u2713 " + destino);
