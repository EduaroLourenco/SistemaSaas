import { carregarPerformancePreco } from "@/lib/dados/performance-preco";
import { montarPlanilhaPreco } from "@/lib/dados/planilha-preco";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Preço × volume × receita, no recorte da tela.
 *
 * Mesmo carregador da página, com o filtro vindo da URL: uma planilha que
 * discordasse da tela que a gerou só seria descoberta numa reunião.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const dias = Number(url.searchParams.get("dias")) || 90;
    const canalId = url.searchParams.get("canal") || undefined;

    const dados = await carregarPerformancePreco({ dias, canalId });

    if (dados.vazio) {
      return Response.json(
        { erro: "Não há venda no recorte escolhido." },
        { status: 404 }
      );
    }

    const nomeCanal = dados.canais.find((c) => c.id === canalId)?.nome ?? null;
    const { buffer, skus, faixas } = await montarPlanilhaPreco(dados, nomeCanal);

    if (!skus) {
      return Response.json(
        {
          erro:
            "Nenhum SKU tem duas faixas de preço com evidência suficiente no recorte. " +
            "Amplie o período ou escolha outro canal.",
        },
        { status: 404 }
      );
    }

    const pedaco = (nomeCanal ?? "todos")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const nome = `preco-volume-receita-${pedaco}-${dias}d-${dados.periodo.fim}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${nome}"`,
        "cache-control": "no-store",
        "x-skus": String(skus),
        "x-faixas": String(faixas),
      },
    });
  } catch (e) {
    return Response.json(
      { erro: e instanceof Error ? e.message : "Falha ao gerar." },
      { status: 500 }
    );
  }
}
