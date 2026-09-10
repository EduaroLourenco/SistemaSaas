import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import {
  RECURSOS,
  paraColunas,
  ocorrencias,
} from "@/lib/dados/cadastros-financeiros";

/**
 * Grava e apaga os cadastros do financeiro.
 *
 * Uma rota para os cinco recursos. O que ela aceita de cada um está
 * declarado em `cadastros-financeiros.ts` — o corpo do pedido não escolhe
 * tabela nem coluna, só preenche o que o recurso já permitia.
 *
 * Cliente de SESSÃO, como nas outras rotas: quem decide se pode gravar é
 * o RLS, e `leitor` toma recusa do banco em vez de uma checagem escrita
 * aqui que a próxima rota esquece de repetir.
 */

function naoAutenticado() {
  return NextResponse.json(
    { erro: "Não autenticado", codigo: "sem_sessao" },
    { status: 401 }
  );
}

function traduzir(error: { code?: string; message: string }) {
  if (error.code === "42501")
    return { erro: "Seu papel não permite gravar aqui.", status: 403 };
  if (error.code === "23505")
    return { erro: "Já existe um registro com esse identificador.", status: 409 };
  if (error.code === "23503")
    return { erro: "Referência apontando para algo que não existe.", status: 400 };
  if (error.code === "42703")
    return {
      erro:
        "Coluna ausente no banco. Rode a migração db/17_financeiro.sql no Supabase.",
      status: 400,
    };
  return { erro: error.message, status: 400 };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ recurso: string }> }
) {
  const { recurso: nome } = await params;
  const recurso = RECURSOS[nome];
  if (!recurso) {
    return NextResponse.json({ erro: "Recurso desconhecido" }, { status: 404 });
  }

  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) return naoAutenticado();

  let corpo: {
    id?: string;
    dados?: Record<string, unknown>;
    /** Gera as ocorrências futuras. Só em `contas`. */
    replicar?: boolean;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const dados = corpo.dados ?? {};
  const editando = Boolean(corpo.id);

  /*
   * Na edição só chegam os campos que mudaram, então obrigatório ausente
   * não é erro — o valor continua no banco. Na criação é.
   */
  const { linha, erros } = paraColunas(recurso, dados, { parcial: editando });
  if (erros.length) {
    return NextResponse.json(
      {
        erro: `Confira ${erros.map((e) => `${e.campo} (${e.motivo})`).join(", ")}`,
        campos: erros,
      },
      { status: 400 }
    );
  }
  if (!Object.keys(linha).length) {
    return NextResponse.json({ erro: "Nada para gravar" }, { status: 400 });
  }

  /*
   * A operação vem do banco. Na edição, da própria linha — assim mudar um
   * registro nunca o move de empresa. Na criação, da operação atual.
   */
  let operacaoId: string;
  if (editando) {
    const { data: atual, error } = await sb
      .from(recurso.tabela)
      .select("id,operacao_id")
      .eq("id", corpo.id!)
      .maybeSingle();
    if (error) {
      const t = traduzir(error);
      return NextResponse.json({ erro: t.erro }, { status: t.status });
    }
    if (!atual) {
      return NextResponse.json(
        { erro: `Essa ${recurso.nome} não existe ou você não tem acesso.` },
        { status: 404 }
      );
    }
    operacaoId = atual.operacao_id as string;
    linha.id = corpo.id;
  } else {
    const operacao = await operacaoPadrao();
    if (!operacao) {
      return NextResponse.json(
        { erro: "Nenhuma operação disponível para esta conta." },
        { status: 403 }
      );
    }
    operacaoId = operacao.id;
  }
  linha.operacao_id = operacaoId;

  const { data: gravado, error } = await sb
    .from(recurso.tabela)
    .upsert(linha, { onConflict: "id" })
    .select(recurso.selecao)
    .maybeSingle();

  if (error) {
    const t = traduzir(error);
    return NextResponse.json({ erro: t.erro }, { status: t.status });
  }

  /*
   * Recorrência: as ocorrências futuras nascem aqui, uma linha por
   * competência. Só na criação — replicar de novo numa edição duplicaria
   * os meses que já existem.
   */
  let replicadas = 0;
  if (
    nome === "contas" &&
    corpo.replicar &&
    !editando &&
    gravado &&
    typeof linha.periodicidade === "string" &&
    linha.periodicidade !== "unica"
  ) {
    const futuras = ocorrencias(
      String(linha.competencia),
      (linha.vencimento as string) ?? null,
      linha.periodicidade,
      (linha.recorrencia_fim as string) ?? null
    );

    if (futuras.length) {
      const mae = gravado as unknown as Record<string, unknown>;
      const filhas = futuras.map((o) => ({
        operacao_id: operacaoId,
        tipo: mae.tipo,
        categoria_id: mae.categoria_id,
        fornecedor_id: mae.fornecedor_id,
        funcionario_id: mae.funcionario_id,
        canal_id: mae.canal_id,
        descricao: mae.descricao,
        documento: mae.documento,
        valor: mae.valor,
        competencia: o.competencia,
        vencimento: o.vencimento,
        // A ocorrência futura nasce prevista, nunca em aberto: ela ainda
        // não é uma dívida, é uma expectativa. A DRE lê as duas
        // diferente.
        status: "previsto",
        forma_pagamento: mae.forma_pagamento,
        periodicidade: "unica",
        observacao: mae.observacao,
        origem_recorrencia_id: mae.id,
      }));

      const { error: erroFilhas } = await sb
        .from("lancamentos_financeiros")
        .insert(filhas);
      if (erroFilhas) {
        // A mãe já está gravada. Recusar tudo agora seria mentir sobre o
        // que aconteceu; melhor dizer o que faltou.
        return NextResponse.json({
          registro: gravado,
          replicadas: 0,
          aviso: `A conta foi gravada, mas as ocorrências futuras não: ${erroFilhas.message}`,
        });
      }
      replicadas = filhas.length;
    }
  }

  return NextResponse.json({ registro: gravado, replicadas });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ recurso: string }> }
) {
  const { recurso: nome } = await params;
  const recurso = RECURSOS[nome];
  if (!recurso) {
    return NextResponse.json({ erro: "Recurso desconhecido" }, { status: 404 });
  }

  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) return naoAutenticado();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const comFilhas = searchParams.get("filhas") === "1";
  if (!id) {
    return NextResponse.json({ erro: "Informe o id" }, { status: 400 });
  }

  /*
   * Apagar a conta-mãe deixa as ocorrências futuras órfãs — visíveis, sem
   * origem, impossíveis de apagar em bloco depois. Quem apaga a mãe
   * decide se leva as filhas junto.
   */
  if (nome === "contas" && comFilhas) {
    const { error: erroFilhas } = await sb
      .from("lancamentos_financeiros")
      .delete()
      .eq("origem_recorrencia_id", id)
      // Uma ocorrência já paga é fato consumado: some da projeção, não do
      // histórico.
      .neq("status", "pago");
    if (erroFilhas) {
      const t = traduzir(erroFilhas);
      return NextResponse.json({ erro: t.erro }, { status: t.status });
    }
  }

  const { error } = await sb.from(recurso.tabela).delete().eq("id", id);
  if (error) {
    const t = traduzir(error);
    return NextResponse.json({ erro: t.erro }, { status: t.status });
  }

  return NextResponse.json({ apagado: id });
}
