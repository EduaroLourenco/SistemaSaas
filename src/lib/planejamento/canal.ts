import { nomePromocao } from "@/lib/promocao-rotulos";
import type { Status } from "./modelo";

/**
 * O que o Mercado Livre diz estar no ar, na forma que o Planejamento usa,
 * e a situação de cada item do plano a partir das datas.
 *
 * ── Relâmpago negociado ──
 *
 * O relâmpago do consultor não é promoção `LIGHTNING`: é a janela de 12h
 * dentro do `PRE_NEGOTIATED`. Por isso a janela curta vira uma entrada por
 * dia, e a janela do mês fica na entrada do pré-acordo.
 *
 * ── A data manda, o status do item não ──
 *
 * O canal para de devolver a janela que passou, e a linha fica com o último
 * status lido: há relâmpago de 11/11 ainda como `pending`. `started` e
 * `pending` dizem só que o anúncio entrou; se está no ar, quem diz é o relógio.
 */

export type GrupoCanal = "relampago" | "consultor" | "meli" | "nossa" | "cupom" | "automatica";
export type SituacaoCanal = "no-ar" | "agendada" | "encerrada";

export type PromoCanal = {
  id: string;
  codigo: string;
  tipo: string;
  grupo: GrupoCanal;
  nome: string;
  inicio: string;
  fim: string;
  /** Dias em São Paulo: é o que o calendário posiciona. */
  dia: string;
  diaFim: string;
  situacao: SituacaoCanal;
  /** Null: cupom sem adesão por anúncio informada pelo canal. */
  anuncios: number | null;
  skus: string[];
  contas: string[];
  lidoEm: string;
};

export type LinhaPromo = {
  id: string;
  conta_canal_id: string;
  codigo: string;
  tipo: string;
  nome: string | null;
  inicio: string | null;
  fim: string | null;
  lido_em: string;
};

export type LinhaItem = {
  promocao_id: string;
  codigo_externo: string;
  status: string | null;
  inicio: string | null;
  fim: string | null;
};

export const ROTULO_GRUPO: Record<GrupoCanal, string> = {
  relampago: "Relâmpago",
  consultor: "Consultor",
  meli: "Campanha do Meli",
  nossa: "Nossa campanha",
  cupom: "Cupom",
  automatica: "Automática",
};

const GRUPO_POR_TIPO: Record<string, GrupoCanal> = {
  LIGHTNING: "relampago",
  SMART_LIGHTNING: "relampago",
  PRE_NEGOTIATED: "consultor",
  DEAL: "meli",
  DOD: "meli",
  MARKETPLACE_CAMPAIGN: "meli",
  SELLER_CAMPAIGN: "nossa",
  SELLER_COUPON_CAMPAIGN: "cupom",
};

const HORA = 3_600_000;
const COM_JANELA_CURTA = new Set(["PRE_NEGOTIATED", "LIGHTNING", "SMART_LIGHTNING"]);
const ATIVO = new Set(["started", "pending"]);
/* A rodada de uma conta leva minutos. Mais que isto é outra rodada. */
const FOLGA_DA_LEITURA = 6 * HORA;

const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
export const diaSP = (ms: number) => fmtDia.format(new Date(ms));

const tempo = (s: string | null) => (s ? Date.parse(s) : NaN);

export function montarPromocoesNoCanal(
  promos: LinhaPromo[],
  itens: LinhaItem[],
  skuPorMlb: Map<string, string>,
  agora: number = Date.now(),
): PromoCanal[] {
  const ultimaLeitura = new Map<string, number>();
  for (const p of promos) {
    ultimaLeitura.set(
      p.conta_canal_id,
      Math.max(ultimaLeitura.get(p.conta_canal_id) ?? 0, tempo(p.lido_em)),
    );
  }
  /* Vigente pela data e fora da última leitura: o canal deixou de listar. */
  const validas = new Map(
    promos
      .filter(
        (p) =>
          tempo(p.lido_em) >= ultimaLeitura.get(p.conta_canal_id)! - FOLGA_DA_LEITURA ||
          (p.fim != null && tempo(p.fim) < agora),
      )
      .map((p) => [p.id, p]),
  );

  type Acc = {
    p: LinhaPromo;
    curta: boolean;
    ini: number;
    fim: number;
    diaFixo: string | null;
    mlbs: Set<string>;
    contas: Set<string>;
    lido: number;
  };
  const grupos = new Map<string, Acc>();
  const pegar = (chave: string, p: LinhaPromo, curta: boolean, ini: number, fim: number, diaFixo: string | null) => {
    let g = grupos.get(chave);
    if (!g) {
      g = { p, curta, ini, fim, diaFixo, mlbs: new Set(), contas: new Set(), lido: 0 };
      grupos.set(chave, g);
    }
    g.ini = Math.min(g.ini, ini);
    g.fim = Math.max(g.fim, fim);
    g.contas.add(p.conta_canal_id);
    g.lido = Math.max(g.lido, tempo(p.lido_em));
    return g;
  };

  /* A promoção entra mesmo sem item: cupom vigente não lista adesão. */
  for (const p of validas.values()) {
    if (p.inicio && p.fim) pegar(p.codigo, p, false, tempo(p.inicio), tempo(p.fim), null);
  }

  for (const i of itens) {
    const p = validas.get(i.promocao_id);
    if (!p || !ATIVO.has(i.status ?? "")) continue;
    const ini = tempo(i.inicio);
    let fim = tempo(i.fim);
    let diaFixo: string | null = null;
    const relampagoSemFim =
      p.tipo !== "PRE_NEGOTIATED" && COM_JANELA_CURTA.has(p.tipo) && !Number.isNaN(ini) && Number.isNaN(fim);
    if (relampagoSemFim) {
      /* ponytail: LIGHTNING vem sem fim e sem fuso; assume 12h e o dia escrito.
         Trocar quando o canal informar `end_date` nesse tipo. */
      fim = ini + 12 * HORA;
      diaFixo = String(i.inicio).slice(0, 10);
    }
    const curta =
      COM_JANELA_CURTA.has(p.tipo) && !Number.isNaN(ini) && !Number.isNaN(fim) && fim - ini <= 24 * HORA;
    if (curta) {
      const dia = diaFixo ?? diaSP(ini);
      pegar(`${p.codigo}|${dia}`, p, true, ini, fim, diaFixo).mlbs.add(i.codigo_externo);
      continue;
    }
    const g = grupos.get(p.codigo);
    if (!g) continue;
    g.mlbs.add(i.codigo_externo);
    /* O pré-acordo fica aberto além do que foi negociado: vale a janela. */
    if (p.tipo === "PRE_NEGOTIATED" && !Number.isNaN(ini) && !Number.isNaN(fim)) {
      g.fim = g.mlbs.size === 1 ? fim : Math.max(g.fim, fim);
    }
  }

  const saida: PromoCanal[] = [];
  for (const [id, g] of grupos) {
    const cupom = g.p.tipo === "SELLER_COUPON_CAMPAIGN";
    /* Sem anúncio ativo é só convite, e convite não está no ar. */
    if (!g.mlbs.size && !cupom) continue;
    const skus = new Set<string>();
    for (const m of g.mlbs) {
      const s = skuPorMlb.get(m.toUpperCase());
      if (s) skus.add(s);
    }
    saida.push({
      id,
      codigo: g.p.codigo,
      tipo: g.p.tipo,
      grupo: g.curta ? "relampago" : (GRUPO_POR_TIPO[g.p.tipo] ?? "automatica"),
      nome: nomePromocao(g.p.tipo, g.p.nome),
      inicio: new Date(g.ini).toISOString(),
      fim: new Date(g.fim).toISOString(),
      dia: g.diaFixo ?? diaSP(g.ini),
      /* Termina à meia-noite: o último dia é o anterior. */
      diaFim: g.diaFixo ?? diaSP(g.fim - 60_000),
      situacao: agora < g.ini ? "agendada" : agora > g.fim ? "encerrada" : "no-ar",
      anuncios: g.mlbs.size || null,
      skus: [...skus],
      contas: [...g.contas],
      lidoEm: new Date(g.lido).toISOString(),
    });
  }
  return saida.sort((a, b) => a.fim.localeCompare(b.fim));
}

type ItemComData = { status: Status | string; inicio: string; fim: string; skus: string[] };

/**
 * A situação que o item tem hoje.
 *
 * Concluída e Cancelada são decisão de alguém e ficam. Rascunho só anda se o
 * canal confirmar pelo menos metade dos SKUs: rascunho é ideia, e data
 * passando não a põe no ar. O resto segue o calendário.
 */
export function situacaoDoItem<T extends ItemComData>(i: T, hoje: string, promos: PromoCanal[]): T["status"] {
  if (i.status === "Concluída" || i.status === "Cancelada") return i.status;
  if (i.inicio > hoje) return i.status;
  if (i.status === "Rascunho" && !confirmadoNoCanal(i, promos)) return i.status;
  return i.fim < hoje ? "Concluída" : "Em andamento";
}

function confirmadoNoCanal(i: ItemComData, promos: PromoCanal[]) {
  if (!i.skus.length) return false;
  const meus = new Set(i.skus.map((s) => s.toUpperCase()));
  return promos.some(
    (p) =>
      ["consultor", "meli", "nossa"].includes(p.grupo) &&
      p.dia <= i.fim &&
      p.diaFim >= i.inicio &&
      p.skus.filter((s) => meus.has(s.toUpperCase())).length * 2 >= meus.size,
  );
}
