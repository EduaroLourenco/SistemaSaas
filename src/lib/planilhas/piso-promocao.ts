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
  if (i.comissaoCheia == null || !i.precos.length || !bandas.length) return naoZero(i.piso);
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
  return naoZero(melhor ?? i.piso);
}

/**
 * Zero não é piso: é a ausência dele.
 *
 * `precoDeTabela` devolve 0 para o anúncio que não está na Fórmula base,
 * e esse zero atravessava tudo como se fosse um piso de verdade — na
 * fila de aprovação ele virou uma linha propondo R$ 0,00, que foi como
 * apareceu no print. Aqui vira null, que é o que o resto do código já
 * trata como "não sei".
 */
const naoZero = (v: number | null) => (v != null && v > 0 ? v : null);

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

/**
 * O preço que iria para o canal.
 *
 * Onde o preço é nosso, sai do piso com a folga, nunca abaixo do mínimo
 * do canal e nunca acima do teto (o menor entre o máximo e o que o canal
 * propôs) — escrever acima do teto já quebrou a planilha da Imprimil uma
 * vez. Onde o preço é do canal, o que vale é a proposta dele, e a regra
 * só decide se ela cabe no piso.
 */
export function precoProposto(
  i: Pick<ItemAutomacao, "precoCanal" | "sugerido" | "minimoCanal" | "maximoCanal">,
  piso: number | null,
  folgaPct: number,
  nosso: boolean
): number | null {
  /*
   * Sem piso, a fila não decide — nem quando o preço é do canal.
   *
   * A tela aberta mostra esses itens como "cabe", e ali há alguém
   * olhando. Aqui a linha chegaria pronta para aprovar em lote, e
   * aprovar sem saber o piso é aceitar um preço que ninguém conferiu.
   * Fica de fora e aparece na contagem de `sem_preco`.
   */
  /* `pisoDoItem` já devolve null no lugar de zero, mas esta função é
     exportada e alguém pode chamá-la com o piso cru da Fórmula base, onde
     zero quer dizer "fora da tabela". */
  if (piso == null || piso <= 0) return null;
  if (!nosso) {
    const p = i.precoCanal ?? i.sugerido ?? null;
    if (p == null) return null;
    return p >= precoComFolga(piso, folgaPct) - 0.01 ? p : null;
  }
  let v = precoComFolga(piso, folgaPct);
  if (i.minimoCanal != null) v = Math.max(v, i.minimoCanal);
  const teto = Math.min(i.maximoCanal ?? Infinity, i.precoCanal ?? Infinity);
  if (v > teto + 0.01) return null;
  return Math.round(v * 100) / 100;
}
