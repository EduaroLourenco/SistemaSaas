import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { paginar } from "./paginar";
import { carregarQueda, serieDaQueda, type DiaQueda } from "./queda";
import { carregarExclusoes, aplicar } from "./exclusoes";
import { carregarAcontecimentos, type Acontecimento } from "./acontecimentos-semana";
import { carregarSaude } from "./saude";
import { carregarTrafegoPago } from "./trafego-pago";
import { carregarResultadosPlanejamento } from "./planejamento-resultados";
import { carregarBaseMargem, agregar, type BaseMargem } from "./margem";
import { carregarRecordeSku, type RecordeSku } from "./recorde-sku";
import { temColunaFamilia } from "./coluna-familia";
import { diaSP } from "@/lib/promocoes/participacao";
import { montarPonte, type Ponte } from "@/lib/acompanhamento/ponte";
import {
  avaliarGatilhos,
  type CancelamentoQ,
  type ContaReputacaoQ,
  type ConviteQ,
  type Gatilho,
  type LadoQ,
  type MargemLadoQ,
  type MargemQ,
  type ReputacaoQ,
} from "@/lib/acompanhamento/gatilhos";

/**
 * Os gatilhos do Mercado Livre num período, montados dos motores que já
 * existem. Aqui só se junta: quem decide é cada motor e `gatilhos.ts`.
 *
 * A comparação é com o período de mesmo tamanho logo antes — que, para uma
 * semana, é a semana anterior (quarta contra quarta).
 */

/** A régua de preço de um produto: o que a tabela diz, o que o Meli mostra, o que vendeu. */
export type LinhaPreco = {
  sku: string;
  titulo: string;
  /**
   * Fórmula base vigente, na comissão padrão do anúncio (a base guarda um
   * preço por nível de comissão; o que vale é o do anúncio).
   */
  tabela: { comissao: number; preco: number; pela: "padrão" | "praticada" | "menor" } | null;
  vitrineAntes: number | null;
  vitrineAgora: number | null;
  /** O último preço lido no anúncio (hoje ou o dia mais recente). */
  vitrineHoje: number | null;
  vendidoAntes: number | null;
  vendidoAgora: number | null;
  unidadesAntes: number;
  unidadesAgora: number;
  /** O preço com mais unidades nos dois períodos, dia a dia. */
  maisVendeu: { preco: number; unidades: number } | null;
  /** A melhor semana da história do SKU, e o preço médio dela. */
  pico: { rotulo: string; unidades: number; preco: number } | null;
  /** Comissão praticada no período (pedidos), em fração. */
  comissaoPraticada: number | null;
};

export type DadosAcompanhamento = {
  de: string;
  ate: string;
  deAnterior: string;
  ateAnterior: string;
  /** A janela do relatório de mídia usada (o canal manda por janela, não por dia). */
  janelaMidia: string | null;
  gatilhos: Gatilho[];
  aviso: string | null;
  /** Totais do Meli nos dois períodos — os mesmos que os gatilhos usam (pedidos). */
  totais: { antes: LadoQ; agora: LadoQ };
  /**
   * Dia a dia do Meli: posição i do período atual ao lado da posição i do
   * anterior (mesmo dia da semana numa comparação semanal).
   */
  serie: { dia: string; diaAnterior: string; receita: number | null; receitaAnterior: number | null; visitas: number | null; visitasAnterior: number | null }[];
  /** O que aconteceu em cada dia dos dois períodos: preço ≥ 10%, campanha, estoque. */
  acontecimentos: Acontecimento[];
  /** Histórico dos produtos que mais pesaram, nos dois períodos juntos. Chave: SKU. */
  historicos: Record<string, DiaQueda[]>;
  /** Promoções cuja janela medida cruza o período, para a linha do tempo. */
  promocoes: { nome: string; tipo: string | null; origem: string; inicio: string; fim: string; veredito: string; efeito: number | null; participam: number }[];
  precos: LinhaPreco[];
  reputacao: ContaReputacaoQ[];
  cancelamentos: { antes: CancelamentoQ; agora: CancelamentoQ } | null;
  margem: MargemQ | null;
  /** Para onde foi a diferença: estoque, visitas, conversão, preço. Soma = agora − antes. */
  ponte: Ponte | null;
};

const ladoVazio = (): LadoQ => ({ receita: 0, unidades: 0, pedidos: 0, visitas: null, conversao: null, precoVendido: null, precoVitrine: null });
const mais = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const vazio = (de: string, ate: string, aviso: string): DadosAcompanhamento => ({
  de, ate, deAnterior: "", ateAnterior: "", janelaMidia: null, gatilhos: [], totais: { antes: ladoVazio(), agora: ladoVazio() },
  serie: [], acontecimentos: [], historicos: {}, promocoes: [], precos: [], reputacao: [], cancelamentos: null, margem: null, ponte: null, aviso,
});
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * `anterior` escolhe a base: sem ela, o período de mesmo tamanho logo antes.
 * Um dia só se compara com o mesmo dia da semana anterior (sábado não se
 * parece com sexta) — quem chama passa isso.
 */
export async function carregarAcompanhamento(de: string, ate: string, anterior?: { de: string; ate: string }): Promise<DadosAcompanhamento> {
  const op = await operacaoPadrao();
  const sb = await clienteServidor();
  const hoje = diaSP(new Date().toISOString())!;
  if (!op) return vazio(de, ate, "Escolha uma empresa.");

  // Cada operação tem o seu canal "Mercado Livre": é pela conta que se chega a ele.
  const { data: contasBrutas } = await sb
    .from("contas_canal")
    .select("id,nome,canal_id,canais!inner(codigo)")
    .eq("operacao_id", op.id)
    .eq("canais.codigo", "mercado_livre");
  const contas = (contasBrutas ?? []) as unknown as { id: string; nome: string; canal_id: string }[];
  if (!contas.length) return vazio(de, ate, "Sem Mercado Livre nesta empresa.");
  const meli = { id: contas[0].canal_id };
  const idsContas = contas.map((c) => c.id);

  const dias = Math.round((Date.parse(ate) - Date.parse(de)) / 864e5) + 1;
  const deAnterior = anterior?.de ?? mais(de, -dias);
  const ateAnterior = anterior?.ate ?? mais(de, -1);

  const [queda, saudeToda, resultados, convitesBrutos, midia, diarias, exclusoes, reputacaoBruta, baseMargem, familiasBrutas] = await Promise.all([
    carregarQueda({ de, ate, deAnt: deAnterior, ateAnt: ateAnterior, nivel: "produto", canais: meli.id }),
    carregarSaude().catch(() => []),
    carregarResultadosPlanejamento(),
    paginar(() =>
      sb
        .from("promocao_canal_itens")
        .select("codigo_externo,preco_promocional,fim,anuncios(sku_canal),promocoes_canal(nome,tipo,fim)")
        .eq("operacao_id", op.id)
        .eq("status", "candidate")
        .not("preco_promocional", "is", null)
        .order("id")
    ).catch(() => []),
    // Uma chamada só: a janela mais recente do relatório (o canal manda por janela, não por dia).
    carregarTrafegoPago(undefined, meli.id).catch(() => null),
    // Só os dias do período, das contas do Meli — não o histórico inteiro.
    paginar(() =>
      sb
        .from("vendas_diarias")
        .select("data,receita,visitas,valor_cancelado,pedidos,pedidos_cancelados,conta_canal_id")
        .in("conta_canal_id", idsContas)
        .gte("data", deAnterior)
        .lte("data", ate)
        .order("data")
    ).catch(() => []),
    carregarExclusoes().catch(() => []),
    sb
      .from("conta_reputacao_diaria")
      .select("conta_canal_id,data,nivel,reclamacoes_taxa,cancelamentos_taxa,atrasos_taxa")
      .in("conta_canal_id", idsContas)
      .gte("data", mais(deAnterior, -7))
      .lte("data", ate)
      .order("data")
      .limit(500)
      .then((r) => r.data ?? [], () => []),
    carregarBaseMargem({ inicio: deAnterior, fim: ate, canalId: meli.id }).catch(() => null),
    temColunaFamilia(sb)
      .then((tem) =>
        tem
          ? paginar(() => sb.from("anuncios").select("sku_canal,familia_nome").eq("operacao_id", op.id).not("familia_nome", "is", null).order("id"))
          : []
      )
      .catch(() => []),
  ]);

  /*
   * Tudo aqui é só Mercado Livre. A saúde olha todas as contas: fica só o
   * que fala do Meli. Ação do Planejamento conta quando o Meli está nela.
   */
  const ehMeli = (nome: string) => /mercado livre/i.test(nome);
  // Só o que impede ler o período: conta atrasada e pedidos × totais. Custo é do módulo de lucro;
  // a leitura de preço de hoje só importa se o período chega até hoje.
  const LER = new Set(["atualizacao", "consistencia", ...(ate >= hoje ? ["preco"] : [])]);
  const saude = saudeToda
    .filter((s) => LER.has(s.id))
    .map((s) => {
      if (!s.detalhes?.length) return s;
      const det = s.detalhes.filter((d) => ehMeli(d.nome));
      if (!det.length) return null;
      const estado = det.some((d) => d.estado === "problema") ? "problema" : det.some((d) => d.estado === "atencao") ? "atencao" : "ok";
      // A resposta original conta todas as contas: aqui ela fala só das do Meli.
      const ruins = det.filter((d) => d.estado !== "ok");
      const resposta = ruins.length ? ruins.map((d) => `${d.nome}: ${d.valor}`).join(" · ") : "Contas do Mercado Livre em dia.";
      return { ...s, detalhes: det, estado, resposta } as typeof s;
    })
    .filter((s): s is NonNullable<typeof s> => !!s);
  const acoesMeli = resultados.linhas.filter((l) => l.feito.canais.some(ehMeli));

  /* Totais do Meli: a soma dos produtos do recorte. */
  const totais = { antes: ladoVazio(), agora: ladoVazio() };
  for (const l of queda.linhas) {
    for (const k of ["antes", "agora"] as const) {
      const t = totais[k];
      t.receita += l[k].receita;
      t.unidades += l[k].unidades;
      t.pedidos += l[k].pedidos;
      if (l[k].visitas != null) t.visitas = (t.visitas ?? 0) + l[k].visitas!;
    }
  }

  type CB = { codigo_externo: string; preco_promocional: number; fim: string | null; anuncios: { sku_canal: string | null } | null; promocoes_canal: { nome: string | null; tipo: string; fim: string | null } | null };
  const convites: ConviteQ[] = (convitesBrutos as CB[])
    .filter((c) => c.anuncios?.sku_canal && c.promocoes_canal)
    .map((c) => ({
      sku: c.anuncios!.sku_canal!,
      mlb: c.codigo_externo,
      promocao: c.promocoes_canal!.nome ?? c.promocoes_canal!.tipo,
      tipo: c.promocoes_canal!.tipo,
      preco: Number(c.preco_promocional),
      fim: diaSP(c.fim) ?? diaSP(c.promocoes_canal!.fim),
    }));

  /*
   * Promoção com o mesmo nome na planilha e na API é a mesma campanha medida
   * duas vezes: fica a da API, que tem a data real de entrada de cada anúncio.
   */
  const nomesApi = new Set(resultados.promocoes.filter((p) => p.origem === "Meli").map((p) => normal(p.nome)));
  const promocoesUnicas = resultados.promocoes.filter((p) => p.origem === "Meli" || !nomesApi.has(normal(p.nome)));

  /* Dia a dia, cancelamentos: das vendas diárias, sem os dias excluídos da análise. */
  type VD = { data: string; receita: number | null; visitas: number | null; valor_cancelado: number | null; pedidos: number | null; pedidos_cancelados: number | null; conta_canal_id: string };
  const { mantidas } = aplicar(
    (diarias as VD[]).map((l) => ({ ...l, data: String(l.data).slice(0, 10), canalId: meli.id, contaCanalId: l.conta_canal_id })),
    exclusoes
  );
  const somaDia = new Map<string, { receita: number; visitas: number }>();
  const canc = { antes: { receita: 0, cancelado: 0, pedidos: 0, pedidosCancelados: 0 }, agora: { receita: 0, cancelado: 0, pedidos: 0, pedidosCancelados: 0 } };
  for (const l of mantidas) {
    const x = somaDia.get(l.data) ?? { receita: 0, visitas: 0 };
    x.receita += Number(l.receita ?? 0);
    x.visitas += Number(l.visitas ?? 0);
    somaDia.set(l.data, x);
    const lado = l.data >= de && l.data <= ate ? canc.agora : l.data >= deAnterior && l.data <= ateAnterior ? canc.antes : null;
    if (lado) {
      lado.receita += Number(l.receita ?? 0);
      lado.cancelado += Number(l.valor_cancelado ?? 0);
      lado.pedidos += Number(l.pedidos ?? 0);
      lado.pedidosCancelados += Number(l.pedidos_cancelados ?? 0);
    }
  }

  /* Reputação: o último retrato de cada conta em cada período. */
  type RB = { conta_canal_id: string; data: string; nivel: string | null; reclamacoes_taxa: number | null; cancelamentos_taxa: number | null; atrasos_taxa: number | null };
  const retrato = (r: RB): ReputacaoQ => ({ nivel: r.nivel, reclamacoes: r.reclamacoes_taxa == null ? null : Number(r.reclamacoes_taxa), cancelamentos: r.cancelamentos_taxa == null ? null : Number(r.cancelamentos_taxa), atrasos: r.atrasos_taxa == null ? null : Number(r.atrasos_taxa) });
  const reputacao: ContaReputacaoQ[] = contas
    .map((c) => {
      const linhas = (reputacaoBruta as RB[]).filter((r) => r.conta_canal_id === c.id);
      const ultimo = (ateDia: string) => [...linhas].reverse().find((r) => String(r.data).slice(0, 10) <= ateDia);
      const a = ultimo(ateAnterior), b = ultimo(ate);
      return { conta: c.nome && c.nome !== "Conta principal" ? c.nome : "Mercado Livre", antes: a ? retrato(a) : null, agora: b && b !== a ? retrato(b) : b ? retrato(b) : null };
    })
    .filter((c) => c.agora);

  /* Margem: a mesma base dividida nos dois períodos. */
  let margem: MargemQ | null = null;
  if (baseMargem) {
    const recorte = (i: string, f: string): BaseMargem => ({ ...baseMargem, itens: baseMargem.itens.filter((x) => x.data >= i && x.data <= f) });
    const porSku = (b: BaseMargem) => new Map(agregar(b, "sku").map((l) => [l.chave.toUpperCase(), l]));
    const lado = (b: BaseMargem): MargemLadoQ => {
      let receita = 0, receitaApurada = 0, mg = 0, comissao = 0, tem = false;
      for (const l of agregar(b, "sku")) {
        receita += l.receita;
        receitaApurada += l.receitaApurada;
        comissao += l.comissao;
        if (l.margem != null) { mg += l.margem; tem = true; }
      }
      return { receita, receitaApurada, margem: tem ? mg : null, comissao };
    };
    const ba = recorte(deAnterior, ateAnterior), bg = recorte(de, ate);
    const sa = porSku(ba), sg = porSku(bg);
    const conv = (l: ReturnType<typeof agregar>[number] | undefined): MargemLadoQ =>
      l ? { receita: l.receita, receitaApurada: l.receitaApurada, margem: l.margem, comissao: l.comissao } : { receita: 0, receitaApurada: 0, margem: null, comissao: 0 };
    margem = {
      antes: lado(ba),
      agora: lado(bg),
      porSku: [...new Set([...sa.keys(), ...sg.keys()])].map((k) => ({ sku: k, titulo: (sg.get(k) ?? sa.get(k))!.rotulo, antes: conv(sa.get(k)), agora: conv(sg.get(k)) })),
    };
  }

  const familias: Record<string, string> = {};
  for (const a of familiasBrutas as { sku_canal: string | null; familia_nome: string | null }[]) {
    const k = (a.sku_canal ?? "").toUpperCase();
    if (k && a.familia_nome && !familias[k]) familias[k] = a.familia_nome;
  }

  /*
   * Anúncios que vendiam e pararam, só para os SKUs que caíram: quem vendeu
   * no período anterior e hoje está pausado ou com estoque zero.
   */
  const caiu = queda.linhas.filter((l) => l.delta < 0).map((l) => l.sku).filter(Boolean).slice(0, 200);
  const parados: Record<string, { mlb: string; status: string | null; estoque: number | null; unidadesAntes: number }[]> = {};
  if (caiu.length) {
    type PI = { anuncio_id: string | null; sku: string | null; quantidade: number; pedidos: { data: string; cancelado: boolean } | null };
    const itens = (await paginar(() =>
      sb
        .from("pedido_itens")
        .select("anuncio_id,sku,quantidade,pedidos!inner(data,cancelado,conta_canal_id)")
        .eq("operacao_id", op.id)
        .in("pedidos.conta_canal_id", idsContas)
        .in("sku", caiu)
        .gte("pedidos.data", deAnterior)
        .lte("pedidos.data", `${ateAnterior}T23:59:59`)
        .order("id")
    ).catch(() => [])) as unknown as PI[];
    const vendeu = new Map<string, { sku: string; unidades: number }>();
    for (const i of itens) {
      if (!i.anuncio_id || !i.sku || i.pedidos?.cancelado) continue;
      const x = vendeu.get(i.anuncio_id) ?? { sku: i.sku.toUpperCase(), unidades: 0 };
      x.unidades += i.quantidade;
      vendeu.set(i.anuncio_id, x);
    }
    if (vendeu.size) {
      const { data: ans } = await sb.from("anuncios").select("id,codigo_externo,status,estoque").in("id", [...vendeu.keys()].slice(0, 300));
      for (const a of (ans ?? []) as { id: string; codigo_externo: string; status: string | null; estoque: number | null }[]) {
        const pausado = a.status === "pausado" || a.status === "paused";
        if (!pausado && a.estoque !== 0) continue;
        const v = vendeu.get(a.id)!;
        (parados[v.sku] ??= []).push({ mlb: a.codigo_externo, status: a.status, estoque: a.estoque, unidadesAntes: v.unidades });
      }
    }
  }

  const gatilhos = avaliarGatilhos({
    de: queda.de,
    ate: queda.ate,
    hoje,
    dias: queda.dias + 1,
    diasAnterior: queda.diasAnterior + 1,
    totais,
    linhas: queda.linhas,
    saude,
    midia: midia?.oportunidades ?? [],
    promocoes: promocoesUnicas,
    convites,
    acoes: acoesMeli.map((l) => ({ id: l.id, titulo: l.titulo, fim: l.fim, veredito: l.veredito, efeito: l.efeito })),
    cancelamentos: canc,
    reputacao,
    margem,
    familias,
    parados,
  });

  const serie: DadosAcompanhamento["serie"] = [];
  for (let i = 0; i <= Math.max(queda.dias, queda.diasAnterior); i++) {
    const dia = mais(queda.de, i);
    const diaAnterior = mais(queda.deAnterior, i);
    // Fora do período (anterior mais curto, ou hoje sem fechar) é nulo, não zero.
    const atual = dia <= queda.ate ? somaDia.get(dia) : undefined;
    const ant = diaAnterior <= queda.ateAnterior ? somaDia.get(diaAnterior) : undefined;
    serie.push({
      dia, diaAnterior,
      receita: dia <= queda.ate ? Math.round(atual?.receita ?? 0) : null,
      receitaAnterior: diaAnterior <= queda.ateAnterior ? Math.round(ant?.receita ?? 0) : null,
      visitas: atual ? atual.visitas : null,
      visitasAnterior: ant ? ant.visitas : null,
    });
  }
  while (serie.length && serie[serie.length - 1].receita == null && serie[serie.length - 1].receitaAnterior == null) serie.pop();

  /* Histórico e régua de preço dos produtos que mais pesaram (até 6). */
  const doPreco = gatilhos.filter((g) => g.item && g.lados && ["S3", "S4", "S5"].includes(g.slide));
  const skus = [...new Set(doPreco.map((g) => g.item!.sku))].slice(0, 6);
  const [acontecimentos, tabelaBruta, padraoBruto, recordes, ...series] = await Promise.all([
    carregarAcontecimentos(sb, queda.deAnterior, queda.ate, [], idsContas).catch(() => [] as Acontecimento[]),
    skus.length
      ? sb
          .from("formula_base_precos")
          .select("chave,comissao,preco,vigente_de")
          .eq("operacao_id", op.id)
          .eq("chave_tipo", "sku")
          .in("chave", skus)
          .lte("vigente_de", hoje)
          .order("vigente_de", { ascending: false })
          .limit(200)
          .then((r) => r.data ?? [], () => [])
      : [],
    skus.length
      ? sb
          .from("formula_base_itens")
          .select("sku,comissao_padrao,tipo_anuncio,vigente_de")
          .eq("operacao_id", op.id)
          .in("sku", skus)
          .lte("vigente_de", hoje)
          .order("vigente_de", { ascending: false })
          .limit(200)
          .then((r) => r.data ?? [], () => [])
      : [],
    Promise.all(skus.map((s) => carregarRecordeSku(s, idsContas).catch(() => null as RecordeSku | null))),
    ...skus.map((sku) => serieDaQueda(`p:${sku}`, queda.deAnterior, queda.ate, meli.id).catch(() => [] as DiaQueda[])),
  ]);
  const historicos = Object.fromEntries(skus.map((sku, i) => [sku, series[i]]));

  type TB = { chave: string; comissao: number; preco: number; vigente_de: string };
  const precos: LinhaPreco[] = skus.map((sku, i) => {
    const g = doPreco.find((x) => x.item!.sku === sku)!;
    const linha = queda.linhas.find((l) => l.sku === sku);
    const vigente = (tabelaBruta as TB[]).filter((t) => t.chave.toUpperCase() === sku.toUpperCase());
    const ultimaVigencia = vigente[0]?.vigente_de;
    const grade = vigente.filter((t) => t.vigente_de === ultimaVigencia).map((t) => ({ comissao: Number(t.comissao), preco: Number(t.preco) }));
    // Comissão padrão do anúncio: clássico primeiro, que é o que a vitrine costuma mostrar.
    type PB = { sku: string | null; comissao_padrao: number; tipo_anuncio: string; vigente_de: string };
    const padroes = (padraoBruto as PB[]).filter((p) => (p.sku ?? "").toUpperCase() === sku.toUpperCase());
    const padrao = padroes.find((p) => p.tipo_anuncio === "classico") ?? padroes[0];
    const mgSku = margem?.porSku.find((p) => p.sku === sku.toUpperCase())?.agora;
    const praticada = mgSku && mgSku.receita > 0 && mgSku.comissao > 0 ? mgSku.comissao / mgSku.receita : null;
    // Sem comissão padrão na base, vale a praticada no período; sem nenhuma, a menor da grade (e a tela diz).
    const alvo = padrao ? Number(padrao.comissao_padrao) : praticada;
    const pela = padrao ? "padrão" as const : praticada != null ? "praticada" as const : "menor" as const;
    const escolhida = !grade.length ? null : alvo == null ? grade.sort((a, b) => a.comissao - b.comissao)[0] : grade.sort((a, b) => Math.abs(a.comissao - alvo) - Math.abs(b.comissao - alvo))[0];
    const tabela = escolhida ? { ...escolhida, pela } : null;
    // O preço com mais unidades, dia a dia, nos dois períodos.
    const porPreco = new Map<number, number>();
    for (const d of historicos[sku] ?? []) if (d.precoVendido && d.unidades) porPreco.set(Math.round(d.precoVendido), (porPreco.get(Math.round(d.precoVendido)) ?? 0) + d.unidades);
    const top = [...porPreco.entries()].sort((a, b) => b[1] - a[1])[0];
    const rec = recordes[i]?.recorde;
    const mg = margem?.porSku.find((p) => p.sku === sku.toUpperCase())?.agora;
    return {
      sku,
      titulo: g.item!.titulo,
      tabela,
      vitrineAntes: g.lados!.antes.precoVitrine,
      vitrineAgora: g.lados!.agora.precoVitrine,
      vitrineHoje: linha?.precoAtual ?? null,
      vendidoAntes: g.lados!.antes.precoVendido,
      vendidoAgora: g.lados!.agora.precoVendido,
      unidadesAntes: g.lados!.antes.unidades,
      unidadesAgora: g.lados!.agora.unidades,
      maisVendeu: top ? { preco: top[0], unidades: top[1] } : null,
      pico: rec ? { rotulo: rec.rotulo, unidades: rec.unidades, preco: rec.precoMedio } : null,
      comissaoPraticada: mg && mg.receita > 0 && mg.comissao > 0 ? mg.comissao / mg.receita : null,
    };
  });

  const skusDaOperacao = new Set(queda.linhas.map((l) => l.sku.toUpperCase()));
  const titulosDoPlano = acoesMeli.map((l) => l.titulo);
  const promocoes = promocoesUnicas
    .map((p) => ({ p, inicio: p.processadaEm.slice(0, 10), fim: mais(p.processadaEm.slice(0, 10), Math.max(0, p.dias - 1)) }))
    .filter(({ inicio, fim }) => inicio <= queda.ate && fim >= queda.deAnterior)
    .map(({ p, inicio, fim }) => ({ nome: p.nome, tipo: p.tipo ?? null, origem: p.origem ?? "planilha", inicio, fim, veredito: p.veredito, efeito: p.efeito, participam: p.participam }));

  return {
    de: queda.de,
    ate: queda.ate,
    deAnterior: queda.deAnterior,
    ateAnterior: queda.ateAnterior,
    janelaMidia: midia?.janela || null,
    gatilhos,
    aviso: resultados.aviso,
    totais,
    serie,
    /*
     * Só o que é desta operação: SKU do recorte, ou campanha do próprio
     * Planejamento. Na app o RLS já filtra; aqui é a segunda trava (a
     * leitura diária de estoque não filtra por operação).
     */
    acontecimentos: acontecimentos.filter((a) =>
      a.sku ? skusDaOperacao.has(a.sku.toUpperCase()) : titulosDoPlano.some((t) => a.texto.endsWith(`: ${t}`))
    ),
    historicos,
    promocoes,
    precos,
    reputacao,
    cancelamentos: canc,
    margem,
    ponte: montarPonte(queda.linhas, totais.antes.receita, totais.agora.receita, parados),
  };
}
