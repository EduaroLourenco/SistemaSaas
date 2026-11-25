import { NextRequest, NextResponse } from "next/server";
import { carregarEnvios, gravarStatus } from "@/lib/dados/envios-meli";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { contaEditavel } from "@/lib/meli/rota";
import { clienteServidor } from "@/lib/supabase/servidor";
import { STATUS_MANUAL, type StatusManual } from "@/lib/envios/reputacao";

export const dynamic = "force-dynamic";

/**
 * Status que a logística marca no pedido. Fica só na Gerizo: não muda nada no Meli.
 * Fora de /api/envios de propósito: o perfil Expedição não chega aqui.
 * Quem marca: editor para cima, ou o perfil Acompanhamento.
 */
export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => null)) as { pedido?: number; status?: string | null } | null;
  const pedido = Number(corpo?.pedido);
  const status = corpo?.status ?? null;
  if (!pedido) return NextResponse.json({ erro: "pedido inválido" }, { status: 400 });
  if (status !== null && !(status in STATUS_MANUAL)) return NextResponse.json({ erro: "status inválido" }, { status: 400 });

  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) return NextResponse.json({ erro: "Entre novamente." }, { status: 401 });

  const { envios, enviados } = await carregarEnvios();
  const alvo = [...envios, ...(enviados ?? [])].find((e) => e.pedido === pedido);
  if (!alvo?.contaId) return NextResponse.json({ erro: "pedido fora da leitura atual — atualize a tela" }, { status: 404 });
  const op = await operacaoPadrao();
  if (!op) return NextResponse.json({ erro: "empresa não encontrada" }, { status: 404 });
  /* Sem a migração 51, só quem edita a empresa marca. */
  const { data: acompanha, error } = await sb.rpc("pode_acompanhar_operacao", { op: op.id });
  const pode = error ? Boolean((await contaEditavel(alvo.contaId)).conta) : acompanha === true;
  if (!pode) return NextResponse.json({ erro: "Seu acesso é de leitura." }, { status: 403 });
  try {
    const salvo = await gravarStatus(op.id, pedido, status as StatusManual | null, sessao.user.email ?? null);
    return NextResponse.json({ ok: true, salvo });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "falha ao gravar" }, { status: 500 });
  }
}
