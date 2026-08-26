import ExcelJS from "exceljs";

export interface ReportItem {
  campanha: string;
  mlb: string;
  sku: string;
  tipoCampanha: "Com Redução" | "Sem Redução";
  precoOriginal: number | null;
  precoOfertadoML: number | null;
  tarifaReduzida: number | null;
  precoTabela: number | null;
  diferencaRS: number | null;
  diferencaPerc: number | null;
  status: string;
  motivo: string;
}

export async function generateReport(items: ReportItem[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Relatório de Campanhas", {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  });

  sheet.columns = [
    { header: "Campanha", key: "campanha", width: 25 },
    { header: "MLB", key: "mlb", width: 15 },
    { header: "SKU", key: "sku", width: 20 },
    { header: "Tipo de Campanha", key: "tipoCampanha", width: 20 },
    { header: "Preço Original", key: "precoOriginal", width: 15 },
    { header: "Preço Ofertado (ML)", key: "precoOfertadoML", width: 20 },
    { header: "Tarifa Reduzida (R$)", key: "tarifaReduzida", width: 20 },
    { header: "Preço Tabela (Mínimo)", key: "precoTabela", width: 22 },
    { header: "Diferença (R$)", key: "diferencaRS", width: 18 },
    { header: "Diferença (%)", key: "diferencaPerc", width: 18 },
    { header: "Status", key: "status", width: 15 },
    { header: "Motivo / Detalhe", key: "motivo", width: 45 }
  ];

  // Header Styling
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2937" } // dark gray
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  items.forEach((item) => {
    const row = sheet.addRow(item);

    // Number formatting
    if (item.precoOriginal !== null) row.getCell("precoOriginal").numFmt = '"R$" #,##0.00';
    if (item.precoOfertadoML !== null) row.getCell("precoOfertadoML").numFmt = '"R$" #,##0.00';
    if (item.tarifaReduzida !== null) row.getCell("tarifaReduzida").numFmt = '"R$" #,##0.00';
    if (item.precoTabela !== null) row.getCell("precoTabela").numFmt = '"R$" #,##0.00';
    if (item.diferencaRS !== null) row.getCell("diferencaRS").numFmt = '"R$" #,##0.00';
    if (item.diferencaPerc !== null) row.getCell("diferencaPerc").numFmt = '0.00%';

    // Alignment
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle' };
      if (colNumber >= 5 && colNumber <= 10) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    });

    // Conditional formatting for Status
    const statusCell = row.getCell("status");
    statusCell.alignment = { vertical: 'middle', horizontal: 'center' };
    if (item.status.toLowerCase().includes("aprovado")) {
      statusCell.font = { color: { argb: "FF059669" }, bold: true }; // Green
    } else {
      statusCell.font = { color: { argb: "FFDC2626" }, bold: true }; // Red
    }

    // Conditional formatting for Difference R$
    const diffRSCell = row.getCell("diferencaRS");
    if (item.diferencaRS !== null) {
      if (item.diferencaRS < 0) {
        diffRSCell.font = { color: { argb: "FFDC2626" } }; // Red
      } else {
        diffRSCell.font = { color: { argb: "FF059669" } }; // Green
      }
    }
  });

  // Apply basic borders to all data cells
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: "FFE5E7EB" } },
          bottom: { style: 'thin', color: { argb: "FFE5E7EB" } },
        };
      });
    }
  });

  // Enable filtering
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 12 }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
