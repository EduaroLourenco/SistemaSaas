import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarBaseMargem, agregar } from "./margem";

/**
 * Tráfego pago: a mídia contra a margem que ela produz.
 *
 * ── A pergunta que esta tela existe para responder ──
 *
 * Não é "qual o ACOS". O canal já mostra ACOS, e ele engana sozinho: um
 * ACOS de 14% parece ótimo até você descobrir que a margem daquele
 * anúncio é 13,8%. Aí cada venda que a mídia traz custa dinheiro.
 *
 * A pergunta é: **depois de pagar a mídia, sobra?** Só dá para responder
 * cruzando o gasto por anúncio com a margem por anúncio, e os dois vivem
 * em lugares diferentes até aqui.
 *
 * ── Três receitas diferentes, e a confusão que elas causam ──
 *
 *   receita atribuída   o que o canal credita ao ads
 *   receita direta      clicou no anúncio e comprou aquele anúncio
 *   receita real        o que o anúncio faturou, dos pedidos
 *
 * Medido nos dados reais: a atribuída é 55,9% da real, e 47,5% dela é
 * indireta — a pessoa clicou e comprou outra coisa.
 *
 * Isso importa porque o ROAS publicado usa a atribuída. Um ROAS de 8,4
 * não significa que a mídia gerou R$ 8,40 por real: significa que o canal
 * credita isso a ela. A tela mostra as duas, e a diferença é a margem de
 * dúvida da atribuição.
 *
 * ── O gasto que não vira nada ──
 *
 * Anúncio com investimento e sem receita atribuída se separa em dois
 * grupos que pedem decisões opostas:
 *
 *   não vendeu nem sozinho    →  30 anúncios, R$ 1.504,67 → desligar
 *   vendeu bem sem o ads      →  36 anúncios, R$ 2.784,58 → a mídia sobrou
 *
 * Um relatório de ads sozinho não distingue os dois. Aqui dá, porque o
 * sistema sabe o que cada anúncio faturou de verdade.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export type Periodo = { inicio: string; fim: string; rotulo: string };

export type LinhaAnuncioAds = {
  mlb: string;
  sku: string;
  titulo: string;
  tipo: string;
  campanhas: string[];

  impressoes: number;
  cliques: number;
  investimento: number;
  /** Atribuída pelo canal. Inclui venda indireta. */
  receitaAtribuida: number;
  receitaDireta: number;
  receitaIndireta: number;

  /** Faturamento real do anúncio no período, dos pedidos. */
  receitaReal: number;
  /** Margem de contribuição real, quando o custo do SKU está cadastrado. */
  margem: number | null;
  margemPct: number | null;

  cpc: number | null;
  acos: number | null;
  roas: number | null;
  /** Margem menos a mídia. Negativo = a mídia comeu mais do que sobrou. */
  sobraAposMidia: number | null;
  /** Sem receita atribuída: vendeu por fora, ou não vendeu nada? */
  situacao: "ok" | "sem_retorno" | "vendeu_sem_ads" | "prejuizo";
};

export type LinhaCampanha = {
  campanha: string;
  anuncios: number;
  investimento: number;
  receitaAtribuida: number;
  cliques: number;
  acos: number | null;
  roas: number | null;
  margem: number | null;
  sobraAposMidia: number | null;
};

export type PeriodoResumo = {
  rotulo: string;
  inicio: string;
  fim: string;
  investimento: number;
  receitaAtribuida: number;
  cliques: number;
  acos: number | null;
  roas: number | null;
  cpc: number | null;
};

export type DadosTrafegoPago = {
  vazio: boolean;
  periodos: PeriodoResumo[];
  linhas: LinhaAnuncioAds[];
  campanhas: LinhaCampanha[];
  totais: {
    investimento: number;
    receitaAtribuida: number;
    receitaReal: number;
    receitaIndireta: number;
    margem: number | null;
    sobraAposMidia: number | null;
    /** Quanto da receita real o canal credita à mídia. */
    atribuicao: number | null;
    /** Quantos SKUs têm custo, para não ler margem parcial como total. */
    coberturaMargem: number;
  };
  /** Investimento do relatório contra o lançado à mão, por mês. */
  conferencia: { mes: string; relatorio: number; lancado: number }[];
};

export async function carregarTrafegoPago(): Promise<DadosTrafegoPago> {
  const sb = await clienteServidor();

  const [adsRaw, anunciosRaw, diariasRaw] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncio_ads")
        .select(
          "codigo_externo,campanha,inicio,fim,impressoes,cliques,investimento,receita,receita_direta,receita_indireta"
        )
        .order("inicio")
    ),
    paginar(() =>
      sb.from("anuncios").select("codigo_externo,sku_canal,titulo,tipo").order("codigo_externo")
    ),
    paginar(() =>
      sb.from("vendas_diarias").select("data,investimento_ads").gt("investimento_ads", 0)
    ),
  ]);

  type Ads = {
    codigo_externo: string;
    campanha: string;
    inicio: string;
    fim: string;
    impressoes: number;
    cliques: number;
    investimento: string | number;
    receita: string | number;
    receita_direta: string | number;
    receita_indireta: string | number;
  };
  const ads = adsRaw as unknown as Ads[];
  if (!ads.length) {
    return {
      vazio: true, periodos: [], linhas: [], campanhas: [],
      totais: {
        investimento: 0, receitaAtribuida: 0, receitaReal: 0, receitaIndireta: 0,
        margem: null, sobraAposMidia: null, atribuicao: null, coberturaMargem: 0,
      },
      conferencia: [],
    };
  }

  type Anun = { codigo_externo: string; sku_canal: string | null; titulo: string; tipo: string };
  const info = new Map(
    (anunciosRaw as unknown as Anun[]).map((a) => [a.codigo_externo, a])
  );

  /* ── O intervalo que a mídia cobre define a janela da margem ── */

  const inicio = ads.reduce((m, a) => (a.inicio < m ? a.inicio : m), ads[0].inicio);
  const fim = ads.reduce((m, a) => (a.fim > m ? a.fim : m), ads[0].fim);

  const base = await carregarBaseMargem({ inicio, fim });
  const margemPorMlb = new Map(agregar(base, "anuncio").map((l) => [l.chave, l]));

  /* ── Agrega a mídia por anúncio ── */

  type Ac = {
    imp: number; cli: number; inv: number;
    rec: number; recD: number; recI: number;
    campanhas: Set<string>;
  };
  const porMlb = new Map<string, Ac>();
  const porCampanha = new Map<string, Ac & { mlbs: Set<string> }>();
  const porPeriodo = new Map<string, PeriodoResumo>();

  for (const a of ads) {
    const at =
      porMlb.get(a.codigo_externo) ??
      { imp: 0, cli: 0, inv: 0, rec: 0, recD: 0, recI: 0, campanhas: new Set<string>() };
    at.imp += a.impressoes;
    at.cli += a.cliques;
    at.inv += n(a.investimento);
    at.rec += n(a.receita);
    at.recD += n(a.receita_direta);
    at.recI += n(a.receita_indireta);
    at.campanhas.add(a.campanha);
    porMlb.set(a.codigo_externo, at);

    const c =
      porCampanha.get(a.campanha) ??
      { imp: 0, cli: 0, inv: 0, rec: 0, recD: 0, recI: 0, campanhas: new Set<string>(), mlbs: new Set<string>() };
    c.imp += a.impressoes;
    c.cli += a.cliques;
    c.inv += n(a.investimento);
    c.rec += n(a.receita);
    c.mlbs.add(a.codigo_externo);
    porCampanha.set(a.campanha, c);

    const chave = `${a.inicio}|${a.fim}`;
    const p =
      porPeriodo.get(chave) ??
      {
        rotulo: rotuloPeriodo(a.inicio, a.fim),
        inicio: a.inicio, fim: a.fim,
        investimento: 0, receitaAtribuida: 0, cliques: 0,
        acos: null, roas: null, cpc: null,
      };
    p.investimento += n(a.investimento);
    p.receitaAtribuida += n(a.receita);
    p.cliques += a.cliques;
    porPeriodo.set(chave, p);
  }

  /* ── Monta as linhas por anúncio ── */

  const linhas: LinhaAnuncioAds[] = [];
  let comCusto = 0;

  for (const [mlb, a] of porMlb) {
    const i = info.get(mlb);
    const m = margemPorMlb.get(mlb);
    const receitaReal = m?.receita ?? 0;
    const margem = m?.margem ?? null;
    if (margem != null) comCusto += 1;

    const sobra = margem == null ? null : r2(margem - a.inv);

    /*
     * A situação é o que transforma o número em decisão.
     *
     * "sem_retorno" e "vendeu_sem_ads" parecem iguais no relatório do
     * canal — investimento com receita atribuída zero — e pedem ações
     * opostas: um se desliga, o outro mostra que a mídia estava sobrando
     * num anúncio que já vendia.
     */
    let situacao: LinhaAnuncioAds["situacao"] = "ok";
    if (a.inv > 0 && a.rec === 0) {
      situacao = receitaReal > 0 ? "vendeu_sem_ads" : "sem_retorno";
    } else if (sobra != null && sobra < 0) {
      situacao = "prejuizo";
    }

    linhas.push({
      mlb,
      sku: i?.sku_canal ?? "",
      titulo: i?.titulo ?? "",
      tipo: i?.tipo ?? "—",
      campanhas: [...a.campanhas].sort(),
      impressoes: a.imp,
      cliques: a.cli,
      investimento: r2(a.inv),
      receitaAtribuida: r2(a.rec),
      receitaDireta: r2(a.recD),
      receitaIndireta: r2(a.recI),
      receitaReal: r2(receitaReal),
      margem,
      margemPct: m?.margemPct ?? null,
      cpc: a.cli > 0 ? r2(a.inv / a.cli) : null,
      acos: a.rec > 0 ? r2((a.inv * 100) / a.rec) : null,
      roas: a.inv > 0 && a.rec > 0 ? r2(a.rec / a.inv) : null,
      sobraAposMidia: sobra,
      situacao,
    });
  }

  linhas.sort((a, b) => b.investimento - a.investimento);

  /* ── Campanhas ── */

  const margemPorMlbMap = margemPorMlb;
  const campanhas: LinhaCampanha[] = [...porCampanha.entries()]
    .map(([nome, c]) => {
      let margem: number | null = null;
      for (const mlb of c.mlbs) {
        const m = margemPorMlbMap.get(mlb)?.margem;
        if (m != null) margem = (margem ?? 0) + m;
      }
      return {
        campanha: nome,
        anuncios: c.mlbs.size,
        investimento: r2(c.inv),
        receitaAtribuida: r2(c.rec),
        cliques: c.cli,
        acos: c.rec > 0 ? r2((c.inv * 100) / c.rec) : null,
        roas: c.inv > 0 && c.rec > 0 ? r2(c.rec / c.inv) : null,
        margem: margem == null ? null : r2(margem),
        sobraAposMidia: margem == null ? null : r2(margem - c.inv),
      };
    })
    .sort((a, b) => b.investimento - a.investimento);

  /* ── Períodos ── */

  const periodos = [...porPeriodo.values()]
    .map((p) => ({
      ...p,
      investimento: r2(p.investimento),
      receitaAtribuida: r2(p.receitaAtribuida),
      acos: p.receitaAtribuida > 0 ? r2((p.investimento * 100) / p.receitaAtribuida) : null,
      roas: p.investimento > 0 && p.receitaAtribuida > 0 ? r2(p.receitaAtribuida / p.investimento) : null,
      cpc: p.cliques > 0 ? r2(p.investimento / p.cliques) : null,
    }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  /* ── Conferência com o lançamento manual ── */

  const lancadoPorMes = new Map<string, number>();
  for (const d of diariasRaw as unknown as { data: string; investimento_ads: string | number }[]) {
    const mes = String(d.data).slice(0, 7);
    lancadoPorMes.set(mes, (lancadoPorMes.get(mes) ?? 0) + n(d.investimento_ads));
  }
  const relatorioPorMes = new Map<string, number>();
  for (const a of ads) {
    const mes = a.inicio.slice(0, 7);
    relatorioPorMes.set(mes, (relatorioPorMes.get(mes) ?? 0) + n(a.investimento));
  }
  const conferencia = [...relatorioPorMes.entries()]
    .map(([mes, relatorio]) => ({
      mes,
      relatorio: r2(relatorio),
      lancado: r2(lancadoPorMes.get(mes) ?? 0),
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  /* ── Totais ── */

  const investimento = r2(linhas.reduce((s, l) => s + l.investimento, 0));
  const receitaAtribuida = r2(linhas.reduce((s, l) => s + l.receitaAtribuida, 0));
  const receitaReal = r2(linhas.reduce((s, l) => s + l.receitaReal, 0));
  const receitaIndireta = r2(linhas.reduce((s, l) => s + l.receitaIndireta, 0));
  const margemTotal = linhas.reduce<number | null>(
    (s, l) => (l.margem == null ? s : (s ?? 0) + l.margem),
    null
  );

  return {
    vazio: false,
    periodos,
    linhas,
    campanhas,
    totais: {
      investimento,
      receitaAtribuida,
      receitaReal,
      receitaIndireta,
      margem: margemTotal == null ? null : r2(margemTotal),
      sobraAposMidia: margemTotal == null ? null : r2(margemTotal - investimento),
      atribuicao: receitaReal > 0 ? r2((receitaAtribuida * 100) / receitaReal) : null,
      coberturaMargem: linhas.length ? r2((comCusto * 100) / linhas.length) : 0,
    },
    conferencia,
  };
}

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function rotuloPeriodo(inicio: string, fim: string): string {
  const mi = Number(inicio.slice(5, 7)) - 1;
  const mf = Number(fim.slice(5, 7)) - 1;
  // Período que cabe num mês só se lê melhor pelo nome do mês do que por
  // duas datas — e é o caso de todos os relatórios mensais do canal.
  if (mi === mf) return `${MESES[mi]}/${inicio.slice(2, 4)}`;
  return `${inicio.slice(8, 10)}/${inicio.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}`;
}
