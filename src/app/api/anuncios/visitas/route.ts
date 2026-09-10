import { NextRequest, NextResponse } from "next/server";
import {
  visitasPorAnuncio,
  visitasDaConta,
  idsDosAnuncios,
  type VisitaDia,
} from "@/lib/meli/cliente";
import { comMeli, intervalo, contaDaQuery } from "@/lib/meli/rota";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Visitas por anúncio, dia a dia.
 *
 * Junto com os pedidos é o que dá a conversão sem planilha nenhuma.
 *
 * ── Por que `dias` e não `de`/`ate` ──
 *
 * O endpoint que devolve a quebra por anúncio
 * (`/items/{id}/visits/time_window`) só aceita "os últimos N dias". Não
 * há `date_from`. A rota continua aceitando `de`/`ate` por compatibilidade
 * e converte para a janela equivalente, mas o corte fino é feito depois,
 * sobre o que voltou.
 *
 * GET /api/anuncios/visitas?dias=30[&mlbs=MLB1,MLB2]
 * GET /api/anuncios/visitas?de=2026-08-17&ate=2026-08-23
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const faixa = intervalo(url);
  const conta = contaDaQuery(url);

  const mlbs = (url.searchParams.get("mlbs") ?? "")
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter((m) => /^MLB\d+$/.test(m));

  const pedido = Number(url.searchParams.get("dias"));
  let dias = Number.isFinite(pedido) && pedido > 0 ? Math.trunc(pedido) : 30;

  // Com intervalo explícito, pede dias suficientes para cobri-lo e recorta
  // depois. Pedir menos deixaria buracos no começo da faixa.
  if (faixa) {
    const ms =
      new Date(`${faixa.ate}T00:00:00Z`).getTime() -
      new Date(`${faixa.de}T00:00:00Z`).getTime();
    const ateHoje =
      Date.now() - new Date(`${faixa.de}T00:00:00Z`).getTime();
    dias = Math.min(150, Math.max(1, Math.ceil(ateHoje / 86_400_000) + 1));
    if (ms < 0) {
      return NextResponse.json(
        { erro: "`de` não pode ser depois de `ate`." },
        { status: 400 }
      );
    }
  }

  return comMeli(async () => {
    const alvos = mlbs.length ? mlbs : await idsDosAnuncios({ conta });
    const r = await visitasPorAnuncio({ mlbs: alvos, dias, conta });

    const dentro: VisitaDia[] = faixa
      ? r.linhas.filter((l) => l.data >= faixa.de && l.data <= faixa.ate)
      : r.linhas;

    const porAnuncio = new Map<string, number>();
    const porDia = new Map<string, number>();
    for (const l of dentro) {
      porAnuncio.set(l.mlb, (porAnuncio.get(l.mlb) ?? 0) + l.visitas);
      porDia.set(l.data, (porDia.get(l.data) ?? 0) + l.visitas);
    }

    /*
     * O total da CONTA vem de outro endpoint e costuma ser maior que a
     * soma dos anúncios: anúncio encerrado no meio do período some da
     * lista e leva as visitas dele junto. Trazer os dois deixa a
     * diferença visível em vez de escondida numa soma só.
     */
    let totalConta: number | null = null;
    if (faixa) {
      try {
        totalConta = await visitasDaConta({ ...faixa, conta });
      } catch {
        totalConta = null;
      }
    }

    return {
      periodo: faixa ?? { dias },
      anunciosConsultados: alvos.length,
      falharam: r.falharam,
      somaDosAnuncios: dentro.reduce((s, l) => s + l.visitas, 0),
      totalDaConta: totalConta,
      itens: [...porAnuncio.entries()]
        .map(([mlb, visitas]) => ({ mlb, visitas }))
        .sort((a, b) => b.visitas - a.visitas),
      porDia: [...porDia.entries()]
        .map(([data, visitas]) => ({ data, visitas }))
        .sort((a, b) => a.data.localeCompare(b.data)),
    };
  }, conta);
}
