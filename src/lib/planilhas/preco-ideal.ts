import ExcelJS from "exceljs";

export interface PrecoIdealRow {
  mlb: string;
  precoAtual: number;
  comissaoNegociada: number;
}

export interface PrecoIdealReport {
  id: string;
  fileName: string;
  dataBase: string; // The date input by the user
  data: PrecoIdealRow[];
  uploadedAt: string;
}

function parseNumber(val: any): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const s = String(val).replace(/R\$\s?/, "").replace(/\./g, "").replace(",", ".").replace("%", "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function extractText(val: any): string {
  if (val == null) return "";
  if (typeof val === "object") {
    if (val.richText) return val.richText.map((t: any) => t.text).join("");
    if (val.text) return val.text;
    if (val.result) return String(val.result);
    return JSON.stringify(val);
  }
  return String(val);
}

export async function parsePrecoIdealReport(buffer: Buffer, fileName: string, dataBase: string): Promise<PrecoIdealReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Planilha vazia");

  let headerRowIndex = 0;
  for (let i = 1; i <= 30; i++) {
    const row = worksheet.getRow(i).values as any[];
    if (row && row.some(v => {
      const text = extractText(v).toLowerCase().trim();
      return text === "mlb" || text.includes("id do an") || text.includes("id") || text.includes("item_id");
    })) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === 0) {
    throw new Error("Cabeçalhos do relatório não encontrados.");
  }

  const headerRow = worksheet.getRow(headerRowIndex).values as any[];
  
  const findCol = (terms: string[]) => {
    let idx = headerRow.findIndex(v => {
      const s = extractText(v).toLowerCase().trim();
      return terms.some(t => s === t);
    });
    if (idx !== -1) return idx;
    return headerRow.findIndex(v => {
      const s = extractText(v).toLowerCase().trim();
      return terms.some(t => s.includes(t));
    });
  };

  const colMlb = findCol(["mlb", "id do anúncio", "item_id"]);
  const colPrecoAtual = findCol(["preço atual", "preço final", "preço segundo tabela", "preço"]);
  const colComissao = findCol(["comissão negociada", "comissão real", "comissão a considerar", "comissão"]);

  if (colMlb === -1) {
    throw new Error("Coluna MLB não encontrada.");
  }

  const items: PrecoIdealRow[] = [];

  for (let i = headerRowIndex + 1; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const rawMlb = extractText(row.getCell(colMlb).value).trim().toUpperCase();
    if (!rawMlb || !/^\d+$/.test(rawMlb) && !/^MLB\d+$/i.test(rawMlb)) {
        continue;
    }

    const mlbStr = rawMlb.startsWith("MLB") ? rawMlb : `MLB${rawMlb}`;

    items.push({
      mlb: mlbStr,
      precoAtual: colPrecoAtual !== -1 ? parseNumber(row.getCell(colPrecoAtual).value) : 0,
      comissaoNegociada: colComissao !== -1 ? parseNumber(row.getCell(colComissao).value) : 0,
    });
  }

  return {
    id: Date.now().toString() + "-" + Math.floor(Math.random() * 1000),
    fileName,
    dataBase,
    data: items,
    uploadedAt: new Date().toISOString()
  };
}
