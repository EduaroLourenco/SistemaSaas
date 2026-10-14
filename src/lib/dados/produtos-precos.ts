import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { paginar } from "./paginar";
import { montarProdutosPrecos, periodoProdutos, type CanalPrecos, type ContaPrecos, type ProdutoPrecos, type AnuncioPrecos, type ItemPrecos, type LeituraVitrine } from "@/lib/produtos-precos";

export async function carregarProdutosPrecos(p: { de?: string; ate?: string; canais?: string; sku?: string }) {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const periodo = periodoProdutos(p, hoje);
  const op = await operacaoPadrao();
  const base = { operacaoId: op?.id ?? "", ...periodo, hoje, sku: p.sku, recorte: (p.canais ?? "").split(",").filter(Boolean) };
  if (!op) return montarProdutosPrecos({ ...base, canais: [], contas: [], produtos: [], anuncios: [], itens: [], leituras: [] });
  const sb = await clienteServidor();
  // Sessão + operação explícita. Nenhuma credencial de serviço nesta tela.
  const [canais, contas, produtos, anuncios, itens] = await Promise.all([
    paginar(() => sb.from("canais").select("id,nome").eq("operacao_id", op.id).eq("ativo", true)) as Promise<CanalPrecos[]>,
    paginar(() => sb.from("contas_canal").select("id,nome,canal_id").eq("operacao_id", op.id)) as Promise<ContaPrecos[]>,
    paginar(() => sb.from("produtos").select("id,sku,titulo").eq("operacao_id", op.id)) as Promise<ProdutoPrecos[]>,
    paginar(() => sb.from("anuncios").select("id,codigo_externo,sku_canal,titulo,produto_id,canal_id,conta_canal_id,status").eq("operacao_id", op.id)) as Promise<AnuncioPrecos[]>,
    paginar(() => sb.from("pedido_itens")
      .select("id,sku,titulo,anuncio_id,codigo_externo,quantidade,preco_unitario,total,pedidos!inner(data,canal_id,conta_canal_id,cancelado)")
      .eq("operacao_id", op.id).eq("pedidos.operacao_id", op.id).eq("pedidos.cancelado", false)
      .gte("pedidos.data", periodo.de).lte("pedidos.data", periodo.ate)) as unknown as Promise<ItemPrecos[]>,
  ]);
  // Esta tabela é abastecida pelos coletores de API. O preço importado do
  // cadastro e o preço de venda nunca preenchem uma vitrine sem medição.
  const faltam = new Set(anuncios.filter(a => a.status === "ativo").map(a => a.id));
  const leituras: LeituraVitrine[] = [];
  for (let inicio = 0; faltam.size; inicio += 1000) {
    const { data, error } = await sb.from("anuncio_estoque_diario").select("anuncio_id,data,preco")
      .eq("operacao_id", op.id).not("preco", "is", null).gte("preco", 0)
      .order("data", { ascending: false }).order("id").range(inicio, inicio + 999);
    if (error) throw new Error(`Não foi possível ler a vitrine: ${error.message}`);
    for (const l of (data ?? []) as LeituraVitrine[]) if (faltam.delete(l.anuncio_id)) leituras.push(l);
    if (!data || data.length < 1000) break;
  }
  return montarProdutosPrecos({ ...base, canais, contas, produtos, anuncios, itens, leituras });
}
