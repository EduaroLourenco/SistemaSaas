import type ExcelJS from "exceljs";

/**
 * Lê uma tabela de preço por faixa de comissão: SKU na coluna A, uma coluna
 * por faixa (20,5%, 0,205 ou 20,5 no cabeçalho), preço nas células.
 *
 * Com abas "(Fluxo)" e "(Antecipado)" no nome, lê só as do modo pedido — é o
 * formato da "Tabela de preços - marketplaces" da Probel. Sem nenhuma aba
 * assim, a planilha inteira é uma tabela só e vale para o modo escolhido.
 *
 * SKU repetido entre abas: fica o da primeira, como no script local.
 */

export type Modo = "antecipado" | "fluxo";

const texto = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    return String(o.result ?? o.text ?? o.richText?.map((r) => r.text).join("") ?? "");
  }
  return String(v);
};
const numero = (v: ExcelJS.CellValue): number | null => {
  const s = texto(v).trim();
  if (!s) return null;
  const x = Number(/,/.test(s) ? s.replace(/\./g, "").replace(",", ".").replace("%", "") : s.replace("%", ""));
  return Number.isFinite(x) ? x : null;
};
/** 0,205 / 20,5 / "20,5%" → 0,205; fora de 0–100% → nulo. */
export function faixaDe(v: ExcelJS.CellValue): number | null {
  const x = numero(v);
  if (x == null || x <= 0) return null;
  const f = texto(v).includes("%") || x >= 1 ? x / 100 : x;
  return f > 0 && f < 1 ? Math.round(f * 1000) / 1000 : null;
}

export function lerTabelaFaixas(wb: ExcelJS.Workbook, modo: Modo): Map<string, Map<number, number>> {
  const todas = wb.worksheets;
  const marcadas = todas.filter((w) => /fluxo|antecipado/i.test(w.name));
  const abas = marcadas.length ? marcadas.filter((w) => new RegExp(modo, "i").test(w.name)) : todas.slice(0, 1);
  if (!abas.length) throw new Error(`A planilha tem abas de Fluxo/Antecipado, mas nenhuma de ${modo === "fluxo" ? "Fluxo" : "Antecipado"}.`);

  const saida = new Map<string, Map<number, number>>();
  for (const ws of abas) {
    // Cabeçalho: a primeira linha (até a 10ª) com duas ou mais faixas.
    let cab = 0;
    let cols: { col: number; faixa: number }[] = [];
    for (let r = 1; r <= Math.min(10, ws.rowCount) && !cab; r++) {
      const achadas: typeof cols = [];
      ws.getRow(r).eachCell((c, i) => {
        const f = i > 1 ? faixaDe(c.value) : null;
        if (f != null) achadas.push({ col: i, faixa: f });
      });
      if (achadas.length >= 2) [cab, cols] = [r, achadas.sort((a, b) => a.faixa - b.faixa)];
    }
    if (!cab) continue;

    for (let r = cab + 1; r <= ws.rowCount; r++) {
      const sku = texto(ws.getCell(r, 1).value).trim().toUpperCase();
      if (!sku || saida.has(sku)) continue;
      const linha = new Map<number, number>();
      for (const { col, faixa } of cols) {
        const v = numero(ws.getCell(r, col).value);
        if (v != null && v > 0) linha.set(faixa, Math.round(v * 100) / 100);
      }
      // Faixa fora de ordem (preço acima da faixa de cima) é erro de fórmula
      // na origem — a escada é linear, então vale a média das vizinhas.
      for (let i = 1; i < cols.length - 1; i++) {
        const [a, m, b] = [cols[i - 1], cols[i], cols[i + 1]].map((c) => linha.get(c.faixa));
        if (a != null && m != null && b != null && m > b) linha.set(cols[i].faixa, Math.round(((a + b) / 2) * 100) / 100);
      }
      if (linha.size) saida.set(sku, linha);
    }
  }
  if (!saida.size) throw new Error("Não achei preços: a coluna A precisa ter o SKU e o cabeçalho, as faixas (20,5%, 19,5%…).");
  return saida;
}
