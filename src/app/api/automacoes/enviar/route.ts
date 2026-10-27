import { NextRequest, NextResponse } from "next/server";
import { carregarCanais } from "@/lib/dados/canais";
import { aceitarEmLote } from "@/lib/meli/promocoes-escrita";
import type { PedidoDeAceite } from "@/lib/planilhas/corpo-promocao";

export const dynamic = "force-dynamic";

/**
 * Manda os aceites para o Mercado Livre. É o único caminho que escreve.
 *
 * ── O que protege ──
 *
 * `confirmar: true` no corpo. Não é cerimônia: a rota aceita POST, e um
 * POST acontece por engano — recarregar uma página, um clique duplo, um
 * teste batendo na URL. Sem a confirmação explícita, nada sai.
 *
 * Teto de 300 itens por chamada. A cota é por aplicação e dividida com
 * os agentes dele; um lote maior derruba todo mundo no 429 e deixa
 * metade enviada, que é o pior estado possível.
 *
 * A conta é conferida contra as da operação de quem pede, e a aplicação
 * de escrita precisa estar conectada NELA — conectar numa conta não
 * autoriza a outra.
 *
 * ── O que devolve ──
 *
 * Uma linha por item, com o que o canal respondeu. O canal recusa linha
 * por linha, com motivo próprio, e é assim que a tela precisa mostrar:
 * "8 entraram, 2 recusados e por quê", nunca "deu certo".
 */
export async function POST(req: NextRequest) {
  let corpo: { conta?: string; itens?: PedidoDeAceite[]; confirmar?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const { conta, itens, confirmar } = corpo;
  if (confirmar !== true) {
    return NextResponse.json({ erro: "falta a confirmação explícita" }, { status: 400 });
  }
  if (!conta || !Array.isArray(itens) || !itens.length) {
    return NextResponse.json({ erro: "faltou conta ou itens" }, { status: 400 });
  }
  if (itens.length > 300) {
    return NextResponse.json(
      { erro: `${itens.length} itens de uma vez estoura a cota do canal — mande em lotes de até 300` },
      { status: 400 }
    );
  }

  const { contas } = await carregarCanais();
  const minha = contas.find((c) => c.id === conta && c.canalCodigo === "mercado_livre");
  if (!minha) return NextResponse.json({ erro: "conta não encontrada" }, { status: 404 });
  if (!minha.escrita?.conectada) {
    return NextResponse.json(
      { erro: `A conta ${minha.nome} não autorizou o sistema a alterar promoções. Em Canais e contas, clique em "Permitir alterações".` },
      { status: 409 }
    );
  }

  const resultados = await aceitarEmLote(conta, itens);
  const entraram = resultados.filter((r) => r.ok).length;
  return NextResponse.json({
    conta: minha.nome,
    entraram,
    recusados: resultados.length - entraram,
    resultados,
  });
}
