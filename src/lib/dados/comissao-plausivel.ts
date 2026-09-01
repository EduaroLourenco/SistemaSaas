/**
 * A faixa que separa comissão reconstruída de lixo.
 *
 * Onde o canal não informa a comissão, ela é reconstruída na importação
 * por `total − frete do vendedor − juros − valor a receber`. A conta
 * funciona, mas não em todo pedido: em parte deles o "valor a receber"
 * ainda não teve a tarifa descontada, e aí o resultado não é tarifa
 * nenhuma.
 *
 * Medido contra os 1.169 pedidos que trazem a comissão informada, por
 * faixa de percentual sobre o total:
 *
 *   ≤ 0%          2.017 pedidos    0/5 exatos
 *   1–5%            206           97% exatos
 *   5–10%           777           99% exatos
 *   10–15%          364           93% exatos
 *   15–20%          107           53% exatos
 *   acima de 20%     69            0% exatos
 *
 * Dentro de 1–15% o acerto é ~97%. Acima de 20% a conta capturou o
 * frete: foi assim que um frete de R$ 597 apareceu como "tarifa de 21%"
 * num anúncio cuja tabela é 11,5%.
 *
 * A regra vive aqui, e não copiada em cada tela, porque ela é uma só. Já
 * esteve escrita em três arquivos, e três cópias de um limite numérico
 * divergem no primeiro ajuste — com o agravante de que a divergência
 * aparece como telas discordando entre si, não como erro.
 */

export const FAIXA_MIN = 1;
export const FAIXA_MAX = 15;

/**
 * Aceita a comissão do pedido como utilizável?
 *
 * Zero é recusado junto com ausência: houve importação que gravou "não
 * informado" como 0,00 em 1.373 pedidos, e tratá-lo como valor real
 * diluía a tarifa da semana para baixo.
 */
export function comissaoUtilizavel(
  comissao: string | number | null | undefined,
  total: string | number | null | undefined
): boolean {
  if (comissao == null) return false;
  const c = Number(comissao) || 0;
  const t = Number(total) || 0;
  if (c <= 0 || t <= 0) return false;
  const pct = (c * 100) / t;
  return pct >= FAIXA_MIN && pct <= FAIXA_MAX;
}
