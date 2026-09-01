import { NextResponse } from "next/server";
import { operacaoPadrao } from "@/lib/dados/operacao";

export const runtime = "nodejs";

/**
 * Qual operação a tela deve usar.
 *
 * Existe para o navegador não ter que adivinhar. A regra — a operação com
 * mais canais cadastrados — já mordeu uma vez: escolher a primeira em
 * ordem alfabética levava a "Loja própria", que não tem canal nenhum, e
 * toda importação era recusada por "canal desconhecido".
 *
 * Deixar a regra em um lugar só evita que o front e o back discordem
 * sobre onde o arquivo deve ir.
 */
export async function GET() {
  try {
    const op = await operacaoPadrao();
    if (!op) {
      return NextResponse.json({ erro: "Nenhuma operação visível." }, { status: 403 });
    }
    return NextResponse.json({ id: op.id, nome: op.nome, canais: op.canais });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha." },
      { status: 500 }
    );
  }
}
