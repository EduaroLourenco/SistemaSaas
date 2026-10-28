import { NextRequest, NextResponse } from "next/server";
import { gravarRegra, apagarRegra, reordenar, type RegraParaGravar } from "@/lib/dados/regras-promocao";

export const dynamic = "force-dynamic";

/** Salvar, apagar e reordenar regra. A leitura vem pela página. */
export async function POST(req: NextRequest) {
  let corpo: { acao?: string; regra?: RegraParaGravar; id?: string; ids?: string[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  if (corpo.acao === "apagar" && corpo.id) {
    const r = await apagarRegra(corpo.id);
    return r.erro ? NextResponse.json(r, { status: 400 }) : NextResponse.json({ ok: true });
  }

  if (corpo.acao === "reordenar" && Array.isArray(corpo.ids)) {
    const r = await reordenar(corpo.ids);
    return r.erro ? NextResponse.json(r, { status: 400 }) : NextResponse.json({ ok: true });
  }

  if (!corpo.regra) return NextResponse.json({ erro: "faltou a regra" }, { status: 400 });
  const r = await gravarRegra(corpo.regra);
  return "erro" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
}
