import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { promocoesDoAnuncio } from "@/lib/meli/promocoes-canal";

export const dynamic = "force-dynamic";

/**
 * As promoções ao vivo de um anúncio, sob demanda.
 *
 * ── Por que é por MLB e não por SKU ──
 *
 * O canal responde por anúncio. Dois irmãos do mesmo SKU recebem
 * convites diferentes — preço, piso e campanha são do MLB —, e somar os
 * dois daria um número que não existe em lugar nenhum.
 *
 * ── Uma chamada ao canal por abertura de drawer ──
 *
 * A cota é por aplicação e compartilhada com os agentes do Eduardo, por
 * isso esta rota não é chamada pela listagem: só quando o drawer abre, e
 * com cache curto para a reabertura não cobrar de novo.
 *
 * ── A conta sai do anúncio, não do endereço ──
 *
 * O token é por conta de vendedor. Quem diz de qual conta é o anúncio
 * gravado na operação do cookie — passar `conta` pela URL deixaria
 * qualquer um pedir uma leitura na conta de outra empresa.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ mlb: string }> }) {
  const { mlb: cru } = await ctx.params;
  const mlb = decodeURIComponent(cru).trim().toUpperCase();
  if (!/^[A-Z]{3}\d+$/.test(mlb)) {
    return NextResponse.json({ erro: "MLB inválido." }, { status: 400 });
  }

  try {
    const op = await operacaoPadrao();
    if (!op) return NextResponse.json({ erro: "Sem operação." }, { status: 404 });

    const sb = await clienteServidor();
    const { data: anuncio } = await sb
      .from("anuncios")
      .select("conta_canal_id")
      .eq("operacao_id", op.id)
      .eq("codigo_externo", mlb)
      .maybeSingle();

    if (!anuncio?.conta_canal_id) {
      return NextResponse.json({ erro: "Anúncio sem conta nesta operação." }, { status: 404 });
    }

    const r = await promocoesDoAnuncio(anuncio.conta_canal_id, mlb);
    return NextResponse.json(
      { mlb, ...r, lidoEm: new Date().toISOString() },
      /* Promoção do canal muda em minutos, não em segundos. Cinco minutos
         cobrem abrir, fechar e reabrir o mesmo drawer sem gastar cota. */
      { headers: { "cache-control": "private, max-age=300" } }
    );
  } catch (e) {
    console.error("[promocoes-do-anuncio]", e);
    return NextResponse.json({ erro: "Não consegui perguntar ao canal agora." }, { status: 500 });
  }
}
