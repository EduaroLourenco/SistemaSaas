import { NextResponse } from "next/server";
import { COOKIE_OPERACAO, listarOperacoes, operacaoPadrao } from "@/lib/dados/operacao";

export const runtime = "nodejs";

/**
 * Qual operação a tela deve usar, e como trocar.
 *
 * Existe para o navegador não ter que adivinhar. A regra do padrão — a
 * operação com mais canais cadastrados — já mordeu uma vez: escolher a
 * primeira em ordem alfabética levava a "Loja própria", que não tem canal
 * nenhum, e toda importação era recusada por "canal desconhecido".
 *
 * Deixar a regra em um lugar só evita que o front e o back discordem
 * sobre onde o arquivo deve ir.
 */
export async function GET() {
  try {
    const [op, todas] = await Promise.all([operacaoPadrao(), listarOperacoes()]);
    if (!op) {
      return NextResponse.json({ erro: "Nenhuma operação visível." }, { status: 403 });
    }
    return NextResponse.json({
      id: op.id,
      nome: op.nome,
      canais: op.canais,
      empresa: op.empresa,
      operacoes: todas,
    });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha." },
      { status: 500 }
    );
  }
}

/**
 * Troca a operação da sessão.
 *
 * Só grava o cookie depois de conferir que a operação aparece em
 * `listarOperacoes()`, que lê pelo cliente de sessão e já passa pelo RLS —
 * então um id de outra empresa não casa com nada e é recusado aqui, não
 * silenciosamente ignorado lá na frente.
 */
export async function POST(req: Request) {
  try {
    const corpo = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof corpo?.id === "string" ? corpo.id.trim() : "";
    if (!id) {
      return NextResponse.json({ erro: "Diga qual operação." }, { status: 400 });
    }

    const todas = await listarOperacoes();
    const achada = todas.find((o) => o.id === id);
    if (!achada) {
      return NextResponse.json(
        { erro: "Essa operação não existe ou não é sua." },
        { status: 403 }
      );
    }

    const resposta = NextResponse.json({
      id: achada.id,
      nome: achada.nome,
      empresa: achada.empresa,
    });
    resposta.cookies.set({
      name: COOKIE_OPERACAO,
      value: achada.id,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
    return resposta;
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha." },
      { status: 500 }
    );
  }
}
