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
   *
   * Vem da leitura diária de preço (`anuncio_estoque_diario.preco`), do
   * último dia medido dentro da semana: preço é estado, não fluxo, e a
   * média de sete dias esconde a troca que aconteceu na quarta.
   *
   * Null quando a semana não teve leitura — as leituras começam em
   * outubro de 2026. Nulo não é zero: zero seria "estava de graça", e foi
   * tratar um pelo outro que fez 825 anúncios aparecerem como "100%
   * abaixo do preço ideal".
   */
  precoAnunciado: number | null;

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
  /**
   * Saldo da última sincronização do canal. Null = nunca lido, que é
   * diferente de zero: zero é ruptura, e ruptura explica venda que parou.
   * Sem esta coluna a lista mostrava queda sem dizer se havia produto.
   */
  estoque: number | null;
  /** Preço publicado agora, do cadastro do anúncio. */
  precoAtual: number | null;
  semanas: SemanaDesempenho[];
};

export type Lente =
  | "todos"
  | "abaixo_tabela"
  | "acima_tabela"
  | "nao_fecha"
  | "converte_bem"
  | "sem_tabela";

export type Metricas = {
  visitas: number;
  vendas: number;
  receita: number;
  /** Conversão do período: vendas ÷ visitas. */
  conversao: number;
  /** Preço médio da última semana com venda. */
  preco: number;
  /**
   * O preço publicado na vitrine do anúncio: o que o comprador vê antes
   * de comprar. Da última semana do recorte que teve leitura.
   *
   * Null quando nenhuma semana do recorte teve leitura. As leituras
   * começam em 30/09/2026, então recorte anterior a isso vem nulo — e
   * nulo aqui é "não medimos", nunca "de graça".
   */
  precoVitrine: number | null;
  /**
   * O preço que o cliente de fato pagou: receita ÷ vendas da última
   * semana com venda. Difere do de vitrine por campanha, cupom ou frete
   * embutido. Null quando o recorte não teve venda nenhuma.
   */
  precoPraticado: number | null;
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

/**
 * Vendas mínimas para a conversão de um anúncio virar diagnóstico.
 *
 * Com uma venda só, 1 em 3 visitas vira "33% de conversão" e qualquer
 * anúncio que teve sorte entra na lista. Com duas, a taxa já descreve
 * um comportamento. O corte é por venda e não por visita porque a lente
 * exige, por definição, tráfego abaixo da média da carteira.
 */
const VENDAS_MINIMAS = 2;

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
      /*
       * O preço que vale para comparar com a tabela: o pago na última
       * semana com venda; sem venda nenhuma, o da vitrine na última
       * semana que teve leitura. Zero significa "não há preço medido", e
       * nenhuma lente de preço acende nesse caso.
       */
      const ultimaComVitrine = [...semanas]
        .reverse()
        .find((w) => w.precoAnunciado != null);
      /*
       * Vitrine e praticado são duas perguntas diferentes — "por quanto
       * está anunciado" e "por quanto saiu" — e cada uma tem a sua
       * última semana válida. Juntar as duas num campo só fazia o anúncio
       * que vendeu nunca mostrar a vitrine: não havia onde pôr.
       */
      const precoVitrine = ultimaComVitrine?.precoAnunciado ?? null;
      const precoPraticado = ultimaComVenda
        ? ultimaComVenda.receita / ultimaComVenda.vendas
        : null;
      /* `preco` segue sendo o que compara com a tabela: o pago, se houve
         venda; senão o anunciado. Zero = não há preço medido. */
      const preco = precoPraticado ?? precoVitrine ?? 0;
      const precoIdeal = ultimaComVenda
        ? ultimaComVenda.precoIdeal
        : ultima
          ? ultima.precoIdeal
          : 0;
      /*
       * Desvio só existe com os dois preços. Faltando o praticado — nem
       * venda, nem leitura de vitrine —, a conta dava (0 − tabela) ÷
       * tabela = −100%, e a tela acusava "100% abaixo do preço ideal"
       * em 825 dos 1.004 anúncios da Probel. Eles não estavam abaixo de
       * nada; ninguém tinha lido o preço deles.
       */
      const desvio = precoIdeal > 0 && preco > 0 ? ((preco - precoIdeal) / precoIdeal) * 100 : 0;

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

      const baseSuficiente = vendas >= VENDAS_MINIMAS;
      const noAr = anuncio.status === "ativo";

      const desperdicioTrafego =
        noAr && visitas > mediaVisitas && conversao < mediaConversao;

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
        precoVitrine,
        precoPraticado,
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

      /*
       * Três pontos de folga antes de chamar de desvio. A tabela é
       * arredondada e o preço pago embute frete e cupom; abaixo disso é
       * ruído de cálculo, não decisão de preço.
       */
      const FOLGA = 3;
      const temPreco = precoIdeal > 0 && preco > 0;

      if (!precoIdeal) {
        lentes.push("sem_tabela");
        motivos.sem_tabela =
          "Este anúncio não está na Fórmula base, então não dá para comparar o preço dele com nada.";
      }

      if (temPreco && desvio <= -FOLGA) {
        lentes.push("abaixo_tabela");
        /* O quanto o desconto pesa na receita era a antiga "falsa
           tração". É o tamanho do problema, não outro problema. */
        const pesado = vendas > 0 && metricas.subsidioPct >= 3;
        motivos.abaixo_tabela =
          `Vendeu a ${fmtBrl(preco)}, e a sua tabela diz ${fmtBrl(precoIdeal)} — ` +
          `${fmtPct(Math.abs(desvio))}% abaixo.` +
          (subsidio > 0 ? ` São ${fmtBrl(subsidio)} que deixaram de entrar.` : "") +
          (pesado
            ? ` O desconto já é ${fmtPct(metricas.subsidioPct)}% da receita deste anúncio.`
            : "") +
          (elasticidadePositiva
            ? " Em compensação, a venda reagiu ao preço menor."
            : subsidio > 0
              ? " E o volume não reagiu ao preço menor."
              : "");
      }

      if (temPreco && desvio >= FOLGA) {
        lentes.push("acima_tabela");
        motivos.acima_tabela =
          `Vendeu a ${fmtBrl(preco)}, e a sua tabela diz ${fmtBrl(precoIdeal)} — ` +
          `${fmtPct(desvio)}% acima. Sobra margem, mas pode estar perdendo venda para o concorrente.`;
      }

      if (desperdicioTrafego) {
        lentes.push("nao_fecha");
        motivos.nao_fecha =
          `Recebeu ${visitas.toLocaleString("pt-BR")} visitas e fechou ${vendas} — ` +
          `${fmtPct(conversao)}% contra ${fmtPct(mediaConversao)}% da média. ` +
          "Chega gente e ela não compra: o problema está no anúncio, não no alcance.";
      }

      if (
        baseSuficiente &&
        visitas < mediaVisitas &&
        conversao > mediaConversao &&
        vendas > 0
      ) {
        lentes.push("converte_bem");
        motivos.converte_bem =
          `${vendas} vendas em ${visitas.toLocaleString("pt-BR")} visitas — ` +
          `${fmtPct(conversao)}% contra ${fmtPct(mediaConversao)}% da média — mas recebe ` +
          "menos visita que a média da carteira. Quem chega compra; falta chegar gente.";
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

/**
 * O catálogo das lentes, em português do dia a dia.
 *
 * `rotulo` é o que aparece no botão; `regra` é como o número foi
 * calculado, para dar para conferir; `acao` é o que fazer com ele. Os
 * três são frases que o dono da operação diria — "falsa tração" e
 * "margem subsidiada" eram vocabulário meu, e ele não tinha como saber
 * o que significavam.
 */
export const LENTES: {
  id: Lente;
  rotulo: string;
  regra: string;
  acao: string;
}[] = [
  {
    id: "todos",
    rotulo: "Todos",
    regra: "Todos os anúncios do período escolhido.",
    acao: "Escolha um dos problemas ao lado para filtrar.",
  },
  {
    id: "abaixo_tabela",
    rotulo: "Vendendo abaixo da tabela",
    regra:
      "O preço médio pago ficou 3% ou mais abaixo do preço da sua Fórmula base.",
    acao: "Subir o preço, ou aceitar o desconto sabendo quanto ele custa.",
  },
  {
    id: "acima_tabela",
    rotulo: "Preço acima da tabela",
    regra: "O preço médio pago ficou 3% ou mais acima do preço da sua Fórmula base.",
    acao: "Conferir se o concorrente está mais barato antes de manter.",
  },
  {
    id: "nao_fecha",
    rotulo: "Muita visita, pouca venda",
    regra:
      "Anúncio no ar, com mais visitas que a média da carteira e conversão abaixo da média.",
    acao: "Olhar foto, título, ficha e preço — a gente chega e não compra.",
  },
  {
    id: "converte_bem",
    rotulo: "Vende bem, falta visita",
    regra:
      "Menos visitas que a média e conversão acima dela, com pelo menos duas vendas no período.",
    acao: "Vale mídia e posição: quem chega já compra.",
  },
  {
    id: "sem_tabela",
    rotulo: "Sem preço de tabela",
    regra: "O anúncio não está na Fórmula base, então não há com o que comparar.",
    acao: "Cadastrar o SKU na Fórmula base para ele entrar na análise.",
  },
];
