import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { paginar } from "./paginar";
import {
  detalhesVazios,
  type Dados,
  type Item,
  type Grupo,
  type Tipo,
  type Produto,
  type Promocao,
} from "@/lib/planejamento/modelo";
export async function carregarPlanejamentoComercial(): Promise<Dados> {
  const op = await operacaoPadrao();
  const vazio: Dados = {
    operacao: op?.id ?? "",
    empresa: op?.nome ?? "",
    itens: [],
    grupos: [],
    tipos: [],
    produtos: [],
    anuncios: [],
    canais: [],
    contas: [],
    promocoes: [],
    avisos: [],
    pronto: false,
  };
  if (!op)
    return {
      ...vazio,
      avisos: ["Selecione uma operação para começar a planejar."],
    };
  const sb = await clienteServidor();
  const resultados = await Promise.allSettled([
    paginar(() =>
      sb
        .from("planejamento_itens")
        .select("*")
        .eq("operacao_id", op.id)
        .order("id"),
    ),
    paginar(() =>
      sb
        .from("planejamento_grupos")
        .select("*")
        .eq("operacao_id", op.id)
        .order("id"),
    ),
    paginar(() =>
      sb
        .from("planejamento_tipos")
        .select("*")
        .eq("operacao_id", op.id)
        .order("id"),
    ),
    paginar(() =>
      sb
        .from("produtos")
        .select("id,sku,titulo,custo_unitario")
        .eq("operacao_id", op.id)
        .order("id"),
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select(
          "id,produto_id,sku_canal,titulo,codigo_externo,conta_canal_id,canal_id,tipo,preco_atual,estoque,status",
        )
        .eq("operacao_id", op.id)
        .order("id"),
    ),
    paginar(() =>
      sb.from("canais").select("id,nome").eq("operacao_id", op.id).order("id"),
    ),
    paginar(() =>
      sb
        .from("contas_canal")
        .select("id,nome,canal_id")
        .eq("operacao_id", op.id)
        .order("id"),
    ),
    paginar(() =>
      sb
        .from("campanhas")
        .select("id,nome,inicio,fim,canal_id,ativa,atualizado_em")
        .eq("operacao_id", op.id)
        .order("id"),
    ),
    paginar(() =>
      sb
        .from("campanha_itens")
        .select("campanha_id,anuncio_id,preco_oferta,decisao")
        .eq("operacao_id", op.id)
        .order("id"),
    ),
  ]);
  const nomes = [
    "planejamento",
    "grupos",
    "tipos de ação",
    "produtos",
    "anúncios",
    "canais",
    "contas",
    "promoções",
    "itens de promoção",
  ];
  resultados.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[planejamento/${nomes[i]}]`, r.reason);
      vazio.avisos.push(
        i < 3
          ? "O armazenamento do planejamento não está disponível. A configuração do banco precisa ser concluída."
          : `Não foi possível carregar ${nomes[i]}. Tente atualizar a página.`,
      );
    }
  });
  function dados<T>(i: number): T[] {
    const r = resultados[i];
    return r.status === "fulfilled" ? (r.value as T[]) : [];
  }
  const produtos = dados<{ id: string; sku: string; titulo: string; custo_unitario: number | null }>(3);
  const anuncios = dados<{
    id: string;
    produto_id: string | null;
    sku_canal: string | null;
    titulo: string;
    codigo_externo: string;
    conta_canal_id: string;
    canal_id: string;
    tipo: string;
    preco_atual: number | string | null;
    estoque: number | null;
    status: string | null;
  }>(4);
  const porId = new Map(produtos.map((p) => [p.id, p.sku]));
  const catalogo = new Map<string, Produto>();
  produtos.forEach((p) =>
    catalogo.set(p.sku.toUpperCase(), {
      sku: p.sku,
      titulo: p.titulo,
      origem: "produto",
    }),
  );
  function skuAnuncio(a: (typeof anuncios)[number]): string {
    return (
      (a.produto_id ? porId.get(a.produto_id) : null) ??
      a.sku_canal?.trim() ??
      ""
    );
  }
  anuncios.forEach((a) => {
    const sku = skuAnuncio(a);
    if (sku && !catalogo.has(sku.toUpperCase()))
      catalogo.set(sku.toUpperCase(), {
        sku,
        titulo: a.titulo,
        origem: "anuncio",
      });
  });
  await enriquecer(catalogo, produtos, anuncios, skuAnuncio, sb, op.id);
  const anuncioPorId = new Map(anuncios.map((a) => [a.id, a]));
  const ofertas = dados<{
    campanha_id: string;
    anuncio_id: string;
    preco_oferta: number | null;
    decisao: string;
  }>(8);
  const promocoes = dados<Omit<Promocao, "ofertas">>(7).map((c) => ({
    ...c,
    ofertas: ofertas
      .filter((o) => o.campanha_id === c.id)
      .flatMap((o) => {
        const a = anuncioPorId.get(o.anuncio_id);
        return a
          ? [
              {
                sku: skuAnuncio(a),
                conta: a.conta_canal_id,
                anuncio: a.codigo_externo,
                preco: o.preco_oferta == null ? null : Number(o.preco_oferta),
                decisao: o.decisao,
              },
            ]
          : [];
      }),
  }));
  return {
    ...vazio,
    pronto: resultados.slice(0, 3).every((r) => r.status === "fulfilled"),
    avisos: [...new Set(vazio.avisos)],
    itens: dados<Item>(0).map((i) => ({
      ...i,
      detalhes: { ...detalhesVazios(), ...i.detalhes },
    })),
    grupos: dados<Grupo>(1),
    tipos: dados<Tipo>(2),
    produtos: [...catalogo.values()].sort((a, b) =>
      a.titulo.localeCompare(b.titulo, "pt-BR"),
    ),
    canais: dados(5),
    contas: dados(6),
    anuncios: anuncios.map((a) => ({
      id: a.id,
      codigo: a.codigo_externo,
      titulo: a.titulo,
      sku: skuAnuncio(a),
      canal: a.canal_id,
      conta: a.conta_canal_id,
      tipo: a.tipo,
    })),
    promocoes,
  };
}

/**
 * O que ajuda a ESCOLHER produto para uma campanha: curva, receita e
 * unidades dos últimos 90 dias, preço de agora, estoque e se tem custo.
 * Falha aqui não derruba o planejamento — o seletor só fica sem as colunas.
 */
async function enriquecer(
  catalogo: Map<string, Produto>,
  produtos: { sku: string; custo_unitario: number | null }[],
  anuncios: { id: string; status: string | null; estoque: number | null }[],
  skuAnuncio: (a: never) => string,
  sb: Awaited<ReturnType<typeof clienteServidor>>,
  operacaoId: string,
) {
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  let itens: { sku: string | null; quantidade: number; total: number | string; pedidos: { data: string } | null }[] = [];
  try {
    itens = (await paginar(() =>
      sb
        .from("pedido_itens")
        .select("sku,quantidade,total,pedidos!inner(data,cancelado)")
        .eq("operacao_id", operacaoId)
        .gte("pedidos.data", desde)
        .eq("pedidos.cancelado", false)
        .order("id"),
    )) as unknown as typeof itens;
  } catch (e) {
    console.error("[planejamento/vendas-90d]", e);
  }
  /*
   * Preço de agora: o último preço de VENDA registrado (rotina diária de
   * preços, ou o retrato do catálogo). O do cadastro do anúncio é o cheio,
   * sem o desconto da campanha — mostraria R$ 4.212 onde o comprador paga
   * R$ 2.140.
   */
  const semana = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const ultimo = new Map<string, { data: string; preco: number }>();
  const guardar = (id: string, data: string, preco: unknown) => {
    const v = Number(preco);
    const u = ultimo.get(id);
    if (v > 0 && (!u || data >= u.data)) ultimo.set(id, { data, preco: v });
  };
  try {
    const [cat, ret] = await Promise.all([
      paginar(() => sb.from("anuncio_catalogo_diario").select("anuncio_id,data,preco_atual").eq("operacao_id", operacaoId).gte("data", semana).not("preco_atual", "is", null).order("id")),
      paginar(() => sb.from("anuncio_estoque_diario").select("anuncio_id,data,preco").eq("operacao_id", operacaoId).gte("data", semana).not("preco", "is", null).order("id")),
    ]);
    for (const c of cat as { anuncio_id: string; data: string; preco_atual: unknown }[]) guardar(c.anuncio_id, c.data, c.preco_atual);
    // O retrato diário vem depois: no mesmo dia, ele vence o catálogo.
    for (const r of ret as { anuncio_id: string; data: string; preco: unknown }[]) guardar(r.anuncio_id, r.data, r.preco);
  } catch (e) {
    console.error("[planejamento/precos]", e);
  }
  const k = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
  const vendas = new Map<string, { receita: number; unidades: number; ultimo: string; precoUltimo: number }>();
  for (const it of itens) {
    const chave = k(it.sku);
    if (!chave || !it.pedidos) continue;
    const v = vendas.get(chave) ?? { receita: 0, unidades: 0, ultimo: "", precoUltimo: 0 };
    const q = Number(it.quantidade) || 0;
    const t = Number(it.total) || 0;
    v.receita += t;
    v.unidades += q;
    if (it.pedidos.data >= v.ultimo && q > 0) {
      v.ultimo = it.pedidos.data;
      v.precoUltimo = t / q;
    }
    vendas.set(chave, v);
  }
  const anuncio = new Map<string, { preco: number | null; estoque: number; semControle?: boolean }>();
  for (const a of anuncios) {
    const chave = k(skuAnuncio(a as never));
    if (!chave) continue;
    const x = anuncio.get(chave) ?? { preco: null, estoque: 0 };
    const preco = ultimo.get(a.id)?.preco ?? null;
    const ativo = a.status === "ativo" || a.status === "active";
    if (ativo && preco && (x.preco == null || preco < x.preco)) x.preco = preco;
    // 40.000+ é o marcador de "sem controle" (sob encomenda): disponível, não quantidade.
    if (ativo && a.estoque != null && a.estoque >= 40_000) x.semControle = true;
    else x.estoque += a.estoque ?? 0;
    anuncio.set(chave, x);
  }
  const comCusto = new Set(produtos.filter((p) => p.custo_unitario != null).map((p) => k(p.sku)));

  const ordem = [...vendas.entries()].sort((a, b) => b[1].receita - a[1].receita);
  const total = ordem.reduce((s, [, v]) => s + v.receita, 0);
  const curva = new Map<string, "A" | "B" | "C">();
  let acc = 0;
  for (const [chave, v] of ordem) {
    acc += v.receita;
    const pc = total ? (acc / total) * 100 : 100;
    curva.set(chave, pc <= 80 ? "A" : pc <= 95 ? "B" : "C");
  }

  for (const [chave, p] of catalogo) {
    const v = vendas.get(chave);
    const a = anuncio.get(chave);
    p.curva = curva.get(chave) ?? null;
    p.receita90 = v ? Math.round(v.receita) : 0;
    p.unidades90 = v?.unidades ?? 0;
    p.preco = a?.preco ?? (v ? Math.round(v.precoUltimo * 100) / 100 : null);
    p.precoOrigem = a?.preco != null ? "anuncio" : v ? "vendido" : null;
    p.estoque = a ? a.estoque : null;
    p.semControle = a?.semControle ?? false;
    p.temCusto = comCusto.has(chave);
  }
}
