import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";

/**
 * Grava os custos que só o usuário sabe.
 *
 * Mercadoria, embalagem, alíquota e peso não vêm de planilha nenhuma —
 * são digitados, e sem eles a margem não existe. Ficam em `produtos`,
 * uma linha por SKU.
 *
 * Cliente de SESSÃO, não o privilegiado: o RLS decide quem grava, e
 * `leitor` recebe recusa do banco em vez de uma checagem escrita aqui
 * que alguém pode esquecer de repetir na próxima rota.
 */

type Edicao = {
  produtoId: string;
  custoMercadoria?: number | null;
  embalagem?: number | null;
  freteUnitario?: number | null;
  aliquotaImpostos?: number | null;
  pesoKg?: number | null;
  margemMinimaPct?: number | null;
};

const COLUNA = {
  custoMercadoria: "custo_unitario",
  embalagem: "embalagem",
  freteUnitario: "frete_unitario",
  aliquotaImpostos: "aliquota_impostos",
  pesoKg: "peso_kg",
  margemMinimaPct: "margem_minima_pct",
} as const;

type Campo = keyof typeof COLUNA;
const CAMPOS = Object.keys(COLUNA) as Campo[];

/** Teto por campo. Não é validação de tipo — é rede contra dedo escorregado. */
const TETO: Record<Campo, number> = {
  custoMercadoria: 1_000_000,
  embalagem: 100_000,
  freteUnitario: 100_000,
  aliquotaImpostos: 100,
  pesoKg: 10_000,
  margemMinimaPct: 60,
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

  const edicoes = corpo?.edicoes ?? [];
  if (!Array.isArray(edicoes) || edicoes.some((e) => !e || typeof e.produtoId !== "string")) {
    return NextResponse.json({ erro: "Edições inválidas" }, { status: 400 });
  }
  if (!edicoes.length) {
    return NextResponse.json({ erro: "Nada para gravar" }, { status: 400 });
  }
  if (edicoes.length > 500) {
    return NextResponse.json(
      { erro: "Envie no máximo 500 produtos por vez" },
      { status: 400 }
    );
  }

  /*
   * A operação vem do banco, não do navegador: é o que o RLS confere, e
   * aceitar o que o cliente mandar permitiria escrever na operação de
   * outra pessoa.
   */
  const ids = [...new Set(edicoes.map((e) => e.produtoId))];
  const op = await operacaoPadrao();
  if (!op) return NextResponse.json({ erro: "Escolha uma empresa." }, { status: 409 });
  const { data: pode, error: erroAcesso } = await sb.rpc("pode_editar_operacao", { op: op.id });
  if (erroAcesso || !pode) return NextResponse.json({ erro: "Seu acesso não permite editar custos." }, { status: 403 });
  const { data: existentes, error: erroBusca } = await sb
    .from("produtos")
    .select("id,operacao_id")
    .in("id", ids).eq("operacao_id", op.id);

  if (erroBusca) {
    return NextResponse.json({ erro: erroBusca.message }, { status: 400 });
  }

  const operacaoDe = new Map(
    (existentes ?? []).map((p) => [p.id as string, p.operacao_id as string])
  );

  const linhas: Record<string, unknown>[] = [];

  for (const e of edicoes) {
    const operacao = operacaoDe.get(e.produtoId);
    // Produto que o usuário não enxerga não volta da consulta — o RLS já
    // filtrou. Ignorar em silêncio seria pior que recusar.
    if (!operacao) {
      return NextResponse.json(
        { erro: `Produto ${e.produtoId} não encontrado ou sem acesso` },
        { status: 403 }
      );
    }

    const linha: Record<string, unknown> = {
      id: e.produtoId,
      operacao_id: operacao,
      custo_atualizado_em: new Date().toISOString(),
    };

    let mexeu = false;
    for (const campo of CAMPOS) {
      if (!(campo in e)) continue;
      const v = e[campo];

      /*
       * `null` é gravável de propósito: apagar o campo é uma ação, e a
       * pessoa que percebeu que digitou o custo errado precisa poder
       * deixá-lo vazio de novo. Vazio devolve a margem ao estado "não
       * calculável", que é a verdade enquanto o custo não se sabe.
       */
      if (v === null) {
        linha[COLUNA[campo]] = null;
        mexeu = true;
        continue;
      }
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        return NextResponse.json(
          { erro: `Valor inválido em ${campo} do produto ${e.produtoId}` },
          { status: 400 }
        );
      }
      if (v > TETO[campo]) {
        return NextResponse.json(
          { erro: `Valor fora do razoável em ${campo}: ${v}` },
          { status: 400 }
        );
      }
      linha[COLUNA[campo]] = v;
      mexeu = true;
    }

    if (mexeu) linhas.push(linha);
  }

  if (!linhas.length) {
    return NextResponse.json({ erro: "Nada para gravar" }, { status: 400 });
  }

  // Atualiza somente campos enviados. Upsert exigia SKU/título e podia
  // limpar campos de outros produtos em lotes com edições diferentes.
  let gravados = 0;
  for (let i = 0; i < linhas.length; i += 10) {
    const resultados = await Promise.all(linhas.slice(i, i + 10).map(async ({ id, operacao_id: operacaoId, ...campos }) =>
      sb.from("produtos").update(campos).eq("id", id).eq("operacao_id", operacaoId).select("id").single()
    ));
    gravados += resultados.filter((r) => !r.error && r.data).length;
    const falha = resultados.find((r) => r.error || !r.data);
    if (falha) return NextResponse.json({ erro: `Não foi possível salvar todos os custos. ${gravados} produto(s) gravado(s). Verifique seu acesso e a migração db/38 se editou margem mínima.`, gravados }, { status: 400 });
  }

  return NextResponse.json({ gravados: linhas.length });
}
