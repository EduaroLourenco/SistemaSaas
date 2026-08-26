/**
 * Vendas por semana — as 53 semanas do ano corrente.
 * Semana de segunda a domingo; a semana 1 é a que contém 1º de janeiro.
 * O ano está em curso: só as semanas até `SEMANA_ATUAL` têm movimento,
 * as demais ficam zeradas e a interface trata zero como vazio.
 */

export type SemanaVendas = {
  /** 1 a 53 */
  n: number;
  /** "S01" … "S53" */
  rotulo: string;
  /** ISO da segunda-feira */
  inicio: string;
  /** ISO do domingo */
  fim: string;
  /** "16/03 – 22/03" */
  intervalo: string;
  /** "S12 · 16/03 – 22/03" — rótulo cheio, usado no eixo e no tooltip */
  titulo: string;
  /** mês de referência do início da semana: "jan", "fev"… */
  mes: string;
  receita: number;
  cancelado: number;
  receitaLiquida: number;
  pedidos: number;
  pedidosCancelados: number;
  ticket: number;
  visitas: number;
  /** em % */
  conversao: number;
  ads: number;
  /** ads / receita, em % */
  tacos: number;
  /** semana em curso — números ainda parciais */
  parcial: boolean;
  /** false para as semanas que ainda não aconteceram */
  comDados: boolean;
};

export const TOTAL_SEMANAS = 53;
export const SEMANA_ATUAL = 34;
export const ANO = 2026;

/** Segunda-feira da semana 1 de 2026 (a semana que contém 01/01). */
const INICIO_S01 = Date.UTC(2025, 11, 29);
const DIA = 86_400_000;

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

const pad = (v: number) => String(v).padStart(2, "0");
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const diaMes = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
};

/** Gerador determinístico — os números não mudam entre renders. */
function lcg(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Sazonalidade do varejo brasileiro nas 34 primeiras semanas. */
function sazonal(n: number): number {
  let f = 1;
  if (n <= 2) f *= 0.78;
  else if (n <= 5) f *= 0.87;
  else if (n <= 8) f *= 0.93;

  if (n === 11) f *= 1.07;
  if (n === 19) f *= 1.17;
  if (n === 20) f *= 1.3;
  if (n === 21) f *= 0.86;
  if (n === 23) f *= 1.11;
  if (n === 24) f *= 1.2;
  if (n === 25) f *= 0.89;
  if (n === 31) f *= 1.13;
  if (n === 32) f *= 1.26;
  if (n === 33) f *= 0.85;
  return f;
}

const cent = (v: number) => Math.round(v * 100) / 100;

function montar(): SemanaVendas[] {
  const rnd = lcg(20260817);

  return Array.from({ length: TOTAL_SEMANAS }, (_, i) => {
    const n = i + 1;
    const inicioT = INICIO_S01 + i * 7 * DIA;
    const fimT = inicioT + 6 * DIA;

    const base = {
      n,
      rotulo: `S${pad(n)}`,
      inicio: iso(inicioT),
      fim: iso(fimT),
      intervalo: `${diaMes(inicioT)} – ${diaMes(fimT)}`,
      titulo: `S${pad(n)} · ${diaMes(inicioT)} – ${diaMes(fimT)}`,
      mes: MESES[new Date(inicioT).getUTCMonth()],
    };

    if (n > SEMANA_ATUAL) {
      return {
        ...base,
        receita: 0,
        cancelado: 0,
        receitaLiquida: 0,
        pedidos: 0,
        pedidosCancelados: 0,
        ticket: 0,
        visitas: 0,
        conversao: 0,
        ads: 0,
        tacos: 0,
        parcial: false,
        comDados: false,
      };
    }

    const parcial = n === SEMANA_ATUAL;
    const fatorParcial = parcial ? 0.44 : 1;

    const crescimento = 1 + i * 0.0072;
    const ruido = 0.94 + rnd() * 0.12;
    const ticketBase = 352 + n * 0.9 + (rnd() - 0.5) * 24;
    const conversaoBase = 1.62 + n * 0.008 + (rnd() - 0.5) * 0.26;
    const taxaCancel = 0.028 + rnd() * 0.031;
    const tacosBase = 4.2 + rnd() * 3.1;

    const pedidos = Math.round(690 * crescimento * sazonal(n) * ruido * fatorParcial);
    const receita = cent(pedidos * ticketBase);
    const visitas = Math.round(pedidos / (conversaoBase / 100));
    const cancelado = cent(receita * taxaCancel);
    const pedidosCancelados = Math.round(pedidos * taxaCancel * 0.92);
    const ads = cent(receita * (tacosBase / 100));

    return {
      ...base,
      receita,
      cancelado,
      receitaLiquida: cent(receita - cancelado),
      pedidos,
      pedidosCancelados,
      ticket: cent(receita / pedidos),
      visitas,
      conversao: cent((pedidos / visitas) * 100),
      ads,
      tacos: cent((ads / receita) * 100),
      parcial,
      comDados: true,
    };
  });
}

export const SEMANAS: SemanaVendas[] = montar();

/** Só as semanas já fechadas — a semana em curso distorce máximo e mínimo. */
export const SEMANAS_FECHADAS = SEMANAS.filter((s) => s.comDados && !s.parcial);
