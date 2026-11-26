import { NextRequest, NextResponse } from "next/server";
import { carregarContextoSugestoes, carregarSugestoesDaConta } from "@/lib/dados/sugestoes";

export const dynamic = "force-dynamic";
/* Uma conta grande leva minutos: 753 anúncios a 4 por segundo. */
export const maxDuration = 300;

/**
 * O dado bruto das Promoções sugeridas — a decisão roda na tela.
 *
 *   sem `conta`  → contexto: contas, parâmetros, fonte do preço mínimo (só banco)
 *   `conta=<id>` → os anúncios daquela conta com os convites ao vivo
 *   `forcar=1`   → fura o cache e relê o canal
 */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const conta = q.get("conta");
  try {
    if (!conta) return NextResponse.json(await carregarContextoSugestoes());
    return NextResponse.json(await carregarSugestoesDaConta(conta, q.get("forcar") === "1"));
  } catch (e) {
    console.error("[sugestoes]", e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : "não consegui montar as sugestões" }, { status: 500 });
  }
}
