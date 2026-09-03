import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";
import { ratearPorPeso, ratearNoMes, pesosDaSemana } from "./ratear-meta";

/**
 * Planejamento de metas: o que a tela precisa para distribuir um número.
 *
 * ── O peso vem do realizado recente, não do ano inteiro ──
 *
 * Noventa dias, terminando no último dia com dado. É a janela que já
 * reflete a operação de hoje: um canal que entrou em maio não deve ser
 * penalizado por não existir em janeiro, e um que morreu em março não
 * deve levar meta em setembro.
 *
 * Fechar em "hoje" e não no último dia com dado seria pior: quem importa
 * a planilha uma vez por semana teria a janela terminando num vazio, e o
 * peso cairia por falta de importação, não por falta de venda.
 *
 * ── Cancelamento entra na conta ──
 *
 * O peso usa receita líquida — bruta menos cancelada. Um canal que
 * fatura muito e cancela 41% não deve puxar meta como se entregasse
 * tudo; foi o caso medido na Zema.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

const JANELA_DIAS = 90;

export type CanalPlanejamento = {
  id: string;
  nome: string;
  cor: string;
  /** Receita líquida na janela recente. */
  receitaRecente: number;
  /** Participação nessa receita, em %. */
  peso: number;
  /** Ticket médio recente, para derivar a meta de pedidos. */
  ticket: number | null;
  /** Já tem meta cadastrada no mês escolhido? */
  metaAtual: number | null;
  /** Participa da meta deste mês. */
  selecionado: boolean;
};

export type DiaPlanejamento = {
  data: string;
  diaSemana: number;
  /** Alvo do dia, somando os canais selecionados. */
  meta: number;
  /** Algum canal fixou este dia à mão. */
  manual: boolean;
  /** Realizado, quando o dia já passou. */
  realizado: number | null;
};

export type DadosPlanejamento = {
  ano: number;
  mes: number;
  /** Meta total do mês, somando os canais com meta. */
  metaTotal: number;
  canais: CanalPlanejamento[];
  dias: DiaPlanejamento[];
  /** Peso de cada dia da semana, do histórico. Domingo = índice 0. */
  pesosSemana: number[];
  janela: { inicio: string; fim: string };
  ultimaData: string | null;
  vazio: boolean;
};

function diasDoMes(ano: number, mes: number): string[] {
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return Array.from(
    { length: total },
    (_, i) =>
      `${ano}-${String(mes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
  );
}

export async function carregarPlanejamento(
  ano: number,
  mes: number
): Promise<DadosPlanejamento> {
  const sb = await clienteServidor();

  const [diariasRaw, contasRaw, canaisRaw, metasRaw, metasDiariasRaw, exclusoes] =
    await Promise.all([
      paginar(() =>
        sb
          .from("vendas_diarias")
          .select("data,receita,valor_cancelado,pedidos,canal_id,conta_canal_id")
          .order("data")
      ),
      sb.from("contas_canal").select("id,canal_id").limit(200),
      sb.from("canais").select("id,nome,cor_serie,ordem").order("ordem"),
      sb.from("metas").select("canal_id,receita_meta,peso").eq("ano", ano).eq("mes", mes),
      paginar(() =>
        sb
          .from("metas_diarias")
          .select("canal_id,data,receita_meta,manual")
          .gte("data", `${ano}-${String(mes).padStart(2, "0")}-01`)
          .lte("data", `${ano}-${String(mes).padStart(2, "0")}-31`)
      ),
      carregarExclusoes(),
    ]);

  type Diaria = {
    data: string;
    receita: string | number;
    valor_cancelado: string | number;
    pedidos: number;
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
  if (!todas.length) {
    return {
      ano, mes, metaTotal: 0, canais: [], dias: [],
      pesosSemana: Array(7).fill(1),
      janela: { inicio: "", fim: "" }, ultimaData: null, vazio: true,
    };
  }

  const datas = todas.map((d) => String(d.data).slice(0, 10)).sort();
  const ultimaData = datas[datas.length - 1];

  const corte = new Date(`${ultimaData}T00:00:00Z`);
  corte.setUTCDate(corte.getUTCDate() - (JANELA_DIAS - 1));
  const janelaInicio = corte.toISOString().slice(0, 10);

  /* ── Peso por canal, na janela recente ── */

  const recentes = todas.filter(
    (d) => String(d.data).slice(0, 10) >= janelaInicio
  );

  type Ac = { receita: number; pedidos: number };
  const porCanal = new Map<string, Ac>();
  for (const d of recentes) {
    const at = porCanal.get(d.canalId) ?? { receita: 0, pedidos: 0 };
    // Líquida: o canal que cancela muito não puxa meta como se entregasse.
    at.receita += n(d.receita) - n(d.valor_cancelado);
    at.pedidos += d.pedidos ?? 0;
    porCanal.set(d.canalId, at);
  }

  const totalRecente = [...porCanal.values()].reduce(
    (s, a) => s + Math.max(0, a.receita),
    0
  );

  const metaPorCanal = new Map(
    ((metasRaw.data ?? []) as { canal_id: string | null; receita_meta: string | number }[])
      .filter((m) => m.canal_id)
      .map((m) => [m.canal_id as string, n(m.receita_meta)])
  );

  const canais: CanalPlanejamento[] = ((canaisRaw.data ?? []) as Canal[])
    .filter((c) => porCanal.has(c.id) || metaPorCanal.has(c.id))
    .map((c) => {
      const a = porCanal.get(c.id) ?? { receita: 0, pedidos: 0 };
      const receita = Math.max(0, a.receita);
      return {
        id: c.id,
        nome: c.nome,
        cor: `var(--s${c.cor_serie ?? 1})`,
        receitaRecente: r2(receita),
        peso: totalRecente > 0 ? r2((receita * 100) / totalRecente) : 0,
        ticket: a.pedidos > 0 ? r2(receita / a.pedidos) : null,
        metaAtual: metaPorCanal.get(c.id) ?? null,
        // Sem meta gravada, a sugestão é participar de quem tem peso: um
        // canal que vende hoje quase sempre entra, e desmarcar é um
        // clique. O contrário faria a pessoa marcar oito caixas toda vez.
        selecionado: metaPorCanal.has(c.id) || receita > 0,
      };
    })
    .sort((a, b) => b.peso - a.peso);

  /* ── Dias do mês, com meta e realizado ── */

  const pesos = pesosDaSemana(
    recentes.map((d) => ({
      data: String(d.data).slice(0, 10),
      receita: n(d.receita) - n(d.valor_cancelado),
    }))
  );

  type MetaDia = {
    canal_id: string;
    data: string;
    receita_meta: string | number;
    manual: boolean;
  };
  const porDia = new Map<string, { meta: number; manual: boolean }>();
  for (const m of metasDiariasRaw as unknown as MetaDia[]) {
    const dia = String(m.data).slice(0, 10);
    const at = porDia.get(dia) ?? { meta: 0, manual: false };
    at.meta += n(m.receita_meta);
    if (m.manual) at.manual = true;
    porDia.set(dia, at);
  }

  const realizadoPorDia = new Map<string, number>();
  for (const d of todas) {
    const dia = String(d.data).slice(0, 10);
    realizadoPorDia.set(
      dia,
      (realizadoPorDia.get(dia) ?? 0) + n(d.receita) - n(d.valor_cancelado)
    );
  }

  const dias: DiaPlanejamento[] = diasDoMes(ano, mes).map((data) => {
    const m = porDia.get(data);
    const real = realizadoPorDia.get(data);
    return {
      data,
      diaSemana: new Date(`${data}T00:00:00Z`).getUTCDay(),
      meta: r2(m?.meta ?? 0),
      manual: m?.manual ?? false,
      // Dia futuro fica nulo, e não zero: zero se lê como "não vendeu".
      realizado: data <= ultimaData ? r2(real ?? 0) : null,
    };
  });

  return {
    ano,
    mes,
    metaTotal: r2([...metaPorCanal.values()].reduce((s, v) => s + v, 0)),
    canais,
    dias,
    pesosSemana: pesos,
    janela: { inicio: janelaInicio, fim: ultimaData },
    ultimaData,
    vazio: false,
  };
}

/* ── Gravação ──────────────────────────────────────────────────────── */

export type PedidoDefinirMeta = {
  ano: number;
  mes: number;
  total: number;
  canaisSelecionados: string[];
};

/**
 * Distribui a meta do mês e grava tudo: canal e dia.
 *
 * Os dias marcados como manuais sobrevivem — o rateio soma o que foi
 * fixado, tira do total do canal e divide o resto. Recalcular o mês
 * depois de ajustar o dia 12 não pode apagar o ajuste.
 */
export async function definirMeta(
  pedido: PedidoDefinirMeta,
  operacaoId: string
): Promise<{ canais: number; dias: number; estourou: string[] }> {
  const sb = await clienteServidor();
  const { ano, mes, total, canaisSelecionados } = pedido;

  const dados = await carregarPlanejamento(ano, mes);

  const pesos = canaisSelecionados.map((id) => ({
    canalId: id,
    peso: dados.canais.find((c) => c.id === id)?.peso ?? 0,
  }));
  const fatias = ratearPorPeso(total, pesos);

  /* Metas mensais por canal */

  const linhasMes = fatias.map((f) => ({
    operacao_id: operacaoId,
    canal_id: f.canalId,
    ano,
    mes,
    receita_meta: f.valor,
    peso: f.peso,
    origem: "manual",
    atualizado_em: new Date().toISOString(),
  }));

  // Canal que saiu da seleção perde a meta: deixá-la ali faria a soma dos
  // canais não bater com o total que a pessoa digitou.
  const { data: existentes } = await sb
    .from("metas")
    .select("id,canal_id")
    .eq("ano", ano)
    .eq("mes", mes)
    .not("canal_id", "is", null);

  const remover = (existentes ?? [])
    .filter((m) => !canaisSelecionados.includes(m.canal_id as string))
    .map((m) => m.id as string);

  if (remover.length) {
    await sb.from("metas").delete().in("id", remover);
    await sb
      .from("metas_diarias")
      .delete()
      .in(
        "canal_id",
        (existentes ?? [])
          .filter((m) => !canaisSelecionados.includes(m.canal_id as string))
          .map((m) => m.canal_id as string)
      )
      .gte("data", `${ano}-${String(mes).padStart(2, "0")}-01`)
      .lte("data", `${ano}-${String(mes).padStart(2, "0")}-31`);
  }

  if (linhasMes.length) {
    const { error } = await sb
      .from("metas")
      .upsert(linhasMes, { onConflict: "operacao_id,canal_id,ano,mes" });
    if (error) throw new Error(`Falha ao gravar as metas do mês: ${error.message}`);
  }

  /* Metas diárias, por canal */

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = `${ano}-${String(mes).padStart(2, "0")}-31`;

  const { data: manuaisRaw } = await sb
    .from("metas_diarias")
    .select("canal_id,data,receita_meta")
    .eq("manual", true)
    .gte("data", inicio)
    .lte("data", fim);

  const manuaisPorCanal = new Map<string, Map<string, number>>();
  for (const m of manuaisRaw ?? []) {
    const canal = m.canal_id as string;
    if (!manuaisPorCanal.has(canal)) manuaisPorCanal.set(canal, new Map());
    manuaisPorCanal
      .get(canal)!
      .set(String(m.data).slice(0, 10), n(m.receita_meta));
  }

  const linhasDia: Record<string, unknown>[] = [];
  const estourou: string[] = [];

  for (const f of fatias) {
    const fixados = manuaisPorCanal.get(f.canalId) ?? new Map();
    const dias = diasDoMes(ano, mes).map((data) => ({
      data,
      peso: dados.pesosSemana[new Date(`${data}T00:00:00Z`).getUTCDay()] ?? 1,
      manual: fixados.has(data),
      valor: fixados.get(data),
    }));

    const rateio = ratearNoMes(f.valor, dias);
    if (rateio.estourou) {
      estourou.push(dados.canais.find((c) => c.id === f.canalId)?.nome ?? f.canalId);
    }

    for (const d of rateio.dias) {
      linhasDia.push({
        operacao_id: operacaoId,
        canal_id: f.canalId,
        data: d.data,
        receita_meta: d.valor,
        manual: d.manual,
        atualizado_em: new Date().toISOString(),
      });
    }
  }

  for (let i = 0; i < linhasDia.length; i += 400) {
    const { error } = await sb
      .from("metas_diarias")
      .upsert(linhasDia.slice(i, i + 400), {
        onConflict: "operacao_id,canal_id,data",
      });
    if (error) throw new Error(`Falha ao gravar as metas diárias: ${error.message}`);
  }

  return { canais: fatias.length, dias: linhasDia.length, estourou };
}
