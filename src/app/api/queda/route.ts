import { NextRequest, NextResponse } from "next/server";
import { serieDaQueda, carregarQueda } from "@/lib/dados/queda";
import { clienteServidor } from "@/lib/supabase/servidor";

export const runtime = "nodejs";

/** GET ?chave=&de=&ate=&canais= — o dia a dia de uma linha da análise de queda. */
export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  if (!(await sb.auth.getUser()).data.user) return NextResponse.json({ erro: "Entre novamente para consultar." }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const chave = p.get("chave") ?? "";
  if (!/^[aps]:.{1,200}$/.test(chave)) return NextResponse.json({ erro: "Linha inválida." }, { status: 400 });
  try {
    const [dias, analise] = await Promise.all([
      serieDaQueda(chave, p.get("de") ?? "", p.get("ate") ?? "", p.get("canais") ?? undefined),
      chave.startsWith("p:") && p.get("inicioAtual") ? carregarQueda({ de: p.get("inicioAtual")!, ate: p.get("ate") ?? undefined, canais: p.get("canais") ?? undefined, nivel: "anuncio", sku: chave.slice(2) }) : null,
    ]);
    const sku = chave.slice(2).trim().toUpperCase();
    const anuncios = analise?.linhas.filter((l) => l.sku.trim().toUpperCase() === sku || l.codigo.toUpperCase() === sku) ?? [];
    return NextResponse.json({ dias, anuncios });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
