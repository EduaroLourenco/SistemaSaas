import { NextRequest, NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { carregarEstoques } from "@/lib/dados/estoques";

export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  if (!(await sb.auth.getUser()).data.user) return NextResponse.json({ erro: "Entre novamente para consultar." }, { status: 401 });
  const sku = req.nextUrl.searchParams.get("sku")?.trim();
  const anuncio = req.nextUrl.searchParams.get("anuncio")?.trim();
  if ((!sku && !anuncio) || (sku?.length ?? 0) > 200 || (anuncio && !/^MLB\d+$/i.test(anuncio))) return NextResponse.json({ erro: "Escolha um produto." }, { status: 400 });
  try {
    const d = await carregarEstoques({ sku, skuExato: true, anuncio, pagina: Number(req.nextUrl.searchParams.get("pagina") || 0) });
    return NextResponse.json(d);
  } catch {
    return NextResponse.json({ erro: "Não foi possível consultar os depósitos." }, { status: 503 });
  }
}
