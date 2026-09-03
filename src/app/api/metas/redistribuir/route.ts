import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { redistribuirRestante } from "@/lib/dados/mtd";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Joga o que falta do mês nos dias que ainda não vieram.
 *
 * Um clique, sem parâmetro de valor: o quanto redistribuir não é escolha
 * do usuário, é a conta `meta do mês − realizado`. Deixar esse número ser
 * digitado abriria a porta para redistribuir um valor que não fecha com a
 * meta, e o alvo do mês deixaria de somar.
 */
export async function POST(req: Request) {
  const sb = await clienteServidor();

  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  let corpo: { ano?: number; mes?: number; canais?: string[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const { ano, mes, canais } = corpo;
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes! < 1 || mes! > 12) {
    return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });
  }

  const operacao = await operacaoPadrao();
  if (!operacao) {
    return NextResponse.json({ erro: "Nenhuma operação acessível." }, { status: 403 });
  }

  try {
    const r = await redistribuirRestante(ano!, mes!, operacao.id, canais);
    return NextResponse.json({
      canais: r.canais,
      dias: r.dias,
      total: r.total,
      aviso: r.semDiasLivres.length
        ? "O mês já acabou para algum canal selecionado — não há dia futuro onde redistribuir."
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao redistribuir.";
    const semPermissao = /row-level security|42501/i.test(msg);
    return NextResponse.json(
      { erro: semPermissao ? "Seu papel não permite ajustar metas." : msg },
      { status: semPermissao ? 403 : 400 }
    );
  }
}
