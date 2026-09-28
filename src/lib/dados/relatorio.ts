import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { paginar } from "@/lib/dados/paginar";
import instantaneoBruto from "./instantaneo-meli.json";

/**
 * O relatório da operação, montado inteiro no servidor.
 *
 * Uma função, um objeto de saída. A tela não calcula nada — só mostra,
 * abre e fecha. Quando dois lugares calculam a mesma métrica, eles
 * divergem no primeiro ajuste, e a diretoria vê dois números para a mesma
 * pergunta.
 *
 * As regras de método estão em `docs/agents/inteligencia-de-mercado.md`.
 * Três valem repetir aqui porque o código as aplica direto:
 *
 *  - Visita existe no Mercado Livre. Não existe na Loja própria nem nos
 *    canais de planilha, e onde não existe a conversão vem `null`, nunca
 *    zero.
 *  - Dia em andamento não entra em média. Ele aparece marcado à parte.
 *  - Estoque e posição de catálogo vêm de `instantaneo-meli.json` enquanto
 *    a migração 21 não roda. O arquivo carrega a hora em que foi lido, e a
 *    tela mostra essa hora.
 */

/* ══════════════════════════════════════════════════════════════
   Tipos
   ══════════════════════════════════════════════════════════════ */

export type Variacao = {
  atual: number;
  anterior: number | null;
  media4: number | null;
  melhor: number | null;
  melhorQuando: string | null;
  /** Fração, não porcentagem. `null` quando não há base de comparação. */
  contraAnterior: number | null;
  contraMedia4: number | null;
  contraMelhor: number | null;
};

export type Metricas = {
  receita: Variacao;
  pedidos: Variacao;
  unidades: Variacao;
  ticket: Variacao;
  cancelamento: Variacao;
  /** `null` no canal sem medição de visita. */
  visitas: Variacao | null;
  conversao: Variacao | null;
};

export type BlocoCanal = {
  id: string;
  nome: string;
  canal: string;
  temVisita: boolean;
  metricas: Metricas;
  participacao: number;
  serie: { dia: string; receita: number; pedidos: number; visitas: number | null }[];
};

export type LinhaProduto = {
  sku: string | null;
  mlb: string;
  titulo: string;
  conta: string;
  tipo: string;
  curva: "A" | "B" | "C";
  receita90: number;
  unidades90: number;
  /** Receita e unidades da janela do relatório. */
  receitaPeriodo: number;
  unidadesPeriodo: number;
  precoVitrine: number | null;
  precoVisivel: number | null;
  emCampanha: boolean;
  precoMinimo: number | null;
  melhorPreco: number | null;
  melhorPorDia: number | null;
  melhorPeriodo: string | null;
  melhorAmostraFraca: boolean;
  estoque: number | null;
  situacao: string | null;
  coberturaDias: number | null;
  vendaDia: number;
  visitas: number | null;
  visitasDia: number | null;
  conversao: number | null;
  melhorConversao: number | null;
  custoUnitario: number | null;
  margemUnitaria: number | null;
  catalogo: {
    situacao: string;
    precoParaGanhar: number | null;
    fatiaVisita: string | null;
    alavancasAbertas: string[];
  } | null;
  elegivelForaCatalogo: boolean;
  diasSemVenda: number | null;
};

export type Pendencia = {
  titulo: string;
  detalhe: string;
  impacto: string;
  quem: "eduardo" | "sistema";
};

export type Prioridade = {
  titulo: string;
  numero: string;
  detalhe: string;
  onde: string;
  prazo: "semana" | "longo";
};

export type FonteEstado = {
  fonte: string;
  ate: string | null;
  atrasoDias: number | null;
  situacao: "ok" | "atencao" | "parado" | "ausente";
  detalhe: string;
};

export type Relatorio = {
  geradoEm: string;
  instantaneoEm: string;
  periodo: { de: string; ate: string; dias: number; hoje: string };
  janelas: { anterior: { de: string; ate: string }; media4: string; melhor: string };
  estadoDados: FonteEstado[];
  operacao: Metricas;
  canais: BlocoCanal[];
  produtos: LinhaProduto[];
  catalogo: {
    ganhando: number;
    dividindo: number;
    perdendo: number;
    fora: number;
    elegiveisFora: number;
    consultados: number;
    perdendoLista: { mlb: string; sku: string | null; titulo: string; precoAtual: number | null; precoParaGanhar: number | null; conta: string }[];
    alavancas: { id: string; abertas: number; rotulo: string }[];
  };
  estoque: {
    rupturaCurvaA: LinhaProduto[];
    encerradosCurvaA: LinhaProduto[];
    criticos: LinhaProduto[];
    parados: LinhaProduto[];
    pausados: { conta: string; quantidade: number }[];
  };
  multicanal: {
    dispersao: { sku: string; titulo: string; precos: { canal: string; preco: number }[]; diferenca: number; diferencaPct: number }[];
    migracao: { sku: string; titulo: string; subiu: { canal: string; delta: number }; caiu: { canal: string; delta: number }; somaMudou: number }[];
  };
  financeiro: {
    coberturaCusto: number;
    receitaComCusto: number;
    receitaTotal: number;
    margemApurada: number | null;
    produtosComCusto: number;
    produtosTotal: number;
  };
  trafegoPago: {
    temDado: boolean;
    de: string | null;
    ate: string | null;
    /** O dado cobre a mesma janela do relatório, ou é de outro período. */
    mesmaJanela: boolean;
    investimento: number;
    cliques: number;
    impressoes: number;
    receitaAtribuida: number;
    acos: number | null;
    anunciosNoVermelho: { sku: string | null; mlb: string; investimento: number; receita: number }[];
  };
  alavancas: { alavanca: string; ganho: number; detalhe: string }[];
  metas: {
    mes: string;
    meta: number;
    realizado: number;
    gap: number;
    diasRestantes: number;
    ritmoNecessario: number;
    ritmoAtual: number;
    decomposicao: { alavanca: string; ganho: number; detalhe: string }[];
  } | null;
  prioridades: Prioridade[];
  pendencias: Pendencia[];
  anotacoes: Record<string, string>;
  reputacao: { conta: string; nivel: string | null; categoria: string | null; reclamacoes: number | null; cancelamentos: number | null; perguntas: number | null }[];
};

/* ══════════════════════════════════════════════════════════════
   Ajudantes de data e conta
   ══════════════════════════════════════════════════════════════ */

const DIA = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const maisDias = (data: string, n: number) => iso(new Date(Date.parse(data + "T12:00:00Z") + n * DIA));
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DIA);

/** Hoje em Brasília: o servidor roda em UTC e viraria o dia às 21h. */
function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const divide = (a: number, b: number) => (b ? a / b : 0);
const r2 = (v: number) => Number(v.toFixed(2));
const reaisCurto = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

function variacao(
  atual: number,
  anterior: number | null,
  media4: number | null,
  melhor: { valor: number; quando: string } | null
): Variacao {
  const rel = (base: number | null) => (base != null && base !== 0 ? (atual - base) / base : null);
  return {
    atual: r2(atual),
    anterior: anterior == null ? null : r2(anterior),
    media4: media4 == null ? null : r2(media4),
    melhor: melhor ? r2(melhor.valor) : null,
    melhorQuando: melhor?.quando ?? null,
    contraAnterior: rel(anterior),
    contraMedia4: rel(media4),
    contraMelhor: rel(melhor?.valor ?? null),
  };
}

type Instantaneo = typeof instantaneoBruto;
type AnuncioInstantaneo = Instantaneo["contas"]["principal"]["anuncios"][number] & {
  precoVitrine?: number | null;
  precoVisivel?: number | null;
  campanha?: string | null;
  catalogo?: {
    status: string | null;
    precoParaGanhar: number | null;
    precoAtual: number | null;
    fatiaVisita: string | null;
    dividindoPrimeiro: number | null;
    motivo: string[];
    vencedorPreco: number | null;
    alavancas: { id: string; situacao: string }[];
  };
};

const ROTULO_ALAVANCA: Record<string, string> = {
  fulfillment: "Envios Full",
  free_installments: "Parcelamento sem juros",
  free_shipping: "Frete grátis",
  shipping_collect: "Envio com coleta",
  same_day_shipping: "Envio no mesmo dia",
};

/* ══════════════════════════════════════════════════════════════
   O relatório
   ══════════════════════════════════════════════════════════════ */

export async function montarRelatorio(opcoes: { dias?: number } = {}): Promise<Relatorio> {
  const sb = clientePrivilegiado();
  const hoje = hojeSP();
  const dias = opcoes.dias ?? 7;

  /*
   * A janela termina HOJE, inclusive.
   *
   * O Eduardo pode pedir o relatório numa quarta, e aí o período tem o
   * pedaço da semana corrente. Comparar 7 dias corridos com os 7
   * anteriores mantém o mesmo número de dias da semana em cada lado, que
   * é o que a comparação exige.
   */
  const ate = hoje;
  const de = maisDias(ate, -(dias - 1));
  const anteriorAte = maisDias(de, -1);
  const anteriorDe = maisDias(anteriorAte, -(dias - 1));
  const inicioAno = `${hoje.slice(0, 4)}-01-01`;

  /* ── Leitura ── */
  const [contas, pedidos, itens, visitasItem, anunciosDb, produtos, precosMinimos, metas, anotacoesDb, ads] =
    await Promise.all([
      sb.from("contas_canal").select("id,nome,operacao_id,canal_id,canais(nome,codigo)").then((r) => r.data ?? []),
      paginar<{ id: string; conta_canal_id: string; data: string; total: number; cancelado: boolean }>(() =>
        sb.from("pedidos").select("id,conta_canal_id,data,total,cancelado").gte("data", inicioAno).order("data")
      ),
      paginar<{
        pedido_id: string; codigo_externo: string; sku: string | null; quantidade: number; preco_unitario: number;
      }>(() =>
        sb.from("pedido_itens").select("pedido_id,codigo_externo,sku,quantidade,preco_unitario").order("pedido_id")
      ),
      paginar<{ anuncio_id: string; data: string; visitas: number }>(() =>
        sb.from("anuncio_desempenho_diario").select("anuncio_id,data,visitas").gte("data", maisDias(hoje, -120)).order("data")
      ),
      paginar<{ id: string; codigo_externo: string; titulo: string; tipo: string; conta_canal_id: string; sku_canal: string | null; produto_id: string | null; sincronizado_em: string | null }>(() =>
        sb.from("anuncios").select("id,codigo_externo,titulo,tipo,conta_canal_id,sku_canal,produto_id,sincronizado_em")
      ),
      paginar<{ id: string; sku: string; titulo: string; custo_unitario: number | null; embalagem: number | null; aliquota_impostos: number | null; curva: string | null }>(() =>
        sb.from("produtos").select("id,sku,titulo,custo_unitario,embalagem,aliquota_impostos,curva")
      ),
      paginar<{ chave_tipo: string; chave: string; preco: number; vigente_de: string }>(() =>
        sb.from("formula_base_precos").select("chave_tipo,chave,preco,vigente_de").eq("comissao", 0.045).order("vigente_de", { ascending: false })
      ),
      sb.from("metas").select("ano,mes,receita_meta,canal_id").then((r) => r.data ?? []),
      sb.from("anotacoes").select("entidade_id,texto").eq("entidade", "relatorio").then((r) => r.data ?? []),
      paginar<{ codigo_externo: string; inicio: string; fim: string; investimento: number; cliques: number; impressoes: number; receita: number }>(() =>
        sb.from("anuncio_ads").select("codigo_externo,inicio,fim,investimento,cliques,impressoes,receita").order("fim", { ascending: false })
      ),
    ]);

  const instantaneo = instantaneoBruto as Instantaneo;

  /* ── Índices ── */
  type Conta = { id: string; nome: string; canal: string; codigo: string; temVisita: boolean };
  const contaDe = new Map<string, Conta>();
  for (const c of contas as Record<string, unknown>[]) {
    const canal = Array.isArray(c.canais) ? c.canais[0] : c.canais;
    const nomeCanal = String((canal as { nome?: string })?.nome ?? "");
    const codigo = String((canal as { codigo?: string })?.codigo ?? "");
    contaDe.set(String(c.id), {
      id: String(c.id),
      nome: String(c.nome),
      canal: nomeCanal,
      codigo,
      // Só o Mercado Livre entrega visita por anúncio hoje.
      temVisita: codigo === "mercado_livre",
    });
  }

  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]));
  const anuncioPorId = new Map(anunciosDb.map((a) => [a.id, a]));
  const anuncioPorCodigo = new Map(anunciosDb.map((a) => [String(a.codigo_externo).toUpperCase(), a]));
  const produtoPorSku = new Map(produtos.map((p) => [String(p.sku).toUpperCase(), p]));
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));

  /** Preço mínimo da Fórmula base vigente, por SKU e por MLB. */
  const minimoPorChave = new Map<string, number>();
  for (const p of precosMinimos) {
    const k = `${p.chave_tipo}:${String(p.chave).toUpperCase()}`;
    if (!minimoPorChave.has(k)) minimoPorChave.set(k, Number(p.preco));
  }
  const minimoDe = (sku: string | null, mlb: string) =>
    minimoPorChave.get(`sku:${String(sku ?? "").toUpperCase()}`) ??
    minimoPorChave.get(`mlb:${mlb.toUpperCase()}`) ??
    null;

  /** Instantâneo por MLB, das duas contas. */
  const instPorMlb = new Map<string, AnuncioInstantaneo & { contaNome: string }>();
  for (const [, dados] of Object.entries(instantaneo.contas)) {
    for (const a of dados.anuncios as AnuncioInstantaneo[]) {
      instPorMlb.set(a.mlb.toUpperCase(), { ...a, contaNome: dados.nome });
    }
  }

  /* ── Itens por pedido, com data e conta ── */
  type Venda = { data: string; conta: string; mlb: string; sku: string | null; q: number; preco: number; cancelado: boolean };
  const vendas: Venda[] = [];
  for (const it of itens) {
    const p = pedidoPorId.get(it.pedido_id);
    if (!p) continue;
    vendas.push({
      data: String(p.data).slice(0, 10),
      conta: p.conta_canal_id,
      mlb: String(it.codigo_externo).toUpperCase(),
      sku: it.sku ? String(it.sku).toUpperCase() : null,
      q: Number(it.quantidade) || 0,
      preco: Number(it.preco_unitario) || 0,
      cancelado: p.cancelado,
    });
  }

  /* ── Visitas por conta e por dia ──
   *
   * Duas fontes: o instantâneo traz visita da CONTA (o total que o canal
   * informa, 60 dias) e `anuncio_desempenho_diario` traz por anúncio. A
   * conta usa a primeira, que é a verdade do canal; o produto usa a
   * segunda, que é a única com grão de anúncio.
   */
  const visitaContaPorDia = new Map<string, Map<string, number>>();
  const idPorSeller = new Map<number, string>();
  for (const c of contaDe.values()) {
    const inst = Object.values(instantaneo.contas).find((x) => x.nome === c.nome);
    if (inst) idPorSeller.set(inst.seller, c.id);
  }
  for (const [, dados] of Object.entries(instantaneo.contas)) {
    const contaId = idPorSeller.get(dados.seller);
    if (!contaId) continue;
    const m = new Map<string, number>();
    for (const v of dados.visitasConta) m.set(v.dia, (m.get(v.dia) ?? 0) + v.total);
    visitaContaPorDia.set(contaId, m);
  }

  const visitaAnuncioPorDia = new Map<string, Map<string, number>>();
  for (const v of visitasItem) {
    const a = anuncioPorId.get(v.anuncio_id);
    if (!a) continue;
    const k = String(a.codigo_externo).toUpperCase();
    const m = visitaAnuncioPorDia.get(k) ?? new Map<string, number>();
    m.set(v.data, (m.get(v.data) ?? 0) + (Number(v.visitas) || 0));
    visitaAnuncioPorDia.set(k, m);
  }

  /* ══ Métricas de um recorte de conta e janela ══ */
  function metricasDe(contasAlvo: Set<string> | null, ini: string, fim: string) {
    const ped = pedidos.filter((p) => (!contasAlvo || contasAlvo.has(p.conta_canal_id)) && p.data >= ini && p.data <= fim);
    const validos = ped.filter((p) => !p.cancelado);
    const receita = soma(validos.map((p) => Number(p.total) || 0));
    const cancelados = ped.filter((p) => p.cancelado);
    const un = soma(
      vendas.filter((v) => !v.cancelado && (!contasAlvo || contasAlvo.has(v.conta)) && v.data >= ini && v.data <= fim).map((v) => v.q)
    );
    let visitas: number | null = null;
    const contasComVisita = new Set<string>();
    for (const [contaId, m] of visitaContaPorDia) {
      if (contasAlvo && !contasAlvo.has(contaId)) continue;
      contasComVisita.add(contaId);
      for (const [d, n] of m) if (d >= ini && d <= fim) visitas = (visitas ?? 0) + n;
    }

    /*
     * Conversão só conta a venda de quem tem visita medida.
     *
     * Somar as unidades dos oito canais e dividir pelas visitas das duas
     * contas do Mercado Livre daria uma conversão inventada — e alta, já
     * que a Loja própria faz 88% da receita e não mede visita. O
     * denominador manda no numerador.
     */
    const unidadesComVisita = soma(
      vendas
        .filter((v) => !v.cancelado && contasComVisita.has(v.conta) && v.data >= ini && v.data <= fim)
        .map((v) => v.q)
    );

    return {
      receita,
      pedidos: validos.length,
      unidades: un,
      ticket: divide(receita, validos.length),
      cancelamento: divide(cancelados.length, ped.length),
      visitas,
      conversao: visitas ? divide(unidadesComVisita, visitas) : null,
    };
  }

  /** As 52 semanas do ano, para achar a melhor. */
  function semanasDoAno(contasAlvo: Set<string> | null) {
    const out: { de: string; ate: string; m: ReturnType<typeof metricasDe> }[] = [];
    for (let fim = maisDias(ate, -dias); fim >= inicioAno; fim = maisDias(fim, -dias)) {
      const ini = maisDias(fim, -(dias - 1));
      if (ini < inicioAno) break;
      out.push({ de: ini, ate: fim, m: metricasDe(contasAlvo, ini, fim) });
    }
    return out;
  }

  function montarMetricas(contasAlvo: Set<string> | null, temVisita: boolean): Metricas {
    const atual = metricasDe(contasAlvo, de, ate);
    const anterior = metricasDe(contasAlvo, anteriorDe, anteriorAte);
    const semanas = semanasDoAno(contasAlvo);
    const quatro = semanas.slice(0, 4);
    const media = (f: (m: ReturnType<typeof metricasDe>) => number | null) => {
      const vs = quatro.map((s) => f(s.m)).filter((v): v is number => v != null);
      return vs.length ? soma(vs) / vs.length : null;
    };
    const melhorDe = (f: (m: ReturnType<typeof metricasDe>) => number | null) => {
      let best: { valor: number; quando: string } | null = null;
      for (const s of semanas) {
        const v = f(s.m);
        if (v == null) continue;
        if (!best || v > best.valor) best = { valor: v, quando: `${s.de.slice(8)}/${s.de.slice(5, 7)} a ${s.ate.slice(8)}/${s.ate.slice(5, 7)}` };
      }
      return best;
    };

    const campo = <K extends keyof ReturnType<typeof metricasDe>>(k: K) =>
      variacao(Number(atual[k] ?? 0), anterior[k] == null ? null : Number(anterior[k]), media((m) => m[k] as number | null), melhorDe((m) => m[k] as number | null));

    return {
      receita: campo("receita"),
      pedidos: campo("pedidos"),
      unidades: campo("unidades"),
      ticket: campo("ticket"),
      // Cancelamento: menor é melhor, então "melhor" aqui é o MENOR.
      cancelamento: (() => {
        const v = campo("cancelamento");
        let best: { valor: number; quando: string } | null = null;
        for (const s of semanas) {
          if (!s.m.pedidos) continue;
          if (!best || s.m.cancelamento < best.valor) best = { valor: s.m.cancelamento, quando: `${s.de.slice(8)}/${s.de.slice(5, 7)}` };
        }
        return { ...v, melhor: best ? r2(best.valor) : null, melhorQuando: best?.quando ?? null, contraMelhor: best && best.valor ? (v.atual - best.valor) / best.valor : null };
      })(),
      visitas: temVisita ? campo("visitas") : null,
      conversao: temVisita ? campo("conversao") : null,
    };
  }

  const operacao = montarMetricas(null, true);

  /* ══ Canais ══ */
  const canais: BlocoCanal[] = [];
  for (const c of contaDe.values()) {
    const alvo = new Set([c.id]);
    const m = montarMetricas(alvo, c.temVisita);
    if (!m.receita.atual && !m.pedidos.atual && !m.receita.media4) continue;
    const serie: BlocoCanal["serie"] = [];
    for (let d = de; d <= ate; d = maisDias(d, 1)) {
      const dia = metricasDe(alvo, d, d);
      serie.push({ dia: d, receita: r2(dia.receita), pedidos: dia.pedidos, visitas: c.temVisita ? dia.visitas : null });
    }
    canais.push({
      id: c.id,
      nome: c.nome === "Conta principal" ? c.canal : `${c.canal} · ${c.nome}`,
      canal: c.canal,
      temVisita: c.temVisita,
      metricas: m,
      participacao: divide(m.receita.atual, operacao.receita.atual),
      serie,
    });
  }
  canais.sort((a, b) => b.metricas.receita.atual - a.metricas.receita.atual);

  /* ══ Produtos: curva, preço, estoque, catálogo ══ */
  const noventa = maisDias(hoje, -89);
  type Agregado = { receita90: number; unidades90: number; receitaPeriodo: number; unidadesPeriodo: number; porPreco: Map<number, { q: number; primeira: string; ultima: string }>; ultimaVenda: string | null };
  const porMlb = new Map<string, Agregado>();
  for (const v of vendas) {
    if (v.cancelado) continue;
    const a = porMlb.get(v.mlb) ?? { receita90: 0, unidades90: 0, receitaPeriodo: 0, unidadesPeriodo: 0, porPreco: new Map(), ultimaVenda: null };
    if (v.data >= noventa) { a.receita90 += v.q * v.preco; a.unidades90 += v.q; }
    if (v.data >= de && v.data <= ate) { a.receitaPeriodo += v.q * v.preco; a.unidadesPeriodo += v.q; }
    const p = Math.round(v.preco * 100) / 100;
    const g = a.porPreco.get(p) ?? { q: 0, primeira: v.data, ultima: v.data };
    g.q += v.q;
    if (v.data < g.primeira) g.primeira = v.data;
    if (v.data > g.ultima) g.ultima = v.data;
    a.porPreco.set(p, g);
    if (!a.ultimaVenda || v.data > a.ultimaVenda) a.ultimaVenda = v.data;
    porMlb.set(v.mlb, a);
  }

  const linhas: LinhaProduto[] = [];
  for (const [mlb, a] of porMlb) {
    const anuncio = anuncioPorCodigo.get(mlb);
    const inst = instPorMlb.get(mlb);
    const contaId = anuncio?.conta_canal_id;
    const conta = contaId ? contaDe.get(contaId) : null;
    const sku =
      (anuncio?.produto_id ? produtoPorId.get(anuncio.produto_id)?.sku : null) ??
      anuncio?.sku_canal ??
      inst?.sku ??
      vendas.find((v) => v.mlb === mlb && v.sku)?.sku ??
      null;
    const skuU = sku ? String(sku).toUpperCase() : null;
    const produto = skuU ? produtoPorSku.get(skuU) : undefined;

    /* Melhor preço: velocidade, e nunca em cima de uma venda só. */
    const grupos = [...a.porPreco.entries()].map(([preco, g]) => {
      const d = Math.max(1, diasEntre(g.primeira, g.ultima) + 1);
      return { preco, q: g.q, porDia: g.q / d, primeira: g.primeira, ultima: g.ultima };
    });
    const firmes = grupos.filter((g) => g.q >= 2).sort((x, y) => y.porDia - x.porDia);
    const melhor = firmes[0] ?? [...grupos].sort((x, y) => y.q - x.q)[0] ?? null;

    /*
     * Venda por dia da janela, e cobertura de estoque.
     *
     * Anúncio que vendeu no ano mas não aparece no instantâneo foi
     * ENCERRADO no canal. Não é estoque zero nem falta de leitura: a
     * receita dele existiu e o anúncio não existe mais. Sem esta
     * distinção, encerrado entra na lista de ruptura e manda repor
     * estoque de um anúncio que ninguém pode comprar.
     */
    const vendaDia = a.unidadesPeriodo / dias;
    const situacao = inst?.situacao ?? "encerrado";
    const estoque = inst ? inst.estoque : null;
    const cobertura = estoque != null && vendaDia > 0 ? estoque / vendaDia : null;

    const visitasJanela = (() => {
      const m = visitaAnuncioPorDia.get(mlb);
      if (!m) return null;
      let t = 0, achou = false;
      for (const [d, n] of m) if (d >= de && d <= ate) { t += n; achou = true; }
      return achou ? t : null;
    })();

    const melhorConversao = (() => {
      const m = visitaAnuncioPorDia.get(mlb);
      if (!m || !melhor) return null;
      let vis = 0;
      for (const [d, n] of m) if (d >= melhor.primeira && d <= melhor.ultima) vis += n;
      return vis >= 30 ? melhor.q / vis : null;
    })();

    const custo = produto?.custo_unitario != null ? Number(produto.custo_unitario) : null;
    const precoVisivel = inst?.precoVisivel ?? inst?.precoVitrine ?? null;
    const margem = custo != null && precoVisivel != null
      ? precoVisivel - custo - precoVisivel * Number(produto?.aliquota_impostos ?? 0) - Number(produto?.embalagem ?? 0)
      : null;

    linhas.push({
      sku: skuU,
      mlb,
      titulo: inst?.titulo ?? anuncio?.titulo ?? produto?.titulo ?? mlb,
      conta: conta ? (conta.nome === "Conta principal" ? conta.canal : `${conta.canal} · ${conta.nome}`) : "—",
      tipo: inst?.tipo ?? (anuncio?.tipo === "premium" ? "Premium" : anuncio?.tipo === "classico" ? "Clássico" : "—"),
      curva: "C",
      receita90: r2(a.receita90),
      unidades90: a.unidades90,
      receitaPeriodo: r2(a.receitaPeriodo),
      unidadesPeriodo: a.unidadesPeriodo,
      precoVitrine: inst?.precoVitrine ?? null,
      precoVisivel,
      emCampanha: Boolean(inst?.campanha),
      precoMinimo: minimoDe(skuU, mlb),
      melhorPreco: melhor?.preco ?? null,
      melhorPorDia: melhor ? r2(melhor.porDia) : null,
      melhorPeriodo: melhor ? `${melhor.primeira.slice(8)}/${melhor.primeira.slice(5, 7)} a ${melhor.ultima.slice(8)}/${melhor.ultima.slice(5, 7)}` : null,
      melhorAmostraFraca: !firmes.length,
      estoque,
      situacao,
      coberturaDias: cobertura == null ? null : Math.round(cobertura),
      vendaDia: r2(vendaDia),
      visitas: visitasJanela,
      visitasDia: visitasJanela == null ? null : r2(visitasJanela / dias),
      conversao: visitasJanela ? divide(a.unidadesPeriodo, visitasJanela) : null,
      melhorConversao,
      custoUnitario: custo,
      margemUnitaria: margem == null ? null : r2(margem),
      catalogo: inst?.catalogo?.status
        ? {
            situacao: inst.catalogo.status,
            precoParaGanhar: inst.catalogo.precoParaGanhar,
            fatiaVisita: inst.catalogo.fatiaVisita,
            alavancasAbertas: (inst.catalogo.alavancas ?? []).filter((x) => x.situacao === "opportunity").map((x) => ROTULO_ALAVANCA[x.id] ?? x.id),
          }
        : null,
      elegivelForaCatalogo: Boolean(inst?.elegivelCatalogo && !inst?.emCatalogo),
      diasSemVenda: a.ultimaVenda ? diasEntre(a.ultimaVenda, hoje) : null,
    });
  }

  /* Curva ABC por receita de 90 dias, dentro da operação. */
  linhas.sort((x, y) => y.receita90 - x.receita90);
  const totalReceita90 = soma(linhas.map((l) => l.receita90));
  let acumulado = 0;
  for (const l of linhas) {
    acumulado += l.receita90;
    const p = divide(acumulado, totalReceita90);
    l.curva = p <= 0.8 ? "A" : p <= 0.95 ? "B" : "C";
  }

  /* ══ Catálogo ══ */
  const comCatalogo = linhas.filter((l) => l.catalogo);
  const contaSituacao = (s: string) => comCatalogo.filter((l) => l.catalogo!.situacao === s).length;
  const alavancasAbertas = new Map<string, number>();
  for (const l of comCatalogo) for (const a of l.catalogo!.alavancasAbertas) alavancasAbertas.set(a, (alavancasAbertas.get(a) ?? 0) + 1);

  /* ══ Estoque ══ */
  const rupturaCurvaA = linhas.filter((l) => l.curva === "A" && (l.estoque === 0 || l.situacao === "paused"));
  /*
   * Encerrado só interessa enquanto a venda é recente.
   *
   * Anúncio fechado há meses que vendeu em julho não é decisão desta
   * semana — e havia 146 assim, o que afogava a lista. Com corte de 30
   * dias sobra o que ainda dá para republicar aproveitando a demanda.
   */
  const encerradosCurvaA = linhas.filter(
    (l) => l.curva === "A" && l.situacao === "encerrado" && (l.diasSemVenda ?? 999) <= 30
  );
  const criticos = linhas.filter((l) => l.coberturaDias != null && l.coberturaDias <= 14 && l.estoque! > 0);
  const parados = linhas.filter((l) => l.curva !== "C" && (l.diasSemVenda ?? 0) >= 14 && (l.estoque ?? 0) > 0);
  const pausados = Object.values(instantaneo.contas).map((c) => ({
    conta: c.nome,
    quantidade: c.anuncios.filter((a) => a.situacao === "paused").length,
  }));

  /* ══ Multicanal ══ */
  const porSkuCanal = new Map<string, Map<string, { receita: number; unidades: number; unidadesAnterior: number; preco: number | null; titulo: string }>>();
  for (const l of linhas) {
    if (!l.sku) continue;
    const m = porSkuCanal.get(l.sku) ?? new Map();
    const atual = m.get(l.conta) ?? { receita: 0, unidades: 0, unidadesAnterior: 0, preco: null, titulo: l.titulo };
    atual.receita += l.receitaPeriodo;
    atual.unidades += l.unidadesPeriodo;
    if (l.precoVisivel != null) atual.preco = atual.preco == null ? l.precoVisivel : Math.min(atual.preco, l.precoVisivel);
    m.set(l.conta, atual);
    porSkuCanal.set(l.sku, m);
  }
  /* Unidades da janela anterior, para ver migração. */
  const anteriorPorSkuCanal = new Map<string, Map<string, number>>();
  for (const v of vendas) {
    if (v.cancelado || v.data < anteriorDe || v.data > anteriorAte) continue;
    const anuncio = anuncioPorCodigo.get(v.mlb);
    const conta = anuncio ? contaDe.get(anuncio.conta_canal_id) : null;
    const sku = v.sku ?? (anuncio?.sku_canal ? String(anuncio.sku_canal).toUpperCase() : null);
    if (!sku || !conta) continue;
    const nome = conta.nome === "Conta principal" ? conta.canal : `${conta.canal} · ${conta.nome}`;
    const m = anteriorPorSkuCanal.get(sku) ?? new Map<string, number>();
    m.set(nome, (m.get(nome) ?? 0) + v.q);
    anteriorPorSkuCanal.set(sku, m);
  }

  const dispersao: Relatorio["multicanal"]["dispersao"] = [];
  for (const [sku, canaisDoSku] of porSkuCanal) {
    const precos = [...canaisDoSku.entries()]
      .filter(([, v]) => v.preco != null)
      .map(([canal, v]) => ({ canal, preco: v.preco as number }));
    if (precos.length < 2) continue;
    const min = Math.min(...precos.map((p) => p.preco));
    const max = Math.max(...precos.map((p) => p.preco));
    if (max - min < 0.5) continue;
    dispersao.push({
      sku,
      titulo: [...canaisDoSku.values()][0].titulo,
      precos: precos.sort((a, b) => a.preco - b.preco),
      diferenca: r2(max - min),
      diferencaPct: divide(max - min, min),
    });
  }
  dispersao.sort((a, b) => b.diferencaPct - a.diferencaPct);

  const migracao: Relatorio["multicanal"]["migracao"] = [];
  for (const [sku, canaisDoSku] of porSkuCanal) {
    const antes = anteriorPorSkuCanal.get(sku) ?? new Map<string, number>();
    const deltas = [...new Set([...canaisDoSku.keys(), ...antes.keys()])].map((canal) => ({
      canal,
      delta: (canaisDoSku.get(canal)?.unidades ?? 0) - (antes.get(canal) ?? 0),
    }));
    const subiu = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    const caiu = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta)[0];
    if (!subiu || !caiu) continue;
    migracao.push({
      sku,
      titulo: [...canaisDoSku.values()][0].titulo,
      subiu,
      caiu,
      somaMudou: soma(deltas.map((d) => d.delta)),
    });
  }
  migracao.sort((a, b) => b.subiu.delta - a.subiu.delta);

  /* ══ Financeiro: cobertura de custo ══ */
  const receitaJanela = soma(linhas.map((l) => l.receitaPeriodo));
  const receitaComCusto = soma(linhas.filter((l) => l.custoUnitario != null).map((l) => l.receitaPeriodo));
  const produtosComCusto = produtos.filter((p) => Number(p.custo_unitario) > 0).length;

  /* ══ Metas do mês ══ */
  const mesAtual = Number(hoje.slice(5, 7));
  const anoAtual = Number(hoje.slice(0, 4));
  const metasMes = (metas as { ano: number; mes: number; receita_meta: number }[]).filter((m) => m.ano === anoAtual && m.mes === mesAtual);
  const metaTotal = soma(metasMes.map((m) => Number(m.receita_meta) || 0));
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const realizadoMes = metricasDe(null, inicioMes, hoje).receita;
  const diasNoMes = new Date(anoAtual, mesAtual, 0).getDate();
  const diasCorridos = Number(hoje.slice(8, 10));
  const diasRestantes = Math.max(1, diasNoMes - diasCorridos);
  const gap = metaTotal - realizadoMes;

  /* Decomposição do gap nas três alavancas, com os números da janela. */
  const at = metricasDe(null, de, ate);
  const conversaoAtual = at.conversao ?? 0;
  const melhorConversaoOperacao = (() => {
    const cs = semanasDoAno(null).map((s) => s.m.conversao).filter((v): v is number => v != null && v > 0);
    return cs.length ? Math.max(...cs) : null;
  })();
  const decomposicao: { alavanca: string; ganho: number; detalhe: string }[] = [];
  {
    if (melhorConversaoOperacao && conversaoAtual && melhorConversaoOperacao > conversaoAtual && at.visitas) {
      const ganhoUnidades = at.visitas * (melhorConversaoOperacao - conversaoAtual);
      decomposicao.push({
        alavanca: "Voltar à melhor conversão do ano",
        ganho: r2(ganhoUnidades * at.ticket * (30 / dias)),
        detalhe: `conversão de ${(conversaoAtual * 100).toFixed(2)}% para ${(melhorConversaoOperacao * 100).toFixed(2)}%, com as visitas de hoje`,
      });
    }
    const receitaPerdidaRuptura = soma(rupturaCurvaA.map((l) => (l.receita90 / 90) * 30));
    if (receitaPerdidaRuptura > 0) {
      decomposicao.push({
        alavanca: "Repor o que está em ruptura na curva A",
        ganho: r2(receitaPerdidaRuptura),
        detalhe: `${rupturaCurvaA.length} anúncios sem estoque ou pausados, no ritmo que vendiam em 90 dias`,
      });
    }
    const ganhoCatalogo = soma(
      comCatalogo
        .filter((l) => l.catalogo!.situacao !== "winning" && l.receita90 > 0)
        .map((l) => (l.receita90 / 90) * 30 * 0.3)
    );
    if (ganhoCatalogo > 0) {
      decomposicao.push({
        alavanca: "Recuperar posição de catálogo",
        ganho: r2(ganhoCatalogo),
        detalhe: "estimativa conservadora de 30% sobre o ritmo atual dos anúncios que não estão ganhando a página",
      });
    }
  }

  /* ══ Tráfego pago ══
   *
   * O Product Ads entra por planilha e a última importação foi de um
   * período fechado — por isso o bloco mostra ATÉ QUANDO o dado vai, em
   * vez de fingir que é da janela do relatório. Google Ads do site não
   * existe no banco; a pendência diz isso.
   */
  /*
   * Prefere a linha que cobre EXATAMENTE a janela do relatório.
   *
   * A mesma campanha é gravada em janelas diferentes — a do relatório e a
   * dos últimos 60 dias, por exemplo. Misturar as duas somaria o mesmo
   * gasto duas vezes; pegar a mais recente por data de fim traria o
   * período longo e diria que é da semana.
   */
  const daJanela = ads.filter((a) => a.inicio === de && a.fim === ate);
  const ultimoFimAds = daJanela.length ? ate : ads.length ? ads.map((a) => a.fim).sort().at(-1)! : null;
  const adsUltimoPeriodo = daJanela.length
    ? daJanela
    : ultimoFimAds
      ? ads.filter((a) => a.fim === ultimoFimAds)
      : [];
  const adsInicio = adsUltimoPeriodo.length ? adsUltimoPeriodo[0].inicio : null;
  const investimentoAds = soma(adsUltimoPeriodo.map((a) => Number(a.investimento) || 0));
  const receitaAds = soma(adsUltimoPeriodo.map((a) => Number(a.receita) || 0));
  const porAnuncioAds = new Map<string, { investimento: number; receita: number }>();
  for (const a of adsUltimoPeriodo) {
    const k = String(a.codigo_externo).toUpperCase();
    const v = porAnuncioAds.get(k) ?? { investimento: 0, receita: 0 };
    v.investimento += Number(a.investimento) || 0;
    v.receita += Number(a.receita) || 0;
    porAnuncioAds.set(k, v);
  }
  const trafegoPago = {
    temDado: adsUltimoPeriodo.length > 0,
    de: adsInicio,
    ate: ultimoFimAds,
    mesmaJanela: daJanela.length > 0,
    investimento: r2(investimentoAds),
    cliques: soma(adsUltimoPeriodo.map((a) => Number(a.cliques) || 0)),
    impressoes: soma(adsUltimoPeriodo.map((a) => Number(a.impressoes) || 0)),
    receitaAtribuida: r2(receitaAds),
    acos: receitaAds ? divide(investimentoAds, receitaAds) : null,
    anunciosNoVermelho: [...porAnuncioAds.entries()]
      /* Metade da receita atribuída em mídia já é caro; sem receita
         atribuída nenhuma, é dinheiro sem retorno medido. */
      .filter(([, v]) => v.investimento > 20 && (v.receita === 0 || v.investimento > v.receita * 0.5))
      .sort((a, b) => b[1].investimento - a[1].investimento)
      .slice(0, 8)
      .map(([mlb, v]) => ({ mlb, sku: anuncioPorCodigo.get(mlb)?.sku_canal ?? null, investimento: r2(v.investimento), receita: r2(v.receita) })),
  };

  /* ══ Prioridades ══ */
  const prioridades: Prioridade[] = [];
  if (rupturaCurvaA.length) {
    prioridades.push({
      titulo: "Repor estoque da curva A",
      numero: `${rupturaCurvaA.length} anúncios · ${reaisCurto(soma(rupturaCurvaA.map((l) => l.receita90)))} em 90 dias`,
      detalhe: rupturaCurvaA.slice(0, 5).map((l) => `${l.sku ?? l.mlb} (${l.conta})`).join(", "),
      onde: "Estoque",
      prazo: "semana",
    });
  }
  const abaixoMinimo = linhas.filter((l) => l.precoMinimo != null && l.precoVisivel != null && l.precoVisivel < l.precoMinimo * 0.99 && l.curva !== "C");
  if (abaixoMinimo.length) {
    prioridades.push({
      titulo: "Corrigir preço abaixo do mínimo",
      numero: `${abaixoMinimo.length} anúncios`,
      detalhe: abaixoMinimo.slice(0, 5).map((l) => `${l.sku ?? l.mlb}: R$ ${l.precoVisivel?.toFixed(2)} contra mínimo de R$ ${l.precoMinimo?.toFixed(2)}`).join(" · "),
      onde: "Preço",
      prazo: "semana",
    });
  }
  const elegiveis = linhas.filter((l) => l.elegivelForaCatalogo);
  if (elegiveis.length) {
    prioridades.push({
      titulo: "Inscrever no catálogo quem é elegível e está fora",
      numero: `${elegiveis.length} anúncios`,
      detalhe: elegiveis.slice(0, 5).map((l) => l.sku ?? l.mlb).join(", "),
      onde: "Catálogo",
      prazo: "semana",
    });
  }
  if (encerradosCurvaA.length) {
    prioridades.push({
      titulo: "Anúncios encerrados que faturavam",
      numero: `${encerradosCurvaA.length} anúncios · ${reaisCurto(soma(encerradosCurvaA.map((l) => l.receita90)))} em 90 dias`,
      detalhe: "Venderam nos últimos 90 dias e não existem mais no canal. Republicar recupera histórico de posição; deixar assim, não.",
      onde: "Estoque",
      prazo: "longo",
    });
  }

  const totalPausados = soma(pausados.map((p) => p.quantidade));
  if (totalPausados) {
    prioridades.push({
      titulo: "Revisar anúncios pausados",
      numero: `${totalPausados} pausados`,
      detalhe: pausados.map((p) => `${p.conta}: ${p.quantidade}`).join(" · "),
      onde: "Catálogo",
      prazo: "longo",
    });
  }
  if (produtosComCusto < produtos.length) {
    prioridades.push({
      titulo: "Cadastrar custo do restante dos produtos",
      numero: `${produtos.length - produtosComCusto} de ${produtos.length} sem custo`,
      detalhe: `Com custo, a margem cobre ${(divide(receitaComCusto, receitaJanela) * 100).toFixed(0)}% da receita da janela`,
      onde: "Financeiro",
      prazo: "longo",
    });
  }
  const caros = linhas.filter((l) => l.curva !== "C" && l.melhorPreco != null && l.precoVisivel != null && l.precoVisivel > l.melhorPreco * 1.1 && !l.melhorAmostraFraca);
  if (caros.length) {
    prioridades.push({
      titulo: "Rever preço acima do que mais vendeu",
      numero: `${caros.length} anúncios de curva A e B`,
      detalhe: caros.slice(0, 5).map((l) => `${l.sku ?? l.mlb}: R$ ${l.precoVisivel?.toFixed(0)} contra R$ ${l.melhorPreco?.toFixed(0)}`).join(" · "),
      onde: "Preço",
      prazo: "semana",
    });
  }

  /* ══ Estado dos dados ══ */
  const ultimaSincronizacao = anunciosDb.reduce<string | null>((max, a) => (a.sincronizado_em && (!max || a.sincronizado_em > max) ? a.sincronizado_em : max), null);
  const ultimoPedido = pedidos.length ? pedidos[pedidos.length - 1].data : null;
  const ultimaVisita = visitasItem.length ? visitasItem[visitasItem.length - 1].data : null;
  const estado = (fonte: string, ateData: string | null, detalhe: string): FonteEstado => {
    const atraso = ateData ? diasEntre(ateData, hoje) : null;
    return {
      fonte,
      ate: ateData,
      atrasoDias: atraso,
      situacao: ateData == null ? "ausente" : atraso! <= 1 ? "ok" : atraso! <= 3 ? "atencao" : "parado",
      detalhe,
    };
  };
  const estadoDados: FonteEstado[] = [
    estado("Pedidos do Mercado Livre", ultimoPedido, "API, as duas contas"),
    estado("Visitas por anúncio", ultimaVisita, "API do Mercado Livre; começou em 06/08/2026"),
    estado("Estoque e catálogo", instantaneo.geradoEm.slice(0, 10), `instantâneo de ${new Date(instantaneo.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`),
    estado("Loja própria (VTEX)", pedidos.filter((p) => contaDe.get(p.conta_canal_id)?.codigo === "vtex").at(-1)?.data ?? null, "API da VTEX, só pedido pago"),
    {
      fonte: "Sincronização do catálogo",
      ate: ultimaSincronizacao ? ultimaSincronizacao.slice(0, 10) : null,
      atrasoDias: ultimaSincronizacao ? diasEntre(ultimaSincronizacao.slice(0, 10), hoje) : null,
      situacao: ultimaSincronizacao && diasEntre(ultimaSincronizacao.slice(0, 10), hoje) <= 1 ? "ok" : "atencao",
      detalhe: "manual, do computador do Eduardo — o agendamento não está ligado",
    },
  ];

  /* ══ Pendências ══ */
  const pendencias: Pendencia[] = [
    {
      titulo: "Visitas da Loja própria não existem",
      detalhe: "A VTEX não está conectada ao Analytics, então não há sessão nem visita da loja.",
      impacto: "Conversão e taxa de abandono da Loja própria ficam sem medição. Receita e pedido estão completos.",
      quem: "eduardo",
    },
    {
      titulo: "Sincronização automática desligada",
      detalhe: "Falta CRON_SECRET, MELI_APP_ID, MELI_CLIENT_SECRET e a autorização nova na Vercel.",
      impacto: "Hoje os dados só entram quando rodo à mão. Sem isso o relatório envelhece sozinho.",
      quem: "eduardo",
    },
    {
      titulo: `Custo cadastrado em ${produtosComCusto} de ${produtos.length} produtos`,
      detalhe: "Os 8 primeiros saíram do relatório de rentabilidade por anúncio. Falta o resto, e falta embalagem em todos.",
      impacto: `A margem cobre ${(divide(receitaComCusto, receitaJanela) * 100).toFixed(0)}% da receita da janela. Resultado por produto fica parcial.`,
      quem: "eduardo",
    },
    {
      titulo: "Migração 21 não rodada",
      detalhe: "Cria estoque no anúncio, série de catálogo, frete detalhado e a tabela de mídia externa.",
      impacto: "Estoque e catálogo vêm de instantâneo em arquivo, não do banco, e não têm série histórica.",
      quem: "eduardo",
    },
    {
      titulo: "Mídia do Google Ads não entra",
      detalhe: "Não há tabela nem tela para a mídia do site. O Product Ads do Mercado Livre já vem por API, anúncio por anúncio.",
      impacto: "A leitura de tráfego pago cobre o Mercado Livre e deixa de fora a mídia que leva gente à Loja própria, que é 88% da receita.",
      quem: "eduardo",
    },
    {
      titulo: "Pedidos da Vtrina só por exportação manual",
      detalhe: "A API configurada da Vtrina só tem produto e catálogo; o token está criptografado para outro perfil do Windows.",
      impacto: "Casas Bahia, Magalu, Madeira Madeira e WebContinental entram por arquivo, e só até a data da última exportação.",
      quem: "eduardo",
    },
  ];

  /* ══ Anotações salvas ══ */
  const anotacoes: Record<string, string> = {};
  for (const a of anotacoesDb as { entidade_id: string; texto: string }[]) anotacoes[a.entidade_id] = a.texto;

  return {
    geradoEm: new Date().toISOString(),
    instantaneoEm: instantaneo.geradoEm,
    periodo: { de, ate, dias, hoje },
    janelas: {
      anterior: { de: anteriorDe, ate: anteriorAte },
      media4: "média das 4 janelas anteriores",
      melhor: `melhor janela de ${dias} dias desde ${inicioAno.slice(8)}/${inicioAno.slice(5, 7)}`,
    },
    estadoDados,
    operacao,
    canais,
    produtos: linhas.filter((l) => l.curva !== "C" || l.unidadesPeriodo > 0),
    catalogo: {
      ganhando: contaSituacao("winning"),
      dividindo: contaSituacao("sharing_first_place"),
      perdendo: contaSituacao("losing"),
      fora: comCatalogo.filter((l) => ["not_listed", "listed"].includes(l.catalogo!.situacao)).length,
      elegiveisFora: elegiveis.length,
      consultados: comCatalogo.length,
      perdendoLista: comCatalogo
        .filter((l) => ["losing", "sharing_first_place"].includes(l.catalogo!.situacao))
        .map((l) => ({ mlb: l.mlb, sku: l.sku, titulo: l.titulo, precoAtual: l.precoVisivel, precoParaGanhar: l.catalogo!.precoParaGanhar, conta: l.conta })),
      alavancas: [...alavancasAbertas.entries()].map(([rotulo, abertas]) => ({ id: rotulo, rotulo, abertas })).sort((a, b) => b.abertas - a.abertas),
    },
    estoque: { rupturaCurvaA, encerradosCurvaA, criticos, parados, pausados },
    multicanal: { dispersao: dispersao.slice(0, 25), migracao: migracao.slice(0, 15) },
    financeiro: {
      coberturaCusto: divide(receitaComCusto, receitaJanela),
      receitaComCusto: r2(receitaComCusto),
      receitaTotal: r2(receitaJanela),
      margemApurada: receitaComCusto
        ? divide(soma(linhas.filter((l) => l.margemUnitaria != null).map((l) => l.margemUnitaria! * l.unidadesPeriodo)), receitaComCusto)
        : null,
      produtosComCusto,
      produtosTotal: produtos.length,
    },
    metas: metaTotal > 0
      ? {
          mes: `${hoje.slice(5, 7)}/${hoje.slice(0, 4)}`,
          meta: r2(metaTotal),
          realizado: r2(realizadoMes),
          gap: r2(gap),
          diasRestantes,
          ritmoNecessario: r2(gap / diasRestantes),
          ritmoAtual: r2(realizadoMes / Math.max(1, diasCorridos)),
          decomposicao,
        }
      : null,
    trafegoPago,
    alavancas: decomposicao,
    prioridades,
    pendencias,
    anotacoes,
    reputacao: Object.values(instantaneo.contas).map((c) => ({
      conta: c.nome,
      nivel: c.reputacao.nivel,
      categoria: c.reputacao.categoria,
      reclamacoes: c.reputacao.reclamacoes,
      cancelamentos: c.reputacao.cancelamentos,
      perguntas: c.perguntasSemResposta,
    })),
  };
}
