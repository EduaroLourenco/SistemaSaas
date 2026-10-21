/**
 * O número que quer dizer "não controlo estoque deste anúncio".
 *
 * O Mercado Livre não tem uma marca para isso: quem vende sob encomenda
 * declara uma quantidade absurda para o anúncio nunca sair do ar. Na
 * prática o valor é 40 mil ou mais, e são 747 dos 1.667 anúncios — quase
 * metade do catálogo.
 *
 * Tratá-lo como estoque estraga tudo que soma ou compara quantidade: a
 * média de cobertura, o aviso de ruptura, a coluna de estoque na planilha.
 * Por isso quem lê estoque precisa decidir o que fazer com ele, e para
 * decidir precisa do corte — que estava escrito à mão em quatro arquivos,
 * em três grafias diferentes (40000, 40_000 e um `const` local).
 */
export const SOB_ENCOMENDA = 40_000;

/** O anúncio declara quantidade de quem não controla estoque? */
export function semControleDeEstoque(estoque: number | null | undefined): boolean {
  return estoque != null && estoque >= SOB_ENCOMENDA;
}
