import { NextRequest, NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { integracaoDaOperacao } from "@/lib/integracoes/cofre";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { PROVEDOR } from "@/lib/bling/cliente";
import { sincronizarBling } from "@/lib/bling/sincronizar";
import { diaSP } from "@/lib/ga4/sincronizar";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Liga uma loja do Bling a uma conta de canal — POST { loja, conta }.
 *
 * `conta` vazia desfaz a ligação. A conta é conferida pelo cliente da
 * SESSÃO: conta de outra empresa não volta da consulta, e a ligação morre.
 * Depois de ligar, relê 30 dias, para os pedidos que estavam parados
 * entrarem já.
 */
export async function POST(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });

  const op = await operacaoPadrao();
  if (!op) return NextResponse.json({ erro: "Nenhuma operação." }, { status: 404 });
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: op.id });
  if (!podeEditar) return NextResponse.json({ erro: "Seu acesso é de leitura." }, { status: 403 });

  const { loja, conta } = (await req.json().catch(() => ({}))) as { loja?: string; conta?: string };
  if (!loja || !/^\d+$/.test(loja)) return NextResponse.json({ erro: "Loja inválida." }, { status: 400 });

  if (conta) {
    const { data: c } = await sb.from("contas_canal").select("id").eq("id", conta).eq("operacao_id", op.id).maybeSingle();
    if (!c) return NextResponse.json({ erro: "Conta não encontrada nesta empresa." }, { status: 404 });
  }

  const integ = await integracaoDaOperacao(PROVEDOR, op.id);
  if (!integ) return NextResponse.json({ erro: "Conecte o Bling primeiro." }, { status: 404 });

  const lojas = { ...((integ.config.lojas ?? {}) as Record<string, string>) };
  if (conta) lojas[loja] = conta;
  else delete lojas[loja];
  integ.config = { ...integ.config, lojas };
  const { error } = await clientePrivilegiado().from("integracoes").update({ config: integ.config }).eq("id", integ.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  if (!conta) return NextResponse.json({ ok: true });
  try {
    const r = await sincronizarBling(integ, diaSP(-30), diaSP(0));
    return NextResponse.json({ ok: true, pedidos: r.pedidos });
  } catch (e) {
    // A ligação ficou gravada; a leitura falhou e o agendamento tenta de novo.
    return NextResponse.json({ ok: true, aviso: (e as Error).message });
  }
}
