import { NextRequest, NextResponse, after } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { acordarFila, estadoDaEmpresa, pedirAtualizacao } from "@/lib/atualizacao-fila";
import { BLOCOS, ehBloco } from "@/lib/atualizacao-blocos";

export const runtime = "nodejs";
export const maxDuration = 60;

async function autorizar() {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) return { erro: "Entre novamente para atualizar.", status: 401 } as const;
  const op = await operacaoPadrao();
  if (!op) return { erro: "Nenhuma empresa escolhida.", status: 409 } as const;
  // Atualizar relê as fontes conectadas, sem editar os anúncios ou regras
  // comerciais. Qualquer membro que possa consultar a empresa pode fazê-lo.
  const { data: podeVer, error } = await sb.rpc("pode_ver_operacao", { op: op.id });
  if (error || !podeVer) return { erro: "Você não tem acesso a esta empresa.", status: 403 } as const;
  return { op } as const;
}

/** O estado: último pedido manual e quando cada bloco foi atualizado. */
export async function GET(req: NextRequest) {
  const a = await autorizar();
  if (a.erro) return NextResponse.json({ erro: a.erro }, { status: a.status });
  const e = await estadoDaEmpresa(a.op.id);
  /* Fila parada (a chamada que encadeia caiu): quem está olhando a tela
     dá o empurrão. Sem isso o pedido esperaria a próxima rotina agendada. */
  if (e.travado) {
    const origem = req.nextUrl.origin;
    after(() => acordarFila(origem));
  }
  return NextResponse.json({
    operacao: { id: a.op.id, nome: a.op.empresa || a.op.nome },
    ultima: e.ultima,
    pedido: e.pedido,
  }, { headers: { "Cache-Control": "no-store" } });
}

/** Enfileira os blocos escolhidos e volta na hora; o servidor segue sozinho. */
export async function POST(req: NextRequest) {
  const a = await autorizar();
  if (a.erro) return NextResponse.json({ erro: a.erro }, { status: a.status });
  const corpo = await req.json().catch(() => null);
  const pedidos: unknown[] = Array.isArray(corpo?.blocos) ? corpo.blocos : [];
  const blocos = BLOCOS.map((b) => b.id).filter((id) => pedidos.includes(id) && ehBloco(id));
  if (!blocos.length) return NextResponse.json({ erro: "Escolha ao menos um bloco." }, { status: 400 });
  try {
    const r = await pedirAtualizacao(a.op.id, blocos, "manual");
    if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: 422 });
    const origem = req.nextUrl.origin;
    after(() => acordarFila(origem));
    return NextResponse.json({ pedido: r });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não foi possível registrar o pedido." }, { status: 502 });
  }
}
