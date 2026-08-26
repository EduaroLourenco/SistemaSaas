/**
 * Planejamento de metas — realizado por canal e por mês do ano corrente.
 *
 * O ano está em curso: os meses até `MES_ATUAL - 1` estão fechados, o mês
 * atual traz apenas a parte decorrida e os seguintes ficam zerados.
 * Tudo é gerado por PRNG semeado — nenhum `Math.random`, para que servidor e
 * cliente produzam exatamente os mesmos números e a hidratação não quebre.
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

export const CANAIS_META_IDS = ["ml", "shopee", "amazon", "site", "b2b"] as const;
export type CanalMetaId = (typeof CANAIS_META_IDS)[number];

export type CanalMeta = { id: CanalMetaId; nome: string; cor: string };

export const CANAIS_META: CanalMeta[] = CANAIS_META_IDS.map((id) => ({
  id,
  nome: CANAL_NOMES[id],
  cor: CANAL_CORES[id],
}));

/* ── recorte temporal ───────────────────────────────────────── */

/** 0–11. Agosto: sete meses fechados atrás. */
export const MES_ATUAL = 7;
export const DIA_ATUAL = 25;
export const DIAS_DO_MES_ATUAL = 31;
export const PROGRESSO_MES_ATUAL = DIA_ATUAL / DIAS_DO_MES_ATUAL;
export const DATA_CORTE = `${String(DIA_ATUAL).padStart(2, "0")}/${String(
  MES_ATUAL + 1
).padStart(2, "0")}`;

/* ── sazonalidade ───────────────────────────────────────────── */

/**
 * Peso de cada mês no ano. Maio (Dia das Mães), agosto (Dia dos Pais),
 * novembro (Black Friday) e dezembro (Natal) puxam o varejo para cima.
 */
export const PESOS_SAZONAIS = [
  0.85, 0.8, 0.92, 0.95, 1.12, 0.94, 0.98, 1.15, 0.96, 1.02, 1.3, 1.21,
];

const SOMA_PESOS = PESOS_SAZONAIS.reduce((a, b) => a + b, 0);

/** Os mesmos pesos, somando 1 — é o que a distribuição usa. */
export const PESOS_NORMALIZADOS = PESOS_SAZONAIS.map((p) => p / SOMA_PESOS);

/** Quanto do ano já passou, em peso sazonal (não em dias). */
export const FRACAO_ANO_DECORRIDA =
  PESOS_NORMALIZADOS.slice(0, MES_ATUAL).reduce((a, b) => a + b, 0) +
  PESOS_NORMALIZADOS[MES_ATUAL] * PROGRESSO_MES_ATUAL;

/* ── geração determinística ─────────────────────────────────── */

function rng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const c2 = (v: number) => +v.toFixed(2);

const BASE_ANUAL = 15_400_000;

type ParamCanal = {
  /** fatia do faturamento do ano */
  share: number;
  /** crescimento sobre o mesmo período do ano anterior, em % */
  crescimento: number;
};

const PARAMS: Record<CanalMetaId, ParamCanal> = {
  ml: { share: 0.46, crescimento: 11.4 },
  shopee: { share: 0.21, crescimento: 26.2 },
  amazon: { share: 0.145, crescimento: -4.8 },
  site: { share: 0.115, crescimento: 33.6 },
  b2b: { share: 0.07, crescimento: -9.1 },
};

function serieDoCanal(id: CanalMetaId): number[] {
  const p = PARAMS[id];
  const r = rng(7_310_000 + CANAIS_META_IDS.indexOf(id) * 1_301);

  return PESOS_NORMALIZADOS.map((peso, m) => {
    if (m > MES_ATUAL) return 0;
    const cheio = BASE_ANUAL * p.share * peso * (0.93 + r() * 0.14);
    return c2(m === MES_ATUAL ? cheio * PROGRESSO_MES_ATUAL : cheio);
  });
}

/* ── realizado ──────────────────────────────────────────────── */

/** Receita realizada, 12 posições por canal. Zero no que ainda não veio. */
export const REALIZADO: Record<CanalMetaId, number[]> = {
  ml: serieDoCanal("ml"),
  shopee: serieDoCanal("shopee"),
  amazon: serieDoCanal("amazon"),
  site: serieDoCanal("site"),
  b2b: serieDoCanal("b2b"),
};

/** Consolidado de todos os canais, mês a mês. */
export const REALIZADO_TOTAL: number[] = PESOS_NORMALIZADOS.map((_, m) =>
  c2(CANAIS_META_IDS.reduce((s, id) => s + REALIZADO[id][m], 0))
);

/** Acumulado do ano por canal. */
export const REALIZADO_ANO: Record<CanalMetaId, number> =
  CANAIS_META_IDS.reduce(
    (acc, id) => {
      acc[id] = c2(REALIZADO[id].reduce((a, b) => a + b, 0));
      return acc;
    },
    {} as Record<CanalMetaId, number>
  );

export const REALIZADO_ANO_TOTAL = c2(
  CANAIS_META_IDS.reduce((s, id) => s + REALIZADO_ANO[id], 0)
);

/** Mesmo período do ano anterior — base das variações. */
export const REALIZADO_ANTERIOR: Record<CanalMetaId, number> =
  CANAIS_META_IDS.reduce(
    (acc, id) => {
      acc[id] = c2(REALIZADO_ANO[id] / (1 + PARAMS[id].crescimento / 100));
      return acc;
    },
    {} as Record<CanalMetaId, number>
  );

export const REALIZADO_ANTERIOR_TOTAL = c2(
  CANAIS_META_IDS.reduce((s, id) => s + REALIZADO_ANTERIOR[id], 0)
);

/** Participação de cada canal no realizado — base para ratear a meta anual. */
export const PARTICIPACAO: Record<CanalMetaId, number> =
  CANAIS_META_IDS.reduce(
    (acc, id) => {
      acc[id] = REALIZADO_ANO_TOTAL
        ? REALIZADO_ANO[id] / REALIZADO_ANO_TOTAL
        : 1 / CANAIS_META_IDS.length;
      return acc;
    },
    {} as Record<CanalMetaId, number>
  );

/** Fechamento projetado se o ritmo atual se mantiver até dezembro. */
export const PROJECAO_ANO = c2(
  FRACAO_ANO_DECORRIDA ? REALIZADO_ANO_TOTAL / FRACAO_ANO_DECORRIDA : 0
);

/**
 * Alvo sugerido ao abrir a tela: a projeção com 8% de ambição por cima,
 * arredondada para a centena de milhar mais próxima.
 */
export const META_ANUAL_SUGERIDA =
  Math.round((PROJECAO_ANO * 1.08) / 100_000) * 100_000;
