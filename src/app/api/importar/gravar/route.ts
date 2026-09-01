import { NextResponse } from "next/server";
import { gravar } from "@/lib/dados/gravar-importacao";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { lerArquivoEnviado } from "@/lib/dados/arquivo-enviado";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const lido = await lerArquivoEnviado(form);
    if ("erro" in lido) {
      return NextResponse.json({ erro: lido.erro }, { status: 400 });
    }

    let operacaoId = String(form.get("operacao") ?? "");
    if (!operacaoId) {
      const op = await operacaoPadrao();
      if (!op) {
        return NextResponse.json(
          { erro: "Nenhuma operação visível para o seu usuário." },
          { status: 403 }
        );
      }
      operacaoId = op.id;
    }

    const conta = String(form.get("conta") ?? "") || undefined;
    const resultado = await gravar(lido.buffer, lido.nome, operacaoId, conta);
    return NextResponse.json({ resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao gravar.";
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
