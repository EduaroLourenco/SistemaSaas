/**
 * A régua da folga — o que a tela e o carregador precisam saber em comum.
 *
 * Fica fora de `lib/dados/` porque a TELA usa estes valores, e tudo em
 * `lib/dados/` é `server-only`: importar de lá para o cliente arrasta
 * `next/headers` para o pacote do navegador e a compilação quebra.
 */

/** O que vale quando ninguém definiu nada. */
export const FOLGA_PADRAO = 5;

/** A chave da linha que vale para todo tipo sem régua própria. */
export const TIPO_PADRAO = "*";

export type Folgas = {
  /** tipo de campanha (ou "*") → folga em pontos percentuais. */
  porTipo: Record<string, number>;
  /** Null quando está tudo certo; o texto é o que a tela mostra. */
  faltaMigracao: string | null;
};
