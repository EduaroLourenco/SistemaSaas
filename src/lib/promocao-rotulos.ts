/**
 * Como cada tipo de promoção do canal se chama na tela, e de que cor.
 *
 * O canal manda `SMART_LIGHTNING`, `UNHEALTHY_STOCK`, `PRE_NEGOTIATED`.
 * Nenhum desses nomes diz nada para quem decide preço, e dois deles
 * mentem por tradução literal: "estoque ruim" é a campanha de liquidar
 * Full, e "pré-negociado" é o pré-acordo da tabela.
 *
 * Mora aqui, e não na tela de Automações onde nasceu, porque o raio-x do
 * anúncio mostra os mesmos tipos — e dois mapas divergindo é a mesma
 * campanha com dois nomes em duas telas.
 *
 * Tipo que o canal inventar aparece com o código cru, de propósito: é
 * sinal de que entrou tipo novo, e inventar nome bonito esconderia isso.
 */
export const ROTULO_PROMOCAO: Record<string, string> = {
  DEAL: "Tradicional",
  SMART: "Automática",
  SMART_LIGHTNING: "Relâmpago auto",
  LIGHTNING: "Relâmpago",
  DOD: "Oferta do dia",
  PRE_NEGOTIATED: "Pré-acordo",
  UNHEALTHY_STOCK: "Liquidar Full",
  SELLER_CAMPAIGN: "Nossa campanha",
  SELLER_COUPON_CAMPAIGN: "Cupom",
  MARKETPLACE_CAMPAIGN: "Cofinanciada",
  PRICE_MATCHING: "Preço competitivo",
  PRICE_MATCHING_MELI_ALL: "100% Meli",
  PRICE_DISCOUNT: "Desconto avulso",
  VOLUME: "Leve mais",
  /* Desconto por meio de pagamento — o "Desconto no Pix". O canal manda
     o meio em `payment_method`, então o rótulo fica genérico. */
  BANK: "Meio de pagamento",
};

export const TOM_PROMOCAO: Record<string, "neutral" | "info" | "up" | "down" | "warn"> = {
  DEAL: "info",
  SELLER_CAMPAIGN: "info",
  SMART: "neutral",
  MARKETPLACE_CAMPAIGN: "neutral",
  BANK: "neutral",
  LIGHTNING: "down",
  SMART_LIGHTNING: "down",
  DOD: "down",
  PRE_NEGOTIATED: "up",
  UNHEALTHY_STOCK: "up",
  SELLER_COUPON_CAMPAIGN: "warn",
};

export const rotuloPromocao = (tipo: string) => ROTULO_PROMOCAO[tipo] ?? tipo;
export const tomPromocao = (tipo: string) => TOM_PROMOCAO[tipo] ?? "neutral";
