import { carregarEvolucao } from "@/lib/dados/evolucao-anuncio";
import { montarPlanilhaEvolucao } from "@/lib/dados/planilha-evolucao";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Evolução semanal por anúncio, em Excel.
 *
 * Era um CSV plano — uma linha por anúncio POR semana. Virou uma planilha
 * pivotada: um anúncio por linha, as semanas em blocos de colunas. Ler
 * "esse anúncio caiu?" deixou de exigir caçar seis linhas espalhadas.
 *
 * O formato binário é o ponto, não um detalhe: cabeçalho de duas alturas,
 * célula numérica de verdade e vazio que continua vazio não sobrevivem a
 * um CSV. Era ali que "sem informação" virava zero ao abrir no Excel.
 *
 * A exportação para máquina continua sendo o pacote de análise, que sai
 * em CSV com ponto decimal e diz isso no próprio manifesto. Este arquivo
 * é para olho humano.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const semanas = Number(url.searchParams.get("semanas")) || undefined;
    const mlb = url.searchParams.get("mlb") ?? undefined;
    const sku = url.searchParams.get("sku") ?? undefined;

    const dados = await carregarEvolucao({ semanas, mlb, sku });

    if (dados.vazio) {
      return Response.json(
        { erro: "Não há desempenho semanal importado para exportar." },
        { status: 404 }
      );
    }

    const buffer = await montarPlanilhaEvolucao(dados.linhas, dados.semanas);
    const carimbo = new Date().toISOString().slice(0, 10);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="evolucao-anuncios-${carimbo}.xlsx"`,
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
