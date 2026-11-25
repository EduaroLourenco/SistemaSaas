/**
 * Termômetro do Mercado Livre e a previsão do que os pedidos abertos fazem com ele.
 *
 * Regra (Central de Vendedores, "Vamos mudar a forma como calculamos sua
 * reputação", vale desde 10/09/2026):
 * - Janela de 60 dias com 101 vendas ou mais nela; senão, 365 dias.
 * - Três taxas sobre as vendas: reclamações, canceladas pelo vendedor e
 *   envios incorretos (atraso no despacho, só em Mercado Envios).
 * - A cor da conta é a pior das três.
 *
 * A API já devolve a cor e as taxas; aqui só se refaz a conta para a previsão.
 * Conta com Reputação Protegida mostra verde e zera as taxas: o número real
 * vem em `excluded`, e é ele que vale quando a proteção acabar.
 */

export type Cor = "verde" | "amarelo" | "laranja" | "vermelho";
export const CORES: Cor[] = ["verde", "amarelo", "laranja", "vermelho"];

type Faixa = [number, number, number]; // teto do verde, do amarelo e do laranja, em %
const LIMITES: Record<"reclamacoes" | "cancelamentos" | "atrasos", Record<60 | 365, Faixa>> = {
  reclamacoes: { 60: [2, 4.5, 8], 365: [2, 4.5, 8] },
  cancelamentos: { 60: [1.5, 3.5, 4], 365: [2.5, 5.5, 6.5] },
  atrasos: { 60: [10, 18, 22], 365: [13, 23.5, 28.5] },
};
export type Variavel = keyof typeof LIMITES;
export const limites = (v: Variavel, periodo: 60 | 365) => LIMITES[v][periodo];

export type Metrica = { valor: number; base: number };

export type ReputacaoMeli = {
  /** level_id da API: 5_green, 4_light_green, 3_yellow, 2_orange, 1_red. */
  nivel: string | null;
  /** Cor real por trás da Reputação Protegida. */
  nivelReal: string | null;
  protegidaAte: string | null;
  periodo: 60 | 365;
  vendas: number;
  reclamacoes: Metrica;
  cancelamentos: Metrica;
  atrasos: Metrica;
};

type Bruta = { rate?: number; value?: number; excluded?: { real_value?: number; real_rate?: number } };
export type ReputacaoBruta = {
  level_id?: string | null;
  real_level?: string | null;
  protection_end_date?: string | null;
  metrics?: { sales?: { period?: string; completed?: number }; claims?: Bruta; cancellations?: Bruta; delayed_handling_time?: Bruta };
};

/*
 * A base de cada taxa não vem pronta: atraso conta só o que foi por Mercado
 * Envios, e reclamação conta também venda cancelada. valor ÷ taxa a recupera.
 * Sem nenhuma ocorrência não há como dividir, e as vendas da janela servem.
 */
function metrica(b: Bruta | undefined, vendas: number): Metrica {
  const valor = b?.excluded?.real_value ?? b?.value ?? 0;
  const taxa = b?.excluded?.real_rate ?? b?.rate ?? 0;
  return { valor, base: valor > 0 && taxa > 0 ? Math.round(valor / taxa) : vendas };
}

export function lerReputacao(r: ReputacaoBruta | null | undefined): ReputacaoMeli | null {
  if (!r?.metrics) return null;
  const vendas = r.metrics.sales?.completed ?? 0;
  return {
    nivel: r.level_id ?? null,
    nivelReal: r.real_level ?? null,
    protegidaAte: r.protection_end_date ?? null,
    periodo: /365/.test(r.metrics.sales?.period ?? "") ? 365 : 60,
    vendas,
    reclamacoes: metrica(r.metrics.claims, vendas),
    cancelamentos: metrica(r.metrics.cancellations, vendas),
    atrasos: metrica(r.metrics.delayed_handling_time, vendas),
  };
}

export const taxa = (m: Metrica) => (m.base > 0 ? (m.valor * 100) / m.base : 0);

export function cor(v: Variavel, pct: number, periodo: 60 | 365): Cor {
  const [g, y, o] = LIMITES[v][periodo];
  return pct <= g ? "verde" : pct <= y ? "amarelo" : pct <= o ? "laranja" : "vermelho";
}

const pior = (cs: Cor[]) => cs.reduce((a, b) => (CORES.indexOf(b) > CORES.indexOf(a) ? b : a), "verde" as Cor);

/** Quantas ocorrências a mais cabem antes de a variável mudar de cor. Null no vermelho. */
export function folga(v: Variavel, m: Metrica, periodo: 60 | 365): number | null {
  const faixa = LIMITES[v][periodo];
  const teto = faixa[CORES.indexOf(cor(v, taxa(m), periodo))];
  if (teto == null) return null;
  /* Cada ocorrência nova também é uma venda nova na base. */
  return Math.max(0, Math.floor((teto * m.base - 100 * m.valor) / (100 - teto)));
}

export type Previsao = {
  /** Pedidos abertos que entram na conta: todos viram venda, os atrasados viram ocorrência. */
  reclamacoes: Metrica;
  cancelamentos: Metrica;
  atrasos: Metrica;
  corGeral: Cor;
  corEnvios: Cor;
};

/**
 * `abertosME` e `atrasadosME` são pedidos por Mercado Envios: o atraso conta
 * no despacho. Em envio próprio o Meli não mede o despacho, e o pedido atrasado
 * entra como reclamação provável — é o que costuma virar.
 */
export function prever(
  r: ReputacaoMeli,
  p: { abertosME: number; atrasadosME: number; abertosProprio: number; atrasadosProprio: number },
): Previsao {
  const abertos = p.abertosME + p.abertosProprio;
  const reclamacoes = { valor: r.reclamacoes.valor + p.atrasadosProprio, base: r.reclamacoes.base + abertos };
  const cancelamentos = { valor: r.cancelamentos.valor, base: r.cancelamentos.base + abertos };
  const atrasos = { valor: r.atrasos.valor + p.atrasadosME, base: r.atrasos.base + p.abertosME };
  const corEnvios = cor("atrasos", taxa(atrasos), r.periodo);
  return {
    reclamacoes,
    cancelamentos,
    atrasos,
    corEnvios,
    corGeral: pior([cor("reclamacoes", taxa(reclamacoes), r.periodo), cor("cancelamentos", taxa(cancelamentos), r.periodo), corEnvios]),
  };
}

export const corAtual = (r: ReputacaoMeli) =>
  pior([
    cor("reclamacoes", taxa(r.reclamacoes), r.periodo),
    cor("cancelamentos", taxa(r.cancelamentos), r.periodo),
    cor("atrasos", taxa(r.atrasos), r.periodo),
  ]);

/* ── Status manual da logística ── */

export const STATUS_MANUAL = {
  producao_no_prazo: "Produção no prazo",
  producao_atrasada: "Produção atrasada",
  falta_faturar: "Falta faturar",
  despachado: "Despachado",
  entregue: "Entregue",
} as const;
export type StatusManual = keyof typeof STATUS_MANUAL;

/**
 * O pedido conta como atrasado se a logística disse que está, ou se o limite
 * do Meli passou e ninguém marcou que saiu.
 */
export function atrasado(e: { dias: number | null; saiu?: boolean }, s: StatusManual | undefined) {
  if (s === "producao_atrasada") return true;
  if (s === "despachado" || s === "entregue" || e.saiu) return false;
  return e.dias != null && e.dias < 0;
}
