import { NextRequest, NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { integracaoDaOperacao } from "@/lib/integracoes/cofre";
import { PROVEDOR } from "@/lib/bling/cliente";
import { sincronizarBling } from "@/lib/bling/sincronizar";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Puxa histórico do Bling — POST { de, ate }.
 *
 * Conectar lê 15 dias e ligar uma loja lê 30: o bastante para a empresa ver
 * que funcionou, pouco para analisar. Esta rota lê o intervalo que a empresa
 * pedir.
 *
 * Lê em FATIAS, da mais nova para a mais velha, e para quando o tempo acaba.
 * Dois motivos para fatiar: a função serverless morre em 300s, e cada pedido
 * custa uma chamada de detalhe (itens e frete) a ~2 por segundo — 400 pedidos
 * já são 3 minutos. Devolve em `continuar` o dia onde parou, e quem chamou
 * repete até vir `null`. Reler fatia que já entrou é inofensivo: o upsert é
 * por (canal, código) e os itens são reescritos.
 */
const FATIA = 10;
const ORCAMENTO = 230_000;

const dia = (d: string, passo: number) =>
  new Date(Date.parse(d + "T12:00:00Z") + passo * 86400000).toISOString().slice(0, 10);

export async function POST(req: NextRequest) {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });

  const op = await operacaoPadrao();
  if (!op) return NextResponse.json({ erro: "Nenhuma operação." }, { status: 404 });
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: op.id });
  if (!podeEditar) return NextResponse.json({ erro: "Seu acesso é de leitura." }, { status: 403 });

  const { de, ate } = (await req.json().catch(() => ({}))) as { de?: string; ate?: string };
  const valido = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)));
  if (!valido(de) || !valido(ate)) return NextResponse.json({ erro: "Informe de e até (AAAA-MM-DD)." }, { status: 400 });
  if (de! > ate!) return NextResponse.json({ erro: "A data inicial é depois da final." }, { status: 400 });

  const integ = await integracaoDaOperacao(PROVEDOR, op.id);
  if (!integ) return NextResponse.json({ erro: "Conecte o Bling primeiro." }, { status: 404 });

  const fim = Date.now() + ORCAMENTO;
  let topo = ate!;
  let pedidos = 0;
  let itens = 0;
  try {
    while (topo >= de!) {
      const base = dia(topo, -(FATIA - 1));
      const inicio = base < de! ? de! : base;
      const r = await sincronizarBling(integ, inicio, topo);
      pedidos += r.pedidos;
      itens += r.itens;
      topo = dia(inicio, -1);
      if (Date.now() > fim) break;
    }
  } catch (e) {
    /* Fatia que falhou (limite do Bling, rede) não perde o que já entrou:
       devolve o progresso e o dia onde parar, para continuar depois. */
    return NextResponse.json({ pedidos, itens, continuar: topo >= de! ? topo : null, aviso: (e as Error).message });
  }

  return NextResponse.json({ pedidos, itens, continuar: topo >= de! ? topo : null });
}
