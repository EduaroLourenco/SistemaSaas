import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { emLotes } from "@/lib/sync/diarias";
import { meliGet, type Conta } from "./cliente";

/**
 * Publicidade do Mercado Livre (Mercado Ads) por API.
 *
 * Até aqui o gasto de mídia entrava por planilha exportada à mão, e a
 * última importação era de 01/08 — quase dois meses de atraso num número
 * que muda todo dia.
 *
 * A rota certa não é a da documentação antiga: a versão anterior do
 * Product Ads foi descontinuada em junho de 2025, e o caminho que
 * responde é
 *
 *   /marketplace/advertising/{site}/advertisers/{id}/product_ads/ads/search
 *
 * com cabeçalho `api-version: 2`. As variações antigas
 * (`/advertising/product_ads/campaigns`, `/advertising/campaigns/search`)
 * devolvem 404, e é fácil concluir que a conta não tem publicidade — ela
 * tem.
 *
 * Limite do canal: a janela de métrica vai até 90 dias para trás, e o
 * número do dia só fecha às 10h (horário de Brasília).
 */

const API_VERSAO = "2";

export type Anunciante = { id: number; site: string; nome: string };

export type CampanhaAds = {
  id: number;
  nome: string;
  status: string;
  estrategia: string | null;
  orcamentoDiario: number | null;
  acosAlvo: number | null;
  metricas: MetricasAds;
};

export type AnuncioAds = {
  mlb: string;
  campanhaId: number;
  titulo: string;
  preco: number | null;
  emCatalogo: boolean;
  ganhandoCatalogo: boolean;
  logistica: string | null;
  metricas: MetricasAds;
};

export type MetricasAds = {
  cliques: number;
  impressoes: number;
  investimento: number;
  cpc: number;
  receita: number;
  receitaDireta: number;
  receitaIndireta: number;
  unidades: number;
  unidadesDiretas: number;
  unidadesIndiretas: number;
  unidadesOrganicas: number;
  acos: number;
  ctr: number;
  cvr: number;
  roas: number;
};

const METRICAS = [
  "clicks", "prints", "ctr", "cost", "cpc", "acos", "cvr", "roas",
  "units_quantity", "direct_units_quantity", "indirect_units_quantity", "organic_units_quantity",
  "direct_amount", "indirect_amount", "total_amount",
].join(",");

type MetricasBrutas = Record<string, number | undefined>;

function metricasDe(m: MetricasBrutas = {}): MetricasAds {
  const n = (k: string) => Number(m[k]) || 0;
  return {
    cliques: n("clicks"),
    impressoes: n("prints"),
    investimento: n("cost"),
    cpc: n("cpc"),
    receita: n("total_amount"),
    receitaDireta: n("direct_amount"),
    receitaIndireta: n("indirect_amount"),
    unidades: n("units_quantity"),
    unidadesDiretas: n("direct_units_quantity"),
    unidadesIndiretas: n("indirect_units_quantity"),
    unidadesOrganicas: n("organic_units_quantity"),
    acos: n("acos"),
    ctr: n("ctr"),
    cvr: n("cvr"),
    roas: n("roas"),
  };
}

/** O anunciante da conta. `null` quando a conta não tem publicidade. */
export async function anunciante(conta: Conta): Promise<Anunciante | null> {
  const r = await meliGet<{ advertisers?: { advertiser_id: number; site_id: string; advertiser_name: string }[] }>(
    "/advertising/advertisers?product_id=PADS",
    conta,
    { "api-version": "1" }
  );
  const a = r?.advertisers?.[0];
  return a ? { id: a.advertiser_id, site: a.site_id, nome: a.advertiser_name } : null;
}

async function paginado<T>(
  caminho: string,
  conta: Conta,
  extrair: (corpo: { results?: T[]; paging?: { total?: number } }) => T[]
): Promise<T[]> {
  const saida: T[] = [];
  for (let offset = 0; offset < 5000; offset += 50) {
    const sep = caminho.includes("?") ? "&" : "?";
    const corpo = await meliGet<{ results?: T[]; paging?: { total?: number } }>(
      `${caminho}${sep}limit=50&offset=${offset}`,
      conta,
      { "api-version": API_VERSAO }
    );
    const pagina = extrair(corpo ?? {});
    saida.push(...pagina);
    if (pagina.length < 50) break;
  }
  return saida;
}

export async function campanhas(conta: Conta, adv: Anunciante, de: string, ate: string): Promise<CampanhaAds[]> {
  type Bruta = {
    id: number; name: string; status: string; strategy?: string;
    daily_budget?: number; acos_target?: number; metrics?: MetricasBrutas;
  };
  const lista = await paginado<Bruta>(
    `/marketplace/advertising/${adv.site}/advertisers/${adv.id}/product_ads/campaigns/search` +
      `?date_from=${de}&date_to=${ate}&metrics=${METRICAS}&metrics_summary=true`,
    conta,
    (c) => c.results ?? []
  );
  return lista.map((c) => ({
    id: c.id,
    nome: c.name,
    status: c.status,
    estrategia: c.strategy ?? null,
    orcamentoDiario: c.daily_budget ?? null,
    acosAlvo: c.acos_target ?? null,
    metricas: metricasDe(c.metrics),
  }));
}

export async function anuncios(conta: Conta, adv: Anunciante, de: string, ate: string): Promise<AnuncioAds[]> {
  type Bruto = {
    item_id: string; campaign_id: number; title?: string; price?: number;
    catalog_listing?: boolean; buy_box_winner?: boolean; logistic_type?: string;
    metrics?: MetricasBrutas;
  };
  const lista = await paginado<Bruto>(
    `/marketplace/advertising/${adv.site}/advertisers/${adv.id}/product_ads/ads/search` +
      `?date_from=${de}&date_to=${ate}&metrics=${METRICAS}`,
    conta,
    (c) => c.results ?? []
  );
  return lista.map((a) => ({
    mlb: a.item_id,
    campanhaId: a.campaign_id,
    titulo: a.title ?? "",
    preco: a.price ?? null,
    emCatalogo: Boolean(a.catalog_listing),
    ganhandoCatalogo: Boolean(a.buy_box_winner),
    logistica: a.logistic_type ?? null,
    metricas: metricasDe(a.metrics),
  }));
}

export type ResultadoAds = {
  conta: string;
  periodo: { de: string; ate: string };
  campanhas: number;
  anuncios: number;
  gravados: number;
  investimento: number;
  receita: number;
  acos: number | null;
};

/**
 * Traz a publicidade da conta e grava em `anuncio_ads`.
 *
 * A tabela já existia, alimentada pela planilha, e a chave natural é
 * (operação, anúncio, campanha, início, fim). Rodar duas vezes o mesmo
 * período sobrescreve; rodar período novo acrescenta. É a mesma regra da
 * importação — nenhuma delas soma.
 *
 * Anúncio sem clique nem gasto no período não é gravado: encheria a
 * tabela com centenas de linhas zeradas por execução, e "não gastou" é o
 * que a ausência já diz.
 */
export async function sincronizarAds(
  conta: Conta,
  opcoes: { de: string; ate: string; operacaoId: string; contaCanalId: string }
): Promise<ResultadoAds | null> {
  const adv = await anunciante(conta);
  if (!adv) return null;

  const { de, ate, operacaoId, contaCanalId } = opcoes;
  const [camps, ads] = await Promise.all([
    campanhas(conta, adv, de, ate),
    anuncios(conta, adv, de, ate),
  ]);
  const nomeCampanha = new Map(camps.map((c) => [c.id, c.nome]));

  const sb = clientePrivilegiado();
  const { data: anunciosDb } = await sb
    .from("anuncios")
    .select("id,codigo_externo")
    .eq("conta_canal_id", contaCanalId);
  const idPorMlb = new Map((anunciosDb ?? []).map((a) => [String(a.codigo_externo).toUpperCase(), a.id as string]));

  const comMovimento = ads.filter((a) => a.metricas.investimento > 0 || a.metricas.cliques > 0 || a.metricas.impressoes > 0);
  const linhas = comMovimento.map((a) => ({
    operacao_id: operacaoId,
    anuncio_id: idPorMlb.get(a.mlb.toUpperCase()) ?? null,
    codigo_externo: a.mlb,
    campanha: nomeCampanha.get(a.campanhaId) ?? `Campanha ${a.campanhaId}`,
    inicio: de,
    fim: ate,
    status: null,
    impressoes: Math.round(a.metricas.impressoes),
    cliques: Math.round(a.metricas.cliques),
    investimento: Number(a.metricas.investimento.toFixed(2)),
    receita: Number(a.metricas.receita.toFixed(2)),
    vendas_diretas: Math.round(a.metricas.unidadesDiretas),
    vendas_indiretas: Math.round(a.metricas.unidadesIndiretas),
    receita_direta: Number(a.metricas.receitaDireta.toFixed(2)),
    receita_indireta: Number(a.metricas.receitaIndireta.toFixed(2)),
  }));

  await emLotes(linhas, 300, async (lote) => {
    const { error } = await sb
      .from("anuncio_ads")
      .upsert(lote, { onConflict: "operacao_id,codigo_externo,campanha,inicio,fim" });
    if (error) throw new Error(`Falha ao gravar publicidade: ${error.message}`);
  });

  const investimento = camps.reduce((s, c) => s + c.metricas.investimento, 0);
  const receita = camps.reduce((s, c) => s + c.metricas.receita, 0);

  return {
    conta: adv.nome,
    periodo: { de, ate },
    campanhas: camps.length,
    anuncios: ads.length,
    gravados: linhas.length,
    investimento: Number(investimento.toFixed(2)),
    receita: Number(receita.toFixed(2)),
    acos: receita ? investimento / receita : null,
  };
}
