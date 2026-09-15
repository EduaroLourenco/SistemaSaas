/**
 * Endereço público do anúncio no canal.
 *
 * Só o Mercado Livre tem padrão previsível a partir do código: MLB seguido
 * de dígitos vira `produto.mercadolivre.com.br/MLB-<dígitos>`, que o
 * próprio Meli redireciona para a página certa — catálogo ou anúncio
 * comum. Para qualquer outro código devolve nulo, e a tela não mostra o
 * botão: um link montado por palpite leva a uma página de erro.
 */
export function linkDoAnuncio(codigo: string | null | undefined): string | null {
  const m = /^MLB(\d+)$/i.exec((codigo ?? "").trim());
  return m ? `https://produto.mercadolivre.com.br/MLB-${m[1]}` : null;
}
