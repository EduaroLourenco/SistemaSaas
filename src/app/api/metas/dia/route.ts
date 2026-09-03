import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import {
  ratearNoMes,
  pesosDaSemana,
  primeiroDiaDoMes,
  ultimoDiaDoMes,
} from "@/lib/dados/ratear-meta";

export const runtime = "nodejs";

/**
 * Fixa (ou solta) a meta de um dia, redistribuindo o resto do mês.
 *
 * ── Por que redistribuir na hora ──
 *
 * Mudar o dia 12 sem mexer nos outros faria o mês somar diferente do que
 * foi definido, e ninguém veria: a tela mostraria o dia certo e o total
 * errado. Aqui o dia entra como fixo e o restante da meta do canal é
 * redividido entre os dias que não foram fixados.
 *
 * ── Soltar é uma ação ──
 *
 * Mandar `manual: false` devolve o dia ao rateio. Sem isso, um ajuste
 * feito por engano ficaria preso para sempre, e a única saída seria
 * digitar de volta um valor que ninguém sabe qual era.
 */

type Corpo = {
  canalId?: string;
  data?: string;
  valor?: number;
  manual?: boolean;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

export async function POST(req: Request) {
  const sb = await clienteServidor();

  const { data: sessao } = await sb.auth.getUser();
  if (!sessao.user) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido" }, { status: 400 });
  }

  const { canalId, data, valor, manual = true } = corpo;

  if (!canalId) {
    return NextResponse.json({ erro: "Informe o canal." }, { status: 400 });
  }
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ erro: `Data inválida: ${data}` }, { status: 400 });
  }
  if (manual && (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0)) {
    return NextResponse.json(
      { erro: "O valor do dia precisa ser positivo." },
      { status: 400 }
    );
  }

  const operacao = await operacaoPadrao();
  if (!operacao) {
    return NextResponse.json({ erro: "Nenhuma operação acessível." }, { status: 403 });
  }

  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  const inicio = primeiroDiaDoMes(ano, mes);
  const fim = ultimoDiaDoMes(ano, mes);

  /* A meta do mês daquele canal é o teto a respeitar. */
  const { data: metaMes } = await sb
    .from("metas")
    .select("receita_meta")
    .eq("canal_id", canalId)
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  if (!metaMes) {
    return NextResponse.json(
      {
        erro:
          "Este canal não tem meta neste mês. Defina a meta do mês antes de ajustar um dia.",
      },
      { status: 400 }
    );
  }

  const { data: atuais } = await sb
    .from("metas_diarias")
    .select("data,receita_meta,manual")
    .eq("canal_id", canalId)
    .gte("data", inicio)
    .lte("data", fim);

  /* Peso do dia da semana, do realizado recente do canal. */
  const { data: hist } = await sb
    .from("vendas_diarias")
    .select("data,receita,valor_cancelado")
    .eq("canal_id", canalId)
    .order("data", { ascending: false })
    .limit(120);

  const pesos = pesosDaSemana(
    (hist ?? []).map((h) => ({
      data: String(h.data).slice(0, 10),
      receita: n(h.receita) - n(h.valor_cancelado),
    }))
  );

  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dias = Array.from({ length: totalDias }, (_, i) => {
    const d = `${ano}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    const existente = (atuais ?? []).find(
      (x) => String(x.data).slice(0, 10) === d
    );

    if (d === data) {
      return manual
        ? { data: d, peso: pesos[new Date(`${d}T00:00:00Z`).getUTCDay()], manual: true, valor }
        : { data: d, peso: pesos[new Date(`${d}T00:00:00Z`).getUTCDay()], manual: false };
    }
    return {
      data: d,
      peso: pesos[new Date(`${d}T00:00:00Z`).getUTCDay()] ?? 1,
      manual: existente?.manual ?? false,
      valor: existente ? n(existente.receita_meta) : undefined,
    };
  });

  const rateio = ratearNoMes(n(metaMes.receita_meta), dias);

  const linhas = rateio.dias.map((d) => ({
    operacao_id: operacao.id,
    canal_id: canalId,
    data: d.data,
    receita_meta: d.valor,
    manual: d.manual,
    atualizado_em: new Date().toISOString(),
  }));

  const { error } = await sb
    .from("metas_diarias")
    .upsert(linhas, { onConflict: "operacao_id,canal_id,data" });

  if (error) {
    const semPermissao = error.code === "42501";
    return NextResponse.json(
      {
        erro: semPermissao
          ? "Seu papel não permite ajustar metas."
          : error.message,
      },
      { status: semPermissao ? 403 : 400 }
    );
  }

  return NextResponse.json({
    dias: linhas.length,
    fixado: rateio.fixado,
    distribuido: rateio.distribuido,
    aviso: rateio.estourou
      ? "Os dias fixados já somam mais que a meta do mês deste canal. Os demais ficaram em zero."
      : null,
  });
}
