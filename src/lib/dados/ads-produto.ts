import "server-only";
import { paginar } from "./paginar";
import type { clienteServidor } from "@/lib/supabase/servidor";

type Sb = Awaited<ReturnType<typeof clienteServidor>>;

export type AdsProduto = {
  investimento: number;
  receitaAds: number;
  /** Vendido do produto no Meli NA MESMA janela — o denominador do TACoS. */
  vendido: number;
  /** Ads ÷ vendido, em %. Nulo sem venda na janela. */
  tacosPct: number | null;
};
export type AdsPorProduto = { inicio: string; fim: string; porProduto: Map<string, AdsProduto> } | null;

/**
 * Gasto de Ads do Mercado Livre por produto, na janela mais recente.
 *
 * O canal entrega a métrica em janelas de 30 dias, gravadas em
 * `anuncio_ads` por MLB e campanha. Aqui pega a janela de `fim` mais
 * recente, soma as campanhas de cada MLB e sobe para o produto pelo anúncio.
 * Janelas diferentes não se somam: cada uma já é um acumulado de 30 dias.
 *
 * Sem `operacaoId`, o RLS recorta — é o que as telas que não filtram usam.
 */
export async function carregarAdsPorProduto(sb: Sb, operacaoId?: string): Promise<AdsPorProduto> {
  let q = sb.from("anuncio_ads").select("inicio,fim").order("fim", { ascending: false }).order("inicio", { ascending: false }).limit(1);
  if (operacaoId) q = q.eq("operacao_id", operacaoId);
  const { data: ultima } = await q;
  const janela = ultima?.[0] as { inicio: string; fim: string } | undefined;
  if (!janela) return null;

  const [linhas, anuncios, canais] = await Promise.all([
    paginar(() => {
      let c = sb
        .from("anuncio_ads")
        .select("id,codigo_externo,investimento,receita")
        .eq("inicio", janela.inicio)
        .eq("fim", janela.fim)
        .order("id");
      if (operacaoId) c = c.eq("operacao_id", operacaoId);
      return c;
    }),
    paginar(() => {
      let c = sb.from("anuncios").select("id,codigo_externo,produto_id").not("produto_id", "is", null).order("id");
      if (operacaoId) c = c.eq("operacao_id", operacaoId);
      return c;
    }),
    sb.from("canais").select("id").eq("codigo", "mercado_livre"),
  ]);

  const meli = ((canais.data ?? []) as { id: string }[]).map((c) => c.id);
  const pedidos = meli.length
    ? await paginar(() => {
        let c = sb
          .from("pedidos")
          .select("id,pedido_itens(anuncio_id,total)")
          .in("canal_id", meli)
          .eq("cancelado", false)
          .gte("data", janela.inicio)
          .lte("data", janela.fim)
          .order("id");
        if (operacaoId) c = c.eq("operacao_id", operacaoId);
        return c;
      })
    : [];

  const lista = anuncios as unknown as { id: string; codigo_externo: string; produto_id: string }[];
  const produtoDoMlb = new Map(lista.map((a) => [a.codigo_externo.toUpperCase(), a.produto_id]));
  const produtoDoAnuncio = new Map(lista.map((a) => [a.id, a.produto_id]));
  const porProduto = new Map<string, AdsProduto>();
  for (const l of linhas as unknown as { codigo_externo: string; investimento: number; receita: number }[]) {
    const produtoId = produtoDoMlb.get(String(l.codigo_externo).toUpperCase());
    if (!produtoId) continue;
    const a = porProduto.get(produtoId) ?? { investimento: 0, receitaAds: 0, vendido: 0, tacosPct: null };
    a.investimento += Number(l.investimento) || 0;
    a.receitaAds += Number(l.receita) || 0;
    porProduto.set(produtoId, a);
  }
  const vendido = new Map<string, number>();
  for (const p of pedidos as unknown as { pedido_itens: { anuncio_id: string | null; total: number }[] }[]) {
    for (const i of p.pedido_itens ?? []) {
      const produtoId = i.anuncio_id ? produtoDoAnuncio.get(i.anuncio_id) : undefined;
      if (produtoId) vendido.set(produtoId, (vendido.get(produtoId) ?? 0) + Number(i.total));
    }
  }
  for (const [produtoId, a] of porProduto) {
    a.vendido = vendido.get(produtoId) ?? 0;
    a.tacosPct = a.vendido > 0 ? +((a.investimento / a.vendido) * 100).toFixed(1) : null;
  }
  return { inicio: janela.inicio, fim: janela.fim, porProduto };
}
