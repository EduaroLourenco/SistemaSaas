/**
 * A faixa que separa comissão reconstruída de lixo.
 *
 * Onde o canal não informa a comissão, ela é reconstruída na importação
 * por `total − frete do vendedor − juros − valor a receber`. A conta
 * funciona, mas não em todo pedido: em parte deles o "valor a receber"
 * ainda não teve a tarifa descontada, e aí o resultado não é tarifa
 * nenhuma.
 *
 * Medido contra os 1.169 pedidos com comissão informada, por faixa de
 * percentual sobre o total:
 *
 *   ≤ 0%          2.017 pedidos    0/5 exatos
 *   1–5%            206           97% exatos
 *   5–10%           777           99% exatos
 *   10–15%          364           93% exatos
 *   15–20%          107           53% exatos
 *   acima de 20%     69            0% exatos
 *
 * ── Por que o teto não pode ser fixo ──
 *
 * A primeira versão usava 15% para todo mundo, e isso estava errado.
 *
 * Aquela medição foi feita sobre a mistura, e a mistura é dominada pelo
 * clássico: 731 pedidos informados contra 102 do premium. Só que a
 * tabela do premium é 16,5%, acima do teto. Separando por tipo:
 *
 *   clássico   731 pedidos   mediana  6,02%   máximo 12,5%
 *   premium    102 pedidos   mediana 11,50%   máximo 17,5%
 *
 * Nove pedidos premium trazem comissão INFORMADA entre 15,3% e 17,5% —
 * tarifa real, cobrada, que o teto de 15% jogaria fora se viesse
 * derivada. E os 53% de acerto da faixa 15–20% eram justamente esses:
 * premium legítimo misturado com frete capturado por engano.
 *
 * Por isso o teto passa a sair da própria alíquota de tabela do anúncio,
 * com 10% de folga: 12,65% no clássico, 18,15% no premium. Além de
 * recuperar o premium, aperta o clássico, onde 15% era frouxo demais.
 *
 * Sem a alíquota conhecida, cai em 15% — o teto medido na mistura, que
 * continua sendo o melhor palpite quando não se sabe o tipo.
 */

export const FAIXA_MIN = 1;
/** Teto quando a alíquota de tabela do anúncio não é conhecida. */
export const FAIXA_MAX_PADRAO = 15;
/**
 * Teto de segurança na gravação, antes de saber o tipo.
 *
 * A importação deriva no nível do PEDIDO, que pode ter itens de anúncios
 * diferentes — não há uma alíquota só para aplicar ali. Então grava com
 * o limite frouxo, que cobre o premium, e cada tela reaplica a regra
 * apertada com a alíquota do anúncio em mãos.
 *
 * Guardar mais e filtrar na leitura é reversível; guardar de menos
 * exigiria reimportar tudo para recuperar o que foi descartado.
 */
export const FAIXA_MAX_GRAVACAO = 20;

/** Teto para uma alíquota de tabela conhecida, com 10% de folga. */
export function tetoPara(
  tabelaPct: string | number | null | undefined
): number {
  const t = Number(tabelaPct) || 0;
  return t > 0 ? t * 1.1 : FAIXA_MAX_PADRAO;
}

/**
 * Aceita a comissão do pedido como utilizável?
 *
 * Zero é recusado junto com ausência: houve importação que gravou "não
 * informado" como 0,00 em 1.373 pedidos, e tratá-lo como valor real
 * diluía a tarifa da semana para baixo.
 *
 * `tabelaPct` é a alíquota do anúncio. Quando vem, o teto sai dela;
 * quando não, cai no padrão.
 */
export function comissaoUtilizavel(
  comissao: string | number | null | undefined,
  total: string | number | null | undefined,
  tabelaPct?: string | number | null
): boolean {
  if (comissao == null) return false;
  const c = Number(comissao) || 0;
  const t = Number(total) || 0;
  if (c <= 0 || t <= 0) return false;
  const pct = (c * 100) / t;
  return pct >= FAIXA_MIN && pct <= tetoPara(tabelaPct);
}
