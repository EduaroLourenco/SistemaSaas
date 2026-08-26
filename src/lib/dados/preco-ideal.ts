import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import type { LinhaCruzada, RelatorioPrecoIdeal } from "@/mock/preco-ideal";

/**
 * Preço ideal, lido do banco.
 *
 * O preço ideal de um anúncio é o preço da Fórmula base NA COMISSÃO PADRÃO
 * dele. A matriz guarda o preço para várias comissões porque, em campanha,
 * o canal reduz a tarifa e o preço de tabela muda junto — é isso que o
 * motor de promoções consulta para decidir.
 *
 * A busca é por SKU e cai para MLB. A Fórmula base tem as duas chaves e o
 * SKU cobre quase tudo; o MLB existe para os poucos casos em que o mesmo
 * SKU tem preço diferente por anúncio.
 */

export type DadosPrecoIdeal = {
  relatorios: RelatorioPrecoIdeal[];
  /** Cruzamento já pronto por relatório — a tela não recalcula. */
  cruzamentos: Record<string, LinhaCruzada[]>;
  categorias: string[];
  vazio: boolean;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

function categoriaDe(titulo: string): string {
  const limpo = titulo.trim();
  if (!limpo) return "Sem categoria";
  const p = limpo.split(/\s+/)[0];
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** A comissão mais próxima da desejada, dentro da matriz do item. */
function precoNaComissao(
  matriz: Map<number, number> | undefined,
  comissao: number
): number {
  if (!matriz || !matriz.size) return 0;
  const exato = matriz.get(comissao);
  if (exato != null) return exato;
  // A planilha grava a comissão com arredondamento; procurar o mais próximo
  // evita perder a linha por uma diferença na terceira casa.
  let melhor = 0;
  let dist = Infinity;
  for (const [c, p] of matriz) {
    const d = Math.abs(c - comissao);
    if (d < dist) { dist = d; melhor = p; }
  }
  return dist <= 0.005 ? melhor : 0;
}

export async function carregarPrecoIdeal(): Promise<DadosPrecoIdeal> {
  const sb = await clienteServidor();

  const [{ data: imports }, itens, precos, anuncios] = await Promise.all([
    sb
      .from("importacoes")
      .select("id,nome_arquivo,data_base,criado_em,linhas_validas")
      .eq("tipo", "preco_ideal")
      .order("criado_em", { ascending: false })
      .limit(10),
    paginar(() =>
      sb
        .from("formula_base_itens")
        .select("mlb,tipo_anuncio,comissao_padrao,vigente_de")
        .order("vigente_de", { ascending: false })
    ),
    // 24 mil linhas: sem paginar, chegavam mil — 4% da matriz de preços.
    paginar(() =>
      sb
        .from("formula_base_precos")
        .select("chave_tipo,chave,comissao,preco,vigente_de")
        .order("vigente_de", { ascending: false })
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select("codigo_externo,titulo,sku_canal,tipo,status,preco_atual,comissao_atual")
    ),
  ]);

  const relatoriosBrutos = imports ?? [];
  if (!relatoriosBrutos.length || !itens.length) {
    return { relatorios: [], cruzamentos: {}, categorias: [], vazio: true };
  }

  // Matriz de preços por chave.
  const porSku = new Map<string, Map<number, number>>();
  const porMlb = new Map<string, Map<number, number>>();
  for (const p of precos) {
    const alvo = p.chave_tipo === "mlb" ? porMlb : porSku;
    const chave = String(p.chave).toUpperCase();
    const m = alvo.get(chave) ?? new Map<number, number>();
    m.set(n(p.comissao), n(p.preco));
    alvo.set(chave, m);
  }

  const base = new Map(
    itens.map((i) => [
      String(i.mlb).toUpperCase(),
      { comissao: n(i.comissao_padrao), tipo: i.tipo_anuncio as string },
    ])
  );

  type Anuncio = {
    codigo_externo: string; titulo: string; sku_canal: string | null;
    tipo: string; status: string; preco_atual: string | null; comissao_atual: string | null;
  };
  const catalogo = new Map(
    (anuncios as unknown as Anuncio[]).map((a) => [a.codigo_externo.toUpperCase(), a])
  );

  const relatorios: RelatorioPrecoIdeal[] = relatoriosBrutos.map((i) => ({
    id: i.id as string,
    fileName: i.nome_arquivo as string,
    dataBase: ((i.data_base as string) ?? (i.criado_em as string)).slice(0, 10),
    uploadedAt: (i.criado_em as string).slice(0, 10).split("-").reverse().join("/"),
    linhas: [],
  }));

  const cruzamentos: Record<string, LinhaCruzada[]> = {};
  const categorias = new Set<string>();

  for (const rel of relatorios) {
    const linhas: LinhaCruzada[] = [];
    for (const [mlb, item] of catalogo) {
      const b = base.get(mlb);
      if (!b) continue;

      const sku = (item.sku_canal ?? "").toUpperCase();
      const precoIdeal =
        precoNaComissao(porMlb.get(mlb), b.comissao) ||
        precoNaComissao(porSku.get(sku), b.comissao);
      if (!precoIdeal) continue;

      const praticado = n(item.preco_atual);
      const desvio = precoIdeal ? ((praticado - precoIdeal) / precoIdeal) * 100 : 0;
      const categoria = categoriaDe(item.titulo);
      categorias.add(categoria);

      linhas.push({
        mlb: item.codigo_externo,
        sku: item.sku_canal ?? "",
        titulo: item.titulo,
        categoria,
        tipo: item.tipo === "premium" ? "Premium" : "Clássico",
        status:
          item.status === "pausado"
            ? "pausado"
            : item.status === "finalizado"
              ? "finalizado"
              : "ativo",
        precoPraticado: praticado,
        precoIdeal: +precoIdeal.toFixed(2),
        desvio: +desvio.toFixed(2),
        comissaoAtual: n(item.comissao_atual),
        // A Fórmula base guarda fração; a tela mostra porcentagem.
        comissaoNegociada: +(b.comissao * 100).toFixed(2),
      });
    }
    linhas.sort((a, b2) => Math.abs(b2.desvio) - Math.abs(a.desvio));
    cruzamentos[rel.id] = linhas;
    rel.linhas = linhas.map((l) => ({
      mlb: l.mlb,
      precoIdeal: l.precoIdeal,
      comissaoNegociada: l.comissaoNegociada,
    }));
  }

  return {
    relatorios,
    cruzamentos,
    categorias: [...categorias].sort(),
    vazio: false,
  };
}
