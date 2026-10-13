import type { ItemMargem } from "./dados/margem";

export const CAMPOS_CUSTO = ["comissao", "frete", "juros", "impostos", "embalagem", "mercadoria"] as const;
export type CampoCusto = typeof CAMPOS_CUSTO[number];
export type CustosConhecidos = Record<CampoCusto, { valor: number | null; cobertura: number }>;

/** Cada componente conserva sua própria cobertura; um imposto ausente
 * não oculta o frete que o canal efetivamente informou. */
export function resumirCustosConhecidos(itens: ItemMargem[]): CustosConhecidos {
  const receita = itens.reduce((s, i) => s + i.receita, 0);
  return Object.fromEntries(CAMPOS_CUSTO.map((campo) => {
    const conhecidos = itens.filter((i) => i[campo] != null);
    return [campo, {
      valor: conhecidos.length ? Math.round(conhecidos.reduce((s, i) => s + i[campo]!, 0) * 100) / 100 : null,
      cobertura: receita > 0 ? conhecidos.reduce((s, i) => s + i.receita, 0) / receita * 100 : 0,
    }];
  })) as CustosConhecidos;
}

/** A base de itens já exclui cancelados. Acrescentá-los ao bruto permite
 * mostrar a dedução uma única vez e manter líquida = vendas válidas. */
export function receitasFinanceiras(receitaValida: number, cancelamentos: number) {
  return { receitaBruta: Math.round((receitaValida + cancelamentos) * 100) / 100, receitaLiquida: Math.round(receitaValida * 100) / 100 };
}
