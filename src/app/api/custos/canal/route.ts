import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";

/**
 * Despesas de canal, separadas por como se comportam no tempo.
 *
 *   ads                  — mídia; já entra pelo lançamento diário
 *   fixa_recorrente      — todo mês, mesmo valor (mensalidade da plataforma)
 *   variavel_recorrente  — todo mês, valor diferente (taxas, frete extra)
 *   variavel_avulsa      — não estava previsto (multa, reprocessamento)
 *
 * A separação decide o que dá para projetar. Previsão do mês que vem soma
 * a fixa inteira, projeta a variável recorrente pela média dos meses
 * anteriores e ignora a avulsa por definição. Com um booleano
 * `recorrente` — que era o que a tabela tinha — nenhuma das três é
 * possível.
 *
 * Grava em `lancamentos_financeiros`, que já existia com canal, valor e
 * competência. Criar tabela nova duplicaria o lugar onde despesa mora, e
 * a segunda cópia é a que fica desatualizada.
 */

const NATUREZAS = [
  "ads",
  "fixa_recorrente",
  "variavel_recorrente",
  "variavel_avulsa",
] as const;

type Natureza = (typeof NATUREZAS)[number];

type Despesa = {
  id?: string;
  canalId: string | null;
  natureza: Natureza;
  descricao: string;
  valor: number;
  competencia: string;
};

export async function POST(req: Request) {
  const sb = await clienteServidor();

  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  let corpo: { despesas?: Despesa[]; apagar?: string[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const operacao = await operacaoPadrao();
  if (!operacao) {
    return NextResponse.json({ erro: "Nenhuma operação acessível." }, { status: 403 });
  }

  const apagar = corpo.apagar ?? [];
  if (apagar.length) {
    const { error } = await sb
      .from("lancamentos_financeiros")
      .delete()
      .in("id", apagar);
    if (error) {
      return NextResponse.json(
        {
          erro:
            error.code === "42501"
              ? "Seu papel não permite apagar despesas."
              : error.message,
        },
        { status: error.code === "42501" ? 403 : 400 }
      );
    }
  }

  const despesas = corpo.despesas ?? [];
  if (!despesas.length && !apagar.length) {
    return NextResponse.json({ erro: "Nada para gravar" }, { status: 400 });
  }

  const linhas: Record<string, unknown>[] = [];
  for (const d of despesas) {
    if (!NATUREZAS.includes(d.natureza)) {
      return NextResponse.json(
        { erro: `Natureza desconhecida: ${d.natureza}` },
        { status: 400 }
      );
    }
    if (typeof d.valor !== "number" || !Number.isFinite(d.valor) || d.valor <= 0) {
      return NextResponse.json(
        { erro: "O valor precisa ser maior que zero." },
        { status: 400 }
      );
    }
    if (!d.descricao?.trim()) {
      return NextResponse.json(
        { erro: "A descrição é obrigatória — é o que identifica a despesa depois." },
        { status: 400 }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.competencia)) {
      return NextResponse.json(
        { erro: `Competência inválida: ${d.competencia}` },
        { status: 400 }
      );
    }

    linhas.push({
      ...(d.id ? { id: d.id } : {}),
      operacao_id: operacao.id,
      canal_id: d.canalId || null,
      tipo: "saida",
      natureza: d.natureza,
      descricao: d.descricao.trim(),
      valor: d.valor,
      competencia: d.competencia,
      // `recorrente` continua preenchido para as telas antigas do
      // financeiro, que ainda leem o booleano.
      recorrente: d.natureza === "fixa_recorrente" || d.natureza === "variavel_recorrente",
      status: "em_aberto",
      atualizado_em: new Date().toISOString(),
    });
  }

  if (linhas.length) {
    const { error } = await sb.from("lancamentos_financeiros").upsert(linhas);
    if (error) {
      return NextResponse.json(
        {
          erro:
            error.code === "42501"
              ? "Seu papel não permite lançar despesas."
              : error.message,
        },
        { status: error.code === "42501" ? 403 : 400 }
      );
    }
  }

  return NextResponse.json({ gravadas: linhas.length, apagadas: apagar.length });
}
