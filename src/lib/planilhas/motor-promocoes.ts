/* eslint-disable */

// Util functions for math
export function roundup(x: number, d: number = 0): number {
  const m = Math.pow(10, d);
  const v = x * m;
  if (v > 0) {
    return Math.ceil(v - 1e-9) / m;
  } else {
    return -Math.ceil(-v - 1e-9) / m;
  }
}

export function norm(s: any): string {
  if (s == null) return "";
  return String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Interfaces
export interface BaseMLBEntry {
  tipo: string;
  padrao: number;
}

export interface FormulaBaseData {
  baseMlb: Map<string, BaseMLBEntry>;
  precosSKU: Map<string, Record<number, number>>;
  precosMLB: Map<string, Record<number, number>>;
  /** Custos por SKU (chave em maiúsculas), para a regra de margem. */
  custos?: Map<string, CustoSku>;
  /** De onde sai o preço mínimo. Ausente = só a tabela, como sempre foi. */
  regra?: RegraPreco;
}

/** O que compõe o custo de uma unidade, fora a comissão (que é a variável). */
export interface CustoSku {
  mercadoria: number;
  embalagem: number;
  frete: number;
  /** Em pontos percentuais. */
  impostoPct: number;
}

/**
 * De onde sai o preço mínimo de uma promoção.
 *
 *   tabela — a Fórmula base, como sempre foi.
 *   margem — calculado dos custos: o preço que ainda deixa `margemMinima`%.
 *   maior  — o maior dos dois. Só participa o que passa nas duas réguas:
 *            é o modo em que nenhuma promoção aceita dá prejuízo.
 */
export interface RegraPreco {
  modo: "tabela" | "margem" | "maior";
  /** Em pontos percentuais, ex.: 8 para 8%. */
  margemMinima: number;
}

/**
 * O que muda de canal para canal.
 *
 * A matriz de preço por faixa de comissão NÃO muda: mercadoria, embalagem
 * e imposto são os mesmos vendendo no Meli ou na Shopee. O que muda é em
 * que faixa o canal cai e o que ele aceita como oferta — e é só isso que
 * este objeto carrega.
 *
 * Os valores padrão são os do Mercado Livre, que era o que estava escrito
 * no código antes desta configuração existir. Quem chamar sem config
 * continua tendo o comportamento de sempre.
 */
export interface ConfigCanal {
  /** Desconto mínimo que o canal aceita. Meli: 0,05. */
  descontoMinimo: number;
  /** Menor faixa de comissão negociável. Meli: 0,045. */
  comissaoMinima: number;
  /** O canal cobra diferente por tipo de anúncio? Meli: sim. */
  usaTipoAnuncio: boolean;
  /**
   * Alíquota cheia do canal, por tipo.
   *
   * A chave `geral` é a alíquota única, usada por quem não separa tipo.
   * No Meli, `classico` e `premium` — cinco pontos que mudam o preço que
   * fecha a margem.
   */
  comissaoPorTipo: Record<string, number>;
}

export const CONFIG_PADRAO: ConfigCanal = {
  descontoMinimo: 0.05,
  comissaoMinima: 0.045,
  usaTipoAnuncio: true,
  comissaoPorTipo: { classico: 0.115, premium: 0.165, geral: 0.115 },
};

/**
 * Piso da tabela: o menor preço que ainda preserva a margem.
 *
 * O canal recusa desconto abaixo do mínimo dele, então a tabela sozinha
 * nunca é ofertável — o piso é o ponto de partida real de qualquer
 * promoção. Num canal que aceita desconto zero, o piso é a própria
 * tabela.
 */
export const PISO = 0.95;

/** Preço de tabela no piso do canal. */
export function precoPiso(tabela: number, descontoMinimo = 1 - PISO): number {
  return Math.round(tabela * (1 - descontoMinimo) * 100) / 100;
}

/**
 * Preço com desconto extra, aplicado SOBRE O PISO.
 *
 * O desconto extra não parte da tabela cheia: parte do menor preço que a
 * margem aguenta. Aplicar sobre a tabela deixaria o resultado 5% acima do
 * pretendido — num item de mil reais, R$ 45 a mais em cada anúncio de uma
 * campanha inteira.
 */
export function precoComExtra(
  tabela: number,
  extra: number,
  descontoMinimo = 1 - PISO
): number {
  return Math.round(precoPiso(tabela, descontoMinimo) * (1 - extra) * 100) / 100;
}

/**
 * Preço final como o Mercado Livre o calcula a partir da porcentagem.
 *
 * Ele TRUNCA o centavo, não arredonda: 2.773,90 com 41% de desconto vira
 * 1.137,29 na planilha, e não 1.137,30. Arredondar aqui deixaria o preço um
 * centavo ABAIXO da tabela em metade dos casos — o suficiente para a linha
 * voltar recusada, ou pior, entrar no ar fora da margem.
 */
export function precoDaPorcentagem(original: number, pct: number): number {
  return Math.floor(original * (1 - pct / 100) * 100 + 1e-6) / 100;
}

/**
 * A porcentagem mais agressiva que ainda respeita o preço mínimo.
 *
 * Só nas campanhas que NÓS criamos. Ali a porcentagem é nossa de escolher,
 * e o preço final é consequência dela — ao contrário das campanhas do
 * canal, onde o preço vem proposto e só se aceita ou recusa.
 *
 * "Mais agressiva" porque o objetivo declarado é o menor preço que a tabela
 * aguenta: ganhar exposição sem furar a margem. O passo é de um ponto
 * inteiro porque o canal não aceita decimal na porcentagem, então o preço
 * alcançável é quantizado — nem sempre dá para encostar no alvo exato.
 *
 * Devolve `null` quando nem o desconto mínimo do canal cabe: aí o anúncio
 * já está sendo vendido perto do mínimo, e participar exigiria vender
 * abaixo dele.
 */
export function melhorPorcentagem(
  original: number,
  alvo: number,
  descontoMinimo = 1 - PISO
): { pct: number; preco: number } | null {
  if (!(original > 0) || !(alvo > 0)) return null;

  /*
   * O épsilon não é supérstição: `1 - PISO` dá 0,050000000000000044, e um
   * `Math.ceil` cru sobre isso devolve 6 em vez de 5. O desconto mínimo do
   * canal viraria 6%, e todo item que só cabe com exatamente 5% seria
   * recusado sem motivo.
   */
  const minimo = Math.max(1, Math.ceil(descontoMinimo * 100 - 1e-9));

  /*
   * O teto vem da desigualdade `original × (1 − n/100) ≥ alvo`. O épsilon
   * cobre o lixo de ponto flutuante: sem ele, um alvo que cai exatamente
   * num ponto inteiro perde esse ponto por um resto de 1e-13.
   */
  let n = Math.floor(100 * (1 - alvo / original) + 1e-9);
  if (n > 100) n = 100;

  /*
   * A truncagem do centavo pode empurrar o preço um centavo abaixo do alvo
   * justamente no ponto limite. Recua um ponto quando isso acontece — é
   * mais barato ceder um ponto de desconto que furar a margem.
   */
  while (n >= minimo && precoDaPorcentagem(original, n) < alvo) n--;

  if (n < minimo) return null;
  return { pct: n, preco: precoDaPorcentagem(original, n) };
}

/**
 * O que o motor decide sobre um item.
 *
 * Declarado em vez de inferido: cada caso devolve um subconjunto diferente
 * de campos, e a união inferida escondia `newPercentage` de quem chamava —
 * o compilador recusava ler o campo que o Caso C acabara de preencher.
 */
export interface ResultadoItem {
  action: string;
  /** Vazio quando deu certo; o motivo da recusa quando não. */
  pendencia: string;
  /** Preço a escrever, ou `null` quando este caso não mexe no preço. */
  newPrice: number | null;
  /** Porcentagem a escrever. Só o Caso C a usa. */
  newPercentage?: number | null;
  tabelaCalculada?: number;
}

export function getPrecoTabela(data: FormulaBaseData, sku: string, mlb: string, comissao: number): number | null {
  const tabela = precoDaFormula(data, sku, mlb, comissao);
  const modo = data.regra?.modo ?? "tabela";
  if (modo === "tabela") return tabela;
  const margem = precoDaMargem(data, sku, comissao);
  if (modo === "margem") return margem;
  // "maior": sem custo cadastrado, a tabela sozinha decide.
  if (margem == null) return tabela;
  if (tabela == null) return margem;
  return Math.max(tabela, margem);
}

/**
 * O "preço de tabela" que a margem pede.
 *
 * A convenção do motor é que a tabela × PISO (95% no Meli) é o menor preço
 * que preserva a margem — é por isso que ele aceita oferta até 5% abaixo
 * da tabela. Para a regra de margem caber na mesma convenção, a "tabela"
 * dela é o preço da margem mínima dividido pelo piso: os 5% de tolerância
 * caem exatamente em cima da margem pedida, nunca abaixo.
 */
export function precoDaMargem(data: FormulaBaseData, sku: string, comissao: number): number | null {
  const c = data.custos?.get(sku.trim().toUpperCase());
  if (!c || !data.regra) return null;
  const restante = 100 - comissao * 100 - c.impostoPct - data.regra.margemMinima;
  if (restante <= 0) return null;
  const precoMargem = ((c.mercadoria + c.embalagem + c.frete) * 100) / restante;
  return Math.round((precoMargem / PISO) * 100) / 100;
}

/** Por que não há preço mínimo — muda conforme a regra. */
function semPreco(data: FormulaBaseData): string {
  return data.regra?.modo === "margem" ? "sem custo cadastrado (Financeiro › Custos)" : "sem preço de tabela";
}

function precoDaFormula(data: FormulaBaseData, sku: string, mlb: string, comissao: number): number | null {
  const k = Math.round(comissao * 1000) / 1000;
  
  if (data.precosSKU.has(sku)) {
    const row = data.precosSKU.get(sku)!;
    if (row[k] !== undefined) return row[k];
  }
  
  if (data.precosMLB.has(mlb)) {
    const row = data.precosMLB.get(mlb)!;
    if (row[k] !== undefined) return row[k];
  }
  
  return null;
}

export function processItem(
  mlb: string,
  sku: string,
  saleFee: number | null,
  finalPrice: number | null,
  originalPrice: number | null,
  data: FormulaBaseData,
  positiveAction: string = "Participar",
  negativeAction: string = "Não participar",
  extraDiscount: number = 0,
  config: ConfigCanal = CONFIG_PADRAO,
  /**
   * A campanha foi criada por NÓS, não proposta pelo canal.
   *
   * Muda o que é ajustável. Nas campanhas do canal o preço vem proposto e a
   * decisão é binária; na nossa, a porcentagem é nossa, e o preço final é
   * consequência dela. Por isso aqui o sistema pode mexer PARA CIMA
   * também — subir o desconto quando a tabela ainda aguenta é o que
   * transforma um "não participar" por preço ruim em participação no melhor
   * preço possível.
   */
  campanhaPropria: boolean = false
): ResultadoItem {
  // Caso C: campanha nossa — a porcentagem é a alavanca
  if (campanhaPropria) {
    return itemCampanhaPropria(
      mlb, sku, originalPrice, data, positiveAction, negativeAction, extraDiscount, config
    );
  }

  // Caso A: Com Redução de Tarifa
  if (saleFee !== null && saleFee > 0) {
    if (!finalPrice) return { action: negativeAction, pendencia: "redução ou preço final ausente", newPrice: null };
    
    /*
     * A alíquota CHEIA do anúncio, da qual a redução é descontada.
     *
     * Vem do cadastro por anúncio quando existe — no Meli é a aba Base
     * MLB. Num canal sem cadastro por anúncio, cai na alíquota do próprio
     * canal, que é o caso da maioria: uma taxa só para tudo. Era isso que
     * antes obrigava todo canal a ter uma "Base MLB".
     */
    const entry = data.baseMlb.get(mlb);
    const cheia =
      entry?.padrao ||
      config.comissaoPorTipo[norm(entry?.tipo ?? "")] ||
      config.comissaoPorTipo.geral;

    if (!cheia) {
      return {
        action: negativeAction,
        pendencia: "sem alíquota cheia para este anúncio nem para o canal",
        newPrice: null,
      };
    }

    const reduzida = saleFee / finalPrice;
    const considerar = Math.max(
      Math.round(((roundup((cheia - reduzida) * 100) + 0.5) / 100) * 10000) / 10000,
      config.comissaoMinima
    );

    const tabela = getPrecoTabela(data, sku, mlb, considerar);
    if (tabela === null) return { action: negativeAction, pendencia: `${semPreco(data)} para a comissão ${(considerar*100).toFixed(1)}%`, newPrice: null };

    // Tolerância do canal: aceita a oferta que chega até o desconto mínimo
    // abaixo da tabela. No Meli são os 5% de sempre.
    const aprovado =
      tabela - finalPrice < 0 ||
      finalPrice >= tabela * (1 - config.descontoMinimo);
    return { 
      action: aprovado ? positiveAction : negativeAction, 
      pendencia: "", 
      newPrice: null, // Caso A não altera preço
      tabelaCalculada: tabela
    };
  } 
  // Caso B: Sem Redução de Tarifa
  else {
    const entry = data.baseMlb.get(mlb);

    /*
     * A alíquota que vale sem redução.
     *
     * Onde o canal separa por tipo — o Meli — depende de clássico ou
     * premium, e sem saber qual é não há como escolher entre 11,5% e
     * 16,5%: cinco pontos mudam a faixa de preço inteira. Num canal de
     * taxa única o tipo não importa, e exigir esse cadastro recusaria a
     * planilha inteira por uma informação que não existe lá.
     *
     * O tipo vem da Fórmula base e, quando ela não traz o anúncio, do
     * catálogo lido da API (ver carregarFormulaBase). Chegar aqui sem ele
     * significa que o MLB não existe em nenhum dos dois — anúncio novo,
     * de outra conta, ou catálogo desatualizado.
     */
    let comissao: number;
    if (config.usaTipoAnuncio) {
      if (!entry || !entry.tipo) {
        return {
          action: negativeAction,
          pendencia: "anúncio não encontrado no catálogo nem na Fórmula base — sincronize o canal",
          newPrice: null,
        };
      }
      const chave = norm(entry.tipo).startsWith("cl") ? "classico" : "premium";
      comissao = config.comissaoPorTipo[chave] ?? config.comissaoPorTipo.geral;
    } else {
      comissao = entry?.padrao || config.comissaoPorTipo.geral;
    }

    if (!comissao) {
      return {
        action: negativeAction,
        pendencia: "canal sem alíquota cadastrada",
        newPrice: null,
      };
    }

    let p = getPrecoTabela(data, sku, mlb, comissao);
    
    if (p === null) return { action: negativeAction, pendencia: semPreco(data), newPrice: null };
    
    /*
     * Sem desconto extra, a oferta é a tabela cheia — comportamento que já
     * vinha do sistema anterior e não foi pedido para mudar.
     *
     * COM desconto extra, ele parte do PISO, não da tabela. Partir da
     * tabela deixaria o resultado 5% acima do pretendido: num item de mil
     * reais, R$ 45 a mais em cada anúncio de uma campanha inteira.
     */
    const newPrice =
      extraDiscount > 0
        ? precoComExtra(p, extraDiscount, config.descontoMinimo)
        : Math.round((p + 1e-9) * 100) / 100;

    // Preço de tabela ACIMA do preço já publicado: participar exigiria
    // AUMENTAR o preço, e promoção é desconto. O canal recusa qualquer
    // desconto abaixo de 5%, então mandar "participar" só gera erro no
    // retorno. Recusa aqui e não toca no preço — o item vai para a lista
    // de revisão com a tag correspondente.
    if (originalPrice && newPrice > originalPrice) {
      return {
        action: negativeAction,
        pendencia: "Preço de tabela acima do preço publicado — sem espaço para desconto",
        newPrice: null,
        tabelaCalculada: p,
      };
    }

    return {
      action: positiveAction,
      pendencia: "",
      newPrice,
      tabelaCalculada: p
    };
  }
}

/**
 * Caso C — a campanha é nossa, e a porcentagem é o que se ajusta.
 *
 * Nas campanhas do canal (A e B) a comissão pode vir reduzida como
 * contrapartida, e é isso que o motor precisa descobrir antes de achar a
 * faixa de preço. Aqui não há contrapartida nenhuma: quem criou a promoção
 * fomos nós, então a comissão é a CHEIA do tipo do anúncio — 11,5% no
 * clássico, 16,5% no premium.
 *
 * A diferença de comportamento que importa: o sistema mexe nos DOIS
 * sentidos. Se o desconto que está na planilha deixa o preço abaixo da
 * tabela, ele diminui; se sobra margem, ele aumenta. Antes, um preço abaixo
 * da tabela virava "Não participar" e o anúncio ficava fora da campanha —
 * quando bastava ajustar a porcentagem para caber.
 */
function itemCampanhaPropria(
  mlb: string,
  sku: string,
  originalPrice: number | null,
  data: FormulaBaseData,
  positiveAction: string,
  negativeAction: string,
  extraDiscount: number,
  config: ConfigCanal
): ResultadoItem {
  if (!originalPrice || originalPrice <= 0) {
    return { action: negativeAction, pendencia: "sem preço original", newPrice: null, newPercentage: null };
  }

  const entry = data.baseMlb.get(mlb);

  /*
   * A alíquota cheia do anúncio. Onde o canal separa por tipo — o Meli —
   * sem o cadastro não há como saber se são 11,5% ou 16,5%, e cinco pontos
   * mudam a faixa de preço inteira. Recusar é mais honesto que adivinhar.
   *
   * O tipo vem da Fórmula base ou do catálogo da API; faltar nos dois é
   * MLB desconhecido, não falta de cadastro manual.
   */
  let comissao: number;
  if (config.usaTipoAnuncio) {
    if (!entry || !entry.tipo) {
      return {
        action: negativeAction,
        pendencia: "anúncio não encontrado no catálogo nem na Fórmula base — sincronize o canal",
        newPrice: null,
        newPercentage: null,
      };
    }
    const chave = norm(entry.tipo).startsWith("cl") ? "classico" : "premium";
    comissao = config.comissaoPorTipo[chave] ?? config.comissaoPorTipo.geral;
  } else {
    comissao = entry?.padrao || config.comissaoPorTipo.geral;
  }

  if (!comissao) {
    return { action: negativeAction, pendencia: "canal sem alíquota cadastrada", newPrice: null, newPercentage: null };
  }

  const tabela = getPrecoTabela(data, sku, mlb, comissao);
  if (tabela === null) {
    return { action: negativeAction, pendencia: semPreco(data), newPrice: null, newPercentage: null };
  }

  /*
   * O alvo é a tabela cheia. O desconto extra, quando alguém o informa, é
   * uma decisão consciente de ir abaixo dela — e parte do PISO, igual ao
   * Caso B, para não ficar 5% acima do pretendido.
   */
  const alvo =
    extraDiscount > 0
      ? precoComExtra(tabela, extraDiscount, config.descontoMinimo)
      : Math.round((tabela + 1e-9) * 100) / 100;

  const melhor = melhorPorcentagem(originalPrice, alvo, config.descontoMinimo);

  if (!melhor) {
    return {
      action: negativeAction,
      pendencia:
        `preço mínimo R$ ${alvo.toFixed(2)} exige desconto abaixo de ` +
        `${Math.ceil(config.descontoMinimo * 100)}% — o canal não aceita`,
      newPrice: null,
      newPercentage: null,
      tabelaCalculada: tabela,
    };
  }

  return {
    action: positiveAction,
    pendencia: "",
    newPrice: melhor.preco,
    newPercentage: melhor.pct,
    tabelaCalculada: tabela,
  };
}
