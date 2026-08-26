/* eslint-disable */
import type ExcelJS from "exceljs";
import { abrirPlanilha } from "./abrir";
import { FormulaBaseData } from "./motor-promocoes";

/**
 * Leitor da Fórmula base.
 *
 * Portado de `google-sheets.ts` do projeto anterior. A lógica de leitura das
 * três abas é a MESMA, linha por linha — mudou só a origem: antes era um
 * caminho fixo em disco (`Formula_Base.xlsx` na raiz do projeto), agora é o
 * arquivo que o usuário envia na tela. Isso é o que permite trocar a base
 * sem fazer deploy, e é o que a tabela `formula_base_*` vai persistir.
 *
 * As três abas:
 *   "Base MLB"        → por anúncio: tipo (Clássico/Premium) e comissão padrão
 *   "Base com preços" → matriz SKU × comissão → preço de tabela
 *   "Boa forma"       → matriz MLB × comissão → preço de tabela
 */
export async function lerFormulaBase(buffer: Buffer): Promise<FormulaBaseData> {
  // Passa pelo abridor tolerante: a Fórmula base costuma ter gráficos e
  // comentários, que derrubam o ExcelJS na reconciliação.
  const workbook = await abrirPlanilha(buffer);

  const baseMlb = new Map();
  const precosSKU = new Map();
  const precosMLB = new Map();

  const sheetMlb = workbook.getWorksheet("Base MLB");
  const sheetPrecosSKU = workbook.getWorksheet("Base com preços");
  const sheetBoaForma = workbook.getWorksheet("Boa forma");

  if (!sheetMlb && !sheetPrecosSKU && !sheetBoaForma) {
    throw new Error(
      'Fórmula base sem as abas esperadas. São necessárias "Base MLB", "Base com preços" e "Boa forma".'
    );
  }

  // ── Base MLB ────────────────────────────────────────────────────────
  // A coluna 1 guarda o CÓDIGO DO ANÚNCIO, apesar de a variável no projeto
  // antigo se chamar `sku`. Mantido igual porque `processItem` busca por
  // MLB nesta mesma chave — renomear aqui quebraria o casamento.
  if (sheetMlb) {
    sheetMlb.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const chave = row.getCell(1).text?.trim();
      const tipo = row.getCell(2).text?.trim() || "";
      const padraoText = row.getCell(3).text?.trim() || "0";
      const padrao = parseFloat(padraoText.replace(",", ".")) || 0;

      if (chave) baseMlb.set(chave, { tipo, padrao });
    });
  }

  // Lê a linha de cabeçalho como faixas de comissão.
  const parseHeaders = (row: ExcelJS.Row, isPercentFormat: boolean) => {
    const cols: Record<number, number> = {};
    row.eachCell((cell, colNumber) => {
      if (colNumber <= 2) return;
      let val = parseFloat(cell.text?.replace(",", ".") || "0");
      if (!isNaN(val)) {
        if (isPercentFormat && val > 1) val /= 100;
        cols[colNumber] = Math.round(val * 1000) / 1000;
      }
    });
    return cols;
  };

  // ── Base com preços (por SKU) ───────────────────────────────────────
  if (sheetPrecosSKU) {
    const cols = parseHeaders(sheetPrecosSKU.getRow(1), false);

    sheetPrecosSKU.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return;

      const sku = row.getCell(1).text?.trim();
      if (sku) {
        const skuData: Record<number, number> = {};
        for (const [colIdx, pct] of Object.entries(cols)) {
          const valText = row.getCell(parseInt(colIdx)).text?.trim() || "0";
          const val = parseFloat(valText.replace(",", "."));
          if (!isNaN(val)) skuData[pct] = val;
        }
        precosSKU.set(sku, skuData);
      }
    });
  }

  // ── Boa forma (por MLB) ─────────────────────────────────────────────
  if (sheetBoaForma) {
    const cols = parseHeaders(sheetBoaForma.getRow(1), true);

    sheetBoaForma.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const mlb = row.getCell(1).text?.trim();
      if (mlb) {
        const mlbData: Record<number, number> = {};
        for (const [colIdx, pct] of Object.entries(cols)) {
          const valText = row.getCell(parseInt(colIdx)).text?.trim() || "0";
          const val = parseFloat(valText.replace(",", "."));
          if (!isNaN(val)) mlbData[pct] = val;
        }
        precosMLB.set(mlb, mlbData);
      }
    });
  }

  return { baseMlb, precosSKU, precosMLB };
}

/** Quantas linhas cada aba trouxe — a tela mostra isso na conferência. */
export function resumoFormulaBase(data: FormulaBaseData) {
  return {
    itens: data.baseMlb.size,
    precosPorSku: data.precosSKU.size,
    precosPorMlb: data.precosMLB.size,
  };
}
