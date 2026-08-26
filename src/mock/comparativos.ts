/**
 * Comparativos por dia da semana — série DIÁRIA do ano, por canal.
 *
 * Formato idêntico ao que a API vai devolver na fase 3: cada dia guarda só os
 * campos BRUTOS (visitas, receita, pedidos, ads, cancelamentos, meta) e tudo
 * o mais é derivado na leitura. Geração 100% determinística (PRNG semeado) —
 * `Math.random` no módulo quebraria a hidratação.
 */

import { CANAL_CORES, CANAL_NOMES } from "@/mock";

export const ANO = 2026;

export const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

export const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

/** Semana de segunda a domingo — 0 = segunda. */
export const DIAS_SEMANA = [
  "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo",
] as const;

export const DIAS_SEMANA_CURTOS = [
  "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom",
] as const;

export const TRIMESTRES = [
  { rotulo: "1º tri", meses: [0, 1, 2] },
  { rotulo: "2º tri", meses: [3, 4, 5] },
  { rotulo: "3º tri", meses: [6, 7, 8] },
  { rotulo: "4º tri", meses: [9, 10, 11] },
] as const;

/* ── canais ─────────────────────────────────────────────────── */

export const CANAIS_COMP_IDS = ["ml", "shopee", "amazon", "site", "b2b"] as const;
export type CanalCompId = (typeof CANAIS_COMP_IDS)[number];
export type EscopoComp = "todos" | CanalCompId;

export const CANAIS_COMP: { id: CanalCompId; nome: string; cor: string }[] =
  CANAIS_COMP_IDS.map((id) => ({
    id,
    nome: CANAL_NOMES[id],
    cor: CANAL_CORES[id],
  }));

export const ESCOPOS_COMP: { value: EscopoComp; label: string }[] = [
  { value: "todos", label: "Todos os canais" },
  ...CANAIS_COMP.map((c) => ({ value: c.id as EscopoComp, label: c.nome })),
];

export function nomeEscopo(e: EscopoComp) {
  return ESCOPOS_COMP.find((o) => o.value === e)?.label ?? "Todos os canais";
}

/* ── calendário do ano ──────────────────────────────────────── */

const DIAS_NO_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export type DiaCalendario = {
  /** índice no ano, 0-based */
  i: number;
  iso: string;
  mes: number;
  dia: number;
  /** 0 = segunda … 6 = domingo */
  dow: number;
  /** 1ª, 2ª… ocorrência daquele dia da semana dentro do mês */
  occ: number;
  /** verdadeiro quando é a ÚLTIMA ocorrência do dia da semana no mês */
  ultima: boolean;
};

export const CALENDARIO: DiaCalendario[] = (() => {
  const out: DiaCalendario[] = [];
  let i = 0;
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= DIAS_NO_MES[m]; d++) {
      const dow = (new Date(Date.UTC(ANO, m, d)).getUTCDay() + 6) % 7;
      out.push({
        i: i++,
        iso: `${ANO}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        mes: m,
        dia: d,
        dow,
        occ: Math.floor((d - 1) / 7) + 1,
        ultima: false,
      });
    }
  }
  const maiorOcc = new Map<string, number>();
  for (const d of out) {
    const k = `${d.mes}:${d.dow}`;
    maiorOcc.set(k, Math.max(maiorOcc.get(k) ?? 0, d.occ));
  }
  for (const d of out) d.ultima = d.occ === maiorOcc.get(`${d.mes}:${d.dow}`);
  return out;
})();

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

/**
 * Curva DENTRO do mês, por dia do calendário. O varejo brasileiro sobe logo
 * depois do pagamento, afunda na terceira semana e reage no vale do fim do
 * mês — é isso que faz a 1ª ocorrência de cada dia render mais que a última.
 */
const CURVA_MES = [
  1.14, 1.13, 1.12, 1.11, 1.09, 1.07, 1.05, 1.03, 1.01, 1.0,
  0.99, 0.98, 0.97, 0.96, 0.95, 0.94, 0.93, 0.92, 0.92, 0.93,
  0.94, 0.96, 0.98, 1.0, 1.03, 1.06, 1.08, 1.09, 1.08, 1.06, 1.03,
];

/** Atingimento-alvo do mês — a meta diária nasce daqui. */
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
  /** fator de visitas por dia da semana, começando na segunda */
  visitasDow: number[];
  /** fator de conversão por dia da semana */
  conversaoDow: number[];
  /** fator de ticket por dia da semana */
  ticketDow: number[];
};

/**
 * Cada canal tem um "temperamento" de semana diferente — é o que faz a tela
 * valer: o melhor dia de receita não é o melhor dia de ticket nem de conversão.
 */
const PARAMS: Record<CanalCompId, ParamCanal> = {
  ml: {
    share: 0.46, ticket: 352, conversao: 2.84, tacos: 6.2, cancelamento: 4.8,
    visitasDow: [1.11, 1.07, 1.03, 1.0, 0.96, 0.85, 0.98],
    conversaoDow: [1.06, 1.04, 1.01, 1.0, 0.97, 0.92, 1.0],
    ticketDow: [1.01, 1.0, 0.99, 0.99, 1.0, 1.03, 1.04],
  },
  shopee: {
    share: 0.21, ticket: 285, conversao: 3.41, tacos: 5.4, cancelamento: 6.6,
    visitasDow: [1.03, 1.0, 0.99, 1.01, 1.06, 1.13, 1.16],
    conversaoDow: [1.0, 0.98, 0.97, 0.99, 1.03, 1.08, 1.09],
    ticketDow: [1.0, 1.0, 1.01, 1.01, 1.0, 0.97, 0.96],
  },
  amazon: {
    share: 0.145, ticket: 442, conversao: 2.12, tacos: 4.1, cancelamento: 3.2,
    visitasDow: [1.09, 1.06, 1.02, 1.0, 0.97, 0.89, 0.96],
    conversaoDow: [1.05, 1.03, 1.01, 1.0, 0.98, 0.94, 0.98],
    ticketDow: [0.99, 0.99, 1.0, 1.0, 1.01, 1.04, 1.05],
  },
  site: {
    share: 0.115, ticket: 677, conversao: 1.68, tacos: 8.9, cancelamento: 2.4,
    visitasDow: [1.02, 1.0, 0.98, 1.0, 1.05, 1.11, 1.14],
    conversaoDow: [1.02, 1.0, 0.99, 1.0, 1.02, 1.05, 1.07],
    ticketDow: [1.02, 1.01, 1.0, 1.0, 0.99, 0.97, 0.96],
  },
  b2b: {
    share: 0.07, ticket: 730, conversao: 8.4, tacos: 0.6, cancelamento: 1.6,
    visitasDow: [1.26, 1.21, 1.15, 1.09, 0.96, 0.47, 0.4],
    conversaoDow: [1.08, 1.06, 1.03, 1.0, 0.93, 0.7, 0.62],
    ticketDow: [1.03, 1.02, 1.01, 1.0, 0.98, 0.93, 0.9],
  },
};

/** Um dia, um canal — só o que vem cru da origem. */
export type Registro = {
  visitas: number;
  receita: number;
  pedidos: number;
  ads: number;
  pedidosCancelados: number;
  valorCancelado: number;
  meta: number;
};

function serieDoCanal(id: CanalCompId): Registro[] {
  const p = PARAMS[id];
  const r = rng(7_300_000 + CANAIS_COMP_IDS.indexOf(id) * 613);

  return CALENDARIO.map((d) => {
    const receitaAlvoDia =
      (BASE_MENSAL * SAZONALIDADE[d.mes] * p.share) / DIAS_NO_MES[d.mes];

    const cm = CURVA_MES[d.dia - 1];

    const visitasBase = receitaAlvoDia / (p.ticket * (p.conversao / 100));
    const visitas = Math.max(
      1,
      Math.round(visitasBase * p.visitasDow[d.dow] * cm * (0.92 + r() * 0.16))
    );

    const conversao =
      p.conversao *
      p.conversaoDow[d.dow] *
      (1 + (cm - 1) * 0.35) *
      (0.93 + r() * 0.14);
    const pedidos = Math.max(1, Math.round((visitas * conversao) / 100));

    const ticket =
      p.ticket *
      p.ticketDow[d.dow] *
      (1 + (cm - 1) * 0.15) *
      (0.97 + r() * 0.06);
    const receita = c2(pedidos * ticket);

    const ads = c2(receita * (p.tacos / 100) * (0.85 + r() * 0.3));

    const taxaCancel = (p.cancelamento / 100) * (0.7 + r() * 0.6);
    const valorCancelado = c2(receita * taxaCancel);
    const pedidosCancelados = Math.round(pedidos * taxaCancel);

    const meta = Math.round(receitaAlvoDia / ATINGIMENTO_MES[d.mes] / 10) * 10;

    return {
      visitas,
      receita,
      pedidos,
      ads,
      pedidosCancelados,
      valorCancelado,
      meta,
    };
  });
}

const POR_CANAL: Record<CanalCompId, Registro[]> = {
  ml: serieDoCanal("ml"),
  shopee: serieDoCanal("shopee"),
  amazon: serieDoCanal("amazon"),
  site: serieDoCanal("site"),
  b2b: serieDoCanal("b2b"),
};

const TODOS: Registro[] = CALENDARIO.map((d) =>
  CANAIS_COMP_IDS.reduce<Registro>(
    (acc, id) => {
      const r = POR_CANAL[id][d.i];
      return {
        visitas: acc.visitas + r.visitas,
        receita: c2(acc.receita + r.receita),
        pedidos: acc.pedidos + r.pedidos,
        ads: c2(acc.ads + r.ads),
        pedidosCancelados: acc.pedidosCancelados + r.pedidosCancelados,
        valorCancelado: c2(acc.valorCancelado + r.valorCancelado),
        meta: acc.meta + r.meta,
      };
    },
    {
      visitas: 0, receita: 0, pedidos: 0, ads: 0,
      pedidosCancelados: 0, valorCancelado: 0, meta: 0,
    }
  )
);

/** Série diária por escopo — "todos" já vem consolidado. */
export const SERIE_DIARIA: Record<EscopoComp, Registro[]> = {
  todos: TODOS,
  ml: POR_CANAL.ml,
  shopee: POR_CANAL.shopee,
  amazon: POR_CANAL.amazon,
  site: POR_CANAL.site,
  b2b: POR_CANAL.b2b,
};

/* ── recortes de índices, prontos para agregar ──────────────── */

const idx = (f: (d: DiaCalendario) => boolean) =>
  CALENDARIO.filter(f).map((d) => d.i);

/** Todos os dias do ano. */
export const INDICES_ANO: number[] = CALENDARIO.map((d) => d.i);

/** Índices por dia da semana. */
export const INDICES_DOW: number[][] = DIAS_SEMANA.map((_, dw) =>
  idx((d) => d.dow === dw)
);

/** Índices por mês. */
export const INDICES_MES: number[][] = MESES.map((_, m) =>
  idx((d) => d.mes === m)
);

/** Índices por dia da semana × mês — a matriz do mapa de calor. */
export const INDICES_DOW_MES: number[][][] = DIAS_SEMANA.map((_, dw) =>
  MESES.map((_, m) => idx((d) => d.dow === dw && d.mes === m))
);

/** 1ª ocorrência de cada dia da semana em cada mês. */
export const INDICES_DOW_PRIMEIRA: number[][] = DIAS_SEMANA.map((_, dw) =>
  idx((d) => d.dow === dw && d.occ === 1)
);

/** Última ocorrência de cada dia da semana em cada mês. */
export const INDICES_DOW_ULTIMA: number[][] = DIAS_SEMANA.map((_, dw) =>
  idx((d) => d.dow === dw && d.ultima)
);

/* ── agregação ──────────────────────────────────────────────── */

export type Agregado = Registro & { dias: number };

export function agregar(indices: number[], escopo: EscopoComp): Agregado {
  const s = SERIE_DIARIA[escopo];
  let visitas = 0, receita = 0, pedidos = 0, ads = 0;
  let pedidosCancelados = 0, valorCancelado = 0, meta = 0;

  for (const i of indices) {
    const r = s[i];
    visitas += r.visitas;
    receita += r.receita;
    pedidos += r.pedidos;
    ads += r.ads;
    pedidosCancelados += r.pedidosCancelados;
    valorCancelado += r.valorCancelado;
    meta += r.meta;
  }

  return {
    dias: indices.length,
    visitas,
    receita: c2(receita),
    pedidos,
    ads: c2(ads),
    pedidosCancelados,
    valorCancelado: c2(valorCancelado),
    meta,
  };
}

/** Derivadas do modelo: ticket, conversão, TACOS, receita líquida. */
export function derivar(a: Agregado) {
  return {
    ticket: a.pedidos ? a.receita / a.pedidos : 0,
    conversao: a.visitas ? (a.pedidos / a.visitas) * 100 : 0,
    tacos: a.receita ? (a.ads / a.receita) * 100 : 0,
    receitaLiquida: c2(a.receita - a.valorCancelado),
    pctCancelado: a.receita ? (a.valorCancelado / a.receita) * 100 : 0,
    pctMeta: a.meta ? (a.receita / a.meta) * 100 : 0,
  };
}
