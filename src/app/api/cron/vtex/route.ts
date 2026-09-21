import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sincronizarVtex } from "@/lib/vtex/sincronizar";
import { vtexConfigurada } from "@/lib/vtex/cliente";

export const runtime = "nodejs";
/** Cada pedido é uma chamada de detalhe; 3 dias da loja são ~150. */
export const maxDuration = 300;

/**
 * Sincronização agendada da loja própria (VTEX).
 *
 * GET /api/cron/vtex — chamada pelo agendador da Vercel (`vercel.json`),
 * nunca por gente. Roda junto do turno da madrugada, quando o dia anterior
 * já fechou: é aí que cancelamento tardio e pagamento de boleto aparecem.
 *
 * Três dias de janela, e não um, porque pedido da VTEX muda de status
 * depois de criado — o que foi "pagamento pendente" ontem pode ser
 * faturado ou cancelado hoje, e o registro precisa acompanhar.
 */
const DIAS = 3;

function autorizado(req: NextRequest, segredo: string) {
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

function diaSP(deslocamento = 0) {
  const d = new Date(Date.now() + deslocamento * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return NextResponse.json(
      { erro: "CRON_SECRET não definido — sincronização agendada desligada." },
      { status: 503 }
    );
  }
  if (!autorizado(req, segredo)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  if (!vtexConfigurada()) {
    return NextResponse.json(
      { erro: "VTEX não conectada. Defina VTEX_ACCOUNT, VTEX_APP_KEY e VTEX_APP_TOKEN." },
      { status: 503 }
    );
  }

  const comecou = Date.now();
  try {
    const r = await sincronizarVtex({ de: diaSP(-DIAS), ate: diaSP() });
    return NextResponse.json({ ok: true, segundos: Math.round((Date.now() - comecou) / 1000), ...r });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[vtex] sincronização agendada falhou:", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}
