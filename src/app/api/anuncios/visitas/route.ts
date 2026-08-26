import { NextRequest, NextResponse } from "next/server";
import { visitas } from "@/lib/meli/cliente";
import { comMeli, intervalo, contaDaQuery } from "@/lib/meli/rota";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Visitas por anúncio no intervalo.
 *
 * Junto com os pedidos é o que dá a conversão sem planilha nenhuma.
 *
 * GET /api/anuncios/visitas?de=2026-08-17&ate=2026-08-23[&mlbs=MLB1,MLB2]
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const faixa = intervalo(url);

  if (!faixa) {
    return NextResponse.json(
      { erro: "Informe `de` e `ate` no formato AAAA-MM-DD." },
      { status: 400 }
    );
  }

  const mlbs = (url.searchParams.get("mlbs") ?? "")
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter((m) => /^MLB\d+$/.test(m));

  const conta = contaDaQuery(url);

  return comMeli(async () => {
    const r = await visitas({ ...faixa, mlbs, conta });
    return {
      periodo: faixa,
      total: r.total,
      itens: r.itens.sort((a, b) => b.visitas - a.visitas),
    };
  }, conta);
}
