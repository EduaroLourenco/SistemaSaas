/**
 * Comparativo diário e de períodos — dados estáticos da fase 1.
 * Cada período traz a série dia a dia; as métricas derivadas
 * (ticket, conversão, TACOS, % de cancelamento) são calculadas na tela.
 */

export type DiaPeriodo = {
  /** Índice do dia dentro do período: 1 = primeiro dia. */
  dia: number;
  /**
   * A data real, aaaa-mm-dd.
   *
   * O índice sozinho posiciona o dia no gráfico mas não diz QUE dia é —
   * e o calendário precisa saber, para recortar um intervalo qualquer.
   * Opcional porque o gerador de exemplo não tem datas reais.
   */
  data?: string;
  receita: number;
  pedidos: number;
  visitas: number;
  ads: number;
  cancelado: number;
  pedidosCancelados: number;
};

export type PeriodoId =
  | "hoje"
  | "ontem"
  | "d7"
  | "mesAtual"
  | "mesAnterior"
  | "mesAnoPassado"
  /*
   * Intervalo escolhido no calendário, com as datas no próprio id:
   * "livre:2026-08-01:2026-08-15".
   *
   * Carregar o intervalo no id, em vez de num estado paralelo, mantém a
   * seleção das quatro colunas sendo uma lista de strings — que é o que
   * o rascunho, o aplicado e a comparação já esperam. Um estado separado
   * para "a coluna 2 é personalizada" precisaria ser mantido em sincronia
   * com o resto em todo lugar que mexe nas colunas.
   */
  | `livre:${string}:${string}`;

export type Periodo = {
  id: PeriodoId;
  rotulo: string;
  intervalo: string;
  dias: DiaPeriodo[];
};

type Config = {
  id: PeriodoId;
  rotulo: string;
  intervalo: string;
  /** Quantidade de dias. */
  n: number;
  /** Dia da semana do primeiro dia: 0 = domingo. */
  inicio: number;
  /** Receita bruta média por dia. */
  base: number;
  ticket: number;
  /** Conversão em %. */
  conversao: number;
  /** ADS sobre receita, em %. */
  tacos: number;
  /** Cancelamento sobre receita, em %. */
  cancel: number;
  seed: number;
};

const CONFIG: Config[] = [
  {
    id: "hoje",
    rotulo: "Hoje",
    intervalo: "25/08/2026",
    n: 1,
    inicio: 2,
    base: 38400,
    ticket: 371,
    conversao: 2.71,
    tacos: 7.6,
    cancel: 3.4,
    seed: 1471,
  },
  {
    id: "ontem",
    rotulo: "Ontem",
    intervalo: "24/08/2026",
    n: 1,
    inicio: 1,
    base: 41900,
    ticket: 378,
    conversao: 2.83,
    tacos: 7.1,
    cancel: 2.9,
    seed: 2298,
  },
  {
    id: "d7",
    rotulo: "Últimos 7 dias",
    intervalo: "18/08 a 24/08/2026",
    n: 7,
    inicio: 2,
    base: 40600,
    ticket: 374,
    conversao: 2.76,
    tacos: 7.3,
    cancel: 3.1,
    seed: 3317,
  },
  {
    id: "mesAtual",
    rotulo: "Mês atual",
    intervalo: "01/08 a 25/08/2026",
    n: 25,
    inicio: 6,
    base: 41300,
    ticket: 376,
    conversao: 2.79,
    tacos: 7.2,
    cancel: 3.0,
    seed: 4126,
  },
  {
    id: "mesAnterior",
    rotulo: "Mês anterior",
    intervalo: "01/07 a 31/07/2026",
    n: 31,
    inicio: 3,
    base: 38900,
    ticket: 366,
    conversao: 2.64,
    tacos: 8.1,
    cancel: 3.6,
    seed: 5074,
  },
  {
    id: "mesAnoPassado",
    rotulo: "Mesmo mês do ano passado",
    intervalo: "01/08 a 31/08/2025",
    n: 31,
    inicio: 5,
    base: 33200,
    ticket: 342,
    conversao: 2.41,
    tacos: 9.4,
    cancel: 4.3,
    seed: 6203,
  },
];

/** Gerador determinístico — os números são sempre os mesmos entre execuções. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Domingo a sábado — segunda e sexta puxam, fim de semana cai. */
const FATOR_SEMANA = [0.79, 1.07, 1.01, 0.97, 1.0, 1.1, 0.86];

function gerar(c: Config): Periodo {
  const rnd = lcg(c.seed);
  const dias: DiaPeriodo[] = [];

  for (let i = 0; i < c.n; i++) {
    const dow = (c.inicio + i) % 7;
    const receita = Math.round(c.base * FATOR_SEMANA[dow] * (0.88 + rnd() * 0.24));
    const ticket = c.ticket * (0.96 + rnd() * 0.09);
    const pedidos = Math.max(1, Math.round(receita / ticket));
    const conversao = c.conversao * (0.9 + rnd() * 0.21);
    const visitas = Math.round((pedidos / conversao) * 100);
    const ads = Math.round(receita * (c.tacos / 100) * (0.86 + rnd() * 0.3));
    const cancelado = Math.round(receita * (c.cancel / 100) * (0.55 + rnd() * 0.95));
    const pedidosCancelados = Math.max(0, Math.round(cancelado / ticket));

    dias.push({
      dia: i + 1,
      data: undefined,
      receita,
      pedidos,
      visitas,
      ads,
      cancelado,
      pedidosCancelados,
    });
  }

  return { id: c.id, rotulo: c.rotulo, intervalo: c.intervalo, dias };
}

export const PERIODOS: Periodo[] = CONFIG.map(gerar);

export const PERIODO_POR_ID = Object.fromEntries(
  PERIODOS.map((p) => [p.id, p])
) as Record<PeriodoId, Periodo>;

/** Seleção inicial das 4 colunas. String vazia = coluna desligada. */
export const COLUNAS_INICIAIS: (PeriodoId | "")[] = [
  "mesAtual",
  "mesAnterior",
  "mesAnoPassado",
  "",
];
