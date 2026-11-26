/**
 * Como o Mercado Livre quer receber um aceite de promoção.
 *
 * Separado do módulo que CHAMA o canal porque isto aqui é regra pura —
 * monta o corpo e diz não quando falta campo — e regra pura tem teste.
 * O que fala com a rede fica em .
 *
 * O corpo muda conforme QUEM define o preço, e errar isso não dá erro
 * aqui: dá uma linha recusada lá, depois de gastar a chamada.
 */

/** O que o canal aceita receber, por tipo de campanha. */
export type FamiliaPromocao = "nosso_preco" | "aceite" | "aceite_com_estoque";

const FAMILIA: Record<string, FamiliaPromocao> = {
  DEAL: "nosso_preco",
  SELLER_CAMPAIGN: "nosso_preco",
  PRICE_DISCOUNT: "nosso_preco",
  MARKETPLACE_CAMPAIGN: "aceite",
  SMART: "aceite",
  PRICE_MATCHING: "aceite",
  PRE_NEGOTIATED: "aceite",
  UNHEALTHY_STOCK: "aceite",
  SELLER_COUPON_CAMPAIGN: "aceite",
  SMART_LIGHTNING: "aceite_com_estoque",
  LIGHTNING: "aceite_com_estoque",
  DOD: "aceite_com_estoque",
};

export const familiaDe = (tipo: string): FamiliaPromocao | null => FAMILIA[tipo.toUpperCase()] ?? null;

export type PedidoDeAceite = {
  mlb: string;
  promocao: string;
  tipo: string;
  /** Só na família `nosso_preco`. */
  preco?: number | null;
  precoTopo?: number | null;
  /** O `offer_id`/`ref_id` do candidato. Obrigatório fora de MARKETPLACE_CAMPAIGN. */
  oferta?: string | null;
  /** Só em relâmpago e oferta do dia. */
  estoque?: number | null;
  /** O que o canal propôs, para a trava do teto. */
  tetoDoCanal?: number | null;
  /**
   * Mudar o preço de um item que JÁ está na campanha (PUT), em vez de
   * entrar nela (POST). Só em DEAL e SELLER_CAMPAIGN.
   */
  alterar?: boolean;
  /** O preço atual dentro da campanha — com ela começada, o novo tem de ser menor. */
  precoAtual?: number | null;
};

/** Onde dá para trocar o preço de quem já está dentro. */
const ALTERAVEL = new Set(["DEAL", "SELLER_CAMPAIGN"]);

/**
 * O corpo do PUT que muda o preço de um item já dentro da campanha.
 *
 * Pela documentação do Meli (Seller campaigns › Modify items), com a
 * campanha começada "prices can only improve": o canal recusa preço
 * maior com "New deal_price must be lower than current deal_price". A
 * recusa acontece aqui, de graça, antes de gastar a chamada.
 */
export function corpoDaAlteracao(p: PedidoDeAceite): { corpo: Record<string, unknown> } | { erro: string } {
  const tipo = p.tipo.toUpperCase();
  if (!ALTERAVEL.has(tipo)) return { erro: `não dá para mudar o preço dentro de uma campanha ${p.tipo}` };
  if (p.preco == null || !(p.preco > 0)) return { erro: "faltou o preço novo" };
  if (p.precoAtual != null && p.preco >= p.precoAtual - 0.005) {
    return {
      erro: `o preço atual é ${p.precoAtual.toFixed(2)} e o novo é ${p.preco.toFixed(2)} — ` +
        "com a campanha começada o preço só pode descer",
    };
  }
  return {
    corpo: {
      promotion_id: p.promocao,
      promotion_type: tipo,
      deal_price: Math.round(p.preco * 100) / 100,
    },
  };
}

/**
 * Monta o corpo do POST. Devolve o motivo em vez do corpo quando o
 * pedido não tem o que o canal exige — assim a recusa acontece aqui, de
 * graça, em vez de gastar uma chamada para ouvir não.
 */
export function corpoDoAceite(p: PedidoDeAceite): { corpo: Record<string, unknown> } | { erro: string } {
  const familia = familiaDe(p.tipo);
  if (!familia) return { erro: `não sei montar o aceite de uma campanha ${p.tipo}` };

  const base: Record<string, unknown> = { promotion_type: p.tipo.toUpperCase() };
  /* PRICE_DISCOUNT é desconto avulso: não pertence a campanha nenhuma e
     o canal recusa um `promotion_id` junto. */
  if (p.tipo.toUpperCase() !== "PRICE_DISCOUNT") base.promotion_id = p.promocao;

  if (familia === "nosso_preco") {
    if (p.preco == null || !(p.preco > 0)) return { erro: "campanha de preço nosso, e não veio preço" };
    if (p.tetoDoCanal != null && p.preco > p.tetoDoCanal + 0.01) {
      return {
        erro: `o canal propôs ${p.tetoDoCanal.toFixed(2)} e o nosso preço é ${p.preco.toFixed(2)} — ` +
          "nesta campanha o preço não pode subir",
      };
    }
    base.deal_price = Math.round(p.preco * 100) / 100;
    if (p.precoTopo != null && p.precoTopo > 0) base.top_deal_price = Math.round(p.precoTopo * 100) / 100;
    return { corpo: base };
  }

  if (familia === "aceite_com_estoque") {
    if (!p.oferta) return { erro: "relâmpago exige o offer_id do candidato" };
    if (p.estoque == null || !(p.estoque > 0)) return { erro: "relâmpago exige a quantidade de unidades" };
    /* Na LIGHTNING o preço é nosso: sem `deal_price` o canal entende zero. */
    if (p.tipo.toUpperCase() === "LIGHTNING") {
      if (p.preco == null || !(p.preco > 0)) return { erro: "oferta relâmpago exige o preço" };
      if (p.tetoDoCanal != null && p.preco > p.tetoDoCanal + 0.01) {
        return { erro: `o canal sugeriu ${p.tetoDoCanal.toFixed(2)} e o nosso preço é ${p.preco.toFixed(2)}` };
      }
      base.deal_price = Math.round(p.preco * 100) / 100;
    }
    base.offer_id = p.oferta;
    base.stock = Math.trunc(p.estoque);
    return { corpo: base };
  }

  /* `aceite`: a cofinanciada é a única que entra só com a promoção. */
  if (p.tipo.toUpperCase() !== "MARKETPLACE_CAMPAIGN") {
    if (!p.oferta) return { erro: `${p.tipo} exige o offer_id do candidato` };
    base.offer_id = p.oferta;
  }
  return { corpo: base };
}
