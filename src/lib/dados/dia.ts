import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";
import { ticketMedio, pedidosValidos } from "@/lib/ticket";
import {
  lerRecorte,
  noRecorte,
  recorteParcial,
  canalDoRecorte,
  opcoesRecorte,
  type GrupoRecorte,
} from "@/lib/recorte";
import { carregarContasRecorte } from "./contas-recorte";

/**
 * O dia, e os dias do mês ao redor dele.
 *
 * ── Por que uma tela só para o dia ──
 *
 * "Mês até aqui" responde se o mês fecha. Não responde o que fazer hoje.
 * Quem abre o painel de manhã quer saber três coisas: como foi ontem, se
 * bateu a meta, e o que mudou em relação ao que vinha sendo — e essas
 * três não aparecem num acumulado.
 *
 * ── Contra o que o dia é comparado ──
 *
 * Contra o dia anterior, contra a MESMA DIA DA SEMANA da semana passada,
 * e contra a média dos dias equivalentes do mês.
 *
 * O mesmo dia da semana é o que evita a conclusão errada mais comum do
 * varejo: segunda sempre parece ruim comparada a domingo. Sem esse
 * pareamento, toda segunda-feira vira "a operação caiu".
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export type DiaLinha = {
  data: string;
  /** 0 = domingo. */
  diaSemana: number;
  receita: number;
  receitaLiquida: number;
  pedidos: number;
  pedidosValidos: number;
  cancelados: number;
  valorCancelado: number;
  visitas: number;
  ads: number;
  ticket: number | null;
  conversao: number | null;
  meta: number;
  /** receita líquida − meta. Positivo = bateu. */
  sobraMeta: number;
  bateu: boolean | null;
  /** O dia ainda não terminou ou não foi importado. */
  parcial: boolean;
};

export type Comparacao = {
  rotulo: string;
  receita: number | null;
  variacao: number | null;
};

/** Uma conta de canal no dia em foco. */
export type DiaCanal = {
  contaId: string;
  canal: string;
  conta: string;
  receitaLiquida: number;
  pedidosValidos: number;
  cancelados: number;
  valorCancelado: number;
  visitas: number;
  conversao: number | null;
  ads: number;
  /** ads ÷ receita líquida, em %. */
  tacos: number | null;
  ticket: number | null;
};

/** Um produto vendido no dia em foco. */
export type DiaProduto = {
  sku: string;
  titulo: string;
  unidades: number;
  receita: number;
  pedidos: number;
  /** Em quais contas de canal ele vendeu. */
  canais: string[];
};

export type DadosDia = {
  vazio: boolean;
  /** O dia em foco. Sem `data` na URL, é o último com movimento. */
  hoje: DiaLinha | null;
  /** Todos os dias do mês do dia em foco. */
  mes: DiaLinha[];
  mesRotulo: string;
  comparacoes: Comparacao[];
  /** Melhor e pior dia do mês, entre os que já têm dado. */
  melhor: DiaLinha | null;
  pior: DiaLinha | null;
  /** Quantos dias do mês bateram a meta, de quantos com meta. */
  bateram: number;
  comMeta: number;
  /** Opções do seletor: canais e, onde há mais de uma, suas contas. */
  opcoes: GrupoRecorte[];
  /** O recorte atual, no formato da URL (`uuid` ou `conta:uuid`). */
  canalId: string;
  /**
   * Recorte é uma conta que divide o canal com outra. A meta é gravada por
   * canal, então nesse caso ela não se aplica e a tela diz por quê.
   */
  metaPorConta: boolean;
  /** Última data com movimento na base. */
  ultimaData: string | null;
  /** Primeira data com movimento: o limite para voltar de mês. */
  primeiraData: string | null;
  /** O recorte em lista (vazio = todos os canais). */
  canaisSelecionados: string[];
  /** O dia em foco aberto por conta de canal e por produto. */
  porCanal: DiaCanal[];
  produtos: DiaProduto[];
  /** Última sincronização com o canal; nulo sem a migração 19. */
  atualizacao: Atualizacao | null;
};

export type Atualizacao = {
  /** Quando terminou a execução mais recente. */
  em: string;
  ok: boolean;
  automatica: boolean;
  erro: string | null;
  /** Se a mais recente falhou: quando foi a última que deu certo. */
  ultimaOk: string | null;
};

/**
 * De quando é o número que a tela mostra.
 *
 * Sem isso, uma sincronização parada é invisível: a tela segue exibindo
 * o último dia que entrou, com a mesma cara de sempre, e a primeira
 * notícia do problema é uma decisão tomada em cima de dado velho.
 */
async function carregarAtualizacao(
  sb: Awaited<ReturnType<typeof clienteServidor>>
): Promise<Atualizacao | null> {
  const { data, error } = await sb
    .from("sincronizacoes")
    .select("terminada_em,status,origem,erro")
    .not("terminada_em", "is", null)
    .order("iniciada_em", { ascending: false })
    .limit(20);
  // Coluna `origem` ausente (migração 19 não rodada) não é erro da tela.
  if (error || !data?.length) return null;
  type L = { terminada_em: string; status: string; origem: string | null; erro: string | null };
  const linhas = data as L[];
  const ok = (l: L) => l.status === "concluida";
  const [ultima] = linhas;
  return {
    em: ultima.terminada_em,
    ok: ok(ultima),
    automatica: ultima.origem === "agendada",
    erro: ok(ultima) ? null : ultima.erro,
    ultimaOk: linhas.find(ok)?.terminada_em ?? null,
  };
}

import { nomeDoDia } from "@/lib/format";

function somarDias(iso: string, passo: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + passo);
  return d.toISOString().slice(0, 10);
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export async function carregarDia(
  dataPedida?: string,
  canalId?: string,
  /** "AAAA-MM": abrir esse mês (navegação), focando o último dia com dado. */
  mesPedido?: string
): Promise<DadosDia> {
  const sb = await clienteServidor();

  const [diariasRaw, metasRaw, contas, exclusoes, atualizacao] = await Promise.all([
    paginar(() =>
      sb
        .from("vendas_diarias")
        .select(
          "data,receita,pedidos,visitas,investimento_ads,valor_cancelado," +
            "pedidos_cancelados,canal_id,conta_canal_id"
        )
        .order("data")
    ),
    paginar(() =>
      sb.from("metas_diarias").select("data,receita_meta,canal_id")
    ),
    carregarContasRecorte(),
    carregarExclusoes(),
    carregarAtualizacao(sb),
  ]);
  /*
   * O recorte aceita LISTA: "canalA,conta:contaB". Vazio é todos. Escolher
   * dois ou três canais e ver o dia só deles é o que a visão do dia pede —
   * um canal só, ou todos, não respondia "e o marketplace sem o site?".
   */
  const canaisSelecionados = (canalId ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const recortes = canaisSelecionados.map((v) => lerRecorte(v));
  const dentro = (l: { canalId?: string | null; contaCanalId?: string | null }) =>
    recortes.length === 0 || recortes.some((rc) => noRecorte(rc, l));
  const metaPorConta = recortes.some((rc) => recorteParcial(rc, contas));
  const canaisDaMeta = new Set(
    recortes.map((rc) => canalDoRecorte(rc, contas)).filter((c): c is string => Boolean(c))
  );

  type Linha = {
    data: string;
    receita: string | number;
    pedidos: number;
    visitas: number;
    investimento_ads: string | number;
    valor_cancelado: string | number;
    pedidos_cancelados: number;
    canal_id: string;
    conta_canal_id: string;
  };

  const { mantidas } = aplicar(
    (diariasRaw as unknown as Linha[]).map((l) => ({
      ...l,
      canalId: l.canal_id,
      contaCanalId: l.conta_canal_id,
    })),
    exclusoes
  );
  let linhas = mantidas as unknown as Linha[];
  linhas = linhas.filter((l) => dentro({ canalId: l.canal_id, contaCanalId: l.conta_canal_id }));

  const opcoes = opcoesRecorte(contas);

  if (!linhas.length) {
    return {
      vazio: true, hoje: null, mes: [], mesRotulo: "", comparacoes: [],
      melhor: null, pior: null, bateram: 0, comMeta: 0,
      opcoes, canalId: canalId ?? "", metaPorConta, ultimaData: null, atualizacao,
      primeiraData: null, canaisSelecionados, porCanal: [], produtos: [],
    };
  }

  /* ── Soma por dia ── */
  type Acum = {
    receita: number; pedidos: number; visitas: number; ads: number;
    cancelado: number; pedidosCancelados: number;
    /*
     * Pedidos das linhas que TÊM visita registrada.
     *
     * Só o Mercado Livre informa visita. Dividir os pedidos de TODOS os
     * canais pelas visitas de um só infla a conversão — medido aqui em
     * 12,71% num dia cuja conversão real ronda 1%. Mesma regra que
     * periodo.ts já aplicava; repetir a conta de outro jeito faria a
     * mesma métrica ter dois valores no sistema.
     */
    pedidosComVisita: number;
  };
  const porDia = new Map<string, Acum>();
  for (const l of linhas) {
    const k = String(l.data).slice(0, 10);
    const a = porDia.get(k) ?? {
      receita: 0, pedidos: 0, visitas: 0, ads: 0, cancelado: 0,
      pedidosCancelados: 0, pedidosComVisita: 0,
    };
    a.receita += n(l.receita);
    a.pedidos += l.pedidos;
    a.visitas += l.visitas;
    a.ads += n(l.investimento_ads);
    a.cancelado += n(l.valor_cancelado);
    a.pedidosCancelados += l.pedidos_cancelados;
    if (l.visitas > 0) a.pedidosComVisita += l.pedidos;
    porDia.set(k, a);
  }

  const metas = new Map<string, number>();
  for (const m of metasRaw as unknown as {
    data: string; receita_meta: string | number; canal_id: string;
  }[]) {
    if (metaPorConta) continue;
    if (canaisDaMeta.size && !canaisDaMeta.has(m.canal_id)) continue;
    const k = String(m.data).slice(0, 10);
    metas.set(k, (metas.get(k) ?? 0) + n(m.receita_meta));
  }

  const datas = [...porDia.keys()].sort();
  const ultimaData = datas[datas.length - 1];

  /*
   * O dia em foco é o último COM MOVIMENTO, não hoje.
   *
   * A operação alimenta os dados com atraso. Ancorar em hoje faria a tela
   * abrir zerada toda manhã, parecendo que a loja parou.
   */
  const primeiraData = datas[0];
  const doMesPedido = mesPedido && /^\d{4}-\d{2}$/.test(mesPedido)
    ? datas.filter((d) => d.startsWith(mesPedido))
    : [];
  const foco =
    dataPedida && porDia.has(dataPedida)
      ? dataPedida
      : mesPedido && /^\d{4}-\d{2}$/.test(mesPedido)
        ? (doMesPedido[doMesPedido.length - 1] ?? `${mesPedido}-01`)
        : ultimaData;

  const montar = (data: string): DiaLinha => {
    const a = porDia.get(data);
    const meta = metas.get(data) ?? 0;
    /*
     * Dia sem movimento registrado é PARCIAL, não é dia ruim.
     *
     * Sem essa distinção, todo dia futuro do mês — que já tem meta
     * rateada — sairia como "não bateu" e o calendário ficaria vermelho
     * do dia de hoje até o fim do mês. Vermelho tem que significar
     * fracasso, não ausência.
     */
    const parcial = !a;
    const receita = a?.receita ?? 0;
    const cancelado = a?.cancelado ?? 0;
    const liquida = r2(receita - cancelado);
    const pedidos = a?.pedidos ?? 0;
    const canc = a?.pedidosCancelados ?? 0;
    const visitas = a?.visitas ?? 0;

    return {
      data,
      diaSemana: new Date(`${data}T00:00:00Z`).getUTCDay(),
      receita: r2(receita),
      receitaLiquida: liquida,
      pedidos,
      pedidosValidos: pedidosValidos(pedidos, canc),
      cancelados: canc,
      valorCancelado: r2(cancelado),
      visitas,
      ads: r2(a?.ads ?? 0),
      ticket: ticketMedio(receita, cancelado, pedidos, canc),
      conversao:
        visitas > 0 ? r2(((a?.pedidosComVisita ?? 0) / visitas) * 100) : null,
      meta: r2(meta),
      sobraMeta: r2(liquida - meta),
      bateu: meta > 0 && !parcial ? liquida >= meta : null,
      parcial,
    };
  };

  /* ── O mês do dia em foco ── */
  const [ano, mes] = foco.split("-").map(Number);
  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const doMes: DiaLinha[] = [];
  for (let d = 1; d <= totalDias; d++) {
    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // Dia futuro não entra: linha vazia no fim do mês só polui a leitura.
    if (data > ultimaData && !metas.has(data)) continue;
    doMes.push(montar(data));
  }

  const comDado = doMes.filter((d) => !d.parcial && d.receita > 0);
  const melhor = comDado.length
    ? comDado.reduce((a, b) => (b.receitaLiquida > a.receitaLiquida ? b : a))
    : null;
  const pior = comDado.length
    ? comDado.reduce((a, b) => (b.receitaLiquida < a.receitaLiquida ? b : a))
    : null;

  const comMeta = doMes.filter((d) => d.meta > 0 && !d.parcial);
  const bateram = comMeta.filter((d) => d.bateu).length;

  /* ── Comparações do dia em foco ── */
  const hoje = montar(foco);
  const variacao = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

  const ontem = porDia.has(somarDias(foco, -1)) ? montar(somarDias(foco, -1)) : null;
  const semanaPassada = porDia.has(somarDias(foco, -7))
    ? montar(somarDias(foco, -7))
    : null;

  /* Média dos mesmos dias da semana no mês, fora o próprio dia. */
  const mesmos = doMes.filter(
    (d) => d.diaSemana === hoje.diaSemana && d.data !== foco && !d.parcial && d.receita > 0
  );
  const mediaMesmoDia = mesmos.length
    ? r2(mesmos.reduce((s, d) => s + d.receitaLiquida, 0) / mesmos.length)
    : null;

  const comparacoes: Comparacao[] = [
    {
      rotulo: "Dia anterior",
      receita: ontem?.receitaLiquida ?? null,
      variacao: ontem ? variacao(hoje.receitaLiquida, ontem.receitaLiquida) : null,
    },
    {
      rotulo: `${nomeDoDia(hoje.diaSemana)} passada`,
      receita: semanaPassada?.receitaLiquida ?? null,
      variacao: semanaPassada
        ? variacao(hoje.receitaLiquida, semanaPassada.receitaLiquida)
        : null,
    },
    {
      rotulo: `Média das ${nomeDoDia(hoje.diaSemana)}s do mês`,
      receita: mediaMesmoDia,
      variacao: mediaMesmoDia ? variacao(hoje.receitaLiquida, mediaMesmoDia) : null,
    },
  ];

  /* ── O dia em foco por conta de canal ── */
  const nomeConta = new Map(contas.map((c) => [c.contaId, c]));
  const porConta = new Map<string, Acum & { canal: string; conta: string }>();
  for (const l of linhas) {
    if (String(l.data).slice(0, 10) !== foco) continue;
    const c = nomeConta.get(l.conta_canal_id);
    const a = porConta.get(l.conta_canal_id) ?? {
      receita: 0, pedidos: 0, visitas: 0, ads: 0, cancelado: 0, pedidosCancelados: 0, pedidosComVisita: 0,
      canal: c?.canalNome ?? "Outros", conta: c?.contaNome ?? "",
    };
    a.receita += n(l.receita);
    a.pedidos += l.pedidos;
    a.visitas += l.visitas;
    a.ads += n(l.investimento_ads);
    a.cancelado += n(l.valor_cancelado);
    a.pedidosCancelados += l.pedidos_cancelados;
    if (l.visitas > 0) a.pedidosComVisita += l.pedidos;
    porConta.set(l.conta_canal_id, a);
  }
  const porCanal: DiaCanal[] = [...porConta.entries()]
    .map(([contaId, a]) => {
      const liquida = r2(a.receita - a.cancelado);
      return {
        contaId,
        canal: a.canal,
        conta: a.conta,
        receitaLiquida: liquida,
        pedidosValidos: pedidosValidos(a.pedidos, a.pedidosCancelados),
        cancelados: a.pedidosCancelados,
        valorCancelado: r2(a.cancelado),
        visitas: a.visitas,
        conversao: a.visitas > 0 ? r2((a.pedidosComVisita / a.visitas) * 100) : null,
        ads: r2(a.ads),
        tacos: a.ads > 0 && liquida > 0 ? r2((a.ads / liquida) * 100) : null,
        ticket: ticketMedio(a.receita, a.cancelado, a.pedidos, a.pedidosCancelados),
      };
    })
    .sort((x, y) => y.receitaLiquida - x.receitaLiquida);

  /*
   * ── Produtos do dia ──
   * Itens dos pedidos do dia, fora os cancelados, no mesmo recorte de
   * canais. Junção com pedidos (!inner) e filtro pela data do pedido: um
   * .in(pedido_id) com centenas de ids já estourou o limite da URL.
   */
  type Item = {
    sku: string | null; titulo: string | null; quantidade: number; preco_unitario: string | number;
    pedido_id: string;
    pedidos: { data: string; cancelado: boolean; canal_id: string; conta_canal_id: string } | null;
  };
  const itens = (await paginar(() =>
    sb
      .from("pedido_itens")
      .select("sku,titulo,quantidade,preco_unitario,pedido_id,pedidos!inner(data,cancelado,canal_id,conta_canal_id)")
      .eq("pedidos.data", foco)
      .eq("pedidos.cancelado", false)
      .order("pedido_id")
  )) as unknown as Item[];
  const porSku = new Map<string, DiaProduto & { _pedidos: Set<string>; _canais: Set<string> }>();
  for (const it of itens) {
    const ped = it.pedidos;
    if (!ped || !dentro({ canalId: ped.canal_id, contaCanalId: ped.conta_canal_id })) continue;
    const chave = it.sku || it.titulo || "sem código";
    const a = porSku.get(chave) ?? {
      sku: it.sku ?? "—", titulo: it.titulo ?? "", unidades: 0, receita: 0, pedidos: 0, canais: [],
      _pedidos: new Set<string>(), _canais: new Set<string>(),
    };
    a.unidades += Number(it.quantidade) || 0;
    a.receita += (Number(it.quantidade) || 0) * n(it.preco_unitario);
    a._pedidos.add(it.pedido_id);
    const c = nomeConta.get(ped.conta_canal_id);
    a._canais.add(c ? (c.contaNome && c.contaNome !== "Conta principal" ? c.contaNome : c.canalNome) : "Outros");
    if (!a.titulo && it.titulo) a.titulo = it.titulo;
    porSku.set(chave, a);
  }
  const produtos: DiaProduto[] = [...porSku.values()]
    .map(({ _pedidos, _canais, ...p }) => ({ ...p, receita: r2(p.receita), pedidos: _pedidos.size, canais: [..._canais] }))
    .sort((x, y) => y.receita - x.receita);

  return {
    vazio: false,
    primeiraData,
    canaisSelecionados,
    porCanal,
    produtos,
    hoje,
    mes: doMes,
    mesRotulo: `${MESES[mes - 1]} de ${ano}`,
    comparacoes,
    melhor,
    pior,
    bateram,
    comMeta: comMeta.length,
    opcoes,
    canalId: canalId ?? "",
    metaPorConta,
    ultimaData,
    atualizacao,
  };
}
