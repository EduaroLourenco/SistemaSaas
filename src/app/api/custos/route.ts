import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

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
  aliquotaImpostos?: number | null;
  pesoKg?: number | null;
};

const COLUNA = {
  custoMercadoria: "custo_unitario",
  embalagem: "embalagem",
  aliquotaImpostos: "aliquota_impostos",
  pesoKg: "peso_kg",
} as const;

type Campo = keyof typeof COLUNA;
const CAMPOS = Object.keys(COLUNA) as Campo[];

/** Teto por campo. Não é validação de tipo — é rede contra dedo escorregado. */
const TETO: Record<Campo, number> = {
  custoMercadoria: 1_000_000,
  embalagem: 100_000,
  aliquotaImpostos: 100,
  pesoKg: 10_000,
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
  const { data: existentes, error: erroBusca } = await sb
    .from("produtos")
    .select("id,operacao_id")
    .in("id", ids);

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

  /*
   * Upsert pelo id. As colunas ausentes do payload não entram no
   * `DO UPDATE`, então preencher só a embalagem não zera o custo que já
   * estava lá.
   */
  const { error } = await sb.from("produtos").upsert(linhas, { onConflict: "id" });

  if (error) {
    const semPermissao = error.code === "42501";
    return NextResponse.json(
      {
        erro: semPermissao
          ? "Seu papel não permite gravar custos."
          : error.message,
      },
      { status: semPermissao ? 403 : 400 }
    );
  }

  return NextResponse.json({ gravados: linhas.length });
}
