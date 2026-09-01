/**
 * Análise de anúncios — regras de negócio.
 *
 * Portado de `derived-metrics.ts` do projeto anterior, com três correções:
 *  1. o custo de subsídio acumula TODAS as semanas, não só a última — antes,
 *     um item que sangrou margem por dois meses e parou na última semana
 *     aparecia como saudável;
 *  2. a elasticidade compara a média da primeira metade do período com a da
 *     segunda, em vez de duas semanas soltas — uma semana atípica deixava de
 *     inverter o diagnóstico;
 *  3. cada item carrega o MOTIVO em texto de por que entrou em cada lente.
 */

/** Um dia com venda dentro da semana — é o "quando" e o "a quanto". */
export type DiaVenda = {
  /** ISO, AAAA-MM-DD. */
  data: string;
  /** Dia da semana já pronto para exibir: "seg", "ter"… */
  diaSemana: string;
  vendas: number;
  /** Preço médio pago naquele dia (unit_price dos pedidos). */
  preco: number;
};

export type SemanaDesempenho = {
  /** Rótulo curto, ex.: "S31". */
  semana: string;
  /** Intervalo legível, ex.: "28/07 a 03/08". */
  intervalo: string;
  visitas: number;
  vendas: number;
  receita: number;

  /**
   * O preço da vitrine — o que estava publicado no anúncio.
   * Vem de um retrato semanal (`/items/{id}`), porque a API só devolve o
   * preço de AGORA, sem histórico. É o único preço que existe mesmo em
   * semana sem venda — e é justamente ele que explica por que parou de
   * vender.
   */
  precoAnunciado: number;

  /**
   * O preço que o cliente de fato pagou — média ponderada do `unit_price`
   * dos pedidos da semana. Vem com histórico completo pela API de pedidos,
   * sem precisar de retrato. Fica nulo quando não houve venda.
   * Difere do anunciado quando houve campanha, cupom ou frete embutido.
   */
  precoRealizado: number | null;

  /** Preço ideal calculado para a data-base daquela semana. */
  precoIdeal: number;
  /** Comissão negociada, em pontos percentuais (16.5 = 16,5%). */
  comissao: number;
  /** Alíquota que o canal realmente cobrou na semana. Null quando não há venda com comissão conhecida. */
  tarifaCobrada?: number | null;
  /** Quebra por dia: quando vendeu e a quanto. */
  dias: DiaVenda[];
  campanhas: { nome: string; preco: number }[];
};

export type Anuncio = {
  mlb: string;
  sku: string;
  titulo: string;
  tipo: "Clássico" | "Premium";
  status: "ativo" | "pausado";
  conta: string;
  categoria: string;
  semanas: SemanaDesempenho[];
};

export type Lente =
  | "todos"
  | "sangrando"
  | "joias"
  | "falsa_tracao"
  | "desperdicio"
  | "fora_do_preco";

export type Metricas = {
  visitas: number;
  vendas: number;
  receita: number;
  /** Conversão do período: vendas ÷ visitas. */
  conversao: number;
  /** Preço médio da última semana com venda. */
  preco: number;
  precoIdeal: number;
  /** Desvio percentual do praticado sobre o ideal. */
  desvio: number;
  comissao: number;
  /** Soma de (ideal − praticado) × vendas nas semanas abaixo do ideal. */
  subsidio: number;
  /** Quanto o subsídio representa da receita do item, em %. */
  subsidioPct: number;
  elasticidadePositiva: boolean;
  desperdicioTrafego: boolean;
  curvaAReceita: boolean;
  curvaATrafego: boolean;
  /** Variação de vendas entre a primeira e a última semana com venda. */
  tendencia: number;
  campanhasAtivas: number;
  /** Série de vendas por semana, para o gráfico da linha. */
  serieVendas: number[];
};

export type AnuncioAnalisado = Anuncio & {
  metricas: Metricas;
  lentes: Lente[];
  motivos: Partial<Record<Lente, string>>;
};

export type ResumoGlobal = {
  receita: number;
  vendas: number;
  visitas: number;
  conversao: number;
  subsidio: number;
  itens: number;
  mediaVisitas: number;
  mediaConversao: number;
};

const fmtPct = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const fmtBrl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function soma(semanas: SemanaDesempenho[], campo: "visitas" | "vendas" | "receita") {
  return semanas.reduce((s, w) => s + w[campo], 0);
}

/**
 * Curva A por Pareto: ordena por um campo e marca os itens que compõem os
 * primeiros 80% do total — mesmo critério do projeto original.
 */
function curvaA<T>(itens: T[], valor: (t: T) => number, chave: (t: T) => string) {
  const total = itens.reduce((s, i) => s + valor(i), 0);
  const dentro = new Set<string>();
  let acumulado = 0;
  for (const item of [...itens].sort((a, b) => valor(b) - valor(a))) {
    if (acumulado > total * 0.8) break;
    dentro.add(chave(item));
    acumulado += valor(item);
  }
  return dentro;
}

/** Preço médio ponderado pelas semanas que tiveram venda. */
function mediaPreco(semanas: SemanaDesempenho[]) {
  const comVenda = semanas.filter((w) => w.vendas > 0);
  if (comVenda.length === 0) return 0;
  return soma(comVenda, "receita") / soma(comVenda, "vendas");
}

/**
 * Analisa a carteira. As curvas e as médias são sempre relativas ao recorte
 * de semanas visível — calcular sobre o histórico inteiro enquanto a tela
 * mostra um mês faria o usuário ler uma coisa e ver outra.
 */
export function analisar(
  anuncios: Anuncio[],
  semanasSelecionadas?: string[]
): { itens: AnuncioAnalisado[]; resumo: ResumoGlobal } {
  const recorte = (a: Anuncio) =>
    semanasSelecionadas && semanasSelecionadas.length
      ? a.semanas.filter((w) => semanasSelecionadas.includes(w.semana))
      : a.semanas;

  const base = anuncios.map((a) => {
    const semanas = recorte(a);
    return {
      anuncio: a,
      semanas,
      visitas: soma(semanas, "visitas"),
      vendas: soma(semanas, "vendas"),
      receita: soma(semanas, "receita"),
    };
  });

  const totalItens = base.length || 1;
  const mediaVisitas = base.reduce((s, b) => s + b.visitas, 0) / totalItens;
  const mediaConversao =
    base.reduce((s, b) => s + (b.visitas ? (b.vendas / b.visitas) * 100 : 0), 0) /
    totalItens;

  const aReceita = curvaA(base, (b) => b.receita, (b) => b.anuncio.mlb);
  const aTrafego = curvaA(base, (b) => b.visitas, (b) => b.anuncio.mlb);

  const itens: AnuncioAnalisado[] = base.map(
    ({ anuncio, semanas, visitas, vendas, receita }) => {
      const conversao = visitas ? (vendas / visitas) * 100 : 0;

      const subsidio = semanas.reduce((s, w) => {
        if (!w.precoIdeal || !w.vendas) return s;
        const praticado = w.receita / w.vendas;
        return praticado < w.precoIdeal ? s + (w.precoIdeal - praticado) * w.vendas : s;
      }, 0);

      const comVenda = semanas.filter((w) => w.vendas > 0);
      const ultimaComVenda = comVenda[comVenda.length - 1];
      const ultima = semanas[semanas.length - 1];
      const preco = ultimaComVenda
        ? ultimaComVenda.receita / ultimaComVenda.vendas
        // Sem venda na última semana, cai para o preço da vitrine.
        : (ultima ? ultima.precoAnunciado : 0);
      const precoIdeal = ultimaComVenda
        ? ultimaComVenda.precoIdeal
        : ultima
          ? ultima.precoIdeal
          : 0;
      const desvio = precoIdeal ? ((preco - precoIdeal) / precoIdeal) * 100 : 0;

      const meio = Math.floor(semanas.length / 2);
      const inicio = semanas.slice(0, meio);
      const fim = semanas.slice(meio);
      const precoInicio = mediaPreco(inicio);
      const precoFim = mediaPreco(fim);
      const convInicio = soma(inicio, "visitas")
        ? (soma(inicio, "vendas") / soma(inicio, "visitas")) * 100
        : 0;
      const convFim = soma(fim, "visitas")
        ? (soma(fim, "vendas") / soma(fim, "visitas")) * 100
        : 0;
      const precoCaiu = precoInicio > 0 && precoFim > 0 && precoFim < precoInicio * 0.99;
      const elasticidadePositiva = precoCaiu && convFim > convInicio;

      const desperdicioTrafego = visitas > mediaVisitas && conversao < mediaConversao;

      const primeiraComVenda = comVenda[0];
      const tendencia =
        primeiraComVenda && ultimaComVenda && primeiraComVenda !== ultimaComVenda
          ? ((ultimaComVenda.vendas - primeiraComVenda.vendas) /
              primeiraComVenda.vendas) *
            100
          : 0;

      const metricas: Metricas = {
        visitas,
        vendas,
        receita,
        conversao,
        preco,
        precoIdeal,
        desvio,
        comissao: ultima ? ultima.comissao : 0,
        subsidio,
        subsidioPct: receita ? (subsidio / receita) * 100 : 0,
        elasticidadePositiva,
        desperdicioTrafego,
        curvaAReceita: aReceita.has(anuncio.mlb),
        curvaATrafego: aTrafego.has(anuncio.mlb),
        tendencia,
        campanhasAtivas: ultima ? ultima.campanhas.length : 0,
        serieVendas: semanas.map((w) => w.vendas),
      };

      const lentes: Lente[] = ["todos"];
      const motivos: Partial<Record<Lente, string>> = {};

      if (subsidio > 0 && !elasticidadePositiva) {
        lentes.push("sangrando");
        motivos.sangrando = `Vendeu abaixo do preço ideal e o volume não reagiu — ${fmtBrl(
          subsidio
        )} de margem deixada na mesa.`;
      }

      if (visitas < mediaVisitas && conversao > mediaConversao && vendas > 0) {
        lentes.push("joias");
        motivos.joias = `Converte a ${fmtPct(conversao)}% contra a média de ${fmtPct(
          mediaConversao
        )}%, mas recebe menos tráfego que a média da carteira.`;
      }

      if (vendas > 0 && subsidio > 0 && metricas.subsidioPct >= 3) {
        lentes.push("falsa_tracao");
        motivos.falsa_tracao = `O subsídio consome ${fmtPct(
          metricas.subsidioPct
        )}% da receita do item — o volume está sendo comprado com desconto.`;
      }

      if (desperdicioTrafego) {
        lentes.push("desperdicio");
        motivos.desperdicio =
          "Recebe tráfego acima da média e converte abaixo dela. O problema está na página, não no alcance.";
      }

      if (precoIdeal > 0 && Math.abs(desvio) >= 6) {
        lentes.push("fora_do_preco");
        motivos.fora_do_preco =
          desvio > 0
            ? `Está ${fmtPct(desvio)}% acima do preço ideal — risco de perder conversão.`
            : `Está ${fmtPct(Math.abs(desvio))}% abaixo do preço ideal — margem sendo entregue.`;
      }

      return { ...anuncio, semanas, metricas, lentes, motivos };
    }
  );

  const receita = itens.reduce((s, i) => s + i.metricas.receita, 0);
  const vendas = itens.reduce((s, i) => s + i.metricas.vendas, 0);
  const visitas = itens.reduce((s, i) => s + i.metricas.visitas, 0);

  return {
    itens,
    resumo: {
      receita,
      vendas,
      visitas,
      conversao: visitas ? (vendas / visitas) * 100 : 0,
      subsidio: itens.reduce((s, i) => s + i.metricas.subsidio, 0),
      itens: itens.length,
      mediaVisitas,
      mediaConversao,
    },
  };
}

/** Definição de cada lente, para a interface explicar o critério ao usuário. */
export const LENTES: {
  id: Lente;
  rotulo: string;
  regra: string;
  acao: string;
}[] = [
  {
    id: "todos",
    rotulo: "Todos",
    regra: "Todos os anúncios do recorte selecionado.",
    acao: "Use as lentes ao lado para isolar um problema específico.",
  },
  {
    id: "sangrando",
    rotulo: "Sangrando margem",
    regra:
      "Vendeu abaixo do preço ideal sem ganho de conversão — desconto que não comprou volume.",
    acao: "Voltar ao preço ideal e observar o efeito por duas semanas.",
  },
  {
    id: "joias",
    rotulo: "Joias escondidas",
    regra:
      "Tráfego abaixo da média da carteira e conversão acima da média — vende bem para quem chega.",
    acao: "Investir em mídia e posicionamento; o funil já está afiado.",
  },
  {
    id: "falsa_tracao",
    rotulo: "Falsa tração",
    regra: "Tem volume, mas o subsídio já consome 3% ou mais da receita do item.",
    acao: "Rever a participação em campanha antes de comemorar o volume.",
  },
  {
    id: "desperdicio",
    rotulo: "Desperdício de tráfego",
    regra:
      "Visitas acima da média e conversão abaixo da média — o anúncio recebe gente e não fecha.",
    acao: "Revisar preço, título, fotos e ficha técnica antes de investir mais.",
  },
  {
    id: "fora_do_preco",
    rotulo: "Fora do preço ideal",
    regra: "Desvio de 6% ou mais entre o preço praticado e o preço ideal.",
    acao: "Corrigir o preço ou revisar a premissa de custo que gerou o ideal.",
  },
];
