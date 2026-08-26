import { ANUNCIOS_ANALISE } from "@/mock/analise";
import { CANAIS, CANAL_NOMES } from "@/mock";

/**
 * "O que mudou desde ontem".
 *
 * O painel antigo mostrava o total do mês — número que você já sabia
 * ontem. O que muda decisão é a DIFERENÇA: o que caiu, o que subiu, o que
 * vence, o que rompeu. Cada linha aponta para o lugar de agir.
 *
 * Derivado dos mesmos dados das outras telas, para não inventar realidade
 * paralela: os anúncios saem de ANUNCIOS_ANALISE, os canais de CANAIS.
 */

export type Severidade = "critico" | "atencao" | "bom";

export type Mudanca = {
  id: string;
  severidade: Severidade;
  /** O grupo que a tela usa para separar as linhas. */
  tipo: "venda" | "preco" | "campanha" | "estoque" | "meta";
  titulo: string;
  detalhe: string;
  /** Número grande que resume a mudança, já formatado. */
  valor: string;
  /** Variação em %, quando faz sentido mostrar seta. */
  delta?: number;
  /** true quando cair é bom. */
  inverso?: boolean;
  href: string;
  quando: string;
};

/** PRNG semeado — o painel não pode mudar a cada renderização. */
function prng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Percentual em pt-BR — vírgula, nunca ponto. */
const pct1 = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const rand = prng(26_08_2026);

/* ── Quedas de venda por anúncio ────────────────────────────── */

const quedas: Mudanca[] = ANUNCIOS_ANALISE.slice(0, 14)
  .map((a) => {
    const ult = a.semanas[a.semanas.length - 1];
    const pen = a.semanas[a.semanas.length - 2];
    if (!ult || !pen || pen.vendas === 0) return null;
    const variacao = ((ult.vendas - pen.vendas) / pen.vendas) * 100;
    return { a, ult, pen, variacao };
  })
  .filter((x): x is NonNullable<typeof x> => x !== null)
  .filter((x) => x.variacao <= -8)
  .sort((x, y) => x.variacao - y.variacao)
  .slice(0, 4)
  .map((x) => ({
    id: `queda-${x.a.mlb}`,
    severidade: x.variacao <= -20 ? ("critico" as const) : ("atencao" as const),
    tipo: "venda" as const,
    titulo: x.a.titulo,
    detalhe:
      `${x.a.mlb} · caiu de ${x.pen.vendas} para ${x.ult.vendas} unidades` +
      (x.ult.precoAnunciado > x.pen.precoAnunciado
        ? ` — e o preço subiu para ${brl(x.ult.precoAnunciado)}`
        : x.ult.visitas < x.pen.visitas
          ? ` — as visitas também caíram`
          : ` — com o mesmo tráfego`),
    valor: `${x.variacao.toFixed(0)}%`,
    delta: +x.variacao.toFixed(1),
    href: `/anuncios/analise?anuncio=${x.a.mlb}`,
    quando: "semana passada",
  }));

/* ── Subidas que valem olhar ─────────────────────────────────── */

const altas: Mudanca[] = ANUNCIOS_ANALISE.slice(0, 20)
  .map((a) => {
    const ult = a.semanas[a.semanas.length - 1];
    const pen = a.semanas[a.semanas.length - 2];
    if (!ult || !pen || pen.vendas === 0) return null;
    return { a, ult, pen, variacao: ((ult.vendas - pen.vendas) / pen.vendas) * 100 };
  })
  .filter((x): x is NonNullable<typeof x> => x !== null)
  .filter((x) => x.variacao >= 15)
  .sort((x, y) => y.variacao - x.variacao)
  .slice(0, 2)
  .map((x) => ({
    id: `alta-${x.a.mlb}`,
    severidade: "bom" as const,
    tipo: "venda" as const,
    titulo: x.a.titulo,
    detalhe: `${x.a.mlb} · subiu de ${x.pen.vendas} para ${x.ult.vendas} unidades. Vale conferir o estoque.`,
    valor: `+${x.variacao.toFixed(0)}%`,
    delta: +x.variacao.toFixed(1),
    href: `/anuncios/analise?anuncio=${x.a.mlb}`,
    quando: "semana passada",
  }));

/* ── Preço de concorrente ────────────────────────────────────── */

const concorrencia: Mudanca[] = ANUNCIOS_ANALISE.slice(2, 5).map((a, i) => {
  const meu = a.semanas[a.semanas.length - 1].precoAnunciado;
  const queda = 4 + rand() * 9;
  const deles = meu * (1 - queda / 100);
  return {
    id: `conc-${a.mlb}`,
    severidade: queda > 8 ? ("critico" as const) : ("atencao" as const),
    tipo: "preco" as const,
    titulo: `Concorrente ${pct1(queda)}% abaixo em ${a.titulo}`,
    detalhe: `${a.mlb} · ele está a ${brl(deles)}, você a ${brl(meu)}`,
    valor: brl(deles - meu),
    delta: -queda,
    inverso: true,
    href: "/monitoramento/precos",
    quando: ["há 2 h", "há 6 h", "ontem"][i] ?? "ontem",
  };
});

/* ── Campanha vencendo ───────────────────────────────────────── */

const campanhas: Mudanca[] = [
  {
    id: "camp-1",
    severidade: "atencao",
    tipo: "campanha",
    titulo: "“O melhor de todos os dias” encerra em 3 dias",
    detalhe: "142 anúncios elegíveis · 38 ainda sem decisão",
    valor: "38",
    href: "/promocoes/campanhas",
    quando: "encerra 28/08",
  },
];

/* ── Estoque ─────────────────────────────────────────────────── */

const estoque: Mudanca[] = ANUNCIOS_ANALISE.slice(5, 8).map((a, i) => {
  const dias = [6, 11, 14][i] ?? 12;
  const vendaSemana = a.semanas[a.semanas.length - 1].vendas;
  return {
    id: `est-${a.mlb}`,
    severidade: dias <= 7 ? ("critico" as const) : ("atencao" as const),
    tipo: "estoque" as const,
    titulo: a.titulo,
    detalhe: `${a.mlb} · vendendo ${vendaSemana} un por semana, o estoque acaba antes do próximo lote`,
    valor: `${dias} dias`,
    href: `/anuncios/analise?anuncio=${a.mlb}`,
    quando: "cobertura",
  };
});

/* ── Meta ────────────────────────────────────────────────────── */

const metas: Mudanca[] = CANAIS.filter((c) => c.delta < 0)
  .slice(0, 2)
  .map((c) => ({
    id: `meta-${c.id}`,
    severidade: "atencao" as const,
    tipo: "meta" as const,
    titulo: `${CANAL_NOMES[c.id] ?? c.nome} abaixo do ritmo`,
    detalhe: `Caiu ${pct1(Math.abs(c.delta))}% e representa ${pct1(c.participacao)}% do faturamento`,
    valor: `${pct1(c.delta)}%`,
    delta: c.delta,
    href: "/vendas/metas",
    quando: "no mês",
  }));

/* ── Consolidado, na ordem em que a tela mostra ──────────────── */

const ORDEM: Record<Severidade, number> = { critico: 0, atencao: 1, bom: 2 };

export const MUDANCAS: Mudanca[] = [
  ...quedas,
  ...concorrencia,
  ...estoque,
  ...campanhas,
  ...metas,
  ...altas,
].sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade]);

export const RESUMO_MUDANCAS = {
  total: MUDANCAS.length,
  criticos: MUDANCAS.filter((m) => m.severidade === "critico").length,
  atencao: MUDANCAS.filter((m) => m.severidade === "atencao").length,
  bons: MUDANCAS.filter((m) => m.severidade === "bom").length,
};

export const FILTROS_MUDANCA = [
  { valor: "todos", rotulo: "Tudo" },
  { valor: "venda", rotulo: "Vendas" },
  { valor: "preco", rotulo: "Preço" },
  { valor: "estoque", rotulo: "Estoque" },
  { valor: "campanha", rotulo: "Campanhas" },
  { valor: "meta", rotulo: "Metas" },
] as const;
