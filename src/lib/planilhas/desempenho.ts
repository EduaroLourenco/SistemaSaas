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
  /** Datas extraídas do período, quando a frase pôde ser lida. */
  inicio?: string;
  fim?: string;
  anoIso?: number;
  semanaIso?: number;
  dataPreco?: string;
  data: MLPerformanceRow[];
  uploadedAt: string;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Extrai as duas datas de "…de 17 de agosto de 2026 até 23 de agosto de 2026".
 *
 * O banco guarda desempenho por semana ISO, então a frase precisa virar
 * data de verdade: sem isso não há como dizer a que semana a linha pertence,
 * nem impedir que o mesmo arquivo entre duas vezes.
 */
export function extrairIntervalo(texto: string): {
  inicio: string;
  fim: string;
  anoIso: number;
  semanaIso: number;
} | null {
  const mes = `(${MESES.join("|")})`;
  const re = new RegExp(
    `de\\s+(\\d{1,2})\\s+de\\s+${mes}\\s+de\\s+(\\d{4})\\s+at[ée]\\s+(\\d{1,2})\\s+de\\s+${mes}\\s+de\\s+(\\d{4})`,
    "iu"
  );
  const m = texto.match(re);
  if (!m) return null;

  const iso = (dia: string, nomeMes: string, ano: string) => {
    const idx = MESES.indexOf(nomeMes.toLowerCase());
    if (idx < 0) return null;
    return `${ano}-${String(idx + 1).padStart(2, "0")}-${dia.padStart(2, "0")}`;
  };

  const inicio = iso(m[1], m[2], m[3]);
  const fim = iso(m[4], m[5], m[6]);
  if (!inicio || !fim) return null;

  const { ano, semana } = semanaIsoDe(inicio);
  return { inicio, fim, anoIso: ano, semanaIso: semana };
}

/**
 * Ano e semana ISO-8601 de uma data.
 *
 * ISO e não "semana do ano" ingênua porque a virada de ano é o caso que
 * quebra: 30/12/2025 pertence à semana 1 de 2026, e uma contagem simples
 * a colocaria na 53 de 2025 — criando uma semana duplicada no gráfico.
 */
export function semanaIsoDe(data: string): { ano: number; semana: number } {
  const d = new Date(`${data}T00:00:00Z`);
  // Quinta-feira da mesma semana define o ano ISO, por definição da norma.
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const ano = d.getUTCFullYear();
  const primeiraQuinta = new Date(Date.UTC(ano, 0, 4));
  const deslocamento = (primeiraQuinta.getUTCDay() + 6) % 7;
  primeiraQuinta.setUTCDate(primeiraQuinta.getUTCDate() - deslocamento + 3);
  const semana =
    1 + Math.round((d.getTime() - primeiraQuinta.getTime()) / (7 * 86400000));
  return { ano, semana };
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
    // Varre as primeiras linhas em vez de ler uma célula fixa. A frase do
    // período está na coluna 1, não na 2 como estava escrito aqui — o
    // resultado era todo arquivo virar "Período Indefinido", e sem período
    // as semanas se empilham numa só: quatro relatórios viram um borrão.
    busca: for (let r = 1; r <= 6; r++) {
      for (let c = 1; c <= 4; c++) {
        const t = extractText(worksheet.getRow(r).getCell(c).value);
        if (t && /\bde\s+\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}/iu.test(t)) {
          periodoStr = t.trim();
          break busca;
        }
      }
    }
  }

  const intervalo = extrairIntervalo(periodoStr);

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
    inicio: intervalo?.inicio,
    fim: intervalo?.fim,
    anoIso: intervalo?.anoIso,
    semanaIso: intervalo?.semanaIso,
    dataPreco: customDataPreco || "",
    data: items,
    uploadedAt: new Date().toISOString()
  };
}
