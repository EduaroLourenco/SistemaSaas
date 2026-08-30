import { NextResponse } from "next/server";
import { previsualizar } from "@/lib/dados/importar";
import { operacaoPadrao } from "@/lib/dados/operacao";

/**
 * Diz o que ACONTECERIA, sem tocar no banco.
 *
 * A leitura roda inteira: o custo de processar duas vezes é irrelevante
 * perto do custo de desfazer uma importação errada na mão.
 */
export const runtime = "nodejs";
// A leitura de planilha grande estoura o limite padrão.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) {
      return NextResponse.json(
        { erro: "Nenhum arquivo enviado." },
        { status: 400 }
      );
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

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const previa = await previsualizar(buffer, arquivo.name, operacaoId);
    return NextResponse.json({ previa, operacaoId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao ler a planilha.";
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
