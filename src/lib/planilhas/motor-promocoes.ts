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

export function getPrecoTabela(data: FormulaBaseData, sku: string, mlb: string, comissao: number): number | null {
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
  config: ConfigCanal = CONFIG_PADRAO
) {
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
    if (tabela === null) return { action: negativeAction, pendencia: `sem preço de tabela para a comissão ${(considerar*100).toFixed(1)}%`, newPrice: null };

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
     * premium, e sem o cadastro do anúncio não há como saber qual é. Num
     * canal de taxa única o tipo não importa, e exigir esse cadastro
     * recusaria a planilha inteira por uma informação que não existe lá.
     */
    let comissao: number;
    if (config.usaTipoAnuncio) {
      if (!entry || !entry.tipo) {
        return {
          action: negativeAction,
          pendencia: "anúncio sem tipo cadastrado, e este canal cobra por tipo",
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
    
    if (p === null) return { action: negativeAction, pendencia: "sem preço de tabela", newPrice: null };
    
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
