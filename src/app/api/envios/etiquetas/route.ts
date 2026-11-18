import { NextRequest, NextResponse } from "next/server";
import { carregarEnvios } from "@/lib/dados/envios-meli";
import { montarEtiquetas } from "@/lib/meli/etiquetas";
import { contaEditavel } from "@/lib/meli/rota";

export const dynamic = "force-dynamic";

/**
 * Baixa as etiquetas dos envios escolhidos, já com SKU no DANFE e a lista de
 * separação na frente.
 *
 * Pede `confirmar: true` porque baixar marca o envio como impresso no Meli:
 * um POST por engano mexeria na expedição. Os itens vêm do retrato do
 * servidor, não do corpo, e só valem envios da mesma conta.
 */
export async function POST(req: NextRequest) {
  let corpo: { envios?: number[]; confirmar?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo || corpo.confirmar !== true) return NextResponse.json({ erro: "falta a confirmação explícita" }, { status: 400 });
  if (!Array.isArray(corpo.envios)) return NextResponse.json({ erro: "nenhum envio escolhido" }, { status: 400 });
  const pedidos = new Set((corpo.envios ?? []).map(Number).filter(Boolean));
  if (!pedidos.size) return NextResponse.json({ erro: "nenhum envio escolhido" }, { status: 400 });
  if (pedidos.size > 100) return NextResponse.json({ erro: "até 100 envios por vez" }, { status: 400 });

  const { envios } = await carregarEnvios();
  const escolhidos = envios.filter((e) => e.envio && pedidos.has(e.envio));
  if (!escolhidos.length) return NextResponse.json({ erro: "envios não encontrados na leitura atual — atualize a tela" }, { status: 404 });
  const contas = [...new Set(escolhidos.map((e) => e.contaId))];
  if (contas.length > 1 || !contas[0]) return NextResponse.json({ erro: "escolha envios de uma conta só" }, { status: 400 });

  // Baixar a etiqueta altera o envio no canal. Reaproveita o mesmo RLS e
  // pode_editar_operacao das demais escritas do Meli antes desse efeito.
  const { conta, motivo } = await contaEditavel(contas[0]);
  if (!conta) {
    return NextResponse.json(
      { erro: motivo === "sem_permissao" ? "Seu acesso é de leitura." : "Conta não encontrada." },
      { status: motivo === "sem_permissao" ? 403 : 404 }
    );
  }

  const r = await montarEtiquetas(
    conta.id,
    escolhidos.map((e) => ({ envio: e.envio!, pedido: e.pedido, comprador: e.comprador, itens: e.itens }))
  );
  if (r.falhas.length === escolhidos.length) return NextResponse.json({ erro: "nenhuma etiqueta liberada", falhas: r.falhas }, { status: 422 });

  return new NextResponse(Buffer.from(r.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="etiquetas-${new Date().toISOString().slice(0, 10)}.pdf"`,
      // Quem não saiu vai no cabeçalho para a tela avisar, sem perder o PDF dos outros.
      "x-falhas": encodeURIComponent(JSON.stringify(r.falhas)),
    },
  });
}
