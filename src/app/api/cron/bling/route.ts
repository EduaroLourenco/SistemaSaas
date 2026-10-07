import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { integracoesDeOperacao } from "@/lib/integracoes/cofre";
import { PROVEDOR, appConfigurado } from "@/lib/bling/cliente";
import { sincronizarBling } from "@/lib/bling/sincronizar";
import { diaSP } from "@/lib/ga4/sincronizar";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Sincronização diária do Bling — GET /api/cron/bling, chamada pela Vercel.
 *
 * Relê 3 dias de toda empresa conectada: pedido muda de situação depois de
 * criado (cancelamento chega dias depois). Rodar todo dia também mantém o
 * refresh token vivo — ele expira em 30 dias sem uso.
 */
const DIAS = 3;

function autorizado(req: NextRequest, segredo: string) {
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return NextResponse.json({ erro: "CRON_SECRET não definido." }, { status: 503 });
  if (!autorizado(req, segredo)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!appConfigurado()) return NextResponse.json({ erro: "BLING_CLIENT_ID/SECRET não definidos." }, { status: 503 });

  const resultado: Record<string, unknown>[] = [];
  for (const integ of await integracoesDeOperacao(PROVEDOR)) {
    try {
      const r = await sincronizarBling(integ, diaSP(-DIAS), diaSP(0));
      resultado.push({ operacao: integ.operacaoId, pedidos: r.pedidos, pendentes: Object.keys(r.pendentes).length });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      await clientePrivilegiado().from("integracoes").update({ ultimo_erro: msg }).eq("id", integ.id);
      resultado.push({ operacao: integ.operacaoId, erro: msg });
    }
  }
  return NextResponse.json({ empresas: resultado });
}
