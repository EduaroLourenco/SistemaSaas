import { abrirPlanilha } from "./abrir";

/**
 * Leitor do relatório de vendas do Mercado Livre.
 *
 * É o único arquivo que traz a TARIFA REAL cobrada em cada venda e diz se
 * a venda veio de publicidade. Com ele, comissão e ACOS deixam de ser
 * estimativa: a comissão sai do que o canal cobrou, não da faixa da
 * Fórmula base, e a receita atribuída à mídia sai do próprio canal.
 *
 * As colunas 31 a 43 do arquivo trazem nome, CPF, endereço e telefone do
 * comprador. Nenhuma é lida — a lista de colunas aceitas é fechada, como
 * no leitor da listagem de pedidos.
 */

export type VendaMeli = {
  numeroVenda: string;
  data: string;
  deposito: string;
  status: string;
  mlb: string;
  sku: string;
  titulo: string;
  tipoAnuncio: string;
  unidades: number;
  /** Receita dos produtos, sem frete. */
  receita: number;
  /** Tarifa de venda e impostos, sempre positiva aqui. */
  tarifa: number;
  /** Cancelamentos e reembolsos no período. */
  reembolso: number;
  /** A venda veio de anúncio patrocinado. */
  porPublicidade: boolean;
  precoUnitario: number;
};

export type LeituraVendasMeli = {
  vendas: VendaMeli[];
  inicio: string | null;
  fim: string | null;
  depositos: Record<string, number>;
  linhasLidas: number;
  semData: number;
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function texto(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text) return o.text;
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
}

function numero(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = texto(v).replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Data em português por extenso: "24 de agosto de 2026 14:11 hs."
 *
 * O Mercado Livre exporta assim, como texto. Não há como pedir outro
 * formato no painel dele, então a tradução mora aqui.
 */
function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = texto(v).trim().toLowerCase();

  const extenso = s.match(/(\d{1,2})\s+de\s+(\p{L}+)\s+de\s+(\d{4})/u);
  if (extenso) {
    const mes = MESES.indexOf(extenso[2]);
    if (mes >= 0) {
      return `${extenso[3]}-${String(mes + 1).padStart(2, "0")}-${extenso[1].padStart(2, "0")}`;
    }
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;

  return null;
}

/** Cabeçalhos aceitos. Nada fora desta lista é lido. */
const ACEITOS: Record<string, keyof VendaMeli | "ignorar"> = {
  "n.º de venda": "numeroVenda",
  "nº de venda": "numeroVenda",
  "data da venda": "data",
  "depósito": "deposito",
  "descrição do status": "status",
  "unidades": "unidades",
  "receita por produtos (brl)": "receita",
  "tarifa de venda e impostos (brl)": "tarifa",
  "cancelamentos e reembolsos (brl)": "reembolso",
  "venda por publicidade": "porPublicidade",
  "sku": "sku",
  "# de anúncio": "mlb",
  "título do anúncio": "titulo",
  "preço unitário de venda do anúncio (brl)": "precoUnitario",
  "tipo de anúncio": "tipoAnuncio",
};

export async function lerVendasMeli(buffer: Buffer): Promise<LeituraVendasMeli> {
  const wb = await abrirPlanilha(buffer);
  const ws =
    wb.getWorksheet("Vendas BR") ??
    wb.worksheets.find((w) => /vendas/i.test(w.name)) ??
    wb.worksheets[0];
  if (!ws) throw new Error('A planilha não tem a aba "Vendas BR".');

  /*
   * O cabeçalho não está na linha 1: as primeiras linhas são texto
   * explicativo do próprio Mercado Livre. Procura a linha que tem
   * "N.º de venda" em vez de assumir posição fixa — o número de linhas de
   * aviso muda entre exports.
   */
  let linhaCabecalho = 0;
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    for (let c = 1; c <= Math.min(6, ws.columnCount); c++) {
      if (/n\.?º?\s*de venda/i.test(texto(ws.getRow(r).getCell(c).value))) {
        linhaCabecalho = r;
        break;
      }
    }
    if (linhaCabecalho) break;
  }
  if (!linhaCabecalho) throw new Error('Não achei a linha de cabeçalho ("N.º de venda").');

  const col = new Map<keyof VendaMeli, number>();
  for (let c = 1; c <= ws.columnCount; c++) {
    const nome = texto(ws.getRow(linhaCabecalho).getCell(c).value)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const campo = ACEITOS[nome];
    // `has` impede que a segunda coluna "Unidades" (do bloco de envio)
    // sobrescreva a primeira, que é a da venda.
    if (campo && campo !== "ignorar" && !col.has(campo)) col.set(campo, c);
  }

  const pega = (linha: number, campo: keyof VendaMeli) => {
    const c = col.get(campo);
    return c ? ws.getRow(linha).getCell(c).value : null;
  };

  const vendas: VendaMeli[] = [];
  const depositos: Record<string, number> = {};
  const datas: string[] = [];
  let linhasLidas = 0;
  let semData = 0;

  for (let r = linhaCabecalho + 1; r <= ws.rowCount; r++) {
    const numeroVenda = texto(pega(r, "numeroVenda")).trim();
    if (!numeroVenda) continue;
    linhasLidas++;

    const quando = data(pega(r, "data"));
    if (!quando) {
      semData++;
      continue;
    }
    datas.push(quando);

    const deposito = texto(pega(r, "deposito")).trim() || "—";
    depositos[deposito] = (depositos[deposito] ?? 0) + 1;

    const bruta = texto(pega(r, "mlb")).trim().toUpperCase();
    const mlb = bruta && !bruta.startsWith("MLB") ? `MLB${bruta}` : bruta;

    vendas.push({
      numeroVenda,
      data: quando,
      deposito,
      status: texto(pega(r, "status")).trim(),
      mlb,
      sku: texto(pega(r, "sku")).trim(),
      titulo: texto(pega(r, "titulo")).trim(),
      tipoAnuncio: texto(pega(r, "tipoAnuncio")).trim(),
      unidades: Math.round(numero(pega(r, "unidades"))),
      receita: numero(pega(r, "receita")),
      // O canal exporta a tarifa como negativa; aqui ela é um custo positivo.
      tarifa: Math.abs(numero(pega(r, "tarifa"))),
      reembolso: Math.abs(numero(pega(r, "reembolso"))),
      // Vem "Sim" ou espaço em branco — qualquer coisa que não seja "sim"
      // é tratada como venda orgânica.
      porPublicidade: /^sim$/i.test(texto(pega(r, "porPublicidade")).trim()),
      precoUnitario: numero(pega(r, "precoUnitario")),
    });
  }

  datas.sort();
  return {
    vendas,
    inicio: datas[0] ?? null,
    fim: datas[datas.length - 1] ?? null,
    depositos,
    linhasLidas,
    semData,
  };
}
