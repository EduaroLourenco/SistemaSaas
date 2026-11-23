import { NextRequest, NextResponse } from "next/server";
import { carregarAcompanhamento } from "@/lib/dados/acompanhamento";
import { clienteServidor } from "@/lib/supabase/servidor";

export const runtime = "nodejs";
// A montagem lê pedidos, tráfego e promoções: 15–26 s no script (chave de serviço), 36 s ou mais
// na Vercel (com RLS), e passou de 60 s em "Ontem" (23/11). Mesmo teto das outras rotas pesadas.
export const maxDuration = 300;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?de=&ate=[&deAnt=&ateAnt=] — os gatilhos do Mercado Livre no período, contra o anterior (padrão: mesmo tamanho, logo antes). */
export async function GET(req: NextRequest) {
  const sb = await clienteServidor();
  if (!(await sb.auth.getUser()).data.user) return NextResponse.json({ erro: "Entre novamente para consultar." }, { status: 401 });
  const de = req.nextUrl.searchParams.get("de") ?? "";
  const ate = req.nextUrl.searchParams.get("ate") ?? "";
  if (!ISO.test(de) || !ISO.test(ate) || de > ate) return NextResponse.json({ erro: "Período inválido." }, { status: 400 });
  try {
    const deAnt = req.nextUrl.searchParams.get("deAnt") ?? "";
    const ateAnt = req.nextUrl.searchParams.get("ateAnt") ?? "";
    const anterior = ISO.test(deAnt) && ISO.test(ateAnt) && deAnt <= ateAnt && ateAnt < de ? { de: deAnt, ate: ateAnt } : undefined;
    return NextResponse.json(await carregarAcompanhamento(de, ate, anterior));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
