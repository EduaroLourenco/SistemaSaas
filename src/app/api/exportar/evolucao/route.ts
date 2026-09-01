import { carregarEvolucao } from "@/lib/dados/evolucao-anuncio";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Evolução semanal por anúncio, em CSV.
 *
 * Uma linha por anúncio por semana: quanto vendeu, a quanto, e quanto
 * custou de tarifa. É a planilha que responde "por que caiu" sem precisar
 * cruzar três exportações à mão.
 *
 * Ponto e vírgula com vírgula decimal: esta sai para o Excel em
 * português. O pacote de análise, que é o feito para máquina, usa a
 * convenção oposta — e diz isso no próprio manifesto.
 */
function campo(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
  }
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const semanas = Number(url.searchParams.get("semanas")) || undefined;
    const mlb = url.searchParams.get("mlb") ?? undefined;
    const sku = url.searchParams.get("sku") ?? undefined;

    const { linhas } = await carregarEvolucao({ semanas, mlb, sku });

    const cabecalho = [
      "SKU", "MLB", "Título", "Tipo", "Conta",
      "Ano ISO", "Semana", "Início", "Fim",
      "Visitas", "Vendas", "Unidades", "Conversão %",
      "Receita", "Preço praticado",
      "Tarifa tabela %", "Retido pelo canal %", "Retido R$",
    ];

    const corpo = linhas.map((l) => [
      l.sku, l.mlb, l.titulo, l.tipo, l.conta,
      l.anoIso, l.semanaIso, l.inicio, l.fim,
      l.visitas, l.vendas, l.unidades, l.conversao,
      l.receita, l.precoPraticado,
      l.tarifaTabela, l.tarifaCobrada, l.comissaoReais,
    ]);

    // BOM: sem ele o Excel abre em ANSI e todo acento vira símbolo.
    const csv =
      "\uFEFF" +
      [cabecalho, ...corpo].map((linha) => linha.map(campo).join(";")).join("\r\n");

    const carimbo = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="evolucao-anuncios-${carimbo}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return Response.json(
      { erro: e instanceof Error ? e.message : "Falha ao gerar." },
      { status: 500 }
    );
  }
}
