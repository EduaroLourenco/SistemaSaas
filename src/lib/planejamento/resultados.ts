import { diasEntre, somarDias, type Item } from "./modelo";
import { estrategiaDe } from "./estrategia";

export type LinhaVenda = {
  pedido: string;
  data: string;
  canal: string;
  conta: string;
  cancelado: boolean;
  sku: string;
  anuncio: string;
  quantidade: number;
  receita: number;
  atualizado: string;
};
export type ExclusaoVenda = {
  data_inicio: string;
  data_fim: string;
  canal_id: string | null;
  conta_canal_id: string | null;
};
export type ResumoVendas = {
  inicio: string;
  fim: string;
  receita: number;
  pedidos: number;
  unidades: number;
  cancelados: number;
  excluidos: number;
  encontrados: number;
  ultimoRegistro: string | null;
};
export type ResultadoPlanejamento = {
  atual: ResumoVendas;
  anterior: ResumoVendas;
  consultadoEm: string;
  parcial: boolean;
};
export function periodosDoResultado(item: Item, hoje: string) {
  if (item.inicio > hoje) return null;
  const fim = item.fim < hoje ? item.fim : hoje;
  const dias = diasEntre(item.inicio, fim) + 1;
  return {
    inicio: item.inicio,
    fim,
    anteriorInicio: somarDias(item.inicio, -dias),
    anteriorFim: somarDias(item.inicio, -1),
  };
}
export function temRecorte(item: Item): boolean {
  return !!(
    item.canais.length ||
    item.contas.length ||
    item.skus.length ||
    estrategiaDe(item).anuncios.length
  );
}
export function resumirVendas(
  linhas: LinhaVenda[],
  item: Item,
  inicio: string,
  fim: string,
  exclusoes: ExclusaoVenda[],
): ResumoVendas {
  const anuncios = new Set(estrategiaDe(item).anuncios),
    skus = new Set(item.skus.map((s) => s.toUpperCase()));
  const pedidos = new Set<string>(),
    cancelados = new Set<string>(),
    excluidos = new Set<string>(),
    encontrados = new Set<string>();
  let receita = 0,
    unidades = 0,
    ultimoRegistro: string | null = null;
  for (const l of linhas) {
    if (l.data < inicio || l.data > fim) continue;
    if (
      (item.canais.length || item.contas.length) &&
      !item.canais.includes(l.canal) &&
      !item.contas.includes(l.conta)
    )
      continue;
    if (
      anuncios.size
        ? !anuncios.has(l.anuncio)
        : skus.size && !skus.has(l.sku.toUpperCase())
    )
      continue;
    encontrados.add(l.pedido);
    if (l.atualizado && (!ultimoRegistro || l.atualizado > ultimoRegistro))
      ultimoRegistro = l.atualizado;
    if (
      exclusoes.some(
        (e) =>
          l.data >= e.data_inicio &&
          l.data <= e.data_fim &&
          (!e.canal_id ||
            (e.canal_id === l.canal &&
              (!e.conta_canal_id || e.conta_canal_id === l.conta))),
      )
    ) {
      excluidos.add(l.pedido);
      continue;
    }
    if (l.cancelado) {
      cancelados.add(l.pedido);
      continue;
    }
    if (!Number.isFinite(l.receita) || !Number.isFinite(l.quantidade))
      throw new Error("Valor de venda indisponível.");
    pedidos.add(l.pedido);
    receita += l.receita;
    unidades += l.quantidade;
  }
  return {
    inicio,
    fim,
    receita: Math.round(receita * 100) / 100,
    pedidos: pedidos.size,
    unidades,
    cancelados: cancelados.size,
    excluidos: excluidos.size,
    encontrados: encontrados.size,
    ultimoRegistro,
  };
}
