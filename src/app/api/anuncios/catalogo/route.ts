import { NextRequest } from "next/server";
import { meusAnuncios } from "@/lib/meli/cliente";
import { comMeli, contaDaQuery } from "@/lib/meli/rota";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Catálogo completo do vendedor no canal.
 *
 * Substitui a importação da planilha de catálogo: traz preço, tipo de
 * anúncio, status, estoque e vendidos.
 *
 * GET /api/anuncios/catalogo?status=active
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const conta = contaDaQuery(url);
  const valido =
    status === "active" || status === "paused" || status === "closed"
      ? status
      : undefined;

  return comMeli(async () => {
    const itens = await meusAnuncios({ status: valido, conta });
    const comPreco = itens.filter((i) => i.preco !== null);

    return {
      filtro: valido ?? "todos",
      total: itens.length,
      comErro: itens.filter((i) => i.erro).length,
      resumo: {
        ativos: itens.filter((i) => i.status === "active").length,
        pausados: itens.filter((i) => i.status === "paused").length,
        // ticket da vitrine, não de venda — serve para ver o mix de preço
        precoMedio: comPreco.length
          ? +(
              comPreco.reduce((s, i) => s + (i.preco ?? 0), 0) / comPreco.length
            ).toFixed(2)
          : null,
      },
      itens,
    };
  }, conta);
}
