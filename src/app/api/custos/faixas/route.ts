import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";

/**
 * Faixas de frete por peso: o valor de partida, antes de existir venda.
 *
 * Uma faixa sem canal vale para todos. Operação nova começa com uma
 * tabela só, e exigir dezesseis cópias iguais garantiria que ninguém
 * cadastrasse nenhuma; onde o canal tem tabela própria, a linha
 * específica ganha da geral na hora de calcular.
 */

type Faixa = {
  id?: string;
  canalId?: string | null;
  pesoMin: number;
  pesoMax: number;
  valor: number;
  vigenciaInicio?: string;
};

export async function POST(req: Request) {
  const sb = await clienteServidor();

  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  let corpo: { faixas?: Faixa[]; apagar?: string[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const operacao = await operacaoPadrao();
  if (!operacao) {
    return NextResponse.json(
      { erro: "Nenhuma operação acessível." },
      { status: 403 }
    );
  }

  /* ── Apagar ── */

  const apagar = corpo.apagar ?? [];
  if (apagar.length) {
    const { error } = await sb.from("faixas_frete").delete().in("id", apagar);
    if (error) {
      const semPermissao = error.code === "42501";
      return NextResponse.json(
        {
          erro: semPermissao
            ? "Seu papel não permite apagar faixas."
            : error.message,
        },
        { status: semPermissao ? 403 : 400 }
      );
    }
  }

  /* ── Gravar ── */

  const faixas = corpo.faixas ?? [];
  if (!faixas.length && !apagar.length) {
    return NextResponse.json({ erro: "Nada para gravar" }, { status: 400 });
  }

  const linhas: Record<string, unknown>[] = [];
  for (const f of faixas) {
    const nums = [f.pesoMin, f.pesoMax, f.valor];
    if (nums.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return NextResponse.json(
        { erro: "Peso e valor precisam ser números positivos." },
        { status: 400 }
      );
    }
    // O banco também recusa, pelo check. Recusar aqui devolve uma frase
    // em vez de um erro de constraint que a tela não sabe traduzir.
    if (f.pesoMax <= f.pesoMin) {
      return NextResponse.json(
        { erro: `Faixa inválida: o peso final (${f.pesoMax}) precisa ser maior que o inicial (${f.pesoMin}).` },
        { status: 400 }
      );
    }

    linhas.push({
      ...(f.id ? { id: f.id } : {}),
      operacao_id: operacao.id,
      canal_id: f.canalId || null,
      peso_min_kg: f.pesoMin,
      peso_max_kg: f.pesoMax,
      valor: f.valor,
      vigencia_inicio: f.vigenciaInicio ?? new Date().toISOString().slice(0, 10),
      atualizado_em: new Date().toISOString(),
    });
  }

  if (linhas.length) {
    const { error } = await sb.from("faixas_frete").upsert(linhas);
    if (error) {
      const semPermissao = error.code === "42501";
      const duplicada = error.code === "23505";
      return NextResponse.json(
        {
          erro: semPermissao
            ? "Seu papel não permite cadastrar faixas."
            : duplicada
              ? "Já existe uma faixa começando nesse peso, com a mesma vigência."
              : error.message,
        },
        { status: semPermissao ? 403 : 400 }
      );
    }
  }

  return NextResponse.json({ gravadas: linhas.length, apagadas: apagar.length });
}
