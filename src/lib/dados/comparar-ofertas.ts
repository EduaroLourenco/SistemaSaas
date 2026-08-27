import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/**
 * As ofertas de cada anúncio, agrupadas para comparação.
 *
 * O canal propõe VÁRIAS faixas de desconto para o mesmo anúncio, e às
 * vezes o mesmo anúncio aparece em mais de uma campanha ao mesmo tempo.
 * O arquivo de 27/08 traz 549 linhas para 266 anúncios.
 *
 * A decisão de entrar não sai de olhar uma proposta: sai de comparar as
 * propostas entre si e contra o piso. Um anúncio com três faixas onde só
 * a mais cara passa é uma situação; um onde nenhuma passa por pouco é
 * outra, e pede desconto extra. As duas ficam invisíveis numa lista que
 * mostra uma linha por anúncio.
 *
 * Por isso esta camada agrupa por anúncio e devolve as ofertas juntas,
 * em vez de deixar o agrupamento para a tela.
 */

export type Oferta = {
  id: string;
  campanhaId: string;
  campanha: string;
  temReducao: boolean;
  precoOferta: number | null;
  precoSugerido: number | null;
  participa: boolean;
  motivo: string | null;
  arquivo: string | null;
  linhaPlanilha: number | null;
  /** Quanto a oferta corta do preço de tabela, em pontos percentuais. */
  descontoSobreTabela: number | null;
  /** Distância até o piso: negativo fura a margem. */
  folgaAtePiso: number | null;
};

export type AnuncioComOfertas = {
  anuncioId: string;
  mlb: string;
  sku: string;
  titulo: string;
  precoTabela: number | null;
  precoPiso: number | null;
  ofertas: Oferta[];
  /** Campanhas distintas em que este anúncio aparece. */
  campanhas: number;
  /** Quantas das ofertas passam na regra. */
  participam: number;
  /** A melhor oferta aceitável: a de maior preço entre as que passam. */
  melhorAceitavel: Oferta | null;
  /**
   * A oferta recusada que chegou mais perto do piso. É o que responde
   * "faltou quanto" quando nenhuma passa.
   */
  recusadaMaisProxima: Oferta | null;
};

export type DadosComparacao = {
  anuncios: AnuncioComOfertas[];
  campanhasDisponiveis: { id: string; nome: string; temReducao: boolean }[];
  /** Nenhuma planilha processada ainda. */
  vazio: boolean;
  /**
   * O banco ainda não tem as colunas da migração 09 — a tela não pode
   * mostrar de onde cada oferta veio.
   */
  semOrigem: boolean;
};

const n = (v: unknown) => (v == null ? null : Number(v));

/** Piso: o menor preço ofertável sem furar a margem. Mesma regra do motor. */
const PISO = 0.95;

export async function carregarComparacao(): Promise<DadosComparacao> {
  const sb = await clienteServidor();

  /*
   * `arquivo` e `linha_planilha` só existem depois da migração 09. Pedir
   * uma coluna que não existe faz o PostgREST recusar a consulta INTEIRA
   * com 42703 — a tela ficaria em branco em vez de mostrar o que já dá.
   * Então tenta com as colunas novas e cai para o conjunto antigo.
   */
  const camposBase =
    "id,campanha_id,anuncio_id,preco_tabela,preco_oferta,preco_sugerido,decisao,motivo";

  let semOrigem = false;
  let itens: Record<string, unknown>[];

  try {
    itens = await paginar(() =>
      sb.from("campanha_itens").select(`${camposBase},arquivo,linha_planilha`)
    );
  } catch (e) {
    /*
     * Só cai para o conjunto antigo quando a coluna REALMENTE não existe
     * (42703). Engolir qualquer erro faria um tempo limite virar "sem
     * origem" na tela — o problema sumiria de vista e a segunda tentativa,
     * mais leve, poderia até passar, deixando um sintoma silencioso no
     * lugar de um erro.
     */
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("42703")) throw e;
    semOrigem = true;
    itens = await paginar(() => sb.from("campanha_itens").select(camposBase));
  }

  if (!itens.length) {
    return { anuncios: [], campanhasDisponiveis: [], vazio: true, semOrigem };
  }

  const [campanhas, anuncios] = await Promise.all([
    paginar(() => sb.from("campanhas").select("id,nome,tem_reducao_tarifa")),
    paginar(() => sb.from("anuncios").select("id,codigo_externo,sku_canal,titulo")),
  ]);

  type LinhaCampanha = { id: string; nome: string; tem_reducao_tarifa: boolean };
  // `sku_canal`, não `sku`: é o SKU como o canal o escreve. Pedir a
  // coluna errada faz o PostgREST recusar a consulta inteira com 42703, e
  // o render do servidor morre com um erro que produção não mostra.
  type LinhaAnuncio = {
    id: string;
    codigo_externo: string;
    sku_canal: string | null;
    titulo: string | null;
  };

  const porCampanha = new Map(
    (campanhas as LinhaCampanha[]).map((c) => [c.id, c])
  );
  const porAnuncio = new Map(
    (anuncios as LinhaAnuncio[]).map((a) => [a.id, a])
  );

  type LinhaItem = {
    id: string;
    campanha_id: string;
    anuncio_id: string;
    preco_tabela: string | null;
    preco_oferta: string | null;
    preco_sugerido: string | null;
    decisao: string;
    motivo: string | null;
    arquivo?: string | null;
    linha_planilha?: number | null;
  };

  const agrupado = new Map<string, AnuncioComOfertas>();

  for (const i of itens as unknown as LinhaItem[]) {
    const anuncio = porAnuncio.get(i.anuncio_id);
    if (!anuncio) continue;

    const campanha = porCampanha.get(i.campanha_id);
    const precoTabela = n(i.preco_tabela);
    const precoOferta = n(i.preco_oferta);
    const precoPiso =
      precoTabela != null ? Math.round(precoTabela * PISO * 100) / 100 : null;

    const grupo =
      agrupado.get(i.anuncio_id) ??
      ({
        anuncioId: i.anuncio_id,
        mlb: anuncio.codigo_externo,
        sku: anuncio.sku_canal ?? "",
        titulo: anuncio.titulo ?? "",
        // O preço de tabela vem por linha, mas é do anúncio: fica o
        // primeiro que aparecer com valor.
        precoTabela: null,
        precoPiso: null,
        ofertas: [],
        campanhas: 0,
        participam: 0,
        melhorAceitavel: null,
        recusadaMaisProxima: null,
      } as AnuncioComOfertas);

    if (grupo.precoTabela == null && precoTabela != null) {
      grupo.precoTabela = precoTabela;
      grupo.precoPiso = precoPiso;
    }

    grupo.ofertas.push({
      id: i.id,
      campanhaId: i.campanha_id,
      campanha: campanha?.nome ?? "—",
      temReducao: campanha?.tem_reducao_tarifa ?? false,
      precoOferta,
      precoSugerido: n(i.preco_sugerido),
      participa: i.decisao === "participar",
      motivo: i.motivo,
      arquivo: i.arquivo ?? null,
      linhaPlanilha: i.linha_planilha ?? null,
      descontoSobreTabela:
        precoTabela && precoOferta != null
          ? Math.round(((precoTabela - precoOferta) / precoTabela) * 1000) / 10
          : null,
      folgaAtePiso:
        precoPiso != null && precoOferta != null
          ? Math.round((precoOferta - precoPiso) * 100) / 100
          : null,
    });

    agrupado.set(i.anuncio_id, grupo);
  }

  for (const g of agrupado.values()) {
    // Maior preço primeiro: a oferta que menos corta a margem encabeça a
    // comparação, que é a ordem em que a decisão é tomada.
    g.ofertas.sort((a, b) => (b.precoOferta ?? 0) - (a.precoOferta ?? 0));

    g.campanhas = new Set(g.ofertas.map((o) => o.campanhaId)).size;
    g.participam = g.ofertas.filter((o) => o.participa).length;
    g.melhorAceitavel = g.ofertas.find((o) => o.participa) ?? null;

    // Entre as recusadas, a que exige menos concessão para virar aceitável.
    const recusadas = g.ofertas.filter(
      (o) => !o.participa && o.folgaAtePiso != null
    );
    g.recusadaMaisProxima =
      recusadas.sort((a, b) => (b.folgaAtePiso ?? 0) - (a.folgaAtePiso ?? 0))[0] ??
      null;
  }

  const lista = [...agrupado.values()].sort((a, b) => {
    // Quem tem mais para comparar aparece primeiro — é onde a tela ajuda.
    if (b.ofertas.length !== a.ofertas.length) {
      return b.ofertas.length - a.ofertas.length;
    }
    return (b.precoTabela ?? 0) - (a.precoTabela ?? 0);
  });

  const usadas = new Set(lista.flatMap((g) => g.ofertas.map((o) => o.campanhaId)));

  return {
    anuncios: lista,
    campanhasDisponiveis: (campanhas as LinhaCampanha[])
      .filter((c) => usadas.has(c.id))
      .map((c) => ({ id: c.id, nome: c.nome, temReducao: c.tem_reducao_tarifa }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    vazio: false,
    semOrigem,
  };
}
