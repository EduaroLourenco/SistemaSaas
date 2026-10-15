import ExcelJS from "exceljs";
import type { ColunaPrecos, CurvaPrecos, LinhaPrecos } from "@/lib/produtos-precos";

type Contexto = {
  de: string; ate: string; busca?: string; semVenda?: boolean;
  curva?: CurvaPrecos | ""; canalCurva?: string;
};

const dataBr = (data: string) => data.split("-").reverse().join("/");
const moeda = '"R$" #,##0.00';
const semDado = "Sem dado";

/** Recebe todas as linhas filtradas e somente as colunas visíveis, antes da paginação. */
export function planilhaProdutosPrecos(linhas: LinhaPrecos[], colunas: ColunaPrecos[], contexto: Contexto) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gerizo";
  const ws = wb.addWorksheet("Produtos e preços", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 6, showGridLines: false }],
  });
  const totalColunas = 2 + colunas.length * 6;
  ws.columns = [
    { width: 20 }, { width: 46 },
    ...colunas.flatMap(() => [12, 20, 17, 17, 13, 29].map(width => ({ width }))),
  ];
  const filtros = [
    contexto.curva && `Curva ${contexto.curva} em ${contexto.canalCurva ?? "qualquer canal exibido"}`,
    contexto.busca?.trim() && `Busca: ${contexto.busca.trim()}`,
    contexto.semVenda && "Sem venda no período",
  ].filter(Boolean).join(" · ");
  const notas = [
    "Produtos e preços",
    `Vendas: ${dataBr(contexto.de)} a ${dataBr(contexto.ate)} · ${linhas.length} produtos · ${colunas.length} canais/contas`,
    filtros || "Todos os produtos dos canais selecionados",
    "Vitrine: última leitura da API, independente do período de vendas. Sem informação: Sem dado.",
  ];
  notas.forEach((texto, i) => {
    ws.mergeCells(i + 1, 1, i + 1, totalColunas);
    const c = ws.getCell(i + 1, 1);
    c.value = texto;
    c.font = { name: "Aptos", size: i === 0 ? 17 : 10, bold: i === 0, color: { argb: i === 0 ? "FF173D35" : "FF52615D" } };
    c.alignment = { vertical: "middle", wrapText: true };
    ws.getRow(i + 1).height = 30;
  });
  ws.mergeCells(5, 1, 5, 2);
  ws.getCell(5, 1).value = "Produto";
  const titulos = ["SKU", "Produto"];
  colunas.forEach((canal, i) => {
    const inicio = 3 + i * 6;
    ws.mergeCells(5, inicio, 5, inicio + 5);
    ws.getCell(5, inicio).value = canal.nome;
    titulos.push("Curva ABC", "Vendido (médio)", "Vitrine mínima", "Vitrine máxima", "Unidades", "Data(s) da vitrine");
  });
  ws.getRow(6).values = titulos;
  for (const n of [5, 6]) {
    ws.getRow(n).height = 28;
    for (let c = 1; c <= totalColunas; c++) {
      const cell = ws.getCell(n, c);
      cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: n === 5 ? "FFFFFFFF" : "FF173D35" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: n === 5 ? "FF245A4D" : "FFE8F1ED" } };
      cell.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "center", wrapText: true };
    }
  }
  for (const l of linhas) {
    const row = ws.addRow([l.sku || "Sem SKU", l.titulo, ...colunas.flatMap(c => {
      const d = l.canais[c.id], v = d?.vitrine;
      return [d?.curva ?? semDado, d?.vendido ?? semDado, v?.min ?? semDado, v?.max ?? semDado, d?.unidades ?? semDado,
        v ? v.de === v.ate ? dataBr(v.ate) : `${dataBr(v.de)} a ${dataBr(v.ate)}` : semDado];
    })]);
    row.height = Math.max(30, Math.ceil(l.titulo.length / 44) * 14 + 8, Math.ceil(l.sku.length / 18) * 14 + 8);
    row.eachCell((cell, i) => {
      cell.font = { name: "Aptos", size: 10, color: { argb: cell.value === semDado ? "FF76827E" : "FF233B33" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.number % 2 ? "FFFFFFFF" : "FFF4F7F5" } };
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: typeof cell.value === "number" ? "right" : "left" };
      if (i <= 2) cell.numFmt = "@";
      else if ([1, 2, 3].includes((i - 3) % 6)) cell.numFmt = moeda;
      else if ((i - 3) % 6 === 4) cell.numFmt = "#,##0.##";
      if (i > 2 && (i - 3) % 6 === 0 && cell.value === "A") {
        cell.font = { ...cell.font, bold: true, color: { argb: "FF245A4D" } };
      }
    });
  }
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, ws.rowCount), column: totalColunas } };
  return wb;
}
