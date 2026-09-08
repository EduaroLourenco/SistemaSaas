/**
 * Ticket médio, num lugar só.
 *
 * Fica fora de `lib/dados` pelo mesmo motivo que `periodo.ts`: não tem
 * `server-only`, porque quem chama são as telas tanto quanto os loaders.
 *
 * ── O par tem que ser coerente ──
 *
 * O ticket é uma razão entre duas grandezas que precisam falar do mesmo
 * conjunto de pedidos. Dá para errar de dois jeitos, e a tela Diário
 * errava dos dois ao mesmo tempo:
 *
 *   bruta ÷ todos    → responde "quanto valeu o pedido médio, contando
 *                      os que voltaram". É coerente, mas não é o que o
 *                      ERP mostra nem o que o glossário define.
 *   líquida ÷ todos  → mistura um numerador que já descontou o
 *                      cancelamento com um denominador que ainda o
 *                      conta. Não responde pergunta nenhuma.
 *   líquida ÷ válidos→ o que entrou, dividido por quem de fato comprou.
 *
 * No recorte de 01/09 a 07/09 de 2026 a diferença era esta: a tela
 * mostrava R$ 1.380,24 (317.455,35 ÷ 230) onde o ERP mostrava
 * R$ 1.716,04 (293.443,41 ÷ 171). Os 59 pedidos de diferença eram os
 * cancelados, que já saíam da receita e continuavam no divisor.
 */

/** Pedidos que sobraram depois do cancelamento. Nunca negativo. */
export function pedidosValidos(pedidos: number, pedidosCancelados: number): number {
  return Math.max(0, pedidos - pedidosCancelados);
}

/**
 * Receita paga ÷ pedidos não cancelados.
 *
 * Devolve `null` — e não zero — quando não sobrou pedido válido: sem
 * comprador não existe ticket, e zero seria lido como "o ticket caiu para
 * zero" num gráfico ou numa variação percentual.
 */
export function ticketMedio(
  receitaBruta: number,
  valorCancelado: number,
  pedidos: number,
  pedidosCancelados: number
): number | null {
  const validos = pedidosValidos(pedidos, pedidosCancelados);
  if (validos === 0) return null;
  return (receitaBruta - valorCancelado) / validos;
}
