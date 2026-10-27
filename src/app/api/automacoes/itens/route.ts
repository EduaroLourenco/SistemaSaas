import { NextRequest, NextResponse } from "next/server";
import { carregarItensDaPromocao } from "@/lib/dados/automacoes";
import { carregarCanais } from "@/lib/dados/canais";

export const dynamic = "force-dynamic";

/**
 * Os itens de UMA promoção, quando o cartão abre.
 *
 * Fica fora da página porque a varredura é cara: a maior promoção tem 748
 * linhas e o canal pagina de 50 em 50. Carregar as 36 junto com a lista
 * seria meio minuto de tela branca e cota gasta em promoção que ninguém
 * abriu.
 *
 * A conta vem do cliente, então é conferida contra as contas da operação
 * de quem está pedindo — `carregarCanais` lê pela sessão e portanto já
 * passa pelo RLS. Sem isso, trocar o id na URL leria a promoção de outra
 * empresa.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conta = searchParams.get("conta") ?? "";
  const promocao = searchParams.get("promocao") ?? "";
  const tipo = searchParams.get("tipo") ?? "";

  if (!conta || !promocao || !tipo) {
    return NextResponse.json({ erro: "faltou conta, promocao ou tipo" }, { status: 400 });
  }

  const { contas } = await carregarCanais();
  const minha = contas.find((c) => c.id === conta && c.canalCodigo === "mercado_livre");
  if (!minha) return NextResponse.json({ erro: "conta não encontrada" }, { status: 404 });

  try {
    const dados = await carregarItensDaPromocao(conta, promocao, tipo);
    return NextResponse.json(dados);
  } catch (e) {
    /* O canal cai, estoura cota ou devolve 403 por promoção que terminou.
       A tela precisa do motivo para dizer o que houve, não um vazio. */
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "o canal não respondeu" },
      { status: 502 }
    );
  }
}
