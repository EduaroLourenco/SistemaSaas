import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * Grava lançamentos diários.
 *
 * A tela de Lançamentos existe para preencher o que a planilha não trouxe —
 * hoje, as visitas e a mídia dos dias de agosto que vieram só da listagem
 * de pedidos. Até aqui ela guardava as edições em estado do React: o
 * usuário digitava, via "salvo", e perdia tudo ao recarregar.
 *
 * Usa o cliente de SESSÃO, não o privilegiado. Assim o RLS decide quem
 * pode gravar — `leitor` recebe recusa do banco, não uma checagem que
 * alguém pode esquecer de escrever aqui.
 */

type Edicao = {
  contaCanalId: string;
  data: string;
  visitas?: number;
  receita?: number;
  pedidos?: number;
  investimentoAds?: number;
  pedidosCancelados?: number;
  valorCancelado?: number;
};

const CAMPOS = [
  "visitas",
  "receita",
  "pedidos",
  "investimentoAds",
  "pedidosCancelados",
  "valorCancelado",
] as const;

const COLUNA: Record<(typeof CAMPOS)[number], string> = {
  visitas: "visitas",
  receita: "receita",
  pedidos: "pedidos",
  investimentoAds: "investimento_ads",
  pedidosCancelados: "pedidos_cancelados",
  valorCancelado: "valor_cancelado",
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

  let corpo: { edicoes?: Edicao[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const edicoes = corpo.edicoes ?? [];
  if (!edicoes.length) {
    return NextResponse.json({ erro: "Nada para gravar" }, { status: 400 });
  }
  if (edicoes.length > 500) {
    return NextResponse.json(
      { erro: "Envie no máximo 500 dias por vez" },
      { status: 400 }
    );
  }

  /*
   * Precisa da operação de cada conta: `operacao_id` é o que o RLS checa, e
   * confiar no que o navegador mandar permitiria gravar na operação de
   * outra pessoa. Vem do banco.
   */
  const contas = [...new Set(edicoes.map((e) => e.contaCanalId))];
  const { data: info, error: erroContas } = await sb
    .from("contas_canal")
    .select("id,canal_id,operacao_id")
    .in("id", contas);

  if (erroContas) {
    return NextResponse.json({ erro: erroContas.message }, { status: 400 });
  }

  const porConta = new Map(
    (info ?? []).map((c) => [
      c.id as string,
      { canal: c.canal_id as string, operacao: c.operacao_id as string },
    ])
  );

  const linhas = [];
  for (const e of edicoes) {
    const c = porConta.get(e.contaCanalId);
    // Conta que o usuário não enxerga não volta da consulta acima — o RLS
    // já a filtrou. Ignorar em silêncio seria pior que recusar.
    if (!c) {
      return NextResponse.json(
        { erro: `Conta ${e.contaCanalId} não encontrada ou sem acesso` },
        { status: 403 }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data)) {
      return NextResponse.json({ erro: `Data inválida: ${e.data}` }, { status: 400 });
    }

    const linha: Record<string, unknown> = {
      operacao_id: c.operacao,
      canal_id: c.canal,
      conta_canal_id: e.contaCanalId,
      data: e.data,
      origem: "manual",
    };
    for (const campo of CAMPOS) {
      const v = e[campo];
      if (v == null) continue;
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json(
          { erro: `Valor inválido em ${campo} de ${e.data}` },
          { status: 400 }
        );
      }
      linha[COLUNA[campo]] = v;
    }
    linhas.push(linha);
  }

  const { error } = await sb
    .from("vendas_diarias")
    .upsert(linhas, { onConflict: "conta_canal_id,data" });

  if (error) {
    // 42501 é recusa do RLS: papel sem permissão de escrita.
    const semPermissao = error.code === "42501";
    return NextResponse.json(
      {
        erro: semPermissao
          ? "Seu papel não permite gravar lançamentos."
          : error.message,
      },
      { status: semPermissao ? 403 : 400 }
    );
  }

  return NextResponse.json({ gravados: linhas.length });
}
