import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paginar } from "./paginar";

/**
 * A Fórmula base do Meli como tabela: o preço de cada SKU em cada faixa de
 * comissão, na versão vigente, mais o preço na alíquota cheia da versão
 * anterior — é como o dono vê "o que subiu" antes de abrir a Central.
 *
 * Recebe o cliente e a operação para rodar igual na página e no script que
 * monta a página solta com a chave de serviço.
 */

export type LinhaFaixas = {
  chave: string;
  titulo: string | null;
  mlbs: string[];
  /** Alíquota cheia do anúncio, em fração (0,115 clássico, 0,165 premium). */
  cheia: number;
  tipo: "classico" | "premium" | null;
  /** Na ordem de `faixas`; nulo onde a base não tem preço. */
  precos: (number | null)[];
  /** Tabela na alíquota cheia, versão anterior. */
  antes: number | null;
};

export type TabelaFaixas = {
  vigenteDe: string;
  anterior: string | null;
  faixas: number[];
  tolerancia: number;
  linhas: LinhaFaixas[];
};

const k3 = (v: number) => Math.round(Number(v) * 1000) / 1000;

export async function montarTabelaFaixas(sb: SupabaseClient, operacao: string): Promise<TabelaFaixas | null> {
  const { data: v } = await sb
    .from("formula_base_precos")
    .select("vigente_de")
    .eq("operacao_id", operacao)
    .lte("vigente_de", new Date().toISOString().slice(0, 10))
    .order("vigente_de", { ascending: false })
    .limit(1);
  const vigenteDe = v?.[0]?.vigente_de as string | undefined;
  if (!vigenteDe) return null;

  const { data: va } = await sb
    .from("formula_base_precos")
    .select("vigente_de")
    .eq("operacao_id", operacao)
    .lt("vigente_de", vigenteDe)
    .order("vigente_de", { ascending: false })
    .limit(1);
  const anterior = (va?.[0]?.vigente_de as string | undefined) ?? null;

  // Em série: o banco é compartilhado, e são ~30 páginas na Probel.
  const precos = await paginar(() =>
    sb.from("formula_base_precos").select("chave,comissao,preco").eq("operacao_id", operacao).eq("vigente_de", vigenteDe)
  );
  const antigos = anterior
    ? await paginar(() =>
        sb
          .from("formula_base_precos")
          .select("chave,comissao,preco")
          .eq("operacao_id", operacao)
          .eq("vigente_de", anterior)
          .in("comissao", [0.115, 0.165])
      )
    : [];
  const itens = await paginar(() =>
    sb.from("formula_base_itens").select("mlb,sku,comissao_padrao").eq("operacao_id", operacao).eq("vigente_de", vigenteDe)
  );
  const anuncios = await paginar(() =>
    sb
      .from("anuncios")
      .select("codigo_externo,sku_canal,produto_id,titulo,tipo,status")
      .eq("operacao_id", operacao)
      .like("codigo_externo", "MLB%")
  );
  const produtos = await paginar(() => sb.from("produtos").select("id,sku,titulo").eq("operacao_id", operacao));
  const { data: op } = await sb.from("operacoes").select("promo_tolerancia_pct").eq("id", operacao).maybeSingle();

  const faixas = [...new Set(precos.map((p) => k3(p.comissao)))].sort((a, b) => a - b);
  const col = new Map(faixas.map((f, i) => [f, i]));
  const porChave = new Map<string, (number | null)[]>();
  for (const p of precos) {
    const c = String(p.chave);
    const l = porChave.get(c) ?? faixas.map(() => null);
    l[col.get(k3(p.comissao))!] = Number(p.preco);
    porChave.set(c, l);
  }
  const antes = new Map(antigos.map((p) => [`${p.chave}|${k3(p.comissao)}`, Number(p.preco)]));
  const padraoMlb = new Map(itens.map((i) => [String(i.mlb), Number(i.comissao_padrao)]));

  // O anúncio ativo manda no título e no tipo; o resto completa.
  const ordem = (s: string | null) => (s === "ativo" ? 0 : 1);
  anuncios.sort((a, b) => ordem(a.status) - ordem(b.status));
  const porSku = new Map<string, typeof anuncios>();
  const porMlb = new Map<string, (typeof anuncios)[number]>();
  const skuDoProduto = new Map(produtos.map((p) => [String(p.id), String(p.sku ?? "").toUpperCase()]));
  const tituloDoSku = new Map(produtos.map((p) => [String(p.sku ?? "").toUpperCase(), p.titulo as string | null]));
  for (const a of anuncios) {
    porMlb.set(String(a.codigo_externo), a);
    const s = String(a.sku_canal ?? "").toUpperCase() || skuDoProduto.get(String(a.produto_id)) || "";
    if (s) porSku.set(s, [...(porSku.get(s) ?? []), a]);
  }

  const linhas: LinhaFaixas[] = [];
  for (const [chave, ps] of porChave) {
    const lista = chave.startsWith("MLB") ? [porMlb.get(chave)].filter((a) => a != null) : porSku.get(chave.toUpperCase()) ?? [];
    const a = lista[0];
    const tipo = a?.tipo === "premium" ? "premium" : a?.tipo === "classico" ? "classico" : null;
    const cheia = k3((a && padraoMlb.get(String(a.codigo_externo))) || (tipo === "premium" ? 0.165 : 0.115));
    linhas.push({
      chave,
      titulo: tituloDoSku.get(chave.toUpperCase())?.trim() || a?.titulo?.trim() || null,
      mlbs: lista.map((x) => String(x.codigo_externo)),
      cheia,
      tipo,
      precos: ps,
      antes: antes.get(`${chave}|${cheia}`) ?? null,
    });
  }
  linhas.sort((x, y) => x.chave.localeCompare(y.chave));

  return {
    vigenteDe,
    anterior,
    faixas,
    tolerancia: Number(op?.promo_tolerancia_pct ?? 5) / 100,
    linhas,
  };
}
