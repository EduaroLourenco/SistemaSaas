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
  /* O painel do canal chama esta de "Recomendada pelo seu consultor" — é
     por ela que passa o rebate negociado, e por isso a folga dela é
     outra. O nome diz de quem veio, senão ninguém liga uma coisa à
     outra ao abrir a tela. */
  PRE_NEGOTIATED: "Pré-acordo do consultor",
  UNHEALTHY_STOCK: "Liquidar Full",
  SELLER_CAMPAIGN: "Nossa campanha",
  SELLER_COUPON_CAMPAIGN: "Cupom",
  MARKETPLACE_CAMPAIGN: "Cofinanciada",
  /* No painel do canal esta aparece como "Com redução de tarifas", que é
     o benefício; "preço competitivo" era o mecanismo. */
  PRICE_MATCHING: "Redução de tarifa",
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

/**
 * Como a promoção se chama na tela.
 *
 * O canal manda `name` na maioria dos tipos — "11.11 da Black", "Black
 * Friday 2026" —, e é esse nome que o vendedor lê no painel dele. Mas
 * LIGHTNING e PRICE_DISCOUNT vêm SEM nome: a relâmpago é a fila do
 * próprio canal, não uma campanha batizada. "Sem nome" não ajuda
 * ninguém a reconhecer a oferta relâmpago — e repetir o rótulo do tipo
 * só duplica o selo que já está ao lado. Entra a palavra do painel do
 * canal, que é onde o vendedor leu a mesma oferta.
 */
const SEM_NOME: Record<string, string> = {
  LIGHTNING: "Oferta relâmpago do canal",
  PRICE_DISCOUNT: "Desconto avulso neste anúncio",
};

export const nomePromocao = (tipo: string, nome: string | null | undefined) =>
  nome?.trim() ? nome : SEM_NOME[tipo] ?? rotuloPromocao(tipo);
