import type { ItemAutomacao } from "@/lib/dados/automacoes";

/**
 * O piso de um item e a faixa em que um preço cai.
 *
 * Duas funções puras, tiradas de dentro da tela de Automações. Elas
 * saíram de lá porque a fila de aprovação precisa decidir no SERVIDOR, e
 * decidir é conhecer o piso — repetir a conta em dois lugares seria o
 * jeito mais rápido de a fila e a tela discordarem sobre o mesmo item.
 *
 * Não têm estado nem dependem de React: o que elas precisam saber é o
 * item e as bandas de comissão da promoção, que vêm juntos na mesma
 * resposta (`ItensDaPromocao`).
 */

/**
 * O piso do item na comissão que ELE vai pagar nesta promoção.
 *
 * A Fórmula base dá um preço por banda de comissão. Quando o Meli banca
 * parte do desconto (`meliPct`), a comissão efetiva do vendedor cai, e o
 * piso é o da banda mais próxima dessa comissão — não o da comissão
 * cheia. Sem isso, o sistema recusa oferta que cabe.
 *
 * Cai para `item.piso` quando falta banda, falta a linha de preços ou
 * falta a comissão cheia: null aqui é "não sei o piso", e quem recebe
 * trata como não sei — nunca como zero.
 */
export function pisoDoItem(i: ItemAutomacao, bandas: number[]): number | null {
  if (i.comissaoCheia == null || !i.precos.length || !bandas.length) return i.piso;
  const alvo = i.comissaoCheia - (i.meliPct ?? 0) / 100;
  let melhor: number | null = null;
  let dist = Infinity;
  bandas.forEach((b, k) => {
    const d = Math.abs(b - alvo);
    if (i.precos[k] != null && d < dist) {
      dist = d;
      melhor = i.precos[k];
    }
  });
  return melhor ?? i.piso;
}

/**
 * Em que faixa de comissão um preço fecha.
 *
 * Varre as bandas em ordem e fica com a última cujo preço o item alcança
 * — o centavo de tolerância existe porque o preço vem arredondado em
 * duas casas e a comparação exata recusava o preço igual ao da faixa.
 */
export function faixaDoPreco(
  i: ItemAutomacao,
  bandas: number[],
  preco: number | null
): number | null {
  if (preco == null || !i.precos.length || !bandas.length) return null;
  let f: number | null = null;
  bandas.forEach((b, k) => {
    const v = i.precos[k];
    if (v != null && preco >= v - 0.01) f = b;
  });
  return f;
}

/**
 * O preço que a folga propõe a partir do piso.
 *
 * Arredonda para baixo em centavos, porque arredondar para cima devolve
 * um preço que o próprio piso recusaria no teste seguinte.
 */
export function precoComFolga(piso: number, folgaPct: number): number {
  return Math.round(piso * (1 - folgaPct / 100) * 100) / 100;
}
