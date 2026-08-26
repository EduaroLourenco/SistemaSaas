/**
 * Lançamentos diários — a grade de digitação.
 *
 * Cada registro é o que vem CRU da origem, um por canal e por dia:
 * visitas, receita, pedidos, ADS, pedidos cancelados e valor cancelado.
 * A meta do dia acompanha o registro só para dar referência de leitura.
 *
 * Tudo o mais — receita líquida, ticket, conversão, TACOS — é derivado
 * na tela, nunca guardado. Assim a edição de uma célula recalcula o resto
 * sem risco de dois números discordarem.
 *
 * Geração determinística (PRNG semeado): o mesmo mês devolve sempre os
 * mesmos valores no servidor e no cliente.
 */

import { CANAL_NOMES } from "@/mock";

export const ANO = 2026;

/** Mês em curso (0–11). Agosto. */
export const MES_ATUAL = 7;

/** Último dia do mês em curso já lançado. Depois disso, a grade está vazia. */
export const DIA_ATUAL = 25;

export const MESES_LONGOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/** 0 = domingo. */
export const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** 2026 não é bissexto. */
export const DIAS_NO_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export const CANAIS_LANCAMENTO_IDS = [
  "ml",
  "shopee",
  "amazon",
  "site",
  "b2b",
] as const;

export type CanalLancamentoId = (typeof CANAIS_LANCAMENTO_IDS)[number];

export const CANAIS_LANCAMENTO: { id: CanalLancamentoId; nome: string }[] =
  CANAIS_LANCAMENTO_IDS.map((id) => ({ id, nome: CANAL_NOMES[id] }));

/** Os seis campos digitáveis da grade. */
export const CAMPOS_LANCAMENTO = [
  "visitas",
  "receita",
  "pedidos",
  "ads",
  "pedidosCancelados",
  "valorCancelado",
] as const;

export type CampoLancamento = (typeof CAMPOS_LANCAMENTO)[number];

export type LancamentoDia = {
  /** ISO "2026-08-01" */
  data: string;
  /** 0–11 */
  mes: number;
  /** 1–31 */
  dia: number;
  /** 0 = domingo */
  diaSemana: number;
  /** "sáb" */
  rotuloDiaSemana: string;
  fimDeSemana: boolean;
  /** dia que ainda não aconteceu — a linha existe, mas está zerada */
  futuro: boolean;
  visitas: number;
  receita: number;
  pedidos: number;
  ads: number;
  pedidosCancelados: number;
  valorCancelado: number;
  /** referência de leitura, não é digitável */
  metaDia: number;
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

/** Peso do dia da semana, domingo a sábado. Sexta puxa, domingo cede. */
const PESO_DIA_SEMANA = [0.76, 1.12, 1.1, 1.06, 1.05, 1.14, 0.85];

/** Atingimento-alvo do mês — a meta é derivada daqui. */
const ATINGIMENTO_MES = [
  1.04, 0.94, 1.01, 0.97, 1.09, 0.93, 1.0, 1.06, 0.91, 1.03, 1.12, 0.96,
];

const BASE_MENSAL = 1_000_000;

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
};

const PARAMS: Record<CanalLancamentoId, ParamCanal> = {
  ml: { share: 0.46, ticket: 352, conversao: 2.84, tacos: 6.2, cancelamento: 4.8, picoFim: 1.03 },
  shopee: { share: 0.21, ticket: 285, conversao: 3.41, tacos: 5.4, cancelamento: 6.6, picoFim: 1.12 },
  amazon: { share: 0.145, ticket: 442, conversao: 2.12, tacos: 4.1, cancelamento: 3.2, picoFim: 1.01 },
  site: { share: 0.115, ticket: 677, conversao: 1.68, tacos: 8.9, cancelamento: 2.4, picoFim: 1.09 },
  b2b: { share: 0.07, ticket: 730, conversao: 8.4, tacos: 0.6, cancelamento: 1.6, picoFim: 0.94 },
};

const iso = (m: number, d: number) =>
  `${ANO}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const diaDaSemana = (m: number, d: number) =>
  new Date(Date.UTC(ANO, m, d)).getUTCDay();

function mesDoCanal(id: CanalLancamentoId, m: number): LancamentoDia[] {
  const p = PARAMS[id];
  const dias = DIAS_NO_MES[m];
  const r = rng(7_300_000 + CANAIS_LANCAMENTO_IDS.indexOf(id) * 9_181 + m * 617);

  /* soma dos pesos do mês — reparte a receita mensal entre os dias sem
     inventar volume a mais nos meses com mais sextas-feiras */
  let somaPesos = 0;
  for (let d = 1; d <= dias; d++) somaPesos += PESO_DIA_SEMANA[diaDaSemana(m, d)];

  const fim = m >= 9 ? p.picoFim : 1;
  const receitaMes = BASE_MENSAL * SAZONALIDADE[m] * p.share * fim;
  const metaMes =
    Math.round(receitaMes / ATINGIMENTO_MES[m] / 1000) * 1000;

  return Array.from({ length: dias }, (_, k) => {
    const d = k + 1;
    const dow = diaDaSemana(m, d);
    const peso = PESO_DIA_SEMANA[dow] / somaPesos;
    const futuro = m > MES_ATUAL || (m === MES_ATUAL && d > DIA_ATUAL);

    const metaDia = Math.round(metaMes * peso);

    const base: LancamentoDia = {
      data: iso(m, d),
      mes: m,
      dia: d,
      diaSemana: dow,
      rotuloDiaSemana: DIAS_SEMANA[dow],
      fimDeSemana: dow === 0 || dow === 6,
      futuro,
      visitas: 0,
      receita: 0,
      pedidos: 0,
      ads: 0,
      pedidosCancelados: 0,
      valorCancelado: 0,
      metaDia,
    };

    /* consome o mesmo número de sorteios em todo dia — assim um dia futuro
       não desloca a série dos dias seguintes */
    const j1 = 0.86 + r() * 0.28;
    const j2 = 0.96 + r() * 0.08;
    const j3 = 0.9 + r() * 0.2;
    const j4 = 0.88 + r() * 0.24;
    const j5 = 0.78 + r() * 0.44;
    const j6 = 0.95 + r() * 0.1;

    if (futuro) return base;

    const receita = c2(receitaMes * peso * j1);
    const ticket = p.ticket * j2;
    const pedidos = Math.max(1, Math.round(receita / ticket));

    const conversao = p.conversao * j3;
    const visitas = Math.round((pedidos / conversao) * 100);

    const ads = c2(receita * (p.tacos / 100) * j4 * (m >= 9 ? 1.14 : 1));

    const taxa = (p.cancelamento / 100) * j5;
    const valorCancelado = c2(receita * taxa);
    const pedidosCancelados = Math.round(pedidos * taxa * j6);

    return {
      ...base,
      visitas,
      receita,
      pedidos,
      ads,
      pedidosCancelados,
      valorCancelado,
    };
  });
}

/** [canal][mês] → os dias do mês. */
const SERIE: Record<CanalLancamentoId, LancamentoDia[][]> =
  CANAIS_LANCAMENTO_IDS.reduce(
    (acc, id) => {
      acc[id] = MESES_LONGOS.map((_, m) => mesDoCanal(id, m));
      return acc;
    },
    {} as Record<CanalLancamentoId, LancamentoDia[][]>
  );

/** Os dias de um mês de um canal, na ordem do calendário. */
export function lancamentosDoMes(
  canal: CanalLancamentoId,
  mes: number
): LancamentoDia[] {
  return SERIE[canal][mes];
}

/** Meta de receita do mês inteiro — soma das metas diárias. */
export function metaDoMes(canal: CanalLancamentoId, mes: number): number {
  return SERIE[canal][mes].reduce((t, d) => t + d.metaDia, 0);
}
