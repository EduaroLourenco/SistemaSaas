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
        .select("id,sku,titulo")
        .eq("operacao_id", op.id)
        .order("id"),
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select(
          "id,produto_id,sku_canal,titulo,codigo_externo,conta_canal_id,canal_id,tipo",
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
  const produtos = dados<{ id: string; sku: string; titulo: string }>(3);
  const anuncios = dados<{
    id: string;
    produto_id: string | null;
    sku_canal: string | null;
    titulo: string;
    codigo_externo: string;
    conta_canal_id: string;
    canal_id: string;
    tipo: string;
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
