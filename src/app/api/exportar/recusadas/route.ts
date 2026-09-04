import { carregarComparacao } from "@/lib/dados/comparar-ofertas";
import { montarPlanilhaRecusadas } from "@/lib/dados/planilha-recusadas";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * As ofertas recusadas, em Excel, para decidir quais aceitar mesmo assim.
 *
 * Usa o MESMO carregador da tela de comparação. Refazer a leitura aqui
 * produziria uma planilha que discorda da tela que a gerou — e o
 * desencontro só apareceria na hora de subir a decisão de volta ao canal.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const campanha = url.searchParams.get("campanha") || null;

    const dados = await carregarComparacao();

    if (dados.vazio) {
      return Response.json(
        { erro: "Nenhuma planilha de promoção processada ainda." },
        { status: 404 }
      );
    }

    // O filtro de campanha vem da tela: exportar o que está sendo olhado,
    // e não tudo, é o que torna a planilha decidível numa sentada.
    const anuncios = campanha
      ? dados.anuncios
          .map((a) => ({
            ...a,
            ofertas: a.ofertas.filter((o) => o.campanhaId === campanha),
          }))
          .filter((a) => a.ofertas.length)
      : dados.anuncios;

    const { buffer, linhas, skus } = await montarPlanilhaRecusadas(anuncios);

    if (!linhas) {
      return Response.json(
        { erro: "Nenhuma oferta recusada no recorte — todas passaram na regra." },
        { status: 404 }
      );
    }

    const nomeCampanha = campanha
      ? (dados.campanhasDisponiveis.find((c) => c.id === campanha)?.nome ?? "campanha")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40)
      : "todas";

    const carimbo = new Date().toISOString().slice(0, 10);
    const nome = `ofertas-recusadas-${nomeCampanha}-${carimbo}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${nome}"`,
        "cache-control": "no-store",
        // Contagens no cabeçalho: a tela mostra o resultado sem precisar
        // abrir o arquivo para saber se veio o que esperava.
        "x-linhas": String(linhas),
        "x-skus": String(skus),
      },
    });
  } catch (e) {
    return Response.json(
      { erro: e instanceof Error ? e.message : "Falha ao gerar." },
      { status: 500 }
    );
  }
}
