import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import type { ExclusaoVenda, LinhaVenda } from "@/lib/planejamento/resultados";

/**
 * As vendas que o resultado de um planejamento lê, entre duas datas.
 *
 * Uma só implementação para a consulta de UMA ação (rota de resultados) e
 * para o painel com TODAS: as duas têm de chegar ao mesmo número, e duas
 * cópias desta leitura divergiriam na primeira correção.
 *
 * O SKU de cada linha segue a ordem: produto ligado ao anúncio, SKU do
 * anúncio, SKU do item. É o mesmo SKU que o planejamento grava.
 */
export class RegistrosDemais extends Error {}

export async function carregarVendasPlanejamento(
  operacaoId: string,
  de: string,
  ate: string
): Promise<{ vendas: LinhaVenda[]; exclusoes: ExclusaoVenda[] }> {
  const sb = await clienteServidor();
  type Linha = {
    anuncio_id: string | null;
    codigo_externo: string | null;
    sku: string | null;
    quantidade: number;
    total: number | string;
    pedidos:
      | { id: string; data: string; canal_id: string; conta_canal_id: string; cancelado: boolean; atualizado_em: string }
      | { id: string; data: string; canal_id: string; conta_canal_id: string; cancelado: boolean; atualizado_em: string }[]
      | null;
  };
  const [linhas, anuncios, produtos, exclusoes] = await Promise.all([
    paginar(() =>
      sb
        .from("pedido_itens")
        .select(
          "id,anuncio_id,codigo_externo,sku,quantidade,total,pedidos!inner(id,operacao_id,data,canal_id,conta_canal_id,cancelado,atualizado_em)"
        )
        .eq("operacao_id", operacaoId)
        .eq("pedidos.operacao_id", operacaoId)
        .gte("pedidos.data", de)
        .lte("pedidos.data", ate)
        .order("id")
    ) as unknown as Promise<Linha[]>,
    paginar(() =>
      sb
        .from("anuncios")
        .select("id,produto_id,sku_canal,codigo_externo,conta_canal_id")
        .eq("operacao_id", operacaoId)
        .order("id")
    ) as unknown as Promise<
      { id: string; produto_id: string | null; sku_canal: string | null; codigo_externo: string; conta_canal_id: string }[]
    >,
    paginar(() =>
      sb.from("produtos").select("id,sku").eq("operacao_id", operacaoId).order("id")
    ) as unknown as Promise<{ id: string; sku: string }[]>,
    paginar(() =>
      sb
        .from("exclusoes_analise")
        .select("id,data_inicio,data_fim,canal_id,conta_canal_id")
        .eq("operacao_id", operacaoId)
        .lte("data_inicio", ate)
        .gte("data_fim", de)
        .order("id")
    ) as unknown as Promise<ExclusaoVenda[]>,
  ]);
  if ([linhas, anuncios, produtos, exclusoes].some((a) => a.length >= 200000)) {
    throw new RegistrosDemais("O período tem registros demais para esta consulta.");
  }

  const porId = new Map(anuncios.map((a) => [a.id, a]));
  const porCodigo = new Map(anuncios.map((a) => [`${a.conta_canal_id}:${String(a.codigo_externo).toUpperCase()}`, a]));
  const skuProduto = new Map(produtos.map((p) => [p.id, p.sku]));
  const vendas: LinhaVenda[] = linhas.map((l) => {
    const p = Array.isArray(l.pedidos) ? l.pedidos[0] : l.pedidos;
    if (!p) throw new Error("Pedido sem vínculo acessível.");
    const a =
      (l.anuncio_id ? porId.get(l.anuncio_id) : null) ??
      porCodigo.get(`${p.conta_canal_id}:${String(l.codigo_externo).toUpperCase()}`);
    return {
      pedido: p.id,
      data: p.data,
      canal: p.canal_id,
      conta: p.conta_canal_id,
      cancelado: p.cancelado,
      sku: (a?.produto_id ? skuProduto.get(a.produto_id) : null) ?? a?.sku_canal ?? l.sku ?? "",
      anuncio: a?.id ?? "",
      quantidade: Number(l.quantidade),
      receita: Number(l.total),
      atualizado: p.atualizado_em,
    };
  });
  return { vendas, exclusoes };
}
