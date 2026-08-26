/**
 * Acompanhamento anual — 12 meses por canal.
 * Formato idêntico ao que a API vai devolver na fase 3:
 * cada mês guarda apenas os campos BRUTOS; tudo o mais é derivado.
 */

import { CANAL_CORES, CANAL_NOMES } from "@/mock";

export const ANO = 2026;

export const MESES_CURTOS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

export const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export const CANAIS_ANUAL_IDS = ["ml", "shopee", "amazon", "site", "b2b"] as const;
export type CanalAnualId = (typeof CANAIS_ANUAL_IDS)[number];

export type CanalAnual = { id: CanalAnualId; nome: string; cor: string };

export const CANAIS_ANUAL: CanalAnual[] = CANAIS_ANUAL_IDS.map((id) => ({
  id,
  nome: CANAL_NOMES[id],
  cor: CANAL_CORES[id],
}));

/** Um mês, um canal — só o que vem cru da origem. */
export type MesAnual = {
  /** 0–11. O total do ano usa -1. */
  mes: number;
  rotulo: string;
  rotuloLongo: string;
  receita: number;
  pedidos: number;
  visitas: number;
  ads: number;
  pedidosCancelados: number;
  valorCancelado: number;
  meta: number;
};

/* ── geração determinística ─────────────────────────────────── */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const c2 = (v: number) => +v.toFixed(2);

/** Sazonalidade do varejo: fevereiro é o fundo, novembro é o pico. */
const SAZONALIDADE = [
  0.84, 0.81, 0.9, 0.95, 1.04, 0.97, 1.0, 1.03, 1.09, 1.18, 1.44, 1.34,
];

const BASE_MENSAL = 1_000_000;

/**
 * Atingimento-alvo de cada mês. A meta é derivada daqui — assim o ano tem
 * meses claramente acima e claramente abaixo, como acontece na operação real.
 */
const ATINGIMENTO_MES = [
  1.04, 0.94, 1.01, 0.97, 1.09, 0.93, 1.0, 1.06, 0.91, 1.03, 1.12, 0.96,
];

type ParamCanal = {
  share: number;
  ticket: number;
  /** conversão em % */
  conversao: number;
  /** TACOS em % */
  tacos: number;
  /** cancelamento em % da receita */
  cancelamento: number;
  /** peso extra no último trimestre */
  picoFim: number;
  /** crescimento da receita vs. ano anterior, em % */
  crescimento: number;
};

const PARAMS: Record<CanalAnualId, ParamCanal> = {
  ml: { share: 0.46, ticket: 352, conversao: 2.84, tacos: 6.2, cancelamento: 4.8, picoFim: 1.03, crescimento: 11.4 },
  shopee: { share: 0.21, ticket: 285, conversao: 3.41, tacos: 5.4, cancelamento: 6.6, picoFim: 1.12, crescimento: 26.2 },
  amazon: { share: 0.145, ticket: 442, conversao: 2.12, tacos: 4.1, cancelamento: 3.2, picoFim: 1.01, crescimento: -4.8 },
  site: { share: 0.115, ticket: 677, conversao: 1.68, tacos: 8.9, cancelamento: 2.4, picoFim: 1.09, crescimento: 33.6 },
  b2b: { share: 0.07, ticket: 730, conversao: 8.4, tacos: 0.6, cancelamento: 1.6, picoFim: 0.94, crescimento: -9.1 },
};

function serieDoCanal(id: CanalAnualId): MesAnual[] {
  const p = PARAMS[id];
  const r = rng(4_200_000 + CANAIS_ANUAL_IDS.indexOf(id) * 977);

  return MESES_CURTOS.map((rotulo, m) => {
    const fim = m >= 9 ? p.picoFim : 1;
    const receita = c2(
      BASE_MENSAL * SAZONALIDADE[m] * p.share * fim * (0.94 + r() * 0.12)
    );

    const ticket = p.ticket * (0.96 + r() * 0.08);
    const pedidos = Math.round(receita / ticket);

    const conversao = p.conversao * (0.92 + r() * 0.16);
    const visitas = Math.round((pedidos / conversao) * 100);

    const ads = c2(
      receita * (p.tacos / 100) * (0.9 + r() * 0.2) * (m >= 9 ? 1.14 : 1)
    );

    const taxaCancel = (p.cancelamento / 100) * (0.8 + r() * 0.4);
    const valorCancelado = c2(receita * taxaCancel);
    const pedidosCancelados = Math.round(pedidos * taxaCancel * (0.95 + r() * 0.1));

    const meta =
      Math.round(
        receita / (ATINGIMENTO_MES[m] * (0.95 + r() * 0.1)) / 1000
      ) * 1000;

    return {
      mes: m,
      rotulo,
      rotuloLongo: MESES_LONGOS[m],
      receita,
      pedidos,
      visitas,
      ads,
      pedidosCancelados,
      valorCancelado,
      meta,
    };
  });
}

/** Soma um conjunto de meses num único registro. Usado no TOTAL e no “Todos os canais”. */
export function somar(
  meses: MesAnual[],
  rotulo = "Ano",
  rotuloLongo = `Ano de ${ANO}`
): MesAnual {
  return meses.reduce<MesAnual>(
    (acc, m) => ({
      ...acc,
      receita: c2(acc.receita + m.receita),
      pedidos: acc.pedidos + m.pedidos,
      visitas: acc.visitas + m.visitas,
      ads: c2(acc.ads + m.ads),
      pedidosCancelados: acc.pedidosCancelados + m.pedidosCancelados,
      valorCancelado: c2(acc.valorCancelado + m.valorCancelado),
      meta: acc.meta + m.meta,
    }),
    {
      mes: -1,
      rotulo,
      rotuloLongo,
      receita: 0,
      pedidos: 0,
      visitas: 0,
      ads: 0,
      pedidosCancelados: 0,
      valorCancelado: 0,
      meta: 0,
    }
  );
}

/** Série por canal — 12 meses cada. */
export const ANUAL_POR_CANAL: Record<CanalAnualId, MesAnual[]> = {
  ml: serieDoCanal("ml"),
  shopee: serieDoCanal("shopee"),
  amazon: serieDoCanal("amazon"),
  site: serieDoCanal("site"),
  b2b: serieDoCanal("b2b"),
};

/** Consolidado de todos os canais, mês a mês. */
export const ANUAL_TOTAL: MesAnual[] = MESES_CURTOS.map((rotulo, m) =>
  somar(
    CANAIS_ANUAL_IDS.map((id) => ANUAL_POR_CANAL[id][m]),
    rotulo,
    MESES_LONGOS[m]
  )
).map((x, m) => ({ ...x, mes: m }));

export type EscopoAnual = "todos" | CanalAnualId;

/** Acesso por escopo — “todos” já vem consolidado. */
export const ANUAL_SERIES: Record<EscopoAnual, MesAnual[]> = {
  todos: ANUAL_TOTAL,
  ml: ANUAL_POR_CANAL.ml,
  shopee: ANUAL_POR_CANAL.shopee,
  amazon: ANUAL_POR_CANAL.amazon,
  site: ANUAL_POR_CANAL.site,
  b2b: ANUAL_POR_CANAL.b2b,
};

/* ── ano anterior, para as variações ────────────────────────── */

function anterior(serie: MesAnual[], crescimento: number) {
  const receita = serie.reduce((s, m) => s + m.receita, 0);
  const pedidos = serie.reduce((s, m) => s + m.pedidos, 0);
  /** pedidos crescem um pouco menos que a receita — ticket subindo */
  const gPed = crescimento - 3.2;
  return {
    receita: c2(receita / (1 + crescimento / 100)),
    pedidos: Math.round(pedidos / (1 + gPed / 100)),
  };
}

const ANTERIOR_POR_CANAL = CANAIS_ANUAL_IDS.reduce(
  (acc, id) => {
    acc[id] = anterior(ANUAL_POR_CANAL[id], PARAMS[id].crescimento);
    return acc;
  },
  {} as Record<CanalAnualId, { receita: number; pedidos: number }>
);

/** Totais do ano anterior por escopo. Base das variações dos indicadores. */
export const ANO_ANTERIOR: Record<
  EscopoAnual,
  { receita: number; pedidos: number }
> = {
  ...ANTERIOR_POR_CANAL,
  todos: {
    receita: c2(
      CANAIS_ANUAL_IDS.reduce((s, id) => s + ANTERIOR_POR_CANAL[id].receita, 0)
    ),
    pedidos: CANAIS_ANUAL_IDS.reduce(
      (s, id) => s + ANTERIOR_POR_CANAL[id].pedidos,
      0
    ),
  },
};

/* ── derivadas ──────────────────────────────────────────────── */

export type DerivadoMes = {
  ticket: number;
  /** % */
  conversao: number;
  /** % */
  tacos: number;
  /** % da receita */
  pctCancelado: number;
  receitaLiquida: number;
  /** % da meta */
  pctMeta: number;
  gapMeta: number;
};

export function derivar(m: MesAnual): DerivadoMes {
  return {
    ticket: m.pedidos ? m.receita / m.pedidos : 0,
    conversao: m.visitas ? (m.pedidos / m.visitas) * 100 : 0,
    tacos: m.receita ? (m.ads / m.receita) * 100 : 0,
    pctCancelado: m.receita ? (m.valorCancelado / m.receita) * 100 : 0,
    receitaLiquida: c2(m.receita - m.valorCancelado),
    pctMeta: m.meta ? (m.receita / m.meta) * 100 : 0,
    gapMeta: c2(m.receita - m.meta),
  };
}
