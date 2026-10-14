import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarBaseMargem, agregar } from "./margem";
import { carregarContasRecorte } from "./contas-recorte";
import { lerRecorte, noRecorte, opcoesRecorte, type GrupoRecorte } from "@/lib/recorte";
import { conferirInvestimento, periodoTrafego } from "@/lib/trafego-pago-filtros";
import { classificarOportunidades, type LinhaOportunidade, type Referencias } from "./trafego-oportunidades";

/**
 * Tráfego pago: a mídia contra a margem que ela produz.
 *
 * ── A pergunta que esta tela existe para responder ──
 *
 * Não é "qual o ACOS". O canal já mostra ACOS, e ele engana sozinho: um
 * ACOS de 14% parece ótimo até você descobrir que a margem daquele
 * anúncio é 13,8%. Aí cada venda que a mídia traz custa dinheiro.
 *
 * A pergunta é: **depois de pagar a mídia, sobra?** Só dá para responder
 * cruzando o gasto por anúncio com a margem por anúncio, e os dois vivem
 * em lugares diferentes até aqui.
 *
 * ── Três receitas diferentes, e a confusão que elas causam ──
 *
 *   receita atribuída   o que o canal credita ao ads
 *   receita direta      clicou no anúncio e comprou aquele anúncio
 *   receita real        o que o anúncio faturou, dos pedidos
 *
 * Medido nos dados reais: a atribuída é 55,9% da real, e 47,5% dela é
 * indireta — a pessoa clicou e comprou outra coisa.
 *
 * Isso importa porque o ROAS publicado usa a atribuída. Um ROAS de 8,4
 * não significa que a mídia gerou R$ 8,40 por real: significa que o canal
 * credita isso a ela. A tela mostra as duas, e a diferença é a margem de
 * dúvida da atribuição.
 *
 * ── O gasto que não vira nada ──
 *
 * Anúncio com investimento e sem receita atribuída se separa em dois
 * grupos que pedem decisões opostas:
 *
 *   não vendeu nem sozinho    →  30 anúncios, R$ 1.504,67 → desligar
 *   vendeu bem sem o ads      →  36 anúncios, R$ 2.784,58 → a mídia sobrou
 *
 * Um relatório de ads sozinho não distingue os dois. Aqui dá, porque o
 * sistema sabe o que cada anúncio faturou de verdade.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export type Periodo = { inicio: string; fim: string; rotulo: string };

export type LinhaAnuncioAds = {
  mlb: string;
  conta: string;
  sku: string;
  titulo: string;
  tipo: string;
  campanhas: string[];

  impressoes: number;
  cliques: number;
  investimento: number;
  /** Atribuída pelo canal. Inclui venda indireta. */
  receitaAtribuida: number;
  receitaDireta: number;
  receitaIndireta: number;

  /** Faturamento real do anúncio no período, dos pedidos. */
  receitaReal: number;
  /** Margem de contribuição real, quando o custo do SKU está cadastrado. */
  margem: number | null;
  margemPct: number | null;

  cpc: number | null;
  acos: number | null;
  roas: number | null;
  /** Margem menos a mídia. Negativo = a mídia comeu mais do que sobrou. */
  sobraAposMidia: number | null;
  /** Sem receita atribuída: vendeu por fora, ou não vendeu nada? */
  situacao: "ok" | "sem_retorno" | "vendeu_sem_ads" | "prejuizo";
};

export type LinhaCampanha = {
  campanha: string;
  conta: string;
  anuncios: number;
  investimento: number;
  receitaAtribuida: number;
  cliques: number;
  acos: number | null;
  roas: number | null;
  margem: number | null;
  sobraAposMidia: number | null;
};

export type PeriodoResumo = {
  rotulo: string;
  inicio: string;
  fim: string;
  investimento: number;
  receitaAtribuida: number;
  cliques: number;
  acos: number | null;
  roas: number | null;
  cpc: number | null;
};

/** Um dia da série de mídia, de `vendas_diarias`. */
export type DiaTrafego = {
  midiaInformada?: boolean;
  data: string;
  investimento: number;
  /** Receita que o canal atribuiu à mídia naquele dia. */
  receitaAds: number;
  /** Faturamento total do dia, de todos os canais do recorte. */
  receita: number;
};

export type DadosTrafegoPago = {
  contasDoRelatorio?: string[];
  contaNaoIdentificada?: boolean;
  vazio: boolean;
  /** A janela analisada, `inicio|fim`. As outras ficam em `periodos`. */
  janela: string;
  /** O canal ou conta escolhido, no formato do seletor. */
  recorte: string;
  /** As opções do seletor de canais, com as contas de cada um. */
  opcoes: GrupoRecorte[];
  /**
   * O gasto DIA A DIA, que é o que o calendário recorta.
   *
   * Vem de `vendas_diarias`, não de `anuncio_ads`: a tabela por anúncio
   * guarda relatórios de intervalo fechado e sobreposto, e dentro de um
   * relatório não há como saber o que foi gasto no dia 12. A rotina
   * noturna pergunta o número de cada dia separadamente ao canal, e é
   * essa série que permite escolher qualquer período.
   *
   * O que ela NÃO tem é a quebra por anúncio e campanha — isso só existe
   * por janela. Por isso a tela tem as duas coisas: o calendário manda
   * nos totais, e o seletor de relatório manda na tabela por anúncio.
   */
  serie: DiaTrafego[];
  periodo: { de: string; ate: string };
  periodos: PeriodoResumo[];
  linhas: LinhaAnuncioAds[];
  campanhas: LinhaCampanha[];
  totais: {
    investimento: number;
    receitaAtribuida: number;
    receitaReal: number;
    receitaIndireta: number;
    margem: number | null;
    sobraAposMidia: number | null;
    /** Quanto da receita real o canal credita à mídia. */
    atribuicao: number | null;
    /** Quantos SKUs têm custo, para não ler margem parcial como total. */
    coberturaMargem: number;
    /**
     * TACoS: a mídia sobre o faturamento TOTAL da conta na janela, não só
     * sobre o que o canal atribui a ela.
     *
     * É a métrica de decidir escalar ou parar, e a que o painel do canal
     * não mostra. O ACoS responde "a campanha é eficiente"; o TACoS
     * responde "quanto do meu faturamento está indo para mídia". ACoS bom
     * com TACoS subindo e receita total parada é canibalização: a mídia
     * está comprando a venda que já era orgânica.
     */
    tacos: number | null;
    /** Faturamento real de TODOS os anúncios na janela, o denominador do TACoS. */
    receitaTotalConta: number;
  };
  /** Relatório e série diária do mesmo recorte e intervalo. */
  conferencia: ReturnType<typeof conferirInvestimento> | null;
  /**
   * O que fazer com cada anúncio — inclusive os que NÃO têm mídia.
   *
   * A tabela de cima responde pelo dinheiro que já foi gasto. Esta
   * responde pelo que ainda não foi: o anúncio que converte bem e é
   * pouco visto nunca aparece num relatório de ads, porque o canal só
   * conhece quem já anuncia.
   */
  oportunidades: LinhaOportunidade[];
  referencias: Referencias | null;
};

export async function carregarTrafegoPago(
  /** `inicio|fim` da janela a analisar. Sem isso, a mais recente. */
  janela?: string,
  /**
   * Canal ou conta. A mídia é comprada POR CONTA — a Probel tem duas no
   * Mercado Livre, com verba e resultado separados —, e somar as duas
   * esconde qual está pagando caro pelo clique.
   *
   * Hoje só o Meli manda relatório de mídia, mas o recorte já é geral: o
   * dia que outro canal entrar, a tela não muda.
   */
  recorte?: string,
  /** Recorte de datas da SÉRIE diária. Sem isso, os últimos 30 dias. */
  periodo?: { de?: string; ate?: string }
): Promise<DadosTrafegoPago> {
  const sb = await clienteServidor();

  const r = lerRecorte(recorte);
  const [adsRaw, anunciosRaw, diariasRaw, contasRecorte] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncio_ads")
        .select(
          "codigo_externo,conta_canal_id,campanha,inicio,fim,impressoes,cliques,investimento,receita,receita_direta,receita_indireta"
        )
        .order("inicio")
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select("id,codigo_externo,sku_canal,titulo,tipo,status,estoque,canal_id,conta_canal_id")
        .order("codigo_externo")
    ),
    paginar(() =>
      sb
        .from("vendas_diarias")
        .select("data,investimento_ads,receita_ads,receita,canal_id,conta_canal_id")
        .order("data")
    ),
    carregarContasRecorte(),
  ]);

  type Diaria = {
    data: string; investimento_ads: string | number | null; receita_ads: string | number | null;
    receita: string | number | null; canal_id: string | null; conta_canal_id: string | null;
  };
  const diarias = (diariasRaw as unknown as Diaria[]).filter((d) =>
    noRecorte(r, { canalId: d.canal_id, contaCanalId: d.conta_canal_id })
  );
  const ultimoDia = diarias.map((d) => String(d.data).slice(0, 10)).sort().at(-1)
    ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { de: deSerie, ate: ateSerie } = periodoTrafego(periodo, ultimoDia);
  const porDia = new Map<string, DiaTrafego>();
  for (const d of diarias) {
    const data = String(d.data).slice(0, 10);
    if (data < deSerie || data > ateSerie) continue;
    const x = porDia.get(data) ?? { data, investimento: 0, receitaAds: 0, receita: 0, midiaInformada: false };
    x.midiaInformada = x.midiaInformada || d.investimento_ads != null;
    x.investimento += n(d.investimento_ads);
    x.receitaAds += n(d.receita_ads);
    x.receita += n(d.receita);
    porDia.set(data, x);
  }
  const serie = [...porDia.values()]
    .map((d) => ({ ...d, investimento: r2(d.investimento), receitaAds: r2(d.receitaAds), receita: r2(d.receita) }))
    .sort((a, b) => a.data.localeCompare(b.data));

  type Ads = {
    codigo_externo: string;
    conta_canal_id: string | null;
    campanha: string;
    inicio: string;
    fim: string;
    impressoes: number;
    cliques: number;
    investimento: string | number;
    receita: string | number;
    receita_direta: string | number;
    receita_indireta: string | number;
  };
  const todas = adsRaw as unknown as Ads[];
  if (!todas.length) {
    return {
      vazio: true, janela: "", periodos: [], linhas: [], campanhas: [],
      recorte: recorte ?? "", opcoes: opcoesRecorte(contasRecorte),
      serie, periodo: { de: deSerie, ate: ateSerie },
      totais: {
        investimento: 0, receitaAtribuida: 0, receitaReal: 0, receitaIndireta: 0,
        margem: null, sobraAposMidia: null, atribuicao: null, coberturaMargem: 0,
        tacos: null, receitaTotalConta: 0,
      },
      conferencia: null,
      oportunidades: [],
      referencias: null,
    };
  }

  /*
   * ── Uma janela por vez, e isto não é preferência de tela ──
   *
   * Cada linha de `anuncio_ads` é um RELATÓRIO do canal para um intervalo,
   * e os intervalos se sobrepõem: nos dados da Probel são 17 janelas com
   * 98 pares sobrepostos. Agosto aparece em sete delas — 08-01→08-31,
   * 08-01→09-28, 08-01→09-30, 08-01→10-01, 08-01→10-02, 08-01→10-05 e
   * 07-30→09-28 —, porque o canal reexporta o acumulado a cada pedido de
   * relatório.
   *
   * Somar tudo contava o gasto de agosto sete vezes: a tela mostrava
   * R$ 242 mil investidos onde o real é uma fração disso. Não dava erro
   * nenhum, só um número inflado que ninguém tinha como desconfiar.
   *
   * Então o padrão é a janela mais recente, e trocar de janela é escolha
   * explícita. Dentro de uma janela os números são do mesmo relatório e
   * fecham entre si.
   */
  /*
   * A mais recente é a de FIM mais recente, não de início mais recente.
   * Ordenar pela chave crua (`inicio|fim`) escolheria 22/09→28/09 em vez
   * de 11/09→11/10, porque "09-22" é maior que "09-11" como texto — um
   * relatório de uma semana atrás ganharia do de ontem.
   */
  /* O catálogo vem primeiro: é ele que diz de qual conta é cada anúncio,
     e o recorte abaixo depende disso. */
  type Anun = {
    id: string;
    codigo_externo: string;
    sku_canal: string | null;
    titulo: string;
    tipo: string;
    status: string | null;
    estoque: number | null;
    canal_id: string | null;
    conta_canal_id: string | null;
  };
  const info = new Map(
    (anunciosRaw as unknown as Anun[]).map((a) => [a.codigo_externo, a])
  );
  const contas = new Map(contasRecorte.map((c) => [c.contaId, c]));
  const contaDoAnuncio = new Map<string, string>();
  for (const a of todas) {
    const conta = a.conta_canal_id || info.get(a.codigo_externo)?.conta_canal_id;
    if (conta) contaDoAnuncio.set(a.codigo_externo, conta);
  }
  const nomeConta = (mlb: string) => {
    const c = contas.get(contaDoAnuncio.get(mlb) ?? "");
    return c ? `${c.canalNome} · ${c.contaNome}` : "Conta não identificada";
  };

  /*
   * O recorte entra ANTES da escolha da janela: uma conta pode ter
   * relatórios em janelas que a outra não tem, e listar janelas vazias no
   * seletor faria a tela abrir sem número nenhum.
   *
   * Mídia de anúncio que o catálogo não conhece fica de fora quando há
   * recorte: sem o anúncio não dá para saber de que conta é, e somá-la a
   * um canal escolhido seria inventar.
   */
  const dentro = (codigo: string) => {
    if (!r.canalId && !r.contaCanalId) return true;
    const a = info.get(codigo);
    const contaId = contaDoAnuncio.get(codigo);
    return noRecorte(r, { canalId: a?.canal_id ?? contas.get(contaId ?? "")?.canalId, contaCanalId: contaId });
  };
  const noCanal = todas.filter((a) => dentro(a.codigo_externo));

  if (!noCanal.length) {
    return {
      vazio: true, janela: "", periodos: [], linhas: [], campanhas: [],
      recorte: recorte ?? "", opcoes: opcoesRecorte(contasRecorte),
      serie, periodo: { de: deSerie, ate: ateSerie },
      totais: {
        investimento: 0, receitaAtribuida: 0, receitaReal: 0, receitaIndireta: 0,
        margem: null, sobraAposMidia: null, atribuicao: null, coberturaMargem: 0,
        tacos: null, receitaTotalConta: 0,
      },
      conferencia: null,
      oportunidades: [],
      referencias: null,
    };
  }

  const janelas = [...new Set(noCanal.map((a) => `${a.inicio}|${a.fim}`))].sort((x, y) => {
    const [ix, fx] = x.split("|");
    const [iy, fy] = y.split("|");
    return fx.localeCompare(fy) || ix.localeCompare(iy);
  });
  const escolhida = janela && janelas.includes(janela) ? janela : janelas[janelas.length - 1];
  const ads = noCanal.filter((a) => `${a.inicio}|${a.fim}` === escolhida && [a.impressoes, a.cliques, a.investimento, a.receita].some((v) => n(v) !== 0));

  /* ── O intervalo que a mídia cobre define a janela da margem ── */

  const [inicio, fim] = escolhida.split("|");

  const idsContasRelatorio = new Set(noCanal.filter((a) => `${a.inicio}|${a.fim}` === escolhida).map((a) => contaDoAnuncio.get(a.codigo_externo)).filter((v): v is string => Boolean(v)));
  const contaNaoIdentificada = ads.some((a) => !contaDoAnuncio.has(a.codigo_externo));
  const baseCompleta = await carregarBaseMargem({ inicio, fim, canalId: recorte });
  // Mesmo sem filtro, o relatório não pode usar vendas de canais sem mídia
  // ou de contas que não têm relatório nesta janela como base do TACoS.
  const base = { ...baseCompleta, itens: baseCompleta.itens.filter((it) => idsContasRelatorio.has(it.contaCanalId)) };
  const margemPorMlb = new Map(agregar(base, "anuncio").map((l) => [l.chave, l]));

  /*
   * ── Visitas da MESMA janela da mídia ──
   *
   * Sem elas não há conversão, e sem conversão não há como separar
   * "pouco visto" de "não convence". A leitura é por data e vem depois
   * da escolha da janela, como a da margem: o intervalo só existe aqui.
   */
  const visitasRaw = await paginar(() =>
    sb
      .from("anuncio_desempenho_diario")
      .select("anuncio_id,visitas,data")
      .gte("data", inicio)
      .lte("data", fim)
      .order("id")
  );
  const mlbDoId = new Map((anunciosRaw as unknown as Anun[]).map((a) => [a.id, a.codigo_externo]));
  const visitasPorMlb = new Map<string, number>();
  for (const v of visitasRaw as unknown as { anuncio_id: string; visitas: number | null }[]) {
    const mlb = mlbDoId.get(v.anuncio_id);
    if (!mlb) continue;
    visitasPorMlb.set(mlb, (visitasPorMlb.get(mlb) ?? 0) + n(v.visitas));
  }

  /* ── Agrega a mídia por anúncio ── */

  type Ac = {
    imp: number; cli: number; inv: number;
    rec: number; recD: number; recI: number;
    campanhas: Set<string>;
  };
  const porMlb = new Map<string, Ac>();
  const porCampanha = new Map<string, Ac & { nome: string; conta: string; mlbs: Set<string> }>();
  const porPeriodo = new Map<string, PeriodoResumo>();

  for (const a of noCanal) {
    const chaveP = `${a.inicio}|${a.fim}`;
    const pp =
      porPeriodo.get(chaveP) ??
      {
        rotulo: rotuloPeriodo(a.inicio, a.fim),
        inicio: a.inicio, fim: a.fim,
        investimento: 0, receitaAtribuida: 0, cliques: 0,
        acos: null, roas: null, cpc: null,
      };
    pp.investimento += n(a.investimento);
    pp.receitaAtribuida += n(a.receita);
    pp.cliques += a.cliques;
    porPeriodo.set(chaveP, pp);
  }

  for (const a of ads) {
    const at =
      porMlb.get(a.codigo_externo) ??
      { imp: 0, cli: 0, inv: 0, rec: 0, recD: 0, recI: 0, campanhas: new Set<string>() };
    at.imp += a.impressoes;
    at.cli += a.cliques;
    at.inv += n(a.investimento);
    at.rec += n(a.receita);
    at.recD += n(a.receita_direta);
    at.recI += n(a.receita_indireta);
    at.campanhas.add(a.campanha);
    porMlb.set(a.codigo_externo, at);

    const chaveCampanha = `${contaDoAnuncio.get(a.codigo_externo) ?? a.codigo_externo}|${a.campanha}`;
    const c =
      porCampanha.get(chaveCampanha) ??
      { nome: a.campanha, conta: nomeConta(a.codigo_externo), imp: 0, cli: 0, inv: 0, rec: 0, recD: 0, recI: 0, campanhas: new Set<string>(), mlbs: new Set<string>() };
    c.imp += a.impressoes;
    c.cli += a.cliques;
    c.inv += n(a.investimento);
    c.rec += n(a.receita);
    c.mlbs.add(a.codigo_externo);
    porCampanha.set(chaveCampanha, c);

  }

  /* ── Monta as linhas por anúncio ── */

  const linhas: LinhaAnuncioAds[] = [];
  let comCusto = 0;

  for (const [mlb, a] of porMlb) {
    const i = info.get(mlb);
    const m = margemPorMlb.get(mlb);
    const receitaReal = m?.receita ?? 0;
    const margem = m && m.cobertura >= 99.5 ? m.margem : null;
    if (margem != null) comCusto += 1;

    const sobra = margem == null ? null : r2(margem - a.inv);

    /*
     * A situação é o que transforma o número em decisão.
     *
     * "sem_retorno" e "vendeu_sem_ads" parecem iguais no relatório do
     * canal — investimento com receita atribuída zero — e pedem ações
     * opostas: um se desliga, o outro mostra que a mídia estava sobrando
     * num anúncio que já vendia.
     */
    let situacao: LinhaAnuncioAds["situacao"] = "ok";
    if (a.inv > 0 && a.rec === 0) {
      situacao = receitaReal > 0 ? "vendeu_sem_ads" : "sem_retorno";
    } else if (sobra != null && sobra < 0) {
      situacao = "prejuizo";
    }

    linhas.push({
      mlb,
      conta: nomeConta(mlb),
      sku: i?.sku_canal ?? "",
      titulo: i?.titulo ?? "",
      tipo: i?.tipo ?? "—",
      campanhas: [...a.campanhas].sort(),
      impressoes: a.imp,
      cliques: a.cli,
      investimento: r2(a.inv),
      receitaAtribuida: r2(a.rec),
      receitaDireta: r2(a.recD),
      receitaIndireta: r2(a.recI),
      receitaReal: r2(receitaReal),
      margem,
      margemPct: margem != null ? m?.margemPct ?? null : null,
      cpc: a.cli > 0 ? r2(a.inv / a.cli) : null,
      acos: a.rec > 0 ? r2((a.inv * 100) / a.rec) : null,
      roas: a.inv > 0 && a.rec > 0 ? r2(a.rec / a.inv) : null,
      sobraAposMidia: sobra,
      situacao,
    });
  }

  linhas.sort((a, b) => b.investimento - a.investimento);

  /*
   * ── Oportunidades: todo anúncio do recorte, não só os com mídia ──
   *
   * Entra quem teve mídia, venda ou visita na janela. Anúncio sem
   * nenhuma das três não tem o que decidir, e encher a tabela com ele
   * esconderia os que importam.
   */
  const candidatos = (anunciosRaw as unknown as Anun[]).filter((a) => {
    if (!dentro(a.codigo_externo)) return false;
    const ads = porMlb.get(a.codigo_externo);
    const m = margemPorMlb.get(a.codigo_externo);
    return Boolean(ads) || (m?.unidades ?? 0) > 0 || (visitasPorMlb.get(a.codigo_externo) ?? 0) > 0;
  });

  const { linhas: oportunidades, referencias } = classificarOportunidades(
    candidatos.map((a) => {
      const ads = porMlb.get(a.codigo_externo);
      const m = margemPorMlb.get(a.codigo_externo);
      const margem = m && m.cobertura >= 99.5 ? m.margem : null;
      return {
        mlb: a.codigo_externo,
        sku: a.sku_canal ?? "",
        titulo: a.titulo ?? "",
        conta: nomeConta(a.codigo_externo),
        tipo: a.tipo ?? "—",
        visitas: visitasPorMlb.has(a.codigo_externo) ? visitasPorMlb.get(a.codigo_externo)! : null,
        unidades: m?.unidades ?? 0,
        receitaReal: r2(m?.receita ?? 0),
        margem,
        margemPct: margem != null ? m?.margemPct ?? null : null,
        investimento: r2(ads?.inv ?? 0),
        receitaAtribuida: r2(ads?.rec ?? 0),
        estoque: a.estoque,
        status: a.status,
      };
    })
  );

  /* ── Campanhas ── */

  const margemPorMlbMap = margemPorMlb;
  const campanhas: LinhaCampanha[] = [...porCampanha.entries()]
    .map(([, c]) => {
      let margem: number | null = null;
      let completa = true;
      for (const mlb of c.mlbs) {
        const linha = margemPorMlbMap.get(mlb);
        const m = linha && linha.cobertura >= 99.5 ? linha.margem : null;
        if (m == null || (porMlb.get(mlb)?.campanhas.size ?? 0) > 1) completa = false;
        if (m != null) margem = (margem ?? 0) + m;
      }
      if (!completa) margem = null;
      return {
        campanha: c.nome,
        conta: c.conta,
        anuncios: c.mlbs.size,
        investimento: r2(c.inv),
        receitaAtribuida: r2(c.rec),
        cliques: c.cli,
        acos: c.rec > 0 ? r2((c.inv * 100) / c.rec) : null,
        roas: c.inv > 0 && c.rec > 0 ? r2(c.rec / c.inv) : null,
        margem: margem == null ? null : r2(margem),
        sobraAposMidia: margem == null ? null : r2(margem - c.inv),
      };
    })
    .sort((a, b) => b.investimento - a.investimento);

  /* ── Períodos ── */

  const periodos = [...porPeriodo.values()]
    .map((p) => ({
      ...p,
      investimento: r2(p.investimento),
      receitaAtribuida: r2(p.receitaAtribuida),
      acos: p.receitaAtribuida > 0 ? r2((p.investimento * 100) / p.receitaAtribuida) : null,
      roas: p.investimento > 0 && p.receitaAtribuida > 0 ? r2(p.receitaAtribuida / p.investimento) : null,
      cpc: p.cliques > 0 ? r2(p.investimento / p.cliques) : null,
    }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const conferencia = conferirInvestimento(diarias.filter((d) => idsContasRelatorio.has(d.conta_canal_id ?? "")), inicio, fim, r2(ads.reduce((s, a) => s + n(a.investimento), 0)), idsContasRelatorio.size);

  /* ── Totais ── */

  const investimento = r2(linhas.reduce((s, l) => s + l.investimento, 0));
  const receitaAtribuida = r2(linhas.reduce((s, l) => s + l.receitaAtribuida, 0));
  const receitaReal = r2(linhas.reduce((s, l) => s + l.receitaReal, 0));
  const receitaIndireta = r2(linhas.reduce((s, l) => s + l.receitaIndireta, 0));
  const margemTotal = linhas.every((l) => l.margem != null) ? linhas.reduce<number | null>(
    (s, l) => (l.margem == null ? s : (s ?? 0) + l.margem),
    null
  ) : null;

  /*
   * O denominador do TACoS é o faturamento de TODOS os anúncios da conta
   * na janela — não só dos que receberam mídia. Usar só os anunciados
   * daria um TACoS alto demais, porque esconderia justamente o orgânico
   * que a pergunta quer medir.
   */
  const receitaTotalConta = r2(
    [...margemPorMlb.values()].reduce((s, l) => s + (l.receita ?? 0), 0)
  );
  const tacos = !contaNaoIdentificada && receitaTotalConta > 0 ? r2((investimento * 100) / receitaTotalConta) : null;

  return {
    vazio: false,
    contasDoRelatorio: [...idsContasRelatorio].map((id) => { const c = contas.get(id); return c ? `${c.canalNome} · ${c.contaNome}` : "Conta não identificada"; }),
    contaNaoIdentificada,
    janela: escolhida,
    recorte: recorte ?? "",
    opcoes: opcoesRecorte(contasRecorte),
    serie,
    periodo: { de: deSerie, ate: ateSerie },
    periodos,
    linhas,
    campanhas,
    totais: {
      investimento,
      receitaAtribuida,
      receitaReal,
      receitaIndireta,
      margem: margemTotal == null ? null : r2(margemTotal),
      sobraAposMidia: margemTotal == null ? null : r2(margemTotal - investimento),
      atribuicao: receitaReal > 0 ? r2((receitaAtribuida * 100) / receitaReal) : null,
      coberturaMargem: linhas.length ? r2((comCusto * 100) / linhas.length) : 0,
      tacos,
      receitaTotalConta,
    },
    conferencia,
    oportunidades,
    referencias,
  };
}

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function rotuloPeriodo(inicio: string, fim: string): string {
  const mi = Number(inicio.slice(5, 7)) - 1;
  const ultimoDia = new Date(Date.UTC(Number(inicio.slice(0, 4)), mi + 1, 0)).getUTCDate();
  if (inicio.slice(0, 7) === fim.slice(0, 7) && inicio.endsWith("-01") && Number(fim.slice(8, 10)) === ultimoDia) {
    return `${MESES[mi]}/${inicio.slice(2, 4)}`;
  }
  const data = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
  return `${data(inicio)} a ${data(fim)}`;
}
