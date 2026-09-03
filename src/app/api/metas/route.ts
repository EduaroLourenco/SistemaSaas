import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { definirMeta } from "@/lib/dados/metas-planejamento";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Define a meta do mês e a distribui.
 *
 * Um número e uma lista de canais entram; metas por canal e por dia
 * saem. A distribuição roda no servidor, e não no navegador, porque o
 * peso de cada canal vem do histórico — mandá-lo para o cliente só para
 * ele devolver a divisão seria confiar no navegador para uma conta que já
 * temos os dados para fazer aqui.
 */

type Corpo = {
  ano?: number;
  mes?: number;
  total?: number;
  canais?: string[];
};

export async function POST(req: Request) {
  const sb = await clienteServidor();

  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "sem_sessao" },
      { status: 401 }
    );
  }

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const { ano, mes, total, canais } = corpo;

  if (!Number.isInteger(ano) || ano! < 2000 || ano! > 2100) {
    return NextResponse.json({ erro: "Ano inválido." }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes! < 1 || mes! > 12) {
    return NextResponse.json({ erro: "Mês inválido." }, { status: 400 });
  }
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
    return NextResponse.json(
      { erro: "A meta precisa ser um valor positivo." },
      { status: 400 }
    );
  }
  if (!Array.isArray(canais) || !canais.length) {
    return NextResponse.json(
      { erro: "Escolha ao menos um canal para a meta." },
      { status: 400 }
    );
  }

  const operacao = await operacaoPadrao();
  if (!operacao) {
    return NextResponse.json(
      { erro: "Nenhuma operação acessível." },
      { status: 403 }
    );
  }

  try {
    const r = await definirMeta(
      { ano: ano!, mes: mes!, total, canaisSelecionados: canais },
      operacao.id
    );

    return NextResponse.json({
      canais: r.canais,
      dias: r.dias,
      // O aviso não impede a gravação: os dias fixados continuam valendo,
      // e quem os fixou precisa saber que já passaram do total do mês.
      aviso: r.estourou.length
        ? `Em ${r.estourou.join(", ")}, os dias fixados à mão já somam mais que a meta do mês. Os demais dias ficaram em zero.`
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao gravar.";
    const semPermissao = /row-level security|42501/i.test(msg);
    return NextResponse.json(
      { erro: semPermissao ? "Seu papel não permite definir metas." : msg },
      { status: semPermissao ? 403 : 400 }
    );
  }
}
