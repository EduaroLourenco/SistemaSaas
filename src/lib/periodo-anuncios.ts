import type { Anuncio, SemanaDesempenho } from "./analise";

/**
 * Período livre da tela de Anúncios: qualquer data, não semana fechada.
 *
 * Lógica pura — roda na tela, e a troca de período não volta ao servidor.
 * Datas são dias civis em AAAA-MM-DD, sem fuso.
 */

export type Periodo = { de: string; ate: string };
export type ModoComparacao = "anterior" | "mes" | "ano" | "livre" | "nenhum";
/** Dia de um anúncio. `visitas` nulo: sem leitura naquele dia, o que não é zero. */
export type DiaMovimento = [data: string, visitas: number | null, unidades: number, receita: number];
/** Dias em que cada conta teve visitas coletadas. */
export type Coleta = Map<string, Set<string>>;

const DIA_MS = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const somarDias = (d: string, n: number) => iso(utc(d) + n * DIA_MS);
const br = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
const fimDoMes = (d: string) => Number(d.slice(8)) === ultimoDia(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1);
const segunda = (d: string) => somarDias(d, -((new Date(utc(d)).getUTCDay() + 6) % 7));

export const diasDoPeriodo = (p: Periodo) => Math.round((utc(p.ate) - utc(p.de)) / DIA_MS) + 1;

/** Último dia de mês continua sendo último dia: 31/10 → 30/09, não 01/10. */
function moverMeses(d: string, n: number): string {
  const alvo = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1 + n, 1));
  const ano = alvo.getUTCFullYear(), mes = alvo.getUTCMonth();
  const dia = fimDoMes(d) ? ultimoDia(ano, mes) : Math.min(Number(d.slice(8)), ultimoDia(ano, mes));
  return iso(Date.UTC(ano, mes, dia, 12));
}

const mesCheio = (p: Periodo) => p.de.endsWith("-01") && fimDoMes(p.ate);

/* Os atalhos fecham ontem: hoje ainda está acontecendo e derrubaria a comparação.
   A exceção é o dia 1º, em que "este mês" não tem outro dia para mostrar. */
export function atalhosPeriodo(hoje: string) {
  const ontem = somarDias(hoje, -1);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const fimMesPassado = somarDias(inicioMes, -1);
  return [
    { id: "7", nome: "7 dias", de: somarDias(ontem, -6), ate: ontem },
    { id: "30", nome: "30 dias", de: somarDias(ontem, -29), ate: ontem },
    { id: "90", nome: "90 dias", de: somarDias(ontem, -89), ate: ontem },
    { id: "mes", nome: "Este mês", de: inicioMes, ate: ontem < inicioMes ? hoje : ontem },
    { id: "passado", nome: "Mês passado", de: `${fimMesPassado.slice(0, 7)}-01`, ate: fimMesPassado },
  ];
}

/** O período de comparação de cada atalho. `livre` e `nenhum` não se calculam. */
export function periodoComparado(p: Periodo, modo: ModoComparacao): Periodo | null {
  if (modo === "ano") return { de: moverMeses(p.de, -12), ate: moverMeses(p.ate, -12) };
  // Mês fechado contra mês fechado; senão setembro viraria 31/08 a 30/09.
  if (modo === "mes" || (modo === "anterior" && mesCheio(p))) return { de: moverMeses(p.de, -1), ate: moverMeses(p.ate, -1) };
  if (modo === "anterior") return { de: somarDias(p.de, -diasDoPeriodo(p)), ate: somarDias(p.de, -1) };
  return null;
}

function dataValida(d?: string): d is string {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(utc(d)) && iso(utc(d)) === d;
}

export function periodoValido(de?: string, ate?: string): Periodo | null {
  if (!dataValida(de) || !dataValida(ate)) return null;
  return de <= ate ? { de, ate } : { de: ate, ate: de };
}

const MODOS: ModoComparacao[] = ["anterior", "mes", "ano", "livre", "nenhum"];

/** O estado inicial, da URL; sem nada nela, os últimos 30 dias contra os 30 anteriores. */
export function lerPeriodo(
  q: { de?: string; ate?: string; vs?: string; vsde?: string; vsate?: string },
  hoje: string,
): { periodo: Periodo; modo: ModoComparacao; livre: Periodo | null } {
  const periodo = periodoValido(q.de, q.ate) ?? atalhosPeriodo(hoje)[1];
  const livre = periodoValido(q.vsde, q.vsate);
  const pedido = MODOS.find((m) => m === q.vs) ?? "anterior";
  return { periodo: { de: periodo.de, ate: periodo.ate }, modo: pedido === "livre" && !livre ? "anterior" : pedido, livre };
}

export function coletaPorConta(anuncios: Anuncio[]): Coleta {
  const coleta: Coleta = new Map();
  for (const a of anuncios) {
    const dias = coleta.get(a.conta) ?? new Set<string>();
    coleta.set(a.conta, dias);
    for (const [data, visitas] of a.movimento ?? []) if (visitas != null) dias.add(data);
  }
  return coleta;
}

/** Toda conta do recorte tem visitas em todos os dias? Se não, comparar visitas mente. */
export function coletaCompleta(contas: string[], p: Periodo, coleta: Coleta): boolean {
  for (let d = p.de; d <= p.ate; d = somarDias(d, 1)) {
    if (contas.some((c) => !coleta.get(c)?.has(d))) return false;
  }
  return true;
}

export type Totais = { visitas: number; vendas: number; vendasComVisita: number; receita: number };

/** Os totais de um anúncio no período; nulo quando ele não teve movimento nenhum nele. */
export function totaisNoPeriodo(a: Anuncio, p: Periodo, coleta: Coleta): Totais | null {
  let t: Totais | null = null;
  const coletados = coleta.get(a.conta);
  for (const [data, visitas, unidades, receita] of a.movimento ?? []) {
    if (data < p.de || data > p.ate) continue;
    t ??= { visitas: 0, vendas: 0, vendasComVisita: 0, receita: 0 };
    t.visitas += visitas ?? 0;
    t.vendas += unidades;
    t.receita += receita;
    if (coletados?.has(data)) t.vendasComVisita += unidades;
  }
  return t;
}

/** Até 45 dias o gráfico abre por dia; além disso as barras ficam finas demais. */
export const agrupaPorDia = (p: Periodo) => diasDoPeriodo(p) <= 45;

/**
 * O anúncio com `semanas` montada para o período: um item por dia ou por semana.
 *
 * A semana sai cortada nas pontas do período. Vitrine e tarifa só existem por
 * semana no banco, e o dia herda o valor da semana dele.
 */
export function recortarAnuncio(a: Anuncio, p: Periodo, coleta: Coleta): Anuncio {
  const porDia = agrupaPorDia(p);
  const coletados = coleta.get(a.conta);
  const grupos = new Map<string, SemanaDesempenho>();
  for (const [data, visitas, unidades, receita] of a.movimento ?? []) {
    if (data < p.de || data > p.ate) continue;
    const seg = segunda(data);
    const domingo = somarDias(seg, 6);
    const inicio = porDia ? data : seg < p.de ? p.de : seg;
    const fim = porDia ? data : domingo > p.ate ? p.ate : domingo;
    const g = grupos.get(inicio) ?? {
      semana: br(inicio),
      intervalo: inicio === fim ? br(inicio) : `${br(inicio)} – ${br(fim)}`,
      visitas: 0, vendas: 0, receita: 0, vendasComVisita: 0,
      precoAnunciado: a.vitrine?.[seg] ?? null,
      precoRealizado: null,
      precoIdeal: a.precoReferencia ?? 0,
      comissao: 0,
      tarifaCobrada: a.tarifas?.[seg] ?? null,
      dias: [], campanhas: [],
    };
    g.visitas += visitas ?? 0;
    g.vendas += unidades;
    g.receita += receita;
    if (coletados?.has(data)) g.vendasComVisita = (g.vendasComVisita ?? 0) + unidades;
    g.precoRealizado = g.vendas ? g.receita / g.vendas : null;
    grupos.set(inicio, g);
  }
  return { ...a, semanas: [...grupos.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([, g]) => g) };
}
