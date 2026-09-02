import { abrirPlanilha } from "./abrir";

/**
 * Leitor do relatório de Product Ads do Mercado Livre.
 *
 * Uma linha por anúncio, por campanha, por período. O arquivo medido
 * tinha 1.269 linhas: 277 anúncios em 13 campanhas, três meses.
 *
 * ── O que ele acrescenta ao que já existe ──
 *
 * O sistema já registrava mídia, mas como um total por dia e por canal,
 * digitado à mão. Isso responde "quanto gastei". Aqui o gasto vem por
 * anúncio, o que permite cruzar com a margem por MLB e responder se cada
 * anúncio paga a própria mídia.
 *
 * ── A receita daqui não é a receita do anúncio ──
 *
 * É a receita que o canal ATRIBUI ao ads, e ela inclui venda indireta —
 * a pessoa clicou no anúncio e comprou outra coisa. No arquivo medido a
 * indireta é 47,5% do total atribuído, e o atribuído é 55,9% de tudo que
 * esses anúncios venderam no período.
 *
 * Somar essa receita como se fosse faturamento contaria a mesma venda
 * duas vezes. Por isso ela nunca entra em receita: serve para calcular
 * ACOS e ROAS, que é para o que o canal a publica.
 *
 * ── Datas em português abreviado ──
 *
 * O relatório escreve "02-jun-2026". Não é formato que `Date` entenda, e
 * deixar o parser nativo tentar produz `Invalid Date` em silêncio — ou,
 * pior, uma data plausível e errada.
 */

export type LinhaAds = {
  mlb: string;
  campanha: string;
  titulo: string;
  status: string;
  inicio: string;
  fim: string;
  impressoes: number;
  cliques: number;
  investimento: number;
  /** Atribuída pelo canal, não faturamento. */
  receita: number;
  vendasDiretas: number;
  vendasIndiretas: number;
  receitaDireta: number;
  receitaIndireta: number;
};

export type LeituraAds = {
  linhas: LinhaAds[];
  linhasLidas: number;
  ignoradas: number;
  inicio: string | null;
  fim: string | null;
  campanhas: string[];
  investimentoTotal: number;
  colunasDescartadas: number;
};

/** Cabeçalhos aceitos, pelo início do rótulo. Nada fora daqui é lido. */
const ACEITAS = {
  desde: "desde",
  ate: "até",
  campanha: "campanha",
  titulo: "título do anúncio",
  mlb: "código do anúncio",
  status: "status",
  impressoes: "impressões",
  cliques: "cliques",
  receita: "receita\n",
  investimento: "investimento",
  vendasDiretas: "vendas diretas",
  vendasIndiretas: "vendas indiretas",
  receitaDireta: "receita por vendas diret",
  receitaIndireta: "receita por vendas indir",
} as const;

type Campo = keyof typeof ACEITAS;

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

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

/** "02-jun-2026" → "2026-06-02". Devolve null em vez de chutar. */
function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = texto(v).trim().toLowerCase();

  const br = s.match(/^(\d{1,2})-([a-zç]{3})-(\d{4})$/);
  if (br) {
    const mes = MESES[br[2]];
    if (mes) return `${br[3]}-${mes}-${br[1].padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/**
 * Número do relatório. Traço significa "não se aplica", não zero — CPC
 * sem clique, ACOS sem receita. Aqui vira 0 porque as colunas lidas são
 * todas somáveis; as derivadas (CPC, ACOS, ROAS) não são lidas: o
 * sistema as recalcula, e um "-" no meio de uma soma seria erro.
 */
function numero(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = texto(v).replace(/R\$\s?/g, "").replace(/\s/g, "").trim();
  if (!s || s === "-") return 0;
  const n = parseFloat(
    s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s
  );
  return Number.isFinite(n) ? n : 0;
}

export async function lerAdsMeli(buffer: Buffer): Promise<LeituraAds> {
  const wb = await abrirPlanilha(buffer);
  const ws =
    wb.worksheets.find((w) => /patrocinad/i.test(w.name)) ??
    wb.worksheets.find((w) => /an[úu]ncio/i.test(w.name)) ??
    wb.worksheets[0];
  if (!ws) throw new Error("A planilha não tem aba de anúncios patrocinados.");

  /*
   * O cabeçalho está na linha 2 — a 1 é um título agrupador. Achado pela
   * coluna "Código do anúncio" em vez de fixo: relatório muda de layout,
   * e um número escrito no código quebra em silêncio quando isso ocorre.
   */
  let nCab = 0;
  for (let r = 1; r <= Math.min(12, ws.rowCount); r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      const h = texto(ws.getRow(r).getCell(c).value).trim().toLowerCase();
      if (h.startsWith("código do anúncio")) { nCab = r; break; }
    }
    if (nCab) break;
  }
  if (!nCab) {
    throw new Error(
      'Não achei a coluna "Código do anúncio". Este não parece ser o ' +
        "relatório de anúncios patrocinados do Mercado Livre."
    );
  }

  const col = new Map<Campo, number>();
  let descartadas = 0;

  for (let c = 1; c <= ws.columnCount; c++) {
    // O relatório quebra o cabeçalho em duas linhas ("Receita\n(Moeda
    // local)"); comparar com a quebra preservada distingue "Receita" de
    // "Receita por vendas diretas".
    const bruto = texto(ws.getRow(nCab).getCell(c).value).trim().toLowerCase();
    if (!bruto) continue;

    let casou = false;
    for (const [campo, marca] of Object.entries(ACEITAS) as [Campo, string][]) {
      if (bruto.startsWith(marca) && !col.has(campo)) {
        col.set(campo, c);
        casou = true;
        break;
      }
    }
    if (!casou) descartadas += 1;
  }

  for (const obrigatoria of ["mlb", "investimento", "desde"] as Campo[]) {
    if (!col.has(obrigatoria)) {
      throw new Error(
        `O relatório não tem a coluna "${ACEITAS[obrigatoria]}".`
      );
    }
  }

  const pega = (r: number, campo: Campo) => {
    const c = col.get(campo);
    return c ? ws.getRow(r).getCell(c).value : null;
  };

  const linhas: LinhaAds[] = [];
  const campanhas = new Set<string>();
  const datas: string[] = [];
  let linhasLidas = 0;
  let ignoradas = 0;

  for (let r = nCab + 1; r <= ws.rowCount; r++) {
    const mlb = texto(pega(r, "mlb")).trim();
    if (!mlb) continue;
    linhasLidas += 1;

    const inicio = data(pega(r, "desde"));
    const fim = data(pega(r, "ate")) ?? inicio;
    // Sem período a linha não tem onde ser guardada: a chave natural é
    // anúncio + campanha + intervalo, e sem ele a reimportação duplicaria.
    if (!inicio || !fim) { ignoradas += 1; continue; }

    datas.push(inicio, fim);
    const campanha = texto(pega(r, "campanha")).trim() || "(sem campanha)";
    campanhas.add(campanha);

    linhas.push({
      mlb,
      campanha,
      titulo: texto(pega(r, "titulo")).trim(),
      status: texto(pega(r, "status")).trim(),
      inicio,
      fim,
      impressoes: Math.round(numero(pega(r, "impressoes"))),
      cliques: Math.round(numero(pega(r, "cliques"))),
      investimento: numero(pega(r, "investimento")),
      receita: numero(pega(r, "receita")),
      vendasDiretas: Math.round(numero(pega(r, "vendasDiretas"))),
      vendasIndiretas: Math.round(numero(pega(r, "vendasIndiretas"))),
      receitaDireta: numero(pega(r, "receitaDireta")),
      receitaIndireta: numero(pega(r, "receitaIndireta")),
    });
  }

  datas.sort();
  return {
    linhas,
    linhasLidas,
    ignoradas,
    inicio: datas[0] ?? null,
    fim: datas[datas.length - 1] ?? null,
    campanhas: [...campanhas].sort(),
    investimentoTotal: Number(
      linhas.reduce((s, l) => s + l.investimento, 0).toFixed(2)
    ),
    colunasDescartadas: descartadas,
  };
}
