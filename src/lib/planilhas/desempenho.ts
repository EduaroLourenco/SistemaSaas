import ExcelJS from "exceljs";

export interface MLPerformanceRow {
  mlb: string;
  titulo: string;
  status: string;
  sku: string;
  visitas: number;
  vendas: number;
  receita: number;
  conversao: number;
  participacao: number;
  precoAtual: number;
}

export interface AnaliseReport {
  id: string;
  fileName: string;
  periodo: string;
  dataPreco?: string;
  data: MLPerformanceRow[];
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

export async function parsePerformanceReport(buffer: Buffer, fileName: string, customPeriodo?: string, customDataPreco?: string): Promise<AnaliseReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Planilha vazia");

  let periodoStr = customPeriodo || "Período Indefinido";
  if (!customPeriodo) {
    const row3 = worksheet.getRow(3).values as any[];
    if (row3 && row3[2]) {
      periodoStr = extractText(row3[2]);
    }
  }

  let headerRowIndex = 0;
  for (let i = 1; i <= 30; i++) {
    const row = worksheet.getRow(i).values as any[];
    if (!row) continue;

    const texts = row.map(v => extractText(v).toLowerCase().trim());

    // A valid header row must have an ID-like column AND a metrics column (visitas or vendas).
    // This prevents false matches on title/description rows that contain "anúncio".
    const hasIdCol = texts.some(t =>
      t === "id do anúncio" || t === "item_id" || t === "mlb"
    );
    const hasMetricsCol = texts.some(t =>
      t.includes("visitas") || t.includes("vendas") || t.includes("conversão")
    );

    if (hasIdCol && hasMetricsCol) {
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

  const colMlb = findCol(["id do anúncio", "item_id", "mlb"]);
  const colTitulo = findCol(["anúncio", "title", "título"]);
  const colStatus = findCol(["status atual", "status"]);
  const colSku = findCol(["sku"]);
  const colVisitas = findCol(["visitas únicas", "visitas"]);
  const colVendas = findCol(["quantidade de vendas", "vendas"]);
  const colReceita = findCol(["vendas brutas"]);
  const colParticipacao = findCol(["% de participação", "participação"]);
  const colConversao = findCol(["conversão de visitas em vendas", "conversão"]);
  const colPrecoAtual = findCol(["preço atual", "preço atual (r$)", "preço"]);

  if (colMlb === -1 || colVisitas === -1 || colVendas === -1) {
    throw new Error("Colunas essenciais (ID do Anúncio, Visitas, Vendas) não encontradas.");
  }

  const items: MLPerformanceRow[] = [];

  for (let i = headerRowIndex + 1; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const rawMlb = extractText(row.getCell(colMlb).value).trim().toUpperCase();
    if (!rawMlb || !/^\d+$/.test(rawMlb) && !/^MLB\d+$/i.test(rawMlb)) {
        continue;
    }

    const mlbStr = rawMlb.startsWith("MLB") ? rawMlb : `MLB${rawMlb}`;

    items.push({
      mlb: mlbStr,
      titulo: colTitulo !== -1 ? extractText(row.getCell(colTitulo).value) : "N/A",
      status: colStatus !== -1 ? extractText(row.getCell(colStatus).value) : "Ativo",
      sku: colSku !== -1 ? extractText(row.getCell(colSku).value) : "",
      visitas: parseNumber(row.getCell(colVisitas).value),
      vendas: parseNumber(row.getCell(colVendas).value),
      receita: colReceita !== -1 ? parseNumber(row.getCell(colReceita).value) : 0,
      participacao: colParticipacao !== -1 ? parseNumber(row.getCell(colParticipacao).value) : 0,
      conversao: colConversao !== -1 ? parseNumber(row.getCell(colConversao).value) : 0,
      precoAtual: colPrecoAtual !== -1 ? parseNumber(row.getCell(colPrecoAtual).value) : 0,
    });
  }

  return {
    id: Date.now().toString() + "-" + Math.floor(Math.random() * 1000),
    fileName,
    periodo: periodoStr,
    dataPreco: customDataPreco || "",
    data: items,
    uploadedAt: new Date().toISOString()
  };
}
