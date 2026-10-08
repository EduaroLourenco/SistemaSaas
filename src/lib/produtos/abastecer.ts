import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paginar } from "@/lib/dados/paginar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- serve ao cliente de sessão e ao privilegiado
type Cliente = SupabaseClient<any, any, any>;

/**
 * Garante um produto para cada SKU vendido ou anunciado, e liga o anúncio
 * ao produto.
 *
 * ── Por que existe ──
 *
 * `produtos` foi semeada uma vez, pela migração 10, a partir dos anúncios
 * daquela época — e nada mais a abastecia. Empresa nova chegava com 145
 * SKUs nos anúncios e zero produtos: a tela de Custos vazia, sem onde
 * digitar custo, e a margem impossível. Na Probel, 83 SKUs anunciados
 * depois da migração tinham ficado de fora.
 *
 * ── O que NÃO faz ──
 *
 * Nunca altera produto existente. Custo, embalagem, imposto e peso
 * digitados sobrevivem a qualquer número de execuções — o insert ignora
 * o SKU que já existe (o SKU é `citext`, então "pa123" e "PA123" são o
 * mesmo).
 *
 * Fontes: o SKU do anúncio (`anuncios.sku_canal`) e o dos itens de pedido
 * (`pedido_itens.sku`), que cobre os canais sem API de anúncio — loja
 * própria, Bling, planilha.
 */
export async function abastecerProdutos(
  sb: Cliente,
  operacaoId: string
): Promise<{ criados: number; ligados: number }> {
  type An = { id: string; sku_canal: string | null; titulo: string | null; produto_id: string | null };
  type It = { sku: string | null; titulo: string | null };
  type Pr = { id: string; sku: string };

  const [anuncios, itens, existentes] = await Promise.all([
    paginar(() =>
      sb.from("anuncios").select("id,sku_canal,titulo,produto_id").eq("operacao_id", operacaoId).order("id")
    ) as unknown as Promise<An[]>,
    paginar(() =>
      sb.from("pedido_itens").select("sku,titulo").eq("operacao_id", operacaoId).not("sku", "is", null).order("id")
    ) as unknown as Promise<It[]>,
    paginar(() => sb.from("produtos").select("id,sku").eq("operacao_id", operacaoId).order("id")) as unknown as Promise<
      Pr[]
    >,
  ]);

  const chave = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
  const tem = new Set(existentes.map((p) => chave(p.sku)));

  // O título do anúncio vem antes do do pedido: é o que o vendedor escreveu.
  const novos = new Map<string, { operacao_id: string; sku: string; titulo: string }>();
  const propor = (sku: string | null, titulo: string | null) => {
    const k = chave(sku);
    // Item sem SKU às vezes chega com o código do anúncio no lugar: não é produto.
    if (!k || k.length > 80 || /^MLB\d+$/.test(k) || tem.has(k) || novos.has(k)) return;
    novos.set(k, { operacao_id: operacaoId, sku: sku!.trim(), titulo: (titulo ?? "").trim() || sku!.trim() });
  };
  for (const a of anuncios) propor(a.sku_canal, a.titulo);
  for (const i of itens) propor(i.sku, i.titulo);

  const lista = [...novos.values()];
  for (let i = 0; i < lista.length; i += 500) {
    const { error } = await sb
      .from("produtos")
      .upsert(lista.slice(i, i + 500), { onConflict: "operacao_id,sku", ignoreDuplicates: true });
    if (error) throw new Error(`Falha ao criar produtos: ${error.message}`);
  }

  // Liga quem está sem produto.
  const semProduto = anuncios.filter((a) => !a.produto_id && chave(a.sku_canal));
  if (!semProduto.length) return { criados: lista.length, ligados: 0 };

  const todos = lista.length
    ? ((await paginar(() =>
        sb.from("produtos").select("id,sku").eq("operacao_id", operacaoId).order("id")
      )) as unknown as Pr[])
    : existentes;
  const idPorSku = new Map(todos.map((p) => [chave(p.sku), p.id]));

  const porProduto = new Map<string, string[]>();
  for (const a of semProduto) {
    const id = idPorSku.get(chave(a.sku_canal));
    if (!id) continue;
    const l = porProduto.get(id) ?? [];
    l.push(a.id);
    porProduto.set(id, l);
  }
  let ligados = 0;
  // UPDATE e não upsert: `anuncios` tem NOT NULL que o upsert exigiria todos.
  for (const [produtoId, ids] of porProduto) {
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const { error } = await sb.from("anuncios").update({ produto_id: produtoId }).in("id", lote);
      if (error) throw new Error(`Falha ao ligar anúncio ao produto: ${error.message}`);
      ligados += lote.length;
    }
  }
  return { criados: lista.length, ligados };
}
