/**
 * O comparativo entre os anúncios do mesmo SKU, agrupado por produto.
 *
 * Nasceu de uma intuição do Eduardo: "talvez devemos mudar a promoção de
 * lugar, em um anúncio que tem mais visita". Ele estava certo, e o número
 * é grande — em 58 dos 106 SKUs com mais de um anúncio ativo, o desconto
 * mais fundo NÃO está no anúncio que recebe a visita. São 42.081 visitas
 * caindo no anúncio errado, quase metade das visitas da conta.
 *
 * O caso extremo é o PA65751: o anúncio mais visitado tem 1.535 visitas e
 * ZERO desconto, enquanto um irmão com 14 visitas está com 50,16%.
 *
 * A planilha mescla as células do SKU para a comparação ficar legível: uma
 * faixa por produto, uma linha por anúncio, ordenadas por visita.
 *
 * Uso: node scripts/local/probel-comparativo-sku.mjs
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const G = JSON.parse(readFileSync("scratchpad/pm-grupos.json", "utf8"));
const r2 = (v) => Math.round(v * 100) / 100;

/* Preço efetivo e onde está o melhor desconto de cada grupo. */
for (const g of G) {
  for (const a of g.ans) a.efetivo = a.promoPreco ?? a.preco;
  const comP = g.ans.filter((a) => a.promoDesc != null);
  g.melhorDesc = comP.length ? Math.max(...comP.map((a) => a.promoDesc)) : null;
  g.descDoMaisVisitado = g.ans[0].promoDesc ?? 0;
  g.gap = g.melhorDesc != null ? r2(g.melhorDesc - g.descDoMaisVisitado) : null;
  g.quemTemOMelhor = comP.length ? [...comP].sort((a, b) => b.promoDesc - a.promoDesc)[0] : null;
}

const AZUL = "FF1F3864", CLARO = "FFD9E2F3", FAIXA = "FFF2F2F2";
const VERDE = "FFC6EFCE", VERMELHO = "FFFFC7CE", AMARELO = "FFFFEB9C";
const brl = '"R$ "#,##0.00';
const wb = new ExcelJS.Workbook();
wb.creator = "gerizo";

const ws = wb.addWorksheet("Comparativo por SKU");
const cols = [
  "SKU", "Produto", "Anúncios", "Visitas do SKU", "Vendas do SKU",
  "MLB", "CONTA", "Tipo", "Preço cheio", "Promoção", "Preço na promoção", "Desconto",
  "Visitas", "Vendas", "Conversão", "Piso", "Catálogo", "Ads", "LEITURA",
];
ws.columns = [
  { width: 11 }, { width: 28 }, { width: 9 }, { width: 11 }, { width: 11 },
  { width: 15 }, { width: 11 }, { width: 9 }, { width: 11 }, { width: 15 }, { width: 12 }, { width: 10 },
  { width: 9 }, { width: 8 }, { width: 10 }, { width: 11 }, { width: 12 }, { width: 9 }, { width: 50 },
];
const t = ws.addRow(["PROBEL · OS ANÚNCIOS DE CADA PRODUTO, LADO A LADO"]);
t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
t.height = 26; ws.mergeCells(1, 1, 1, cols.length);
t.alignment = { vertical: "middle", indent: 1 };

const aviso = ws.addRow([
  "Uma faixa por produto, uma linha por anúncio, ordenadas pela visita. A primeira linha de cada faixa é o anúncio que o Mercado Livre está mostrando. Em 58 dos 106 produtos o desconto mais fundo NÃO está nele — é a coluna LEITURA que aponta.",
]);
ws.mergeCells(2, 1, 2, cols.length);
aviso.alignment = { wrapText: true, vertical: "top" };
aviso.height = 30;

const cab = ws.addRow(cols);
cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
cab.alignment = { vertical: "middle", wrapText: true };
cab.height = 36;

/* Os deslocados primeiro: é onde há decisão a tomar. */
const ordenados = [...G].sort((a, b) => {
  const da = a.gap != null && a.gap >= 5 ? 1 : 0, db = b.gap != null && b.gap >= 5 ? 1 : 0;
  return db - da || b.vis - a.vis;
});

let linha = cab.number;
let zebra = false;
for (const g of ordenados) {
  const inicio = linha + 1;
  const deslocado = g.gap != null && g.gap >= 5;
  for (const [i, a] of g.ans.entries()) {
    const ehOMaisVisitado = i === 0;
    const leitura = !deslocado
      ? ehOMaisVisitado ? "Recebe a visita e tem o melhor desconto do grupo." : ""
      : ehOMaisVisitado
        ? `MOVER A PROMOÇÃO PARA CÁ: ${g.ans[0].visitas} visitas com ${g.descDoMaisVisitado}% de desconto, enquanto o ${g.quemTemOMelhor.mlb} tem ${g.quemTemOMelhor.promoDesc}% e só ${g.quemTemOMelhor.visitas} visitas.`
        : a.mlb === g.quemTemOMelhor.mlb
          ? `É aqui que está o desconto de ${a.promoDesc}%, e ele só traz ${a.visitas} visitas.`
          : "";
    const r = ws.addRow([
      g.sku, String(g.titulo).slice(0, 26), g.n, g.vis, g.ven,
      a.mlb, a.conta, a.tipo, a.preco,
      a.promoTipo ?? "—", a.promoPreco, a.promoDesc != null ? a.promoDesc / 100 : null,
      a.visitas, a.vendas, a.conv != null ? a.conv / 100 : null,
      a.piso, a.catalogo || "—", a.adsInv, leitura,
    ]);
    [9, 11, 16, 18].forEach((c) => (r.getCell(c).numFmt = brl));
    r.getCell(12).numFmt = "0.0%";
    r.getCell(15).numFmt = "0.00%";
    r.alignment = { vertical: "top", wrapText: true };
    if (zebra) for (let c = 1; c <= cols.length; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIXA } };
    r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: a.conta === "São Paulo" ? CLARO : AMARELO } };
    if (ehOMaisVisitado) {
      r.getCell(13).font = { bold: true };
      r.getCell(6).font = { bold: true };
      if (deslocado) {
        r.getCell(12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERMELHO } };
        r.getCell(19).font = { bold: true, color: { argb: "FFC00000" } };
      } else {
        r.getCell(12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
      }
    }
    if (deslocado && a.mlb === g.quemTemOMelhor.mlb && !ehOMaisVisitado)
      r.getCell(12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    linha++;
  }
  /* Mescla o que é do produto, não do anúncio. */
  if (g.ans.length > 1) for (const c of [1, 2, 3, 4, 5]) ws.mergeCells(inicio, c, linha, c);
  for (const c of [1, 2, 3, 4, 5]) {
    const cel = ws.getCell(inicio, c);
    cel.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "center", wrapText: true };
    if (deslocado) cel.font = { bold: true };
  }
  zebra = !zebra;
}

ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
ws.autoFilter = { from: { row: 3, column: 6 }, to: { row: 3, column: cols.length } };

await wb.xlsx.writeFile("output/Probel-comparativo-por-SKU.xlsx");
const desl = G.filter((g) => g.gap != null && g.gap >= 5);
console.log("escrito: output/Probel-comparativo-por-SKU.xlsx");
console.log(`  ${G.length} produtos · ${G.reduce((s, g) => s + g.n, 0)} anúncios`);
console.log(`  ${desl.length} com a promoção deslocada · ${desl.reduce((s, g) => s + g.ans[0].visitas, 0)} visitas afetadas`);
