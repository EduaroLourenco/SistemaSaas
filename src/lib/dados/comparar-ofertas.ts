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
  /**
   * O preço que o CANAL propôs. Nas campanhas com redução de tarifa é o
   * preço que vai valer; nas sem redução é só o pedido dele.
   */
  precoCanal: number | null;
  /**
   * O preço que vai de volta na planilha.
   *
   * Com redução: igual ao do canal — ali o preço é dele e a decisão é só
   * entrar ou não. Sem redução: o sistema reescreve com o da Fórmula
   * base, e os dois divergem. Mostrar só um dos dois escondia justamente
   * o caso em que o canal pedia R$ 2.235,35 e nós publicamos R$ 1.314,42.
   */
  precoOferta: number | null;
  /*
   * Tabela e piso são da OFERTA, não do anúncio.
   *
   * Cada faixa tem uma comissão diferente, e a Fórmula base devolve um
   * preço de tabela diferente para cada comissão. O mesmo anúncio com
   * duas propostas de R$ 1.344,59 aparece com 4,2% e 1,2% de desconto
   * porque as tabelas são outras — não porque a conta esteja errada.
   *
   * Guardar um valor só no anúncio fazia o cabeçalho contradizer as
   * linhas: dizia piso R$ 1.460,47 enquanto a linha mostrava a mesma
   * oferta R$ 11,65 ACIMA do piso.
   */
  precoTabela: number | null;
  precoPiso: number | null;
  /**
   * O piso que vale de fato para esta oferta.
   *
   * O desconto extra existe para descer ABAIXO do piso de propósito — é a
   * alavanca. Comparar com o piso cheio nesse caso acusava violação de
   * uma regra que o próprio usuário mandou afrouxar.
   *
   * Só se aplica sem redução de tarifa: com redução o preço é do canal e
   * não há preço nosso para descontar.
   */
  pisoEfetivo: number | null;
  /** Desconto extra da rodada, quando pesou nesta oferta. */
  descontoExtra: number | null;
  /** Quanto o canal abate da tarifa nesta oferta, em reais. */
  reducaoTarifa: number | null;
  /**
   * A mesma redução como fatia do preço proposto.
   *
   * É o número que o canal comunica — "reduzi 5% da sua tarifa" — e o que
   * explica por que duas ofertas do mesmo anúncio têm tabelas diferentes:
   * comissão menor, preço de tabela menor.
   *
   * Calculado na leitura e não guardado: depende do preço proposto, e
   * congelar a divisão deixaria o percentual desalinhado se o preço fosse
   * corrigido.
   *
   * DUAS casas, e não uma. Com uma, a redução saía 3,4% e a comissão
   * resultante 8,07% — quem confere de cabeça faz 11,5 − 3,4 = 8,1, não
   * bate, e desconfia do número certo. A precisão aqui não é preciosismo:
   * é o que deixa a subtração verificável a olho.
   */
  reducaoPercentual: number | null;
  participa: boolean;
  motivo: string | null;
  arquivo: string | null;
  linhaPlanilha: number | null;
  /**
   * A comissão que sobra depois da redução, em pontos percentuais.
   *
   * O canal comunica o rebate como uma fatia da tarifa: clássico paga
   * 11,5% e premium 16,5%, e a redução SUBTRAI daí. Um premium com 4% de
   * rebate paga 12,5%.
   *
   * É o número que decide entrar ou não, e ele não estava em lugar
   * nenhum: a tela mostrava a redução em porcentagem e deixava a
   * subtração para a cabeça de quem lê.
   */
  comissaoResultante: number | null;
  /** Quanto a oferta corta do preço de tabela, em pontos percentuais. */
  descontoSobreTabela: number | null;
  /** Distância até o piso EFETIVO: negativo fura a margem de verdade. */
  folgaAtePiso: number | null;
};

export type AnuncioComOfertas = {
  anuncioId: string;
  mlb: string;
  sku: string;
  titulo: string;
  tipo: string;
  /** Alíquota cheia do anúncio, de onde a redução é descontada. */
  comissaoTabela: number;
  /** Menor e maior tabela entre as ofertas. Iguais quando só há uma. */
  tabelaDe: number | null;
  tabelaAte: number | null;
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
   * O banco ainda não tem as colunas das migrações 09 e 11 — a tela não
   * pode mostrar a origem de cada oferta nem a redução de tarifa.
   */
  semOrigem: boolean;
};

const n = (v: unknown) => (v == null ? null : Number(v));

/** Piso: o menor preço ofertável sem furar a margem. Mesma regra do motor. */
const PISO = 0.95;

export async function carregarComparacao(): Promise<DadosComparacao> {
  const sb = await clienteServidor();

  /*
   * `arquivo` e `linha_planilha` vêm da migração 09; `reducao_tarifa` da
   * 11. Pedir uma coluna que não existe faz o PostgREST recusar a consulta
   * INTEIRA com 42703 — a tela ficaria em branco em vez de mostrar o que
   * já dá. Então tenta com as colunas novas e cai para o conjunto antigo.
   */
  const camposBase =
    "id,campanha_id,anuncio_id,processamento_id,preco_tabela,preco_oferta," +
    "preco_sugerido,decisao,motivo";

  /*
   * Colunas que só existem depois das migrações 09 e 11. Ficam juntas no
   * grupo opcional de propósito: se `reducao_tarifa` entrasse no conjunto
   * base, o desvio para o conjunto antigo pediria uma coluna inexistente
   * do mesmo jeito e a tela quebraria em vez de degradar.
   */
  const camposNovos = "arquivo,linha_planilha,reducao_tarifa";

  let semOrigem = false;
  let itens: Record<string, unknown>[];

  try {
    itens = await paginar(() =>
      sb.from("campanha_itens").select(`${camposBase},${camposNovos}`)
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

  const [campanhas, anuncios, execucoes] = await Promise.all([
    paginar(() => sb.from("campanhas").select("id,nome,tem_reducao_tarifa")),
    paginar(() =>
      sb.from("anuncios").select("id,codigo_externo,sku_canal,titulo,tipo,comissao_atual")
    ),
    // O desconto extra é da RODADA, não da oferta — vem daqui.
    paginar(() => sb.from("processamentos_promocao").select("id,desconto_extra")),
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
    tipo: string;
    comissao_atual: string | null;
  };

  const porCampanha = new Map(
    (campanhas as LinhaCampanha[]).map((c) => [c.id, c])
  );
  const porAnuncio = new Map(
    (anuncios as LinhaAnuncio[]).map((a) => [a.id, a])
  );
  const extraPorExecucao = new Map(
    (execucoes as { id: string; desconto_extra: string | null }[]).map((e) => [
      e.id,
      Number(e.desconto_extra) || 0,
    ])
  );

  type LinhaItem = {
    id: string;
    campanha_id: string;
    anuncio_id: string;
    preco_tabela: string | null;
    preco_oferta: string | null;
    preco_sugerido: string | null;
    reducao_tarifa?: string | null;
    decisao: string;
    motivo: string | null;
    arquivo?: string | null;
    linha_planilha?: number | null;
    processamento_id?: string | null;
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

    const precoCanal = n(i.preco_sugerido);
    const reducao = n(i.reducao_tarifa);

    /*
     * A alíquota cheia vem do catálogo quando existe; 11,5% e 16,5% são o
     * padrão do tipo. O catálogo ganha porque tarifa negociada existe, e
     * usar o padrão nesse caso erraria a comissão para menos.
     */
    const comissaoTabela =
      Number(anuncio.comissao_atual) > 0
        ? Number(anuncio.comissao_atual)
        : anuncio.tipo === "premium"
          ? 16.5
          : 11.5;

    const temReducao = campanha?.tem_reducao_tarifa ?? false;
    const extra = temReducao
      ? 0
      : (extraPorExecucao.get(i.processamento_id ?? "") ?? 0);
    const pisoEfetivo =
      precoPiso != null && extra > 0
        ? Math.round(precoPiso * (1 - extra) * 100) / 100
        : precoPiso;

    const grupo =
      agrupado.get(i.anuncio_id) ??
      ({
        anuncioId: i.anuncio_id,
        mlb: anuncio.codigo_externo,
        sku: anuncio.sku_canal ?? "",
        titulo: anuncio.titulo ?? "",
        tipo: anuncio.tipo,
        comissaoTabela,
        tabelaDe: null,
        tabelaAte: null,
        ofertas: [],
        campanhas: 0,
        participam: 0,
        melhorAceitavel: null,
        recusadaMaisProxima: null,
      } as AnuncioComOfertas);

    grupo.ofertas.push({
      id: i.id,
      campanhaId: i.campanha_id,
      campanha: campanha?.nome ?? "—",
      temReducao,
      precoCanal,
      precoOferta,
      precoTabela,
      precoPiso,
      pisoEfetivo,
      descontoExtra: extra > 0 ? extra : null,
      reducaoTarifa: reducao,
      reducaoPercentual:
        reducao != null && precoCanal
          ? Math.round((reducao / precoCanal) * 10000) / 100
          : null,
      // Da MESMA redução arredondada que a tela mostra: senão os dois
      // números se contradizem na segunda casa.
      comissaoResultante:
        reducao != null && precoCanal
          ? Math.round(
              (comissaoTabela - Math.round((reducao / precoCanal) * 10000) / 100) * 100
            ) / 100
          : comissaoTabela,
      participa: i.decisao === "participar",
      motivo: i.motivo,
      arquivo: i.arquivo ?? null,
      linhaPlanilha: i.linha_planilha ?? null,
      descontoSobreTabela:
        precoTabela && precoOferta != null
          ? Math.round(((precoTabela - precoOferta) / precoTabela) * 1000) / 10
          : null,
      folgaAtePiso:
        pisoEfetivo != null && precoOferta != null
          ? Math.round((precoOferta - pisoEfetivo) * 100) / 100
          : null,
    });

    agrupado.set(i.anuncio_id, grupo);
  }

  for (const g of agrupado.values()) {
    // Maior preço primeiro: a oferta que menos corta a margem encabeça a
    // comparação, que é a ordem em que a decisão é tomada.
    g.ofertas.sort((a, b) => (b.precoOferta ?? 0) - (a.precoOferta ?? 0));

    const tabelas = g.ofertas
      .map((o) => o.precoTabela)
      .filter((v): v is number => v != null);
    g.tabelaDe = tabelas.length ? Math.min(...tabelas) : null;
    g.tabelaAte = tabelas.length ? Math.max(...tabelas) : null;

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
    return (b.tabelaAte ?? 0) - (a.tabelaAte ?? 0);
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
