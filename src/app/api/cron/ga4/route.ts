import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { integracoesDoProvedor, registrarErro } from "@/lib/integracoes/cofre";
import { PROVEDOR, appConfigurado } from "@/lib/ga4/cliente";
import { diaSP, sincronizarGa4 } from "@/lib/ga4/sincronizar";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Sincronização diária do GA4 — GET /api/cron/ga4, chamada pela Vercel.
 *
 * Relê os últimos 4 dias de toda loja conectada: o GA4 leva até 48h para
 * fechar o número de um dia, e a releitura corrige o parcial gravado antes.
 * A lista vem do banco, como no Mercado Livre — cada empresa tem a sua.
 */
const DIAS = 4;

function autorizado(req: NextRequest, segredo: string) {
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return NextResponse.json({ erro: "CRON_SECRET não definido — agendamento desligado." }, { status: 503 });
  }
  if (!autorizado(req, segredo)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!appConfigurado()) {
    return NextResponse.json({ erro: "GOOGLE_CLIENT_ID/SECRET não definidos." }, { status: 503 });
  }

  const resultado: Record<string, unknown>[] = [];
  for (const integ of await integracoesDoProvedor(PROVEDOR)) {
    // Conectou mas não escolheu propriedade: nada a ler, e não é erro.
    if (!integ.config.propriedade) {
      resultado.push({ conta: integ.nome, pulada: "sem propriedade escolhida" });
      continue;
    }
    try {
      const r = await sincronizarGa4(integ, diaSP(-DIAS), diaSP(0));
      resultado.push({ conta: integ.nome, ...r });
    } catch (e) {
      const msg = (e as Error).message;
      await registrarErro(PROVEDOR, integ.contaCanalId, msg);
      resultado.push({ conta: integ.nome, erro: msg });
    }
  }
  return NextResponse.json({ contas: resultado });
}
