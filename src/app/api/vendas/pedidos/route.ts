import { NextRequest, NextResponse } from "next/server";
import { pedidos } from "@/lib/meli/cliente";
import { comMeli, intervalo, contaDaQuery } from "@/lib/meli/rota";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Pedidos do intervalo, já consolidados por dia e por anúncio.
 *
 * É esta rota que substitui a digitação em Vendas · Lançamentos e o upload
 * da Análise de anúncios. Cada pedido traz `unit_price` com data, então o
 * histórico de preço pago sai daqui de graça — sem precisar de retrato.
 *
 * GET /api/vendas/pedidos?de=2026-08-01&ate=2026-08-25
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const faixa = intervalo(url);
  const conta = contaDaQuery(url);
  if (!faixa) {
    return NextResponse.json(
      { erro: "Informe `de` e `ate` no formato AAAA-MM-DD, com `de` menor ou igual a `ate`." },
      { status: 400 }
    );
  }

  return comMeli(async () => {
    const lista = await pedidos({ ...faixa, conta });

    const validos = lista.filter((p) => !p.cancelado);
    const cancelados = lista.filter((p) => p.cancelado);

    // Consolidado por dia — é o formato que `vendas_diarias` espera.
    const porDia = new Map<
      string,
      { data: string; pedidos: number; unidades: number; receita: number; cancelados: number; valorCancelado: number }
    >();

    for (const p of lista) {
      const linha =
        porDia.get(p.data) ??
        { data: p.data, pedidos: 0, unidades: 0, receita: 0, cancelados: 0, valorCancelado: 0 };

      if (p.cancelado) {
        linha.cancelados += 1;
        linha.valorCancelado += p.total;
      } else {
        linha.pedidos += 1;
        linha.receita += p.total;
        linha.unidades += p.itens.reduce((s, i) => s + i.quantidade, 0);
      }
      porDia.set(p.data, linha);
    }

    // Consolidado por anúncio — alimenta a Análise de anúncios, incluindo
    // o preço médio ponderado, que é o "preço pago".
    const porAnuncio = new Map<
      string,
      { mlb: string; titulo: string; sku: string | null; unidades: number; receita: number; pedidos: number }
    >();

    for (const p of validos) {
      for (const i of p.itens) {
        if (!i.mlb) continue;
        const linha =
          porAnuncio.get(i.mlb) ??
          { mlb: i.mlb, titulo: i.titulo, sku: i.sku, unidades: 0, receita: 0, pedidos: 0 };
        linha.unidades += i.quantidade;
        linha.receita += i.precoUnitario * i.quantidade;
        linha.pedidos += 1;
        porAnuncio.set(i.mlb, linha);
      }
    }

    const arredondar = <T extends { receita: number }>(x: T) => ({
      ...x,
      receita: +x.receita.toFixed(2),
    });

    return {
      periodo: faixa,
      resumo: {
        pedidos: validos.length,
        cancelados: cancelados.length,
        unidades: validos.reduce(
          (s, p) => s + p.itens.reduce((t, i) => t + i.quantidade, 0),
          0
        ),
        receita: +validos.reduce((s, p) => s + p.total, 0).toFixed(2),
        valorCancelado: +cancelados.reduce((s, p) => s + p.total, 0).toFixed(2),
      },
      porDia: [...porDia.values()]
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((d) => ({
          ...d,
          receita: +d.receita.toFixed(2),
          valorCancelado: +d.valorCancelado.toFixed(2),
        })),
      porAnuncio: [...porAnuncio.values()]
        .map(arredondar)
        .map((a) => ({
          ...a,
          // preço pago: média ponderada pelas unidades
          precoMedio: a.unidades ? +(a.receita / a.unidades).toFixed(2) : null,
        }))
        .sort((a, b) => b.receita - a.receita),
    };
  }, conta);
}
