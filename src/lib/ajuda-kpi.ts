/**
 * O que cada indicador é, em uma frase. Uma fonte só: a Visão geral calcula
 * os indicadores no servidor (painel.ts) e de novo no navegador, ao trocar o
 * período (periodo.ts) — a definição não pode divergir entre os dois.
 */
export const AJUDA_KPI: Record<string, string> = {
  faturamento:
    "Soma de todos os pedidos do período, incluindo os que depois foram cancelados (o cancelado aparece no cartão Valor cancelado).",
  pedidos: "Quantidade de pedidos, cancelados incluídos.",
  ticket: "Valor médio por pedido, sem os cancelados: (faturamento − cancelado) ÷ (pedidos − cancelados).",
  conversao:
    "Pedidos ÷ visitas, só nos canais que informam visita (hoje, o Mercado Livre). Loja própria e marketplaces sem visita ficam fora da conta.",
  ads: "Quanto foi investido em anúncios pagos (Product Ads do Mercado Livre e lançamentos manuais de mídia).",
  cancelado: "Valor dos pedidos do período que foram cancelados. Já está dentro do Faturamento.",
};
