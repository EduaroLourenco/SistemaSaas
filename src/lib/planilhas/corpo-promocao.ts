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
};

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
