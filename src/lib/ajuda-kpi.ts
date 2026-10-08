/**
 * O que cada indicador é, em uma frase. Uma fonte só: a Visão geral calcula
 * os indicadores no servidor (painel.ts) e de novo no navegador, ao trocar o
 * período (periodo.ts) — a definição não pode divergir entre os dois.
 */
export const AJUDA_KPI: Record<string, string> = {
  faturamento:
    "Soma do valor dos pedidos do período: produtos + frete cobrado do comprador, incluindo os que depois foram cancelados (o cancelado aparece no cartão Valor cancelado). As telas por produto (SKU, Por que caiu) somam só os produtos, por isso dão menos.",
  pedidos: "Quantidade de pedidos, cancelados incluídos.",
  ticket: "Valor médio por pedido, sem os cancelados: (faturamento − cancelado) ÷ (pedidos − cancelados).",
  conversao:
    "Pedidos ÷ visitas, só nos canais que informam visita (hoje, o Mercado Livre). Loja própria e marketplaces sem visita ficam fora da conta.",
  ads: "Quanto foi investido em anúncios pagos (Product Ads do Mercado Livre e lançamentos manuais de mídia).",
  cancelado: "Valor dos pedidos do período que foram cancelados. Já está dentro do Faturamento.",
};
