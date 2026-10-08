import { NextRequest, NextResponse } from "next/server";
import { serieDaQueda } from "@/lib/dados/queda";

export const runtime = "nodejs";

/** GET ?chave=&de=&ate=&canais= — o dia a dia de uma linha da análise de queda. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const chave = p.get("chave") ?? "";
  if (!/^[aps]:.{1,200}$/.test(chave)) return NextResponse.json({ erro: "Linha inválida." }, { status: 400 });
  try {
    const dias = await serieDaQueda(chave, p.get("de") ?? "", p.get("ate") ?? "", p.get("canais") ?? undefined);
    return NextResponse.json({ dias });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 });
  }
}
