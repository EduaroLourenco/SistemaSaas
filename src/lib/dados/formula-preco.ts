/**
 * O preço que fecha a margem, e a margem que o preço de hoje fecha.
 *
 * ── Preço se resolve, não se multiplica ──
 *
 * Comissão, imposto e margem são percentuais DO PRÓPRIO PREÇO. Marcar em
 * cima do custo não fecha a conta, porque cada real a mais de preço traz
 * junto mais comissão e mais imposto.
 *
 *   P = (mercadoria + embalagem + frete) ÷ (1 − comissão − imposto − margem)
 *
 * Com custo R$ 900, embalagem R$ 25, frete R$ 186,40, comissão 7,78%,
 * imposto 8,5% e margem-alvo 20%:
 *
 *   1.111,40 ÷ 0,6372 = R$ 1.744,19
 *
 * O caminho intuitivo — dividir só pela margem, 1.111,40 ÷ 0,80 =
 * R$ 1.389,25 — parece certo e entrega 3,7% de margem real, não 20%. É
 * por isso que esta conta mora numa função só, com teste, em vez de ser
 * refeita em cada tela.
 *
 * ── O teto ──
 *
 * Comissão + imposto + margem tem que somar menos de 100%. Premium a
 * 16,5% com imposto de 8,5% e margem de 80% dá 105%: não existe preço, e
 * a função devolve o motivo em vez de um número negativo com cara de
 * resposta.
 *
 * ── Por que clássico e premium são contas separadas ──
 *
 * No Mercado Livre o mesmo produto vive nos dois, a 11,5% e 16,5%. Cinco
 * pontos sobre o preço mudam tanto o preço-alvo quanto a margem que o
 * preço atual entrega — e a margem que se quer de cada um pode ser
 * diferente, já que premium converte pior e custa mais.
 *
 * ── O que fica de fora do alvo, e por quê ──
 *
 * Juros de parcelamento. Ele existe em reais por pedido e só se sabe
 * depois da venda, quando o comprador escolhe parcelar. Entrar no
 * preço-alvo exigiria supor uma taxa média de parcelamento — uma
 * suposição escondida dentro de um número que parece calculado. Ele
 * aparece na margem REAL, que é medida, e é lá que a diferença entre o
 * alvo e o realizado se explica.
 */


const r2 = (v: number) => Number(v.toFixed(2));

export type Componentes = {
  /** Custo da mercadoria por unidade. */
  mercadoria: number;
  embalagem: number;
  /** Frete por unidade, em reais. */
  frete: number;
  /** Alíquota do canal, em pontos percentuais. */
  comissaoPct: number;
  impostoPct: number;
};

export type ResultadoPreco =
  | { ok: true; preco: number }
  | { ok: false; motivo: string };

/** Preço que fecha a margem pedida. */
export function precoParaMargem(
  c: Componentes,
  margemPct: number
): ResultadoPreco {
  const custoFixo = c.mercadoria + c.embalagem + c.frete;
  const restante = 100 - c.comissaoPct - c.impostoPct - margemPct;

  if (restante <= 0) {
    return {
      ok: false,
      motivo:
        `Comissão (${c.comissaoPct}%) + imposto (${c.impostoPct}%) + margem ` +
        `(${margemPct}%) somam ${r2(100 - restante)}%. Não sobra preço para ` +
        `cobrir o custo — reduza a margem pedida.`,
    };
  }

  return { ok: true, preco: r2((custoFixo * 100) / restante) };
}

export type Decomposicao = {
  preco: number;
  comissao: number;
  imposto: number;
  frete: number;
  embalagem: number;
  mercadoria: number;
  margem: number;
  margemPct: number;
};

/** A margem que um preço entrega, com cada parcela nomeada. */
export function margemDoPreco(c: Componentes, preco: number): Decomposicao {
  const comissao = r2((preco * c.comissaoPct) / 100);
  const imposto = r2((preco * c.impostoPct) / 100);
  const margem = r2(
    preco - comissao - imposto - c.frete - c.embalagem - c.mercadoria
  );
  return {
    preco: r2(preco),
    comissao,
    imposto,
    frete: r2(c.frete),
    embalagem: r2(c.embalagem),
    mercadoria: r2(c.mercadoria),
    margem,
    margemPct: preco > 0 ? r2((margem * 100) / preco) : 0,
  };
}
