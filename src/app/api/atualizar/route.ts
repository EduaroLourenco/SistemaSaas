import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { planejarAtualizacao } from "@/lib/atualizacao";

export const runtime = "nodejs";
export const maxDuration = 300;

async function autorizar() {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) return { erro: "Entre novamente para atualizar.", status: 401 } as const;
  const op = await operacaoPadrao();
  if (!op) return { erro: "Nenhuma empresa escolhida.", status: 409 } as const;
  const { data: podeEditar } = await sb.rpc("pode_editar_operacao", { op: op.id });
  if (!podeEditar) return { erro: "Seu acesso é de leitura.", status: 403 } as const;
  return { op } as const;
}

/** GET apenas lista etapas; só o POST lê os canais e grava dados. */
export async function GET() {
  const a = await autorizar();
  if (a.erro) return NextResponse.json({ erro: a.erro }, { status: a.status });
  try {
    const plano = await planejarAtualizacao(a.op.id);
    return NextResponse.json({
      operacao: { id: a.op.id, nome: a.op.empresa || a.op.nome },
      periodo: plano.periodo,
      etapas: plano.etapas.map(({ id, fonte }) => ({ id, fonte })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ erro: "Não foi possível consultar as conexões desta empresa." }, { status: 502 });
  }
}

/** Cada etapa tem seu próprio limite de tempo e sua autorização conferida de novo. */
export async function POST(req: Request) {
  const a = await autorizar();
  if (a.erro) return NextResponse.json({ erro: a.erro }, { status: a.status });
  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo.operacaoId !== "string" || typeof corpo.etapa !== "string") {
    return NextResponse.json({ erro: "Recarregue a página para atualizar as fontes." }, { status: 400 });
  }
  if (corpo.operacaoId !== a.op.id) {
    return NextResponse.json({ erro: "A empresa selecionada mudou. Inicie uma nova atualização na empresa desejada." }, { status: 409 });
  }
  if (corpo.pagina != null && (!Number.isInteger(corpo.pagina) || corpo.pagina < 0 || corpo.pagina > 10000)) {
    return NextResponse.json({ erro: "Lote de atualização inválido." }, { status: 400 });
  }
  try {
    const plano = await planejarAtualizacao(a.op.id);
    const etapa = plano.etapas.find((e) => e.id === corpo.etapa);
    if (!etapa) return NextResponse.json({ erro: "Esta fonte não está mais conectada à empresa." }, { status: 404 });
    const comecou = Date.now();
    const resultado = await etapa.executar(corpo.pagina ?? 0);
    return NextResponse.json({ ...resultado, segundos: Math.round((Date.now() - comecou) / 1000) });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não foi possível atualizar esta fonte." }, { status: 502 });
  }
}
