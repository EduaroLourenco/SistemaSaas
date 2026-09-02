import { NextRequest, NextResponse } from "next/server";
import { pegarPacote, descartarPacote } from "@/lib/planilhas/pacotes";

export const runtime = "nodejs";

/** Entrega o .zip gerado pelo processamento. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const buffer = await pegarPacote(id);

  if (!buffer) {
    return NextResponse.json(
      { erro: "Pacote expirado ou inexistente. Processe as planilhas de novo." },
      { status: 404 }
    );
  }

  // Entregue o arquivo, ele não serve mais: quem precisar de novo
  // processa de novo, que leva segundos. Sem isso o bucket só cresce.
  void descartarPacote(id);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="promocoes-processadas.zip"',
      "Content-Length": String(buffer.length),
    },
  });
}
