import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { DiaPeriodo, Periodo, PeriodoId } from "@/mock/diario";

/**
 * Comparativo diário, lido do banco.
 *
 * A tela compara períodos dia a dia: dia 1 de um mês contra dia 1 do
 * outro. Por isso cada período vira uma lista indexada por posição, não
 * por data — é o que permite sobrepor as curvas.
 *
 * Os períodos são ancorados na ÚLTIMA DATA COM MOVIMENTO, e não em hoje.
 * A operação alimenta os dados com atraso; ancorar em hoje faria "ontem"
 * cair num dia ainda não preenchido e a tela abriria zerada, parecendo
 * que a operação parou.
 */

export type DadosDiario = {
  periodos: Periodo[];
  ultimaData: string | null;
  vazio: boolean;
};

type Linha = {
  data: string;
  receita: string;
  pedidos: number;
  visitas: number;
  investimento_ads: string;
  valor_cancelado: string;
  pedidos_cancelados: number;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

/** Sem fuso: as datas do banco são dias civis, não instantes. */
function dia(iso: string, passo: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + passo);
  return d.toISOString().slice(0, 10);
}

function primeiroDoMes(iso: string, mesesAtras = 0): string {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 - mesesAtras, 1));
  return d.toISOString().slice(0, 10);
}

function ultimoDoMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

const br = (iso: string) => iso.split("-").reverse().join("/");

export async function carregarDiario(): Promise<DadosDiario> {
  const sb = await clienteServidor();
  const { data } = await sb
    .from("vendas_diarias")
    .select(
      "data,receita,pedidos,visitas,investimento_ads,valor_cancelado,pedidos_cancelados"
    )
    .order("data", { ascending: true })
    .limit(20000);

  const linhas = (data ?? []) as unknown as Linha[];
  if (!linhas.length) return { periodos: [], ultimaData: null, vazio: true };

  /* Soma os canais de um mesmo dia: a tela é a operação inteira. */
  const porDia = new Map<string, DiaPeriodo>();
  for (const l of linhas) {
    const d = porDia.get(l.data) ?? {
      dia: 0,
      receita: 0,
      pedidos: 0,
      visitas: 0,
      ads: 0,
      cancelado: 0,
      pedidosCancelados: 0,
    };
    d.receita += n(l.receita);
    d.pedidos += l.pedidos;
    d.visitas += l.visitas;
    d.ads += n(l.investimento_ads);
    d.cancelado += n(l.valor_cancelado);
    d.pedidosCancelados += l.pedidos_cancelados;
    porDia.set(l.data, d);
  }

  const datas = [...porDia.keys()].sort();
  const fim = datas[datas.length - 1];

  /**
   * Monta a série de um intervalo, incluindo os dias sem linha como zero.
   * O buraco precisa aparecer: uma curva que pula do dia 3 para o 9 sugere
   * continuidade que não houve.
   */
  const faixa = (de: string, ate: string): DiaPeriodo[] => {
    const out: DiaPeriodo[] = [];
    let cursor = de;
    let i = 1;
    while (cursor <= ate) {
      const achado = porDia.get(cursor);
      out.push(
        achado
          ? { ...achado, dia: i }
          : {
              dia: i,
              receita: 0,
              pedidos: 0,
              visitas: 0,
              ads: 0,
              cancelado: 0,
              pedidosCancelados: 0,
            }
      );
      cursor = dia(cursor, 1);
      i += 1;
    }
    return out;
  };

  const mesAtualInicio = primeiroDoMes(fim);
  const mesAnteriorInicio = primeiroDoMes(fim, 1);
  const anoPassadoInicio = primeiroDoMes(fim, 12);

  const montar = (
    id: PeriodoId,
    rotulo: string,
    de: string,
    ate: string
  ): Periodo => ({
    id,
    rotulo,
    intervalo: de === ate ? br(de) : `${br(de)} — ${br(ate)}`,
    dias: faixa(de, ate),
  });

  const periodos: Periodo[] = [
    montar("hoje", "Último dia", fim, fim),
    montar("ontem", "Dia anterior", dia(fim, -1), dia(fim, -1)),
    montar("d7", "7 dias", dia(fim, -6), fim),
    montar("mesAtual", "Mês atual", mesAtualInicio, fim),
    montar(
      "mesAnterior",
      "Mês anterior",
      mesAnteriorInicio,
      ultimoDoMes(mesAnteriorInicio)
    ),
    montar(
      "mesAnoPassado",
      "Mesmo mês, ano passado",
      anoPassadoInicio,
      ultimoDoMes(anoPassadoInicio)
    ),
  ];

  return { periodos, ultimaData: fim, vazio: false };
}
