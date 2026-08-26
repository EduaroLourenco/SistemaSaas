import { NextRequest, NextResponse } from "next/server";
import { pegarPacote } from "@/lib/planilhas/pacotes";

export const runtime = "nodejs";

/** Entrega o .zip gerado pelo processamento. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const buffer = pegarPacote(id);

  if (!buffer) {
    return NextResponse.json(
      { erro: "Pacote expirado ou inexistente. Processe as planilhas de novo." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="promocoes-processadas.zip"',
      "Content-Length": String(buffer.length),
    },
  });
}
