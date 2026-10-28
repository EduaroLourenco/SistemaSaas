import { NextResponse } from "next/server";
import { carregarRaioXSku } from "@/lib/dados/raio-x-sku";

/**
 * O raio-x de um SKU, sob demanda.
 *
 * Cliente de SESSÃO lá dentro, como nas outras rotas: quem decide o que
 * este usuário pode ler é o RLS, e a operação sai do cookie — não do
 * endereço. Pedir o SKU de outra empresa devolve "não encontrado", não a
 * resposta dela.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ sku: string }> }) {
  const { sku } = await ctx.params;
  try {
    const dados = await carregarRaioXSku(decodeURIComponent(sku));
    if (!dados) {
      return NextResponse.json({ erro: "SKU sem anúncio nesta operação." }, { status: 404 });
    }
    return NextResponse.json(dados, {
      /* O raio-x muda quando a sincronização roda, não entre dois cliques:
         um minuto de cache poupa cinco consultas por reabertura. */
      headers: { "cache-control": "private, max-age=60" },
    });
  } catch (e) {
    console.error("[raio-x-sku]", e);
    return NextResponse.json({ erro: "Não consegui montar o raio-x agora." }, { status: 500 });
  }
}
