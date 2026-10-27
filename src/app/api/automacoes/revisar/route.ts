import { NextRequest, NextResponse } from "next/server";
import { carregarCanais } from "@/lib/dados/canais";
import { corpoDoAceite, type PedidoDeAceite } from "@/lib/planilhas/corpo-promocao";

export const dynamic = "force-dynamic";

/**
 * O que SERIA enviado ao canal, sem enviar nada.
 *
 * É o passo que o Eduardo pediu: conferir o produto e a promoção antes
 * de aceitar. Monta o corpo exato de cada item pelas mesmas regras do
 * envio de verdade — então o que aparece aqui é o que vai, não um
 * resumo parecido.
 *
 * Não fala com o Mercado Livre. Nenhuma chamada sai desta rota.
 */
export async function POST(req: NextRequest) {
  let corpo: { conta?: string; itens?: PedidoDeAceite[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const { conta, itens } = corpo;
  if (!conta || !Array.isArray(itens) || !itens.length) {
    return NextResponse.json({ erro: "faltou conta ou itens" }, { status: 400 });
  }
  if (itens.length > 2000) {
    return NextResponse.json({ erro: "lote grande demais" }, { status: 400 });
  }

  /* Mesmo sem chamar o canal, a conta é conferida: a resposta diz o que
     o sistema faria com a conta de alguém, e isso não é de graça. */
  const { contas } = await carregarCanais();
  const minha = contas.find((c) => c.id === conta && c.canalCodigo === "mercado_livre");
  if (!minha) return NextResponse.json({ erro: "conta não encontrada" }, { status: 404 });

  const linhas = itens.map((p) => {
    const r = corpoDoAceite(p);
    return "erro" in r
      ? { mlb: p.mlb, vai: false, motivo: r.erro }
      : { mlb: p.mlb, vai: true, metodo: "POST", caminho: `/seller-promotions/items/${p.mlb}?app_version=v2`, corpo: r.corpo };
  });

  return NextResponse.json({
    conta: minha.nome,
    /* Se a conta não autorizou a aplicação de escrita, o envio nem
       começaria — melhor dizer isso na revisão do que no clique. */
    escritaConectada: Boolean(minha.escrita?.conectada),
    vao: linhas.filter((l) => l.vai).length,
    ficam: linhas.filter((l) => !l.vai).length,
    linhas,
  });
}
