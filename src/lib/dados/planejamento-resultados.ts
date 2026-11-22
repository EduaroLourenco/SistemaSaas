import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { paginar } from "./paginar";
import { carregarVendasPlanejamento } from "./planejamento-vendas";
import { detalhesVazios, somarDias, diasEntre, type Item } from "@/lib/planejamento/modelo";
import { estrategiaDe } from "@/lib/planejamento/estrategia";
import {
  filtroDaAcao,
  periodosDoResultado,
  resumirVendas,
  temRecorte,
  type LinhaVenda,
  type ResumoVendas,
} from "@/lib/planejamento/resultados";
import { diaSP, medirEntradas, type Entrada } from "@/lib/promocoes/participacao";

/**
 * Deu certo? As ações do planejamento e as promoções do Mercado Livre.
 *
 * ── A comparação que decide ──
 *
 * "Vendeu 20% a mais que no período anterior" não diz se a campanha
 * funcionou: se o canal inteiro cresceu 20% (data comemorativa, frete grátis
 * do canal), ela não fez nada. Então cada ação é medida contra o RESTO do
 * mesmo canal nas mesmas datas, e cada promoção do Meli contra os anúncios
 * que ficaram FORA dela — a mesma campanha, os mesmos dias, só a decisão de
 * participar mudando. A diferença entre os dois crescimentos é o efeito.
 */

export type Veredito = "deu certo" | "neutra" | "não deu certo" | "sem base" | "futura" | "sem recorte" | "cedo demais";

/** O que foi planejado e registrado: o "o que foi feito" da ação. */
export type Feito = {
  tipo: string;
  status: string;
  etapa: string;
  ideia: string;
  foco: string;
  hipotese: string;
  canais: string[];
  responsavel: string;
  orcamento: number | null;
  meta: string;
  checklist: { texto: string; feito: boolean }[];
  fechamento: { funcionou: string; problemas: string; proximoPasso: string };
};

export type LadoProduto = {
  receita: number;
  unidades: number;
  preco: number | null;
  /** Null quando não houve coleta de visita no período — não é zero. */
  visitas: number | null;
  /** Unidades ÷ visitas. Null sem visita medida. */
  conversao: number | null;
};

export type ProdutoResultado = {
  chave: string;
  titulo: string;
  /** O SKU, mesmo quando a linha é um anúncio: é por ele que se procura. */
  sku: string;
  antes: LadoProduto;
  agora: LadoProduto;
};

export type LinhaResultado = {
  id: string;
  titulo: string;
  natureza: "campanha" | "acao";
  inicio: string;
  fim: string;
  anteriorInicio: string | null;
  anteriorFim: string | null;
  skus: number;
  parcial: boolean;
  feito: Feito;
  atual: ResumoVendas | null;
  anterior: ResumoVendas | null;
  restoAtual: number | null;
  restoAnterior: number | null;
  crescimento: number | null;
  crescimentoResto: number | null;
  efeito: number | null;
  veredito: Veredito;
  leitura: string;
  /** Produtos da ação; sem produto escolhido, os que mais venderam no recorte. */
  produtos: ProdutoResultado[];
  produtosSaoDoCanal: boolean;
  serie: { data: string; acao: number; resto: number }[];
};

export type AnuncioPromo = {
  codigo: string;
  titulo: string;
  precoOferta: number | null;
  precoTabela: number | null;
  antes: number;
  agora: number;
  unidadesAgora: number;
};

export type LinhaPromocao = {
  id: string;
  nome: string;
  processadaEm: string;
  comReducao: boolean;
  dias: number;
  participam: number;
  fora: number;
  /** Contra quem se compara: os de fora da mesma campanha, ou o resto do Meli. */
  controle: "fora da campanha" | "resto do Mercado Livre";
  receitaParticipantes: { antes: number; agora: number };
  receitaFora: { antes: number; agora: number };
  crescimento: number | null;
  crescimentoFora: number | null;
  efeito: number | null;
  veredito: Veredito;
  leitura: string;
  anuncios: AnuncioPromo[];
  /**
   * De onde veio a participação. "planilha": só a Central de Promoções
   * processada aqui, medida da data do processamento. "Meli": o que a API
   * diz estar no ar, medido da entrada real de cada anúncio.
   */
  origem?: "planilha" | "Meli";
  /** Participações aceitas pelo próprio Gerizo (decisoes_promocao enviadas). */
  peloGerizo?: number;
  /** Tipo do canal: SMART, DEAL, SELLER_CAMPAIGN… */
  tipo?: string;
};

export type DadosResultados = {
  linhas: LinhaResultado[];
  promocoes: LinhaPromocao[];
  aviso: string | null;
};

const pct = (agora: number, antes: number) => (antes > 0 ? ((agora - antes) / antes) * 100 : null);
const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const pp = (v: number) => `${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} p.p.`;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** O limiar de efeito: abaixo disto a diferença cabe no ruído de semana a semana. */
const LIMIAR_PP = 10;
/** Janela de medição das promoções do Meli, em dias depois do processamento. */
const JANELA_PROMO = 14;
/** Entradas da API mais antigas que isto ficam de fora: o "deu certo?" é do presente. */
const DIAS_API = 120;
/**
 * Relâmpago dura horas: uma janela de 14 dias diluiria o efeito no resto da
 * semana. Tem leitura própria (vendeu e sobrou?), não entra aqui.
 */
const TIPOS_FORA = new Set(["LIGHTNING", "SMART_LIGHTNING"]);
/** Menos convites não aceitos que isto não serve de controle (ver promoções da API). */
const CONTROLE_MINIMO = 30;

function veredito(efeito: number | null, crescimento: number | null): Veredito {
  const v = efeito ?? crescimento;
  if (v == null) return "sem base";
  return v >= LIMIAR_PP ? "deu certo" : v <= -LIMIAR_PP ? "não deu certo" : "neutra";
}

export async function carregarResultadosPlanejamento(): Promise<DadosResultados> {
  const op = await operacaoPadrao();
  if (!op) return { linhas: [], promocoes: [], aviso: "Escolha uma operação." };
  const sb = await clienteServidor();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const [itensR, campanhas, campItens, anuncios, produtos, contas, promosApi, itensApi, aceitesGerizo] = await Promise.all([
    sb.from("planejamento_itens").select("*").eq("operacao_id", op.id).neq("status", "Cancelada").order("inicio", { ascending: false }).limit(300),
    paginar(() => sb.from("campanhas").select("id,nome,tem_reducao_tarifa").eq("operacao_id", op.id).order("id")).catch(() => []),
    paginar(() =>
      sb
        .from("campanha_itens")
        .select("campanha_id,anuncio_id,decisao,preco_oferta,preco_tabela,decidido_em")
        .eq("operacao_id", op.id)
        .order("id")
    ).catch(() => []),
    paginar(() => sb.from("anuncios").select("id,codigo_externo,titulo,sku_canal").eq("operacao_id", op.id).order("id")),
    paginar(() => sb.from("produtos").select("sku,titulo").eq("operacao_id", op.id).order("id")),
    paginar(() => sb.from("contas_canal").select("id,nome,canal_id,canais(nome)").eq("operacao_id", op.id).order("id")),
    /* O que o Meli diz estar no ar — inclui o que nunca passa por planilha. */
    paginar(() => sb.from("promocoes_canal").select("id,codigo,tipo,nome,inicio,fim").eq("operacao_id", op.id).order("id")).catch(() => []),
    paginar(() =>
      sb
        .from("promocao_canal_itens")
        .select("promocao_id,anuncio_id,codigo_externo,status,inicio,fim,preco_original,preco_promocional")
        .eq("operacao_id", op.id)
        .in("status", ["started", "candidate"])
        .order("id")
    ).catch(() => []),
    paginar(() => sb.from("decisoes_promocao").select("mlb,promocao").eq("operacao_id", op.id).eq("estado", "enviada").order("id")).catch(() => []),
  ]);
  if (itensR.error) return { linhas: [], promocoes: [], aviso: "O planejamento não está disponível." };

  type An = { id: string; codigo_externo: string; titulo: string; sku_canal: string | null };
  type Ct = { id: string; nome: string; canal_id: string; canais: { nome: string } | null };
  type Ci = { campanha_id: string; anuncio_id: string; decisao: string; preco_oferta: number | null; preco_tabela: number | null; decidido_em: string | null };
  const anuncioPorId = new Map((anuncios as An[]).map((a) => [a.id, a]));
  const tituloSku = new Map((produtos as { sku: string; titulo: string }[]).map((p) => [p.sku.toUpperCase(), p.titulo]));
  for (const a of anuncios as An[]) {
    const k = (a.sku_canal ?? "").toUpperCase();
    if (k && !tituloSku.has(k)) tituloSku.set(k, a.titulo);
  }
  const nomeConta = new Map<string, string>();
  const nomeCanal = new Map<string, string>();
  for (const c of contas as unknown as Ct[]) {
    const canal = c.canais?.nome ?? "Canal";
    nomeCanal.set(c.canal_id, canal);
    nomeConta.set(c.id, c.nome && c.nome !== "Conta principal" ? `${canal} · ${c.nome}` : canal);
  }

  const itens = ((itensR.data ?? []) as Item[]).map((i) => ({ ...i, detalhes: { ...detalhesVazios(), ...i.detalhes } }));
  const umAno = somarDias(hoje, -365);

  // Promoções: a data é a do processamento (a planilha não traz a da campanha).
  const porCampanha = new Map<string, Ci[]>();
  for (const ci of campItens as Ci[]) {
    if (!ci.anuncio_id) continue;
    const l = porCampanha.get(ci.campanha_id) ?? [];
    l.push(ci);
    porCampanha.set(ci.campanha_id, l);
  }
  const promos = (campanhas as { id: string; nome: string; tem_reducao_tarifa: boolean | null }[])
    .map((c) => {
      const lista = porCampanha.get(c.id) ?? [];
      const datas = lista.map((x) => (x.decidido_em ?? "").slice(0, 10)).filter(Boolean).sort();
      return { c, lista, inicio: datas[0] ?? null };
    })
    .filter((p) => p.lista.length && p.inicio && p.inicio >= umAno);

  /*
   * Promoções da API, agrupadas pelo código do canal: a mesma "Black Friday
   * 2026" aparece uma vez por conta, e é uma campanha só.
   */
  type PA = { id: string; codigo: string; tipo: string; nome: string | null; inicio: string | null; fim: string | null };
  type IA = { promocao_id: string; anuncio_id: string | null; codigo_externo: string; status: string; inicio: string | null; fim: string | null; preco_original: number | null; preco_promocional: number | null };
  const desdeApi = somarDias(hoje, -DIAS_API);
  const aceitosGerizo = new Set((aceitesGerizo as { mlb: string; promocao: string }[]).map((a) => `${a.promocao}|${a.mlb.toUpperCase()}`));
  const promoPorId = new Map((promosApi as PA[]).map((p) => [p.id, p]));
  const apiPorCodigo = new Map<string, { p: PA; entradas: (Entrada & { item: IA })[]; convites: Set<string>; todos: Set<string>; gerizo: number }>();
  for (const it of itensApi as IA[]) {
    const p = promoPorId.get(it.promocao_id);
    if (!p || TIPOS_FORA.has(p.tipo) || !it.anuncio_id) continue;
    const g = apiPorCodigo.get(p.codigo) ?? { p, entradas: [], convites: new Set<string>(), todos: new Set<string>(), gerizo: 0 };
    g.todos.add(it.anuncio_id);
    if (it.status === "candidate") g.convites.add(it.anuncio_id);
    else {
      // Sem data no item, vale a da promoção; sem nenhuma, não há o que medir.
      const inicio = diaSP(it.inicio) ?? diaSP(p.inicio);
      if (inicio && inicio >= desdeApi && inicio <= hoje) {
        g.entradas.push({ anuncioId: it.anuncio_id, inicio, fim: diaSP(it.fim) ?? diaSP(p.fim), item: it });
        if (aceitosGerizo.has(`${p.codigo}|${it.codigo_externo.toUpperCase()}`)) g.gerizo++;
      }
    }
    apiPorCodigo.set(p.codigo, g);
  }
  for (const g of apiPorCodigo.values()) {
    // Um anúncio que entrou não é controle, mesmo que tenha sobrado convite em outra conta.
    for (const e of g.entradas) g.convites.delete(e.anuncioId);
    // Um anúncio, uma entrada: vale a mais antiga (duas contas, mesma campanha).
    const vistos = new Map<string, (typeof g.entradas)[number]>();
    for (const e of g.entradas) if (!vistos.has(e.anuncioId) || e.inicio < vistos.get(e.anuncioId)!.inicio) vistos.set(e.anuncioId, e);
    g.entradas = [...vistos.values()];
  }
  const gruposApi = [...apiPorCodigo.values()].filter((g) => g.entradas.length);

  // Uma leitura de vendas para tudo: do começo mais antigo até hoje.
  const inicios = [
    ...itens.map((i) => periodosDoResultado(i, hoje)?.anteriorInicio).filter((x): x is string => !!x && x >= umAno),
    ...promos.map((p) => somarDias(p.inicio!, -JANELA_PROMO)),
    ...gruposApi.flatMap((g) => g.entradas.map((e) => somarDias(e.inicio, -JANELA_PROMO))),
  ].sort();
  let vendas: LinhaVenda[] = [];
  let exclusoes: Awaited<ReturnType<typeof carregarVendasPlanejamento>>["exclusoes"] = [];
  let aviso: string | null = null;
  if (inicios.length) {
    try {
      const v = await carregarVendasPlanejamento(op.id, inicios[0], hoje);
      vendas = v.vendas;
      exclusoes = v.exclusoes;
    } catch (e) {
      aviso = (e as Error).message;
    }
  }
  const validas = vendas.filter((l) => !l.cancelado);

  /*
   * Visita por anúncio e por dia, na mesma janela das vendas.
   *
   * É o que faltava para a tela responder "vendeu menos porque veio menos
   * gente, ou porque a mesma gente comprou menos?". Sem ela, toda queda
   * parecia a mesma coisa.
   *
   * Só é lida quando há janela: tela sem nenhuma ação medida não paga uma
   * varredura de desempenho diário.
   */
  const visitaPorDia = new Map<string, number>();
  if (inicios.length) {
    const brutas = await paginar(() =>
      sb
        .from("anuncio_desempenho_diario")
        .select("anuncio_id,data,visitas")
        .eq("operacao_id", op.id)
        .gte("data", inicios[0])
        .lte("data", hoje)
        .order("anuncio_id")
        .order("data")
    ).catch(() => [] as unknown[]);
    for (const v of brutas as { anuncio_id: string; data: string; visitas: number | null }[]) {
      if (v.visitas == null) continue;
      const k = `${v.anuncio_id}|${String(v.data).slice(0, 10)}`;
      visitaPorDia.set(k, (visitaPorDia.get(k) ?? 0) + Number(v.visitas));
    }
  }
  /* Os anúncios de cada SKU, para somar visita quando a ação é por SKU. */
  const anunciosDoSku = new Map<string, string[]>();
  for (const a of anuncios as An[]) {
    const k = (a.sku_canal ?? "").toUpperCase();
    if (!k) continue;
    const lista = anunciosDoSku.get(k) ?? [];
    lista.push(a.id);
    anunciosDoSku.set(k, lista);
  }
  const anuncioPorCodigo = new Map((anuncios as An[]).map((a) => [a.codigo_externo.toUpperCase(), a]));

  /* ── Ações do planejamento ── */
  const linhas: LinhaResultado[] = itens.map((item) => {
    const est = estrategiaDe(item);
    const d = item.detalhes;
    const feito: Feito = {
      tipo: item.natureza === "campanha" ? "Campanha" : item.tipo || "Ação",
      status: item.status,
      etapa: item.etapa,
      ideia: d.briefing || d.objetivo || "",
      foco: est.foco ?? "",
      hipotese: est.hipotese ?? "",
      canais: [
        ...item.canais.map((c) => nomeCanal.get(c) ?? "Canal"),
        ...item.contas.map((c) => nomeConta.get(c) ?? "Conta"),
      ],
      responsavel: d.responsavel,
      orcamento: d.orcamento,
      meta: d.meta,
      checklist: d.checklist ?? [],
      fechamento: {
        funcionou: est.fechamento?.funcionou ?? "",
        problemas: est.fechamento?.problemas ?? "",
        proximoPasso: est.fechamento?.proximoPasso ?? "",
      },
    };
    const base = {
      id: item.id,
      titulo: item.titulo,
      natureza: item.natureza,
      inicio: item.inicio,
      fim: item.fim,
      anteriorInicio: null,
      anteriorFim: null,
      skus: item.skus.length,
      parcial: item.fim >= hoje,
      feito,
      atual: null,
      anterior: null,
      restoAtual: null,
      restoAnterior: null,
      crescimento: null,
      crescimentoResto: null,
      efeito: null,
      produtos: [],
      produtosSaoDoCanal: false,
      serie: [],
    };
    const p0 = periodosDoResultado(item, hoje);
    /*
     * Ação curta (menos de uma semana) se compara com os MESMOS dias da
     * semana anterior, não com os dias logo antes: uma quarta contra uma
     * terça mede o dia da semana, não a ação.
     */
    const curta = p0 ? diasEntre(p0.inicio, p0.fim) + 1 < 7 : false;
    const p = p0 && curta ? { ...p0, anteriorInicio: somarDias(p0.inicio, -7), anteriorFim: somarDias(p0.fim, -7) } : p0;
    if (!p) return { ...base, veredito: "futura" as const, leitura: `Começa em ${item.inicio.split("-").reverse().join("/")}. O resultado aparece quando o período começar.` };

    /*
     * Sem produto nem canal escolhido, a ação não delimita venda nenhuma —
     * mas o período existe. Mede-se a operação inteira, como referência, e
     * a tela diz que é referência: "o que aconteceu na loja enquanto a ação
     * estava no ar", não "o resultado da ação".
     */
    const recorte = temRecorte(item);
    const delimitaProduto = item.skus.length > 0 || est.anuncios.length > 0;
    const daAcao = filtroDaAcao(item);
    const referencia: Item = delimitaProduto
      ? { ...item, skus: [], detalhes: { ...item.detalhes, estrategia: undefined } }
      : { ...item, canais: [], contas: [], skus: [], detalhes: { ...item.detalhes, estrategia: undefined } };
    const daReferencia = filtroDaAcao(referencia);

    const atual = resumirVendas(vendas, item, p.inicio, p.fim, exclusoes);
    const anterior = resumirVendas(vendas, item, p.anteriorInicio, p.anteriorFim, exclusoes);
    const refAtual = resumirVendas(vendas, referencia, p.inicio, p.fim, exclusoes);
    const refAnterior = resumirVendas(vendas, referencia, p.anteriorInicio, p.anteriorFim, exclusoes);
    const restoAtual = recorte ? r2(refAtual.receita - atual.receita) : null;
    const restoAnterior = recorte ? r2(refAnterior.receita - anterior.receita) : null;
    const crescimento = pct(atual.receita, anterior.receita);
    const crescimentoResto = restoAtual != null && restoAnterior != null ? pct(restoAtual, restoAnterior) : null;
    const efeito = recorte && crescimento != null && crescimentoResto != null ? crescimento - crescimentoResto : null;

    // Produto a produto: os da ação, ou os que mais venderam no recorte.
    const chaveDe = (l: LinhaVenda) => (est.anuncios.length ? l.anuncio : l.sku.toUpperCase());
    const porProduto = new Map<string, ProdutoResultado>();
    for (const l of validas) {
      if (l.data < p.anteriorInicio || l.data > p.fim || !daAcao(l)) continue;
      const k = chaveDe(l) || "sem código";
      const pr =
        porProduto.get(k) ??
        {
          chave: est.anuncios.length ? anuncioPorId.get(k)?.codigo_externo ?? k : k,
          titulo: est.anuncios.length ? anuncioPorId.get(k)?.titulo ?? "" : tituloSku.get(k) ?? "",
          sku: est.anuncios.length ? (anuncioPorId.get(k)?.sku_canal ?? "").toUpperCase() : k,
          antes: { receita: 0, unidades: 0, preco: null, visitas: null, conversao: null },
          agora: { receita: 0, unidades: 0, preco: null, visitas: null, conversao: null },
        };
      const lado = l.data >= p.inicio ? pr.agora : pr.antes;
      lado.receita += l.receita;
      lado.unidades += l.quantidade;
      porProduto.set(k, pr);
    }
    /* A visita de um produto: do anúncio, ou de todos os anúncios do SKU. */
    const visitasDe = (pr: ProdutoResultado, de: string, ate: string): number | null => {
      const ids = est.anuncios.length
        ? [anuncioPorCodigo.get(pr.chave.toUpperCase())?.id].filter((x): x is string => !!x)
        : anunciosDoSku.get(pr.chave.toUpperCase()) ?? [];
      if (!ids.length) return null;
      let total = 0;
      let mediu = false;
      for (const id of ids) {
        for (let d = de; d <= ate; d = somarDias(d, 1)) {
          const v = visitaPorDia.get(`${id}|${d}`);
          if (v == null) continue;
          mediu = true;
          total += v;
        }
      }
      return mediu ? total : null;
    };
    const fecha = (lado: ProdutoResultado["antes"], visitas: number | null) => ({
      ...lado,
      receita: r2(lado.receita),
      preco: lado.unidades ? r2(lado.receita / lado.unidades) : null,
      visitas,
      conversao: visitas && visitas > 0 ? r2((lado.unidades * 100) / visitas) : null,
    });
    const listaProdutos = [...porProduto.values()]
      .map((pr) => ({
        ...pr,
        antes: fecha(pr.antes, visitasDe(pr, p.anteriorInicio, p.anteriorFim)),
        agora: fecha(pr.agora, visitasDe(pr, p.inicio, p.fim)),
      }))
      .sort((a, b) => b.agora.receita + b.antes.receita - (a.agora.receita + a.antes.receita))
      .slice(0, 40);

    // Dia a dia: a ação e o resto, do começo do período anterior ao fim.
    const dias = new Map<string, { acao: number; resto: number }>();
    for (let dia = p.anteriorInicio; dia <= p.fim; dia = somarDias(dia, 1)) dias.set(dia, { acao: 0, resto: 0 });
    for (const l of validas) {
      const x = dias.get(l.data);
      if (!x) continue;
      if (daAcao(l)) x.acao += l.receita;
      else if (daReferencia(l)) x.resto += l.receita;
    }
    const serie = [...dias.entries()].map(([data, x]) => ({ data, acao: r2(x.acao), resto: r2(x.resto) }));

    let v: Veredito;
    let leitura: string;
    const nomeResto = delimitaProduto ? "o resto do canal" : "os outros canais";
    if (!recorte) {
      v = "sem recorte";
      leitura =
        `Sem produto, canal ou anúncio escolhido, a ação não delimita venda: os números abaixo são da loja inteira no período, como referência` +
        (crescimento != null ? ` (${fmt(crescimento)} contra o período anterior).` : ".") +
        " Para medir o efeito, escolha os produtos ou o canal da ação no Planejamento.";
    } else if (crescimento == null) {
      v = "sem base";
      leitura = atual.receita > 0 ? "Não vendia no período anterior: não há base de comparação." : "Sem venda nos dois períodos.";
    } else if (efeito == null) {
      v = veredito(null, crescimento);
      leitura = `Vendeu ${fmt(crescimento)} contra o período anterior; ${nomeResto} não teve venda para comparar.`;
    } else {
      v = veredito(efeito, crescimento);
      leitura =
        `${delimitaProduto ? "Os produtos da ação" : "O canal da ação"} foram ${fmt(crescimento)}; ${nomeResto}, ${fmt(crescimentoResto!)}. ` +
        (v === "deu certo"
          ? `Ficou ${pp(efeito)} acima do movimento geral.`
          : v === "não deu certo"
            ? `Ficou ${pp(efeito)} abaixo ${delimitaProduto ? "do resto do canal" : "dos outros canais"}.`
            : `Andou junto com ${nomeResto}: o efeito da ação não se distingue do movimento geral.`);
    }
    if (curta && recorte) leitura += " Ação curta: comparada com os mesmos dias da semana anterior.";
    if (base.parcial) leitura += " Ação em andamento: o número ainda muda.";

    return {
      ...base,
      anteriorInicio: p.anteriorInicio,
      anteriorFim: p.anteriorFim,
      atual,
      anterior,
      restoAtual,
      restoAnterior,
      crescimento,
      crescimentoResto,
      efeito,
      veredito: v,
      leitura,
      produtos: listaProdutos,
      produtosSaoDoCanal: !delimitaProduto,
      serie,
    };
  });

  /* ── Promoções do Mercado Livre: quem entrou contra quem ficou de fora ── */
  const vendaPorAnuncio = new Map<string, LinhaVenda[]>();
  for (const l of validas) {
    if (!l.anuncio) continue;
    const x = vendaPorAnuncio.get(l.anuncio) ?? [];
    x.push(l);
    vendaPorAnuncio.set(l.anuncio, x);
  }
  const somar = (ids: string[], de: string, ate: string) => {
    let receita = 0;
    let unidades = 0;
    for (const id of ids)
      for (const l of vendaPorAnuncio.get(id) ?? [])
        if (l.data >= de && l.data <= ate) {
          receita += l.receita;
          unidades += l.quantidade;
        }
    return { receita: r2(receita), unidades };
  };

  const promocoes: LinhaPromocao[] = promos
    .map(({ c, lista, inicio }) => {
      const ini = inicio!;
      // Até ontem: hoje ainda não fechou, e um dia pela metade puxaria o "depois" para baixo.
      const fimJanela = [somarDias(ini, JANELA_PROMO - 1), somarDias(hoje, -1)].sort()[0];
      const dias = Math.max(0, diasEntre(ini, fimJanela) + 1);
      const antesIni = somarDias(ini, -dias);
      const antesFim = somarDias(ini, -1);
      // Um anúncio que aparece duas vezes na mesma planilha conta uma: vale a última decisão.
      const decisao = new Map<string, Ci>();
      for (const x of lista) decisao.set(x.anuncio_id, x);
      const dentro = [...decisao.values()].filter((x) => x.decisao === "participar");
      const foraLista = [...decisao.values()].filter((x) => x.decisao !== "participar");
      const pA = somar(dentro.map((x) => x.anuncio_id), antesIni, antesFim);
      const pD = somar(dentro.map((x) => x.anuncio_id), ini, fimJanela);
      /*
       * Controle: os que ficaram de fora DESTA campanha, que é a comparação
       * mais justa. Quando ninguém ficou de fora (ou os de fora não vendiam),
       * vale o resto do Mercado Livre — os anúncios que não estavam nela.
       * Sem controle nenhum, "cresceu 35%" seria lido como efeito da
       * campanha quando pode ser só a semana.
       */
      let controleIds = foraLista.map((x) => x.anuncio_id);
      let controle: LinhaPromocao["controle"] = "fora da campanha";
      if (somar(controleIds, antesIni, antesFim).receita <= 0) {
        const naCampanha = new Set(decisao.keys());
        controleIds = [...vendaPorAnuncio.keys()].filter(
          (id) => !naCampanha.has(id) && (anuncioPorId.get(id)?.codigo_externo ?? "").toUpperCase().startsWith("MLB")
        );
        controle = "resto do Mercado Livre";
      }
      const fA = somar(controleIds, antesIni, antesFim);
      const fD = somar(controleIds, ini, fimJanela);
      const nomeControle = controle === "fora da campanha" ? `os ${foraLista.length} que ficaram de fora` : "o resto do Mercado Livre (anúncios fora da campanha)";
      const crescimento = pct(pD.receita, pA.receita);
      const crescimentoFora = pct(fD.receita, fA.receita);
      const efeito = crescimento != null && crescimentoFora != null ? crescimento - crescimentoFora : null;

      let v: Veredito;
      let leitura: string;
      // Uma semana inteira, no mínimo: menos que isso o fim de semana sozinho muda o número.
      if (dias < 7) {
        v = "cedo demais";
        leitura = `Processada há ${dias} dia(s) completos. O resultado aparece com 7 dias: antes disso, o fim de semana sozinho muda o número.`;
      } else if (crescimento == null) {
        v = "sem base";
        leitura = "Os anúncios que entraram não venderam nos dias antes: não há base de comparação.";
      } else if (efeito == null) {
        v = "sem base";
        leitura = `Os ${dentro.length} anúncios que entraram foram ${fmt(crescimento)}, mas não há com o que comparar: sem controle, não dá para separar a campanha do movimento da semana.`;
      } else {
        v = veredito(efeito, crescimento);
        leitura =
          `Nos ${dias} dias depois do processamento, os ${dentro.length} anúncios que entraram foram ${fmt(crescimento)}; ` +
          `${nomeControle}, ${fmt(crescimentoFora!)}. ` +
          (v === "deu certo"
            ? `Entrar rendeu ${pp(efeito)} a mais.`
            : v === "não deu certo"
              ? `Quem entrou ficou ${pp(efeito)} atrás.`
              : "Entrar ou não entrar deu praticamente no mesmo.");
      }

      const anunciosLista: AnuncioPromo[] = dentro
        .map((x) => {
          const a = anuncioPorId.get(x.anuncio_id);
          const an = somar([x.anuncio_id], antesIni, antesFim);
          const ag = somar([x.anuncio_id], ini, fimJanela);
          return {
            codigo: a?.codigo_externo ?? "—",
            titulo: a?.titulo ?? "",
            precoOferta: x.preco_oferta != null ? Number(x.preco_oferta) : null,
            precoTabela: x.preco_tabela != null ? Number(x.preco_tabela) : null,
            antes: an.receita,
            agora: ag.receita,
            unidadesAgora: ag.unidades,
          };
        })
        .sort((a, b) => b.agora + b.antes - (a.agora + a.antes))
        .slice(0, 25);

      // "1_Com_reducao_de_tarifas_2026_09_04-13_28 | De 28..." → "Com reducao de tarifas"
      const nome = c.nome
        .replace(/^\d+_/, "")
        .split("|")[0]
        .replace(/[_-]\d{4}_\d{2}_\d{2}.*$/, "")
        .replace(/-[0-9a-f]{8}-.*$/i, "")
        .replace(/_/g, " ")
        .trim();

      return {
        id: c.id,
        nome: nome || c.nome,
        processadaEm: ini,
        comReducao: !!c.tem_reducao_tarifa,
        dias,
        participam: dentro.length,
        fora: foraLista.length,
        controle,
        receitaParticipantes: { antes: pA.receita, agora: pD.receita },
        receitaFora: { antes: fA.receita, agora: fD.receita },
        crescimento,
        crescimentoFora,
        // Cedo demais não mostra efeito: o número existiria, mas induziria a uma conclusão.
        efeito: v === "cedo demais" ? null : efeito,
        veredito: v,
        leitura,
        anuncios: anunciosLista,
      };
    })
    .map((l) => ({ ...l, origem: "planilha" as const }));

  /*
   * ── Promoções da API: cada anúncio medido a partir da própria entrada ──
   *
   * Ficam AO LADO das da planilha, sem fundir. A planilha não traz o código
   * da campanha, e sobreposição de anúncios não prova que é a mesma: na
   * Probel quase todo o catálogo está em todas as promoções, e a tentativa
   * de ligar por sobreposição casou "Black Friday" com "Principal Outubro".
   * A planilha responde "a decisão daquela planilha deu certo?"; a da API,
   * "entrar nesta promoção do Meli deu certo?".
   */
  const somente = (ids: string[], de: string, ate: string) => somar(ids, de, ate).receita;
  const doCanal: LinhaPromocao[] = gruposApi.map((g) => {
    let controleIds = [...g.convites];
    let controle: LinhaPromocao["controle"] = "fora da campanha";
    let med = medirEntradas({ entradas: g.entradas, controle: controleIds, somar: somente, hoje, janela: JANELA_PROMO });
    // Controle de poucos anúncios mede esses anúncios, não a campanha (18 convites contra 735 entradas deu −150 p.p.): abaixo de 30, vale o resto do Meli.
    if (!(med.controle.antes > 0) || controleIds.length < CONTROLE_MINIMO) {
      controleIds = [...vendaPorAnuncio.keys()].filter(
        (id) => !g.todos.has(id) && (anuncioPorId.get(id)?.codigo_externo ?? "").toUpperCase().startsWith("MLB")
      );
      controle = "resto do Mercado Livre";
      med = medirEntradas({ entradas: g.entradas, controle: controleIds, somar: somente, hoje, janela: JANELA_PROMO });
    }


    const nomeControle = controle === "fora da campanha" ? `os ${g.convites.size} convites não aceitos` : "o resto do Mercado Livre";
    let v: Veredito;
    let leitura: string;
    if (!med.medidas) {
      v = "cedo demais";
      leitura = `${g.entradas.length} anúncio(s) entraram há menos de 7 dias completos. O resultado aparece com 7 dias.`;
    } else if (med.crescimento == null) {
      v = "sem base";
      leitura = "Os anúncios que entraram não venderam nos dias antes de entrar: não há base de comparação.";
    } else if (med.efeito == null) {
      v = "sem base";
      leitura = `Os ${med.medidas} anúncios que entraram foram ${fmt(med.crescimento)}, sem controle para separar a promoção do movimento da semana.`;
    } else {
      v = veredito(med.efeito, med.crescimento);
      leitura =
        `Cada anúncio medido nos até ${JANELA_PROMO} dias depois de entrar: os ${med.medidas} que entraram foram ${fmt(med.crescimento)}; ` +
        `${nomeControle}, nas mesmas datas, ${fmt(med.crescimentoControle!)}. ` +
        (v === "deu certo" ? `Entrar rendeu ${pp(med.efeito)} a mais.` : v === "não deu certo" ? `Quem entrou ficou ${pp(med.efeito)} atrás.` : "Entrar ou não entrar deu praticamente no mesmo.");
    }
    if (med.cedo && med.medidas) leitura += ` ${med.cedo} entrada(s) recente(s) ainda fora da conta.`;

    const entradaPorId = new Map(g.entradas.map((e) => [e.anuncioId, e]));
    const anunciosLista: AnuncioPromo[] = med.janelas
      .map((j) => {
        const a = anuncioPorId.get(j.anuncioId);
        const it = entradaPorId.get(j.anuncioId)!.item;
        const ag = somar([j.anuncioId], j.ini, j.fim);
        return {
          codigo: a?.codigo_externo ?? it.codigo_externo,
          titulo: a?.titulo ?? "",
          precoOferta: it.preco_promocional != null ? Number(it.preco_promocional) : null,
          precoTabela: it.preco_original != null ? Number(it.preco_original) : null,
          antes: somar([j.anuncioId], j.antesIni, j.antesFim).receita,
          agora: ag.receita,
          unidadesAgora: ag.unidades,
        };
      })
      .sort((a, b) => b.agora + b.antes - (a.agora + a.antes))
      .slice(0, 25);

    return {
      id: `api:${g.p.codigo}`,
      nome: g.p.nome?.trim() || g.p.codigo,
      processadaEm: med.desde ?? g.entradas.map((e) => e.inicio).sort()[0],
      comReducao: false,
      dias: med.dias,
      participam: med.medidas || g.entradas.length,
      fora: controle === "fora da campanha" ? g.convites.size : 0,
      controle,
      receitaParticipantes: med.participantes,
      receitaFora: med.controle,
      crescimento: med.crescimento,
      crescimentoFora: med.crescimentoControle,
      efeito: v === "cedo demais" ? null : med.efeito,
      veredito: v,
      leitura,
      anuncios: anunciosLista,
      origem: "Meli",
      peloGerizo: g.gerizo,
      tipo: g.p.tipo,
    };
  });

  const todas = [...doCanal, ...promocoes].sort((a, b) =>
    b.processadaEm.localeCompare(a.processadaEm)
  );
  return { linhas, promocoes: todas, aviso };
}
