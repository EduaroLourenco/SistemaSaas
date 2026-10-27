import { NextRequest, NextResponse } from "next/server";
import { contarPorStatus } from "@/lib/dados/automacoes";
import { carregarCanais } from "@/lib/dados/canais";

export const dynamic = "force-dynamic";

/**
 * Quantos itens de uma promoção em cada status.
 *
 * Fica fora da página porque são três chamadas ao canal por promoção, e
 * com 36 promoções isso levava 75 segundos de tela branca. Agora o
 * cartão aparece na hora e o número chega depois.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conta = searchParams.get("conta") ?? "";
  const promocao = searchParams.get("promocao") ?? "";
  const tipo = searchParams.get("tipo") ?? "";
  if (!conta || !promocao || !tipo) {
    return NextResponse.json({ erro: "faltou conta, promocao ou tipo" }, { status: 400 });
  }

  /* A conta vem do cliente: confere contra as da operação de quem pede. */
  const { contas } = await carregarCanais();
  if (!contas.some((c) => c.id === conta && c.canalCodigo === "mercado_livre")) {
    return NextResponse.json({ erro: "conta não encontrada" }, { status: 404 });
  }

  try {
    return NextResponse.json(await contarPorStatus(conta, promocao, tipo));
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "o canal não respondeu" },
      { status: 502 }
    );
  }
}
