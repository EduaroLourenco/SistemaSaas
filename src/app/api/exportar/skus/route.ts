import { carregarAnaliseSku } from "@/lib/dados/analise-sku";
import { montarPlanilhaSkus } from "@/lib/dados/planilha-skus";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * A análise de SKU em Excel, no mesmo recorte da tela.
 *
 * O filtro vem da URL, exatamente como a página o recebe, e a rota chama
 * o MESMO carregador. Reimplementar a agregação aqui produziria uma
 * planilha que discorda da tela que a gerou — e a discordância só
 * apareceria semanas depois, numa reunião.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inicio = url.searchParams.get("de") ?? undefined;
    const fim = url.searchParams.get("ate") ?? undefined;
    const canalId = url.searchParams.get("canal") || undefined;

    const dados = await carregarAnaliseSku({ inicio, fim, canalId });

    if (dados.vazio) {
      return Response.json(
        { erro: "Não há venda no recorte escolhido." },
        { status: 404 }
      );
    }

    const nomeCanal =
      dados.canais.find((c) => c.id === canalId)?.nome ?? null;
    const buffer = await montarPlanilhaSkus(dados, nomeCanal);

    // O nome carrega o recorte: três exportações de canais diferentes na
    // pasta de Downloads são indistinguíveis se todas se chamarem "skus".
    const pedaco = (nomeCanal ?? "todos")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const nome = `skus-${pedaco}-${dados.periodo.inicio}-a-${dados.periodo.fim}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${nome}"`,
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
