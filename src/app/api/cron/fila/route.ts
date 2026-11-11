import { NextRequest, NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { acordarFila, rodarProxima } from "@/lib/atualizacao-fila";

export const runtime = "nodejs";
/** Uma etapa por chamada; a mais longa (visitas da conta a prazo) leva ~4 min. */
export const maxDuration = 300;

function autorizado(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/**
 * Anda a fila de atualização — POST /api/cron/fila.
 *
 * Responde na hora e trabalha depois (`after`): quem acordou a fila não
 * fica preso esperando a etapa. Ao terminar, acorda a si mesma numa chamada
 * nova, que ganha outros 300s. Só aceita o CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const origem = req.nextUrl.origin;
  after(async () => {
    if ((await rodarProxima()) === "continuar") await acordarFila(origem);
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
