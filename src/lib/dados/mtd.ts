import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";
import { pesosDaSemana } from "./ratear-meta";

/**
 * Mês até aqui: onde a meta está sendo perdida.
 *
 * ── Por que a decomposição do funil ──
 *
 * "Faltam R$ 300 mil" não diz o que fazer. As três alavancas dizem:
 *
 *   receita = visitas × conversão × ticket médio
 *
 * Fixando duas e resolvendo a terceira, sai quanto de cada uma seria
 * preciso para fechar o mês. Se a conversão necessária é 1,1% e a atual é
 * 0,9%, o problema é de página e preço; se as visitas necessárias são o
 * dobro das atuais, é de mídia e posicionamento. O mesmo gap tem causas
 * diferentes, e cada uma tem um dono diferente.
 *
 * ── Até quando conta ──
 *
 * Até o último dia COM DADO, não até hoje. Quem importa a planilha de
 * manhã tem ontem completo; quem importa uma vez por semana tem menos. Se
 * a conta fosse até hoje, o dia que ainda não foi importado entraria como
 * zero e o gap apareceria maior do que é — todo dia de manhã.
 *
 * ── Receita paga e cancelada ──
 *
 * A meta é sobre a líquida: o cancelamento já aconteceu e o dinheiro não
 * entrou. Mostrar a bruta ao lado é o que permite ver quando o gap não é
 * de venda e sim de cancelamento — um mês pode bater a meta bruta e
 * perder a líquida por inteiro.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export type CanalMtd = { id: string; nome: string; cor: string };

export type Alavanca = {
  /** O que está acontecendo no mês até aqui. */
  atual: number | null;
  /** O que precisaria ser, no mês inteiro, para fechar a meta. */
  necessario: number | null;
  /** necessario ÷ atual − 1, em %. Positivo = falta subir. */
  variacao: number | null;
};

export type DadosMtd = {
  vazio: boolean;
  ano: number;
  mes: number;
  /** Último dia com dado — é até onde tudo é contado. */
  ate: string;
  diasDecorridos: number;
  diasRestantes: number;

  canais: CanalMtd[];
  selecionados: string[];

  /* Realizado no mês, até `ate`. */
  receitaBruta: number;
  receitaCancelada: number;
  receitaPaga: number;
  pedidos: number;
  pedidosCancelados: number;
  visitas: number;
  conversao: number | null;
  ticket: number | null;

  /* Meta. */
  metaMes: number;
  metaAteAqui: number;
  /** metaAteAqui − receitaPaga. Positivo = está devendo. */
  gap: number;
  /** Quanto falta para fechar o mês. */
  faltaNoMes: number;
  /** Quanto cada dia restante precisaria fazer. */
  porDiaRestante: number | null;
  /** O ritmo atual projetado até o fim do mês. */
  projecao: number | null;

  /* As três alavancas, no mês inteiro. */
  visitasAlavanca: Alavanca;
  conversaoAlavanca: Alavanca;
  ticketAlavanca: Alavanca;

  /** Dias futuros que ainda podem receber redistribuição. */
  diasLivres: number;
};

export async function carregarMtd(
  ano: number,
  mes: number,
  canaisSelecionados?: string[]
): Promise<DadosMtd> {
  const sb = await clienteServidor();

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = `${ano}-${String(mes).padStart(2, "0")}-31`;

  const [diariasRaw, contasRaw, canaisRaw, metasRaw, metasDiariasRaw, exclusoes] =
    await Promise.all([
      paginar(() =>
        sb
          .from("vendas_diarias")
          .select(
            "data,receita,valor_cancelado,pedidos,pedidos_cancelados,visitas,canal_id,conta_canal_id"
          )
          .order("data")
      ),
      sb.from("contas_canal").select("id,canal_id").limit(200),
      sb.from("canais").select("id,nome,cor_serie,ordem").order("ordem"),
      sb.from("metas").select("canal_id,receita_meta").eq("ano", ano).eq("mes", mes),
      paginar(() =>
        sb
          .from("metas_diarias")
          .select("canal_id,data,receita_meta,manual")
          .gte("data", inicio)
          .lte("data", fimMes)
      ),
      carregarExclusoes(),
    ]);

  type Diaria = {
    data: string;
    receita: string | number;
    valor_cancelado: string | number;
    pedidos: number;
    pedidos_cancelados: number;
    visitas: number;
    canal_id: string;
    conta_canal_id: string;
  };
  type Canal = { id: string; nome: string; cor_serie: number; ordem: number };

  const canalDaConta = new Map(
    ((contasRaw.data ?? []) as { id: string; canal_id: string }[]).map((c) => [
      c.id,
      c.canal_id,
    ])
  );

  const { mantidas } = aplicar(
    (diariasRaw as unknown as Diaria[]).map((d) => ({
      ...d,
      canalId: canalDaConta.get(d.conta_canal_id) ?? d.canal_id,
      contaCanalId: d.conta_canal_id,
    })),
    exclusoes
  );
  const todas = mantidas as unknown as (Diaria & { canalId: string })[];

  const canaisTodos = (canaisRaw.data ?? []) as Canal[];
  const comMovimento = new Set(todas.map((d) => d.canalId));
  const canais: CanalMtd[] = canaisTodos
    .filter((c) => comMovimento.has(c.id))
    .map((c) => ({ id: c.id, nome: c.nome, cor: `var(--s${c.cor_serie ?? 1})` }));

  // Sem seleção, todos: a primeira visita mostra a operação inteira, que é
  // a pergunta mais comum.
  const sel =
    canaisSelecionados?.length
      ? canaisSelecionados.filter((id) => canais.some((c) => c.id === id))
      : canais.map((c) => c.id);

  const doRecorte = todas.filter((d) => sel.includes(d.canalId));
  if (!doRecorte.length) {
    return vazio(ano, mes, canais, sel);
  }

  const ate = doRecorte
    .map((d) => String(d.data).slice(0, 10))
    .sort()
    .slice(-1)[0];

  // O último dia com dado pode ser de outro mês — quando o mês escolhido
  // ainda não começou, ou já passou inteiro.
  const ateNoMes = ate >= inicio && ate <= fimMes ? ate : ate < inicio ? "" : fimMes;

  const doMes = doRecorte.filter((d) => {
    const dia = String(d.data).slice(0, 10);
    return dia >= inicio && dia <= (ateNoMes || inicio) && ateNoMes !== "";
  });

  /* ── Realizado ── */

  let receitaBruta = 0, receitaCancelada = 0, pedidos = 0, pedidosCancelados = 0, visitas = 0;
  for (const d of doMes) {
    receitaBruta += n(d.receita);
    receitaCancelada += n(d.valor_cancelado);
    pedidos += d.pedidos ?? 0;
    pedidosCancelados += d.pedidos_cancelados ?? 0;
    visitas += d.visitas ?? 0;
  }
  const receitaPaga = receitaBruta - receitaCancelada;

  /* ── Meta ── */

  const metaPorCanal = new Map(
    ((metasRaw.data ?? []) as { canal_id: string | null; receita_meta: string | number }[])
      .filter((m) => m.canal_id && sel.includes(m.canal_id))
      .map((m) => [m.canal_id as string, n(m.receita_meta)])
  );
  const metaMes = r2([...metaPorCanal.values()].reduce((s, v) => s + v, 0));

  type MetaDia = { canal_id: string; data: string; receita_meta: string | number; manual: boolean };
  const metasDia = (metasDiariasRaw as unknown as MetaDia[]).filter((m) =>
    sel.includes(m.canal_id)
  );

  const metaAteAqui = r2(
    metasDia
      .filter((m) => ateNoMes && String(m.data).slice(0, 10) <= ateNoMes)
      .reduce((s, m) => s + n(m.receita_meta), 0)
  );

  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diasDecorridos = ateNoMes ? Number(ateNoMes.slice(8, 10)) : 0;
  const diasRestantes = totalDias - diasDecorridos;

  const diasLivres = new Set(
    metasDia
      .filter((m) => !m.manual && ateNoMes && String(m.data).slice(0, 10) > ateNoMes)
      .map((m) => String(m.data).slice(0, 10))
  ).size;

  const gap = r2(metaAteAqui - receitaPaga);
  const faltaNoMes = r2(Math.max(0, metaMes - receitaPaga));

  /* ── As três alavancas ── */

  const conversao = visitas > 0 ? r2((pedidos * 100) / visitas) : null;
  const ticket = pedidos > 0 ? r2(receitaPaga / pedidos) : null;

  /*
   * O necessário é para o MÊS INTEIRO, não para o que falta.
   *
   * "Preciso de 1,4% de conversão nos próximos 12 dias" é um número que
   * ninguém consegue comparar com nada. "O mês precisa fechar em 1,1%
   * contra os 0,9% de agora" se compara com o mês passado, com a meta e
   * com o que o time sabe ser possível.
   */
  const escala = diasDecorridos > 0 ? totalDias / diasDecorridos : 0;
  const visitasProjetadas = escala > 0 ? Math.round(visitas * escala) : 0;

  const alavanca = (atual: number | null, necessario: number | null): Alavanca => ({
    atual,
    necessario,
    variacao:
      atual != null && necessario != null && atual > 0
        ? r2(((necessario - atual) / atual) * 100)
        : null,
  });

  // Visitas necessárias mantendo conversão e ticket de hoje.
  const visitasNecessarias =
    metaMes > 0 && conversao != null && conversao > 0 && ticket != null && ticket > 0
      ? Math.round(metaMes / ((conversao / 100) * ticket))
      : null;

  // Conversão necessária mantendo o ritmo de visitas e o ticket.
  const conversaoNecessaria =
    metaMes > 0 && visitasProjetadas > 0 && ticket != null && ticket > 0
      ? r2((metaMes / (visitasProjetadas * ticket)) * 100)
      : null;

  // Ticket necessário mantendo visitas e conversão.
  const pedidosProjetados =
    conversao != null ? Math.round((visitasProjetadas * conversao) / 100) : 0;
  const ticketNecessario =
    metaMes > 0 && pedidosProjetados > 0 ? r2(metaMes / pedidosProjetados) : null;

  const projecao = escala > 0 ? r2(receitaPaga * escala) : null;

  return {
    vazio: false,
    ano,
    mes,
    ate: ateNoMes,
    diasDecorridos,
    diasRestantes,
    canais,
    selecionados: sel,
    receitaBruta: r2(receitaBruta),
    receitaCancelada: r2(receitaCancelada),
    receitaPaga: r2(receitaPaga),
    pedidos,
    pedidosCancelados,
    visitas,
    conversao,
    ticket,
    metaMes,
    metaAteAqui,
    gap,
    faltaNoMes,
    porDiaRestante: diasRestantes > 0 ? r2(faltaNoMes / diasRestantes) : null,
    projecao,
    visitasAlavanca: alavanca(visitasProjetadas || null, visitasNecessarias),
    conversaoAlavanca: alavanca(conversao, conversaoNecessaria),
    ticketAlavanca: alavanca(ticket, ticketNecessario),
    diasLivres,
  };
}

function vazio(
  ano: number,
  mes: number,
  canais: CanalMtd[],
  sel: string[]
): DadosMtd {
  const nulo: Alavanca = { atual: null, necessario: null, variacao: null };
  return {
    vazio: true, ano, mes, ate: "", diasDecorridos: 0, diasRestantes: 0,
    canais, selecionados: sel,
    receitaBruta: 0, receitaCancelada: 0, receitaPaga: 0,
    pedidos: 0, pedidosCancelados: 0, visitas: 0,
    conversao: null, ticket: null,
    metaMes: 0, metaAteAqui: 0, gap: 0, faltaNoMes: 0,
    porDiaRestante: null, projecao: null,
    visitasAlavanca: nulo, conversaoAlavanca: nulo, ticketAlavanca: nulo,
    diasLivres: 0,
  };
}

/* ── Redistribuir o que falta ──────────────────────────────────────── */

/**
 * Joga o que falta do mês nos dias que ainda não vieram.
 *
 * ── Por que não é "somar o gap aos dias restantes" ──
 *
 * Somar o gap manteria as metas antigas dos dias futuros e acrescentaria
 * a diferença, e aí a soma das metas do mês passaria da meta do mês. O
 * alvo cresceria sozinho a cada redistribuição.
 *
 * O que se faz é reabrir a conta: a meta do mês menos o que já foi
 * realizado é o que os dias restantes precisam entregar. Assim
 * `realizado + metas futuras` continua igual à meta do mês, por
 * construção, quantas vezes se redistribua.
 *
 * Dias fixados à mão no futuro são preservados e saem do bolo, como no
 * rateio normal.
 */
export async function redistribuirRestante(
  ano: number,
  mes: number,
  operacaoId: string,
  canaisSelecionados?: string[]
): Promise<{ canais: number; dias: number; total: number; semDiasLivres: string[] }> {
  const sb = await clienteServidor();
  const { ratearNoMes } = await import("./ratear-meta");

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = `${ano}-${String(mes).padStart(2, "0")}-31`;
  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

  const mtd = await carregarMtd(ano, mes, canaisSelecionados);
  if (mtd.vazio || !mtd.ate) {
    throw new Error("Não há dado no mês para saber o que já foi realizado.");
  }

  const { data: metas } = await sb
    .from("metas")
    .select("canal_id,receita_meta")
    .eq("ano", ano)
    .eq("mes", mes)
    .not("canal_id", "is", null);

  const alvo = (metas ?? []).filter((m) =>
    mtd.selecionados.includes(m.canal_id as string)
  );
  if (!alvo.length) {
    throw new Error("Nenhum canal selecionado tem meta neste mês.");
  }

  /* Realizado por canal, no mês até `ate`. */
  const [{ data: realizadoRaw }, { data: manuaisRaw }, { data: histRaw }] =
    await Promise.all([
      sb
        .from("vendas_diarias")
        .select("canal_id,receita,valor_cancelado")
        .gte("data", inicio)
        .lte("data", mtd.ate),
      sb
        .from("metas_diarias")
        .select("canal_id,data,receita_meta")
        .eq("manual", true)
        .gt("data", mtd.ate)
        .lte("data", fimMes),
      sb
        .from("vendas_diarias")
        .select("data,receita,valor_cancelado")
        .order("data", { ascending: false })
        .limit(600),
    ]);

  const realizadoPorCanal = new Map<string, number>();
  for (const r of realizadoRaw ?? []) {
    const c = r.canal_id as string;
    realizadoPorCanal.set(
      c,
      (realizadoPorCanal.get(c) ?? 0) + n(r.receita) - n(r.valor_cancelado)
    );
  }

  const pesos = pesosDaSemana(
    (histRaw ?? []).map((h) => ({
      data: String(h.data).slice(0, 10),
      receita: n(h.receita) - n(h.valor_cancelado),
    }))
  );

  const manuaisPorCanal = new Map<string, Map<string, number>>();
  for (const m of manuaisRaw ?? []) {
    const c = m.canal_id as string;
    if (!manuaisPorCanal.has(c)) manuaisPorCanal.set(c, new Map());
    manuaisPorCanal.get(c)!.set(String(m.data).slice(0, 10), n(m.receita_meta));
  }

  const linhas: Record<string, unknown>[] = [];
  const semDiasLivres: string[] = [];
  let totalRedistribuido = 0;

  for (const m of alvo) {
    const canalId = m.canal_id as string;
    const metaCanal = n(m.receita_meta);
    const realizado = realizadoPorCanal.get(canalId) ?? 0;
    const restante = Math.max(0, metaCanal - realizado);
    totalRedistribuido += restante;

    const fixados = manuaisPorCanal.get(canalId) ?? new Map();
    const futuros = Array.from({ length: totalDias }, (_, i) => {
      const data = `${ano}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return { data, dow: new Date(`${data}T00:00:00Z`).getUTCDay() };
    }).filter((d) => d.data > mtd.ate);

    if (!futuros.length) {
      semDiasLivres.push(canalId);
      continue;
    }

    const rateio = ratearNoMes(
      restante,
      futuros.map((d) => ({
        data: d.data,
        peso: pesos[d.dow] ?? 1,
        manual: fixados.has(d.data),
        valor: fixados.get(d.data),
      }))
    );

    for (const d of rateio.dias) {
      linhas.push({
        operacao_id: operacaoId,
        canal_id: canalId,
        data: d.data,
        receita_meta: d.valor,
        manual: d.manual,
        atualizado_em: new Date().toISOString(),
      });
    }
  }

  for (let i = 0; i < linhas.length; i += 400) {
    const { error } = await sb
      .from("metas_diarias")
      .upsert(linhas.slice(i, i + 400), {
        onConflict: "operacao_id,canal_id,data",
      });
    if (error) throw new Error(`Falha ao redistribuir: ${error.message}`);
  }

  return {
    canais: alvo.length,
    dias: linhas.length,
    total: r2(totalRedistribuido),
    semDiasLivres,
  };
}
