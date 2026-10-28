import { NextRequest, NextResponse } from "next/server";
import { gravarFolga } from "@/lib/dados/folga-campanha";

export const dynamic = "force-dynamic";

/** Guarda a folga de um tipo de campanha. A leitura vem pela página. */
export async function POST(req: NextRequest) {
  let corpo: { tipo?: string; folga?: number };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const r = await gravarFolga(corpo.tipo ?? "*", Number(corpo.folga));
  return "erro" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
}
