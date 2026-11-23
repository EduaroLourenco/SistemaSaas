/**
 * De um preço final do Meli (e, se houver, do "Você recebe" da Central de
 * Promoções) para a faixa de comissão da Fórmula base.
 *
 * A comissão efetiva sai de `(preço − recebe) / preço`: no print da Central
 * de 23/11 (PA51667) as três ofertas fecham em 10,5% cheios menos a redução,
 * sem taxa fixa nem frete — acima de R$ 79 o "Você recebe" é só preço menos
 * comissão. Por isso a faixa não depende de saber a alíquota cheia quando o
 * recebe é informado.
 *
 * ponytail: abaixo de R$ 79 o recebe da Central também desconta o envio,
 * e a faixa sai mais alta (lado seguro). Os produtos da Probel não chegam lá.
 */

/**
 * A faixa da Fórmula base que vale para uma comissão efetiva.
 * Mesma regra do motor de promoções: arredonda para cima ao inteiro e soma
 * meio ponto (3,5% → 4,5%; 9,42% → 10,5%), nunca abaixo da mínima.
 */
export function faixaDaComissao(efetiva: number, minima = 0.045): number {
  const pts = Math.ceil(efetiva * 100 - 1e-9) + 0.5;
  return Math.max(Math.round(pts * 10) / 1000, minima);
}

/** O que sobra para o vendedor nesta faixa (acima de R$ 79, sem taxa fixa). */
export const recebeNaFaixa = (preco: number, faixa: number) => Math.round(preco * (1 - faixa) * 100) / 100;

export type Leitura = {
  /** Comissão efetiva, em fração. Nula quando só há preço (vale a cheia). */
  efetiva: number | null;
  faixa: number;
  tabela: number | null;
  minimo: number | null;
  dentro: boolean | null;
  recebe: number;
};

/**
 * Lê uma oferta contra a linha da tabela de um produto.
 * `cheia` é a alíquota do anúncio, usada só quando o recebe não vem.
 */
export function lerOferta(
  linha: Record<number, number>,
  preco: number,
  recebe: number | null,
  cheia: number,
  tolerancia = 0.05
): Leitura {
  const efetiva = recebe != null && recebe < preco ? (preco - recebe) / preco : null;
  const faixa = efetiva == null ? cheia : faixaDaComissao(efetiva);
  const tabela = linha[Math.round(faixa * 1000) / 1000] ?? null;
  const minimo = tabela == null ? null : Math.round(tabela * (1 - tolerancia) * 100) / 100;
  return {
    efetiva,
    faixa,
    tabela,
    minimo,
    dentro: minimo == null ? null : preco >= minimo - 0.01,
    recebe: recebe ?? recebeNaFaixa(preco, cheia),
  };
}
