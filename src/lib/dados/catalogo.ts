import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import type { ItemCatalogo } from "@/mock/catalogo";

/**
 * Catálogo de anúncios, lido do banco.
 *
 * O histórico de preço sai de `anuncio_precos_vitrine`, que é o retrato
 * semanal do que estava publicado. É a única fonte de preço para semana
 * SEM venda — e é justamente essa a semana que se quer explicar.
 */

export type ImportacaoCatalogo = {
  id: string;
  arquivo: string;
  enviadoEm: string;
  linhas: number;
  novos: number;
  atualizados: number;
};

export type DadosCatalogo = {
  itens: ItemCatalogo[];
  categorias: string[];
  contas: string[];
  importacoes: ImportacaoCatalogo[];
  vazio: boolean;
};

type LinhaAnuncio = {
  id: string;
  codigo_externo: string;
  titulo: string;
  sku_canal: string | null;
  tipo: string;
  status: string;
  preco_atual: string | null;
  comissao_atual: string | null;
  atualizado_em: string;
  criado_em: string;
  contas_canal: { nome: string } | null;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

/**
 * Categoria derivada da primeira palavra do título.
 *
 * O canal não exporta categoria e os produtos ainda não estão cadastrados.
 * Agrupar por primeira palavra junta colchão com colchão e erra de forma
 * visível — melhor que um "Sem categoria" que esconde tudo no mesmo balde.
 */
function categoriaDe(titulo: string): string {
  const limpo = titulo.trim();
  if (!limpo) return "Sem categoria";
  const p = limpo.split(/\s+/)[0];
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export async function carregarCatalogo(): Promise<DadosCatalogo> {
  const sb = await clienteServidor();

  const [anuncios, retratos, { data: imports }] = await Promise.all([
      paginar(() =>
        sb
          .from("anuncios")
          .select(
            "id,codigo_externo,titulo,sku_canal,tipo,status,preco_atual,comissao_atual,atualizado_em,criado_em,contas_canal(nome)"
          )
          .order("titulo", { ascending: true })
      ),
      paginar(() =>
        sb
          .from("anuncio_precos_vitrine")
          .select("anuncio_id,ano_iso,semana_iso,preco,disponivel")
          .order("semana_iso", { ascending: true })
      ),
      sb
        .from("importacoes")
        .select("id,nome_arquivo,linhas_lidas,linhas_validas,criado_em")
        .eq("tipo", "catalogo")
        .order("criado_em", { ascending: false })
        .limit(10),
    ]);

  const linhas = anuncios as unknown as LinhaAnuncio[];
  if (!linhas.length) {
    return { itens: [], categorias: [], contas: [], importacoes: [], vazio: true };
  }

  type Retrato = {
    anuncio_id: string;
    semana_iso: number;
    preco: string;
    disponivel: number | null;
  };

  const historico = new Map<string, { semana: string; preco: number }[]>();
  const estoquePor = new Map<string, number>();
  for (const r of retratos as unknown as Retrato[]) {
    const lista = historico.get(r.anuncio_id) ?? [];
    lista.push({ semana: `S${r.semana_iso}`, preco: n(r.preco) });
    historico.set(r.anuncio_id, lista);
    if (r.disponivel != null) estoquePor.set(r.anuncio_id, r.disponivel);
  }

  const itens: ItemCatalogo[] = linhas.map((a) => ({
    mlb: a.codigo_externo,
    sku: a.sku_canal ?? "",
    titulo: a.titulo,
    categoria: categoriaDe(a.titulo),
    tipo: a.tipo === "premium" ? "Premium" : "Clássico",
    precoAtual: n(a.preco_atual),
    comissaoAtual: n(a.comissao_atual),
    status:
      a.status === "pausado"
        ? "pausado"
        : a.status === "finalizado"
          ? "finalizado"
          : "ativo",
    conta: a.contas_canal?.nome ?? "Conta principal",
    estoque: estoquePor.get(a.id) ?? 0,
    atualizadoEm: a.atualizado_em.slice(0, 10),
    criadoEm: a.criado_em.slice(0, 10),
    // O export do canal não diz se o frete é grátis; afirmar seria inventar.
    freteGratis: false,
    historicoPreco: historico.get(a.id) ?? [],
  }));

  const categorias = [...new Set(itens.map((i) => i.categoria))].sort();
  const contas = [...new Set(itens.map((i) => i.conta))].sort();

  const importacoes: ImportacaoCatalogo[] = (imports ?? []).map((i) => ({
    id: i.id as string,
    arquivo: i.nome_arquivo as string,
    enviadoEm: (i.criado_em as string).slice(0, 10).split("-").reverse().join("/"),
    linhas: (i.linhas_lidas as number) ?? 0,
    /*
     * `novos` e `atualizados` não são registrados hoje: a gravação usa
     * upsert e não distingue os dois casos. Mostrar zero é honesto; um
     * número aproximado seria pior, porque ninguém desconfiaria dele.
     */
    novos: 0,
    atualizados: (i.linhas_validas as number) ?? 0,
  }));

  return { itens, categorias, contas, importacoes, vazio: false };
}
