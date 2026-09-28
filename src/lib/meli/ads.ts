import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { emLotes, r2 } from "@/lib/sync/diarias";
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
  /** Dias de `vendas_diarias` que receberam o gasto de mídia. */
  diasGravados: number;
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
/**
 * Quantos dias para trás o gasto diário é reescrito a cada execução.
 *
 * O canal só fecha o número do dia às 10h, e a atribuição de venda ainda
 * muda depois disso. Reescrever uma semana a cada noite deixa o valor se
 * assentar sozinho. É também o que mantém a rotina longe do período em
 * que o gasto era digitado à mão: em poucos dias a janela passa a cobrir
 * só dias que nasceram pela API.
 */
const DIAS_DIARIOS = 8;

/**
 * Grava o gasto do dia em `vendas_diarias`, que é de onde as telas leem.
 *
 * O `anuncio_ads` guarda a publicidade por anúncio, e serve para saber
 * qual SKU consumiu o quê. Mas nenhuma tela lê essa tabela para compor o
 * gasto do período: a aba semanal, a diária e a de margem leem a coluna
 * `investimento_ads` de `vendas_diarias`.
 *
 * Essa coluna só tinha uma origem: a mão, pela tela de lançamentos. No
 * dia em que a digitação parou — 20/09 — o gasto virou R$ 0 na tela,
 * enquanto a conta seguia gastando duzentos e poucos reais por dia.
 *
 * A API responde por dia, e a soma dos dias bate com a da semana pedida
 * de uma vez, então não há rateio nem estimativa aqui: cada dia recebe o
 * número daquele dia.
 */
async function gravarGastoDiario(
  conta: Conta,
  adv: Anunciante,
  de: string,
  ate: string,
  ctx: { operacaoId: string; contaCanalId: string }
) {
  const dias: string[] = [];
  for (let d = new Date(`${ate}T00:00:00Z`); dias.length < DIAS_DIARIOS; d.setUTCDate(d.getUTCDate() - 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso < de) break;
    dias.push(iso);
  }
  if (!dias.length) return 0;

  const sb = clientePrivilegiado();
  /*
   * O canal_id é preciso só quando o dia ainda não tem linha — dia com
   * mídia e sem venda nenhuma. Com a linha já lá, o upsert atualiza
   * apenas as colunas do payload e o canal_id nem é tocado.
   */
  const { data: contaDb } = await sb
    .from("contas_canal")
    .select("canal_id")
    .eq("id", ctx.contaCanalId)
    .maybeSingle();

  const linhas = [];
  for (const data of dias.reverse()) {
    const camps = await campanhas(conta, adv, data, data);
    linhas.push({
      operacao_id: ctx.operacaoId,
      canal_id: contaDb?.canal_id ?? null,
      conta_canal_id: ctx.contaCanalId,
      data,
      investimento_ads: r2(camps.reduce((t, c) => t + c.metricas.investimento, 0)),
      receita_ads: r2(camps.reduce((t, c) => t + c.metricas.receita, 0)),
    });
  }

  const { error } = await sb
    .from("vendas_diarias")
    .upsert(linhas, { onConflict: "conta_canal_id,data" });
  if (error) throw new Error(`Falha ao gravar gasto diário: ${error.message}`);
  return linhas.length;
}

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

  const diasGravados = await gravarGastoDiario(conta, adv, de, ate, { operacaoId, contaCanalId });

  const investimento = camps.reduce((s, c) => s + c.metricas.investimento, 0);
  const receita = camps.reduce((s, c) => s + c.metricas.receita, 0);

  return {
    conta: adv.nome,
    periodo: { de, ate },
    campanhas: camps.length,
    anuncios: ads.length,
    gravados: linhas.length,
    diasGravados,
    investimento: Number(investimento.toFixed(2)),
    receita: Number(receita.toFixed(2)),
    acos: receita ? investimento / receita : null,
  };
}
