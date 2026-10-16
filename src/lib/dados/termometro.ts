import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/**
 * Termômetro do Mercado Livre — a leitura operacional do dia.
 *
 * ── A pergunta ──
 *
 * "Como estamos indo HOJE, e a semana está melhor ou pior que a passada?"
 * É a pergunta que se faz de manhã, antes de abrir qualquer relatório, e
 * que hoje exige abrir quatro telas e comparar na cabeça.
 *
 * ── A régua: semana contra semana, no mesmo ponto ──
 *
 * Comparar a semana inteira contra a semana inteira mente na quarta-feira:
 * três dias contra sete. Aqui a semana corrente é comparada com a MESMA
 * FATIA da anterior — se hoje é sexta, são segunda a sexta dos dois lados.
 * E cada dia é comparado com o mesmo dia da semana, porque sábado não se
 * parece com terça.
 *
 * ── O que entra ──
 *
 * Receita, pedidos, unidades, visitas, conversão e mídia saem de
 * `vendas_diarias` e dos pedidos. Reputação sai de `conta_reputacao_diaria`,
 * que a sincronização grava uma vez por dia: nível, reclamações,
 * cancelamentos, atrasos e perguntas sem resposta — os mesmos números que
 * o canal usa para classificar a conta.
 *
 * Nada aqui é estimado. Dia sem coleta fica nulo, e a tela mostra vazio em
 * vez de zero: zero significa "mediu e deu zero", e é diferente.
 */

export type DiaTermometro = {
  data: string;
  /** 0 = domingo. */
  diaSemana: number;
  receita: number;
  pedidos: number;
  unidades: number;
  cancelados: number;
  visitas: number | null;
  conversao: number | null;
  investimento: number;
  receitaAds: number;
  /** O mesmo dia da semana anterior, para a barra de comparação. */
  anterior: { data: string; receita: number; pedidos: number; unidades: number; visitas: number | null } | null;
};

export type ReputacaoConta = {
  conta: string;
  data: string;
  nivel: string | null;
  categoria: string | null;
  reclamacoes: number | null;
  cancelamentos: number | null;
  atrasos: number | null;
  vendas60d: number | null;
  perguntasSemResposta: number | null;
};

export type ProdutoDoDia = {
  mlb: string;
  sku: string;
  titulo: string;
  tipo: string;
  visitas: number;
  unidades: number;
  receita: number;
  conversao: number | null;
  estoque: number | null;
  preco: number | null;
};

export type Atencao = {
  chave: string;
  gravidade: "alta" | "media" | "baixa";
  titulo: string;
  detalhe: string;
  /** Em R$, quando o ponto tem dinheiro medido. Ordena a lista. */
  valor: number | null;
};

export type CampanhaNaSemana = {
  titulo: string;
  inicio: string;
  fim: string;
  status: string;
  tipo: string;
  skus: number;
  /** Cobre a semana corrente, a anterior, ou as duas. */
  onde: "esta semana" | "semana anterior" | "as duas";
};

export type DadosTermometro = {
  vazio: boolean;
  hoje: string;
  /** Segunda a domingo da semana corrente. */
  semana: { inicio: string; fim: string };
  semanaAnterior: { inicio: string; fim: string };
  /** Dias COMPLETOS da semana corrente — o corte da comparação justa. */
  diasCorridos: number;
  /** O dia de hoje ainda está acontecendo e fica fora do ritmo. */
  parcial: boolean;
  contas: { id: string; nome: string }[];
  contaSelecionada: string;
  dias: DiaTermometro[];
  diasAnteriores: DiaTermometro[];
  /** Semana até agora contra a mesma fatia da semana anterior. */
  ritmo: {
    receita: number;
    receitaAnterior: number;
    pedidos: number;
    pedidosAnterior: number;
    unidades: number;
    unidadesAnterior: number;
    visitas: number | null;
    visitasAnterior: number | null;
    investimento: number;
    investimentoAnterior: number;
    conversao: number | null;
    conversaoAnterior: number | null;
    ticket: number | null;
    ticketAnterior: number | null;
  };
  /** O dia de hoje contra o mesmo dia da semana passada. */
  dia: DiaTermometro | null;
  reputacao: ReputacaoConta[];
  maisVistos: ProdutoDoDia[];
  /** De qual dia é o ranking de visitas. */
  diaDoRanking: string;
  /** O que estava no ar nas duas semanas, do Planejamento. */
  campanhas: CampanhaNaSemana[];
  atencao: Atencao[];
  /** Última vez que cada fonte foi atualizada, para a tela dizer. */
  frescor: { vendas: string | null; visitas: string | null; ads: string | null; reputacao: string | null };
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const dia = (iso: string, passo: number) =>
  new Date(Date.parse(iso + "T12:00:00Z") + passo * 86400000).toISOString().slice(0, 10);
const diaSemanaDe = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();

/** Segunda-feira da semana de `iso`. A semana comercial começa na segunda. */
function segundaDe(iso: string) {
  const d = diaSemanaDe(iso);
  return dia(iso, d === 0 ? -6 : 1 - d);
}

export async function carregarTermometro(opcoes: { conta?: string; semana?: string } = {}): Promise<DadosTermometro> {
  const sb = await clienteServidor();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  /* A semana pode ser navegada; sem parâmetro, a corrente. */
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const referencia = opcoes.semana && ISO.test(opcoes.semana) && opcoes.semana <= hoje ? opcoes.semana : hoje;
  const inicio = segundaDe(referencia);
  const fim = dia(inicio, 6);
  const inicioAnt = dia(inicio, -7);
  const fimAnt = dia(inicioAnt, 6);
  /*
   * O ritmo conta só DIAS COMPLETOS.
   *
   * Hoje ainda está acontecendo: comparar uma sexta pela metade com a
   * sexta inteira da semana passada inventa uma queda que é só o relógio.
   * Então a semana corrente é medida até ontem, e hoje aparece à parte,
   * marcado como parcial. Semana passada conta os sete dias.
   */
  const ate = fim < hoje ? fim : hoje;
  const parcial = fim >= hoje;
  const ultimoCompleto = parcial ? dia(hoje, -1) : fim;
  const diasCorridos = Math.max(
    1,
    Math.round((Date.parse(ultimoCompleto + "T12:00:00Z") - Date.parse(inicio + "T12:00:00Z")) / 86400000) + 1
  );

  const [{ data: canais }, { data: contasRaw }] = await Promise.all([
    sb.from("canais").select("id,codigo").eq("ativo", true),
    sb.from("contas_canal").select("id,nome,canal_id"),
  ]);
  const canalML = (canais ?? []).find((c) => c.codigo === "mercado_livre")?.id ?? null;
  const contas = (contasRaw ?? []).filter((c) => c.canal_id === canalML).map((c) => ({ id: c.id as string, nome: c.nome as string }));
  const contaSelecionada = contas.some((c) => c.id === opcoes.conta) ? opcoes.conta! : "";
  const contasAtivas = contaSelecionada ? [contaSelecionada] : contas.map((c) => c.id);

  if (!canalML || !contas.length) {
    return {
      vazio: true, hoje, semana: { inicio, fim }, semanaAnterior: { inicio: inicioAnt, fim: fimAnt },
      diasCorridos, parcial, contas, contaSelecionada: "", dias: [], diasAnteriores: [], diaDoRanking: ate, campanhas: [],
      ritmo: { receita: 0, receitaAnterior: 0, pedidos: 0, pedidosAnterior: 0, unidades: 0, unidadesAnterior: 0, visitas: null, visitasAnterior: null, investimento: 0, investimentoAnterior: 0, conversao: null, conversaoAnterior: null, ticket: null, ticketAnterior: null },
      dia: null, reputacao: [], maisVistos: [], atencao: [],
      frescor: { vendas: null, visitas: null, ads: null, reputacao: null },
    };
  }

  const [diarias, itens, visitasRaw, anunciosRaw, repRaw] = await Promise.all([
    paginar(() =>
      sb
        .from("vendas_diarias")
        .select("data,conta_canal_id,receita,pedidos,visitas,investimento_ads,receita_ads,pedidos_cancelados,vendas_atualizadas_em,visitas_atualizadas_em,ads_atualizados_em")
        .in("conta_canal_id", contasAtivas)
        .gte("data", inicioAnt)
        .lte("data", fim)
        .order("data")
    ),
    paginar(() =>
      sb
        .from("pedido_itens")
        .select("sku,quantidade,total,preco_unitario,anuncio_id,pedidos!inner(data,conta_canal_id,cancelado)")
        .in("pedidos.conta_canal_id", contasAtivas)
        .eq("pedidos.cancelado", false)
        .gte("pedidos.data", inicioAnt)
        .lte("pedidos.data", fim)
    ),
    paginar(() =>
      sb
        .from("anuncio_desempenho_diario")
        .select("anuncio_id,data,visitas")
        .gte("data", inicioAnt)
        .lte("data", fim)
        .order("id")
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select("id,codigo_externo,sku_canal,titulo,tipo,status,estoque,preco_atual,conta_canal_id")
        .eq("canal_id", canalML)
    ),
    sb
      .from("conta_reputacao_diaria")
      .select("conta_canal_id,data,nivel,categoria,reclamacoes_taxa,cancelamentos_taxa,atrasos_taxa,vendas_60d,perguntas_sem_resposta")
      .in("conta_canal_id", contasAtivas)
      .order("data", { ascending: false })
      .limit(60),
  ]);

  const anuncios = anunciosRaw as unknown as {
    id: string; codigo_externo: string; sku_canal: string | null; titulo: string; tipo: string;
    status: string; estoque: number | null; preco_atual: string | number | null; conta_canal_id: string | null;
  }[];
  const anunPorId = new Map(anuncios.map((a) => [a.id, a]));
  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));

  /* ── Um registro por dia ── */
  type Acc = { receita: number; pedidos: number; unidades: number; cancelados: number; visitas: number | null; investimento: number; receitaAds: number };
  const vazio = (): Acc => ({ receita: 0, pedidos: 0, unidades: 0, cancelados: 0, visitas: null, investimento: 0, receitaAds: 0 });
  const porDia = new Map<string, Acc>();
  const pega = (d: string) => {
    let x = porDia.get(d);
    if (!x) porDia.set(d, (x = vazio()));
    return x;
  };

  for (const d of diarias as unknown as Record<string, unknown>[]) {
    const data = String(d.data).slice(0, 10);
    const x = pega(data);
    x.receita += n(d.receita);
    x.pedidos += n(d.pedidos);
    x.cancelados += n(d.pedidos_cancelados);
    x.investimento += n(d.investimento_ads);
    x.receitaAds += n(d.receita_ads);
    /* Visita é null quando não houve coleta: somar como zero faria a
       conversão do dia despencar sem nada ter acontecido. */
    if (d.visitas != null) x.visitas = (x.visitas ?? 0) + n(d.visitas);
  }

  type Item = { sku: string | null; quantidade: number; total: string | number | null; preco_unitario: string | number | null; anuncio_id: string | null; pedidos: { data: string } | null };
  const unidadesPorDiaAnuncio = new Map<string, { unidades: number; receita: number }>();
  for (const it of itens as unknown as Item[]) {
    const data = String(it.pedidos?.data ?? "").slice(0, 10);
    if (!data) continue;
    const q = n(it.quantidade);
    const valor = it.total == null ? q * n(it.preco_unitario) : n(it.total);
    pega(data).unidades += q;
    if (it.anuncio_id) {
      const k = `${data}|${it.anuncio_id}`;
      const g = unidadesPorDiaAnuncio.get(k) ?? { unidades: 0, receita: 0 };
      g.unidades += q;
      g.receita += valor;
      unidadesPorDiaAnuncio.set(k, g);
    }
  }

  /* Visitas por anúncio e por dia, para o ranking do dia. */
  const visitasPorDiaAnuncio = new Map<string, number>();
  for (const v of visitasRaw as unknown as { anuncio_id: string; data: string; visitas: number | null }[]) {
    const data = String(v.data).slice(0, 10);
    const a = anunPorId.get(v.anuncio_id);
    if (!a || (contaSelecionada && a.conta_canal_id !== contaSelecionada)) continue;
    const k = `${data}|${v.anuncio_id}`;
    visitasPorDiaAnuncio.set(k, (visitasPorDiaAnuncio.get(k) ?? 0) + n(v.visitas));
  }

  const monta = (d: string): DiaTermometro => {
    const x = porDia.get(d) ?? vazio();
    const ant = porDia.get(dia(d, -7));
    return {
      data: d,
      diaSemana: diaSemanaDe(d),
      receita: r2(x.receita),
      pedidos: x.pedidos,
      unidades: x.unidades,
      cancelados: x.cancelados,
      visitas: x.visitas,
      conversao: x.visitas && x.visitas > 0 ? r2((x.unidades * 100) / x.visitas) : null,
      investimento: r2(x.investimento),
      receitaAds: r2(x.receitaAds),
      anterior: ant
        ? { data: dia(d, -7), receita: r2(ant.receita), pedidos: ant.pedidos, unidades: ant.unidades, visitas: ant.visitas }
        : null,
    };
  };

  const dias: DiaTermometro[] = [];
  for (let d = inicio; d <= fim; d = dia(d, 1)) dias.push(monta(d));
  const diasAnteriores: DiaTermometro[] = [];
  for (let d = inicioAnt; d <= fimAnt; d = dia(d, 1)) diasAnteriores.push(monta(d));

  /* ── O ritmo: mesma fatia dos dois lados ── */
  const fatia = (lista: DiaTermometro[], quantos: number) => lista.slice(0, quantos);
  const soma = (lista: DiaTermometro[], campo: "receita" | "pedidos" | "unidades" | "investimento") =>
    r2(lista.reduce((s, d) => s + d[campo], 0));
  const somaVisitas = (lista: DiaTermometro[]) => {
    const medidos = lista.filter((d) => d.visitas != null);
    return medidos.length ? medidos.reduce((s, d) => s + (d.visitas ?? 0), 0) : null;
  };
  const atual = fatia(dias, diasCorridos);
  const antes = fatia(diasAnteriores, diasCorridos);
  const taxa = (un: number, vis: number | null) => (vis && vis > 0 ? r2((un * 100) / vis) : null);
  const tick = (rec: number, ped: number) => (ped > 0 ? r2(rec / ped) : null);

  const ritmo = {
    receita: soma(atual, "receita"),
    receitaAnterior: soma(antes, "receita"),
    pedidos: soma(atual, "pedidos"),
    pedidosAnterior: soma(antes, "pedidos"),
    unidades: soma(atual, "unidades"),
    unidadesAnterior: soma(antes, "unidades"),
    visitas: somaVisitas(atual),
    visitasAnterior: somaVisitas(antes),
    investimento: soma(atual, "investimento"),
    investimentoAnterior: soma(antes, "investimento"),
    conversao: taxa(soma(atual, "unidades"), somaVisitas(atual)),
    conversaoAnterior: taxa(soma(antes, "unidades"), somaVisitas(antes)),
    ticket: tick(soma(atual, "receita"), soma(atual, "pedidos")),
    ticketAnterior: tick(soma(antes, "receita"), soma(antes, "pedidos")),
  };

  /* ── Reputação: a leitura mais recente de cada conta ── */
  const repPorConta = new Map<string, ReputacaoConta>();
  for (const r of (repRaw.data ?? []) as unknown as Record<string, unknown>[]) {
    const id = String(r.conta_canal_id);
    if (repPorConta.has(id)) continue; // já ordenado do mais recente
    repPorConta.set(id, {
      conta: nomeConta.get(id) ?? "Conta",
      data: String(r.data).slice(0, 10),
      nivel: (r.nivel as string) ?? null,
      categoria: (r.categoria as string) ?? null,
      reclamacoes: r.reclamacoes_taxa == null ? null : n(r.reclamacoes_taxa) * 100,
      cancelamentos: r.cancelamentos_taxa == null ? null : n(r.cancelamentos_taxa) * 100,
      atrasos: r.atrasos_taxa == null ? null : n(r.atrasos_taxa) * 100,
      vendas60d: r.vendas_60d == null ? null : n(r.vendas_60d),
      perguntasSemResposta: r.perguntas_sem_resposta == null ? null : n(r.perguntas_sem_resposta),
    });
  }

  /*
   * ── Mais vistos: o último dia com COBERTURA, não o último com linha ──
   *
   * A coleta de visitas do dia corrente roda de madrugada e vai
   * completando: às 7h da manhã o dia tem cinco visitas no total, e o
   * ranking sairia com todo mundo empatado em 1. Só entra dia cujo total
   * chegue a pelo menos metade da mediana dos dias medidos.
   */
  const totalPorDia = new Map<string, number>();
  for (const [k, v] of visitasPorDiaAnuncio) {
    const d = k.split("|")[0];
    totalPorDia.set(d, (totalPorDia.get(d) ?? 0) + v);
  }
  const totais = [...totalPorDia.values()].sort((a, b) => a - b);
  const medianaDia = totais.length ? totais[Math.floor(totais.length / 2)] : 0;
  const diaDoRanking =
    [...totalPorDia.entries()]
      .filter(([d, t]) => d <= ate && t >= medianaDia / 2)
      .map(([d]) => d)
      .sort()
      .at(-1) ?? ate;
  const maisVistos: ProdutoDoDia[] = [...visitasPorDiaAnuncio]
    .filter(([k]) => k.startsWith(diaDoRanking + "|"))
    .map(([k, visitas]) => {
      const anuncioId = k.split("|")[1];
      const a = anunPorId.get(anuncioId);
      const venda = unidadesPorDiaAnuncio.get(k) ?? { unidades: 0, receita: 0 };
      return {
        mlb: a?.codigo_externo ?? "—",
        sku: (a?.sku_canal ?? "").toUpperCase(),
        titulo: a?.titulo ?? "",
        tipo: a?.tipo === "premium" ? "Premium" : "Clássico",
        visitas,
        unidades: venda.unidades,
        receita: r2(venda.receita),
        conversao: visitas > 0 ? r2((venda.unidades * 100) / visitas) : null,
        estoque: a?.estoque ?? null,
        preco: a?.preco_atual == null ? null : n(a.preco_atual),
      };
    })
    .sort((a, b) => b.visitas - a.visitas)
    .slice(0, 20);

  /* ── Pontos de atenção ── */
  const atencao: Atencao[] = [];
  const mediaVisitas = maisVistos.length ? maisVistos.reduce((s, p) => s + p.visitas, 0) / maisVistos.length : 0;

  for (const p of maisVistos) {
    if (p.visitas >= Math.max(30, mediaVisitas) && p.unidades === 0) {
      atencao.push({
        chave: `sem-venda-${p.mlb}`,
        gravidade: "alta",
        titulo: `${p.sku || p.mlb} teve ${p.visitas} visitas e nenhuma venda`,
        detalhe: `${p.titulo.slice(0, 60)} · ${p.tipo}${p.preco ? ` · ${p.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}`,
        valor: null,
      });
    }
    if (p.estoque === 0 && p.visitas > 0) {
      atencao.push({
        chave: `sem-estoque-${p.mlb}`,
        gravidade: "alta",
        titulo: `${p.sku || p.mlb} está com estoque zero e recebeu ${p.visitas} visitas`,
        detalhe: p.titulo.slice(0, 70),
        valor: null,
      });
    }
  }

  const hojeDia = dias.find((d) => d.data === ate) ?? null;
  if (hojeDia && hojeDia.investimento > 0 && hojeDia.receitaAds === 0) {
    atencao.push({
      chave: "ads-sem-retorno",
      gravidade: "media",
      titulo: `Mídia sem retorno atribuído hoje`,
      detalhe: `${hojeDia.investimento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} investidos e nenhuma receita creditada pelo canal até agora.`,
      valor: hojeDia.investimento,
    });
  }
  for (const r of repPorConta.values()) {
    if ((r.perguntasSemResposta ?? 0) > 0) {
      atencao.push({
        chave: `perguntas-${r.conta}`,
        gravidade: (r.perguntasSemResposta ?? 0) >= 5 ? "alta" : "media",
        titulo: `${r.perguntasSemResposta} pergunta(s) sem resposta em ${r.conta}`,
        detalhe: "Pergunta parada derruba a reputação e trava a venda de quem já estava decidindo.",
        valor: null,
      });
    }
    if ((r.atrasos ?? 0) >= 2) {
      atencao.push({
        chave: `atraso-${r.conta}`,
        gravidade: (r.atrasos ?? 0) >= 4 ? "alta" : "media",
        titulo: `Atrasos em ${r.atrasos?.toFixed(2)}% em ${r.conta}`,
        detalhe: "O canal corta exposição acima do limite da categoria.",
        valor: null,
      });
    }
    if ((r.reclamacoes ?? 0) >= 1) {
      atencao.push({
        chave: `reclamacao-${r.conta}`,
        gravidade: (r.reclamacoes ?? 0) >= 2 ? "alta" : "media",
        titulo: `Reclamações em ${r.reclamacoes?.toFixed(2)}% em ${r.conta}`,
        detalhe: "Acima de 2% a conta sai do verde.",
        valor: null,
      });
    }
  }
  if (ritmo.receitaAnterior > 0 && ritmo.receita < ritmo.receitaAnterior * 0.7) {
    atencao.push({
      chave: "ritmo",
      gravidade: "alta",
      titulo: `A semana está ${Math.round((1 - ritmo.receita / ritmo.receitaAnterior) * 100)}% abaixo da anterior`,
      detalhe: `${ritmo.receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} contra ${ritmo.receitaAnterior.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} nos mesmos ${diasCorridos} dias.`,
      valor: r2(ritmo.receitaAnterior - ritmo.receita),
    });
  }
  /*
   * O que estava no ar — do Planejamento.
   *
   * Sem isso o termômetro mostra a queda e não mostra a causa mais
   * comum dela: a campanha da semana passada acabou. Com a linha do
   * Planejamento ao lado, a comparação deixa de ser um susto.
   */
  const { data: campanhasRaw } = await sb
    .from("planejamento_itens")
    .select("titulo,inicio,fim,status,tipo,skus,canais")
    .lte("inicio", fim)
    .gte("fim", inicioAnt)
    .order("inicio");
  const campanhas: CampanhaNaSemana[] = ((campanhasRaw ?? []) as unknown as Record<string, unknown>[])
    .filter((c) => {
      const canaisItem = (c.canais ?? []) as string[];
      return !canaisItem.length || canaisItem.includes(canalML);
    })
    .map((c) => {
      const ini = String(c.inicio).slice(0, 10);
      const f = String(c.fim).slice(0, 10);
      const naSemana = ini <= fim && f >= inicio;
      const naAnterior = ini <= fimAnt && f >= inicioAnt;
      return {
        titulo: String(c.titulo),
        inicio: ini,
        fim: f,
        status: String(c.status),
        tipo: String(c.tipo),
        skus: ((c.skus ?? []) as string[]).length,
        onde: (naSemana && naAnterior ? "as duas" : naSemana ? "esta semana" : "semana anterior") as CampanhaNaSemana["onde"],
      };
    });

  /* Campanha que acabou na semana passada explica a queda desta. */
  const acabou = campanhas.filter((c) => c.onde === "semana anterior" && c.fim >= inicioAnt && c.fim < inicio);
  if (acabou.length && ritmo.receitaAnterior > ritmo.receita) {
    atencao.push({
      chave: "campanha-acabou",
      gravidade: "media",
      titulo:
        acabou.length === 1
          ? "A campanha que estava no ar na semana passada terminou"
          : `${acabou.length} campanhas que estavam no ar na semana passada terminaram`,
      detalhe: acabou.map((c) => `${c.titulo} (até ${c.fim.slice(8)}/${c.fim.slice(5, 7)})`).join(" · "),
      valor: null,
    });
  }

  const ordem = { alta: 0, media: 1, baixa: 2 };
  atencao.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || (b.valor ?? 0) - (a.valor ?? 0));

  const ultima = (campo: string) => {
    const valores = (diarias as unknown as Record<string, unknown>[])
      .map((d) => d[campo])
      .filter((v): v is string => typeof v === "string")
      .sort();
    return valores.at(-1) ?? null;
  };

  return {
    vazio: dias.every((d) => d.receita === 0 && d.pedidos === 0),
    hoje,
    semana: { inicio, fim },
    semanaAnterior: { inicio: inicioAnt, fim: fimAnt },
    diasCorridos,
    parcial,
    contas,
    contaSelecionada,
    dias,
    diasAnteriores,
    ritmo,
    dia: hojeDia,
    reputacao: [...repPorConta.values()],
    maisVistos,
    diaDoRanking,
    campanhas,
    atencao: atencao.slice(0, 12),
    frescor: {
      vendas: ultima("vendas_atualizadas_em"),
      visitas: ultima("visitas_atualizadas_em"),
      ads: ultima("ads_atualizados_em"),
      reputacao: [...repPorConta.values()].map((r) => r.data).sort().at(-1) ?? null,
    },
  };
}
