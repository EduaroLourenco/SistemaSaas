import { NextRequest, NextResponse } from "next/server";
import { buscarNoCanal } from "@/lib/meli/cliente";
import { comMeli, contaDaQuery } from "@/lib/meli/rota";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Busca no catálogo do canal — é a coleta do Monitoramento · Preços.
 *
 * Devolve já ordenado do mais barato para o mais caro, com a mediana, que
 * é o número honesto para comparar: a média sozinha se desloca com um
 * anúncio isolado fora da curva.
 *
 * GET /api/monitoramento/concorrentes?termo=colchão casal&limite=20[&meuPreco=1799]
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const termo = (url.searchParams.get("termo") ?? "").trim();
  const limite = Number(url.searchParams.get("limite") ?? 20);
  const meuPreco = Number(url.searchParams.get("meuPreco"));
  const conta = contaDaQuery(url);

  if (termo.length < 3) {
    return NextResponse.json(
      { erro: "Informe `termo` com pelo menos 3 caracteres." },
      { status: 400 }
    );
  }

  return comMeli(async () => {
    const achados = (await buscarNoCanal({ termo, limite, conta })).sort(
      (a, b) => a.preco - b.preco
    );

    // Os seus próprios anúncios saem da conta de concorrência — senão o
    // "menor preço concorrente" pode ser você mesmo.
    const concorrentes = achados.filter((a) => !a.meu);
    const precos = concorrentes.map((a) => a.preco).filter((p) => p > 0);
    const meio = Math.floor(precos.length / 2);
    const mediana = precos.length
      ? precos.length % 2
        ? precos[meio]
        : +((precos[meio - 1] + precos[meio]) / 2).toFixed(2)
      : null;

    return {
      termo,
      encontrados: achados.length,
      concorrentes: concorrentes.length,
      seusAnuncios: achados.length - concorrentes.length,
      resumo: {
        menor: precos[0] ?? null,
        maior: precos[precos.length - 1] ?? null,
        mediana,
        // posição do seu preço no ranking, quando informado
        seuPreco: Number.isFinite(meuPreco) ? meuPreco : null,
        maisBaratosQueVoce: Number.isFinite(meuPreco)
          ? precos.filter((p) => p < meuPreco).length
          : null,
      },
      // devolve tudo, com a marca `meu` — a tela decide se esconde os seus
      resultados: achados,
    };
  }, conta);
}
