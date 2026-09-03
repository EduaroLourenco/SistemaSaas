import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar, type Exclusao } from "./exclusoes";
import type { SemanaVendas } from "@/mock/semanal";

/**
 * Base comum das telas de vendas.
 *
 * Semanal, anual e comparativos leem a mesma coisa — `vendas_diarias` — e
 * só mudam o recorte. Carregar uma vez e recortar aqui evita três consultas
 * que poderiam divergir entre si, que é como um painel passa a mostrar dois
 * totais diferentes para o mesmo período.
 */

export type LinhaVendaDia = {
  data: string;
  canal: string;
  canalId: string;
  /**
   * O id real do canal no banco.
   *
   * `canalId` é um slug do nome, feito para agrupar na tela — duas contas
   * do mesmo canal têm slugs diferentes. As metas são gravadas por canal
   * de verdade, então precisam desta chave para casar.
   */
  canalReal: string | null;
  receita: number;
  pedidos: number;
  visitas: number;
  ads: number;
  cancelado: number;
  pedidosCancelados: number;
};

export type CanalInfo = {
  id: string;
  nome: string;
  cor: string;
  /** Conta de vendedor no banco — é o destino de qualquer gravação. */
  contaCanalId?: string;
  /**
   * As contas que este item soma.
   *
   * Vazio numa conta isolada; preenchido no item de CANAL, que existe só
   * onde o canal tem mais de uma conta. É o que permite ler "Mercado
   * Livre" inteiro sem escolher entre pronta entrega e venda a prazo.
   */
  agrupa?: string[];
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

/**
 * As metas gravadas, por canal e por dia.
 *
 * Uma consulta só, usada por todas as telas que precisam de alvo. Antes
 * cada uma preenchia `meta: 0` com uma nota dizendo que a planilha vinha
 * em branco — agora a meta se define no sistema, e ler de um lugar só é o
 * que garante que o anual, o diário e a tela de metas mostrem o mesmo
 * alvo.
 */
async function carregarMetasGravadas(ano: number): Promise<{
  porCanalMes: Map<string, number>;
  porCanalDia: Map<string, number>;
}> {
  const sb = await clienteServidor();
  const [mensais, diarias] = await Promise.all([
    sb.from("metas").select("canal_id,mes,receita_meta").eq("ano", ano),
    paginar(() =>
      sb
        .from("metas_diarias")
        .select("canal_id,data,receita_meta")
        .gte("data", `${ano}-01-01`)
        .lte("data", `${ano}-12-31`)
    ),
  ]);

  const porCanalMes = new Map<string, number>();
  for (const m of (mensais.data ?? []) as { canal_id: string | null; mes: number; receita_meta: string | number }[]) {
    if (!m.canal_id) continue;
    porCanalMes.set(`${m.canal_id}|${m.mes}`, n(m.receita_meta));
  }

  const porCanalDia = new Map<string, number>();
  for (const d of diarias as unknown as { canal_id: string; data: string; receita_meta: string | number }[]) {
    porCanalDia.set(`${d.canal_id}|${String(d.data).slice(0, 10)}`, n(d.receita_meta));
  }

  return { porCanalMes, porCanalDia };
}

export function chaveCanal(nome: string) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Segunda-feira da semana ISO a que a data pertence. */
function segundaDa(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export function semanaIsoDe(iso: string): { ano: number; semana: number } {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ano = d.getUTCFullYear();
  const q = new Date(Date.UTC(ano, 0, 4));
  q.setUTCDate(q.getUTCDate() - ((q.getUTCDay() + 6) % 7) + 3);
  return { ano, semana: 1 + Math.round((d.getTime() - q.getTime()) / (7 * 86400000)) };
}

const dm = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export type BaseVendas = {
  linhas: LinhaVendaDia[];
  canais: CanalInfo[];
  ano: number;
  ultimaData: string | null;
  vazio: boolean;
  /**
   * Aplicadas aqui, e não em cada tela, de propósito: todas as telas de
   * vendas leem desta função, então excluir num lugar só garante que
   * semanal, anual, comparativos e painel contem a mesma coisa. Telas que
   * discordam entre si sobre o mesmo período destroem a confiança mais
   * rápido que qualquer número errado.
   */
  exclusoes: Exclusao[];
  removidas: number;
  canaisDisponiveis: { id: string; nome: string }[];
};

export async function carregarBaseVendas(): Promise<BaseVendas> {
  const sb = await clienteServidor();

  const [dias, { data: contasBanco }, exclusoes] = await Promise.all([
    paginar(() =>
      sb
        .from("vendas_diarias")
        .select(
          "data,receita,pedidos,visitas,investimento_ads,valor_cancelado,pedidos_cancelados,conta_canal_id"
        )
        .order("data", { ascending: true })
    ),
    sb
      .from("contas_canal")
      .select("id,nome,canal_id,canais(nome,cor_serie,ordem)")
      .limit(200),
    carregarExclusoes(),
  ]);

  type Conta = {
    id: string;
    nome: string;
    canal_id: string;
    canais: { nome: string; cor_serie: number; ordem: number } | null;
  };
  const contas = (contasBanco ?? []) as unknown as Conta[];

  /*
   * A unidade das telas é a CONTA DE VENDEDOR, não o canal.
   *
   * O Mercado Livre opera com duas contas que vendem de formas diferentes
   * — pronta entrega e venda a prazo. Somá-las esconde exatamente a
   * comparação que interessa, e nenhuma decisão de preço ou de anúncio vale
   * para as duas ao mesmo tempo.
   *
   * O nome só ganha o sufixo da conta quando o canal tem mais de uma: para
   * Amazon ou Magalu, "Amazon · Conta principal" seria ruído.
   */
  const contasPorCanal = new Map<string, number>();
  for (const c of contas) {
    contasPorCanal.set(c.canal_id, (contasPorCanal.get(c.canal_id) ?? 0) + 1);
  }

  const rotulo = (c: Conta) => {
    const canal = c.canais?.nome ?? "Outros";
    return (contasPorCanal.get(c.canal_id) ?? 1) > 1 ? `${canal} — ${c.nome}` : canal;
  };

  /*
   * Cor por conta, e não por canal: duas contas do mesmo canal herdariam a
   * mesma cor e virariam uma linha só no gráfico. A segunda conta anda uma
   * casa na paleta — próxima o bastante para se ler como o mesmo canal,
   * distinta o bastante para separar as curvas.
   */
  const ordinal = new Map<string, number>();
  const info = new Map(
    [...contas]
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((c) => {
        const i = ordinal.get(c.canal_id) ?? 0;
        ordinal.set(c.canal_id, i + 1);
        const base = c.canais?.cor_serie ?? 1;
        const serie = i === 0 ? base : ((base + i * 4 - 1) % 10) + 1;
        return [
          c.id,
          {
            nome: rotulo(c),
            cor: `var(--s${serie})`,
            ordem: (c.canais?.ordem ?? 99) * 10 + i,
            contaCanalId: c.id,
          },
        ] as const;
      })
  );

  // O id real do canal, para testar as exclusões. `canalId` da linha é um
  // slug do nome, feito para agrupar na tela — não serve de chave.
  const canalDaConta = new Map(contas.map((c) => [c.id, c.canal_id]));

  const todas = dias.map((l) => {
    const conta = l.conta_canal_id as string;
    const i = info.get(conta);
    const nome = i?.nome ?? "Outros";
    return {
      data: l.data as string,
      canal: nome,
      canalId: chaveCanal(nome),
      receita: n(l.receita),
      pedidos: (l.pedidos as number) ?? 0,
      visitas: (l.visitas as number) ?? 0,
      ads: n(l.investimento_ads),
      cancelado: n(l.valor_cancelado),
      pedidosCancelados: (l.pedidos_cancelados as number) ?? 0,
      // Só para o teste de exclusão; não entram no tipo público.
      _canalReal: canalDaConta.get(conta) ?? null,
      _contaCanalId: conta,
    };
  });

  const { mantidas, removidas } = aplicar(
    todas.map((l) => ({ ...l, canalId: l._canalReal, contaCanalId: l._contaCanalId })),
    exclusoes
  );

  // Devolve o `canalId` de tela (o slug), que é o que as telas agrupam por.
  const linhas: LinhaVendaDia[] = mantidas.map((l) => ({
    data: l.data,
    canal: l.canal,
    canalId: chaveCanal(l.canal),
    canalReal: l.canalId,
    receita: l.receita,
    pedidos: l.pedidos,
    visitas: l.visitas,
    ads: l.ads,
    cancelado: l.cancelado,
    pedidosCancelados: l.pedidosCancelados,
  }));

  const canaisDisponiveis = [
    ...new Map(
      contas.map((c) => [c.canal_id, { id: c.canal_id, nome: c.canais?.nome ?? "Outros" }])
    ).values(),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  if (!linhas.length) {
    return {
      linhas: [], canais: [], ano: new Date().getFullYear(), ultimaData: null,
      vazio: true, exclusoes, removidas, canaisDisponiveis,
    };
  }

  // Só contas com movimento entram nas telas. Listar conta cadastrada e
  // vazia enche a legenda de linhas retas e esconde o que importa.
  const comMovimento = new Set(linhas.filter((l) => l.receita > 0 || l.pedidos > 0).map((l) => l.canalId));

  const vistos = new Set<string>();
  const canais: CanalInfo[] = [...info.values()]
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    .map((i) => ({
      id: chaveCanal(i.nome),
      nome: i.nome,
      cor: i.cor,
      contaCanalId: i.contaCanalId,
    }))
    .filter((c) => {
      if (!comMovimento.has(c.id) || vistos.has(c.id)) return false;
      vistos.add(c.id);
      return true;
    });

  /*
   * O canal inteiro, onde ele tem mais de uma conta.
   *
   * A unidade das telas continua sendo a conta — é nela que se grava e é
   * ela que separa pronta entrega de venda a prazo. Mas quem pergunta
   * "quanto o Mercado Livre fez no dia 31" não quer escolher entre as
   * duas antes de ver o total, e sem esta linha a resposta que aparece é
   * a de uma conta só, sem nada indicando que falta a outra.
   *
   * Vem antes das contas na lista, e as contas seguem logo abaixo: a
   * ordem sugere a relação sem precisar de rótulo explicando.
   */
  const porCanalNome = new Map<string, CanalInfo[]>();
  for (const c of canais) {
    const canal = c.nome.includes(" — ") ? c.nome.split(" — ")[0] : c.nome;
    const lista = porCanalNome.get(canal) ?? [];
    lista.push(c);
    porCanalNome.set(canal, lista);
  }

  const comGrupos: CanalInfo[] = [];
  for (const [nome, contasDoCanal] of porCanalNome) {
    if (contasDoCanal.length > 1) {
      comGrupos.push({
        id: `grupo:${chaveCanal(nome)}`,
        nome,
        cor: contasDoCanal[0].cor,
        // Sem contaCanalId de propósito: linha de canal não tem onde
        // gravar, e a tela já recusa gravação em item sem conta.
        agrupa: contasDoCanal.map((c) => c.id),
      });
    }
    comGrupos.push(...contasDoCanal);
  }

  const ultimaData = linhas[linhas.length - 1].data;
  return {
    linhas, canais: comGrupos, ano: Number(ultimaData.slice(0, 4)), ultimaData,
    vazio: false, exclusoes, removidas, canaisDisponiveis,
  };
}

export type DadosSemanal = {
  semanas: SemanaVendas[];
  semanasFechadas: SemanaVendas[];
  semanaAtual: number;
  totalSemanas: number;
  ano: number;
  canais: CanalInfo[];
  /** Série diária: a tela reagrupa por canal sem voltar ao servidor. */
  linhas: LinhaVendaDia[];
  ultimaData: string;
  vazio: boolean;
};

export async function carregarSemanal(): Promise<DadosSemanal> {
  const base = await carregarBaseVendas();
  if (base.vazio) {
    return {
      semanas: [], semanasFechadas: [], semanaAtual: 1,
      totalSemanas: 52, ano: base.ano, canais: [],
      linhas: [], ultimaData: "", vazio: true,
    };
  }

  const acc = new Map<
    number,
    { receita: number; pedidos: number; visitas: number; ads: number; cancelado: number; pedCanc: number; dias: Set<string> }
  >();

  for (const l of base.linhas) {
    const { ano, semana } = semanaIsoDe(l.data);
    if (ano !== base.ano) continue;
    const a = acc.get(semana) ?? {
      receita: 0, pedidos: 0, visitas: 0, ads: 0, cancelado: 0, pedCanc: 0, dias: new Set<string>(),
    };
    a.receita += l.receita;
    a.pedidos += l.pedidos;
    a.visitas += l.visitas;
    a.ads += l.ads;
    a.cancelado += l.cancelado;
    a.pedCanc += l.pedidosCancelados;
    a.dias.add(l.data);
    acc.set(semana, a);
  }

  const ultima = semanaIsoDe(base.ultimaData!).semana;
  // 53 quando o ano tem 53 semanas ISO — 31/12 cair na semana 53 é o teste.
  const totalSemanas = semanaIsoDe(`${base.ano}-12-28`).semana;

  const semanas: SemanaVendas[] = [];
  for (let s = 1; s <= totalSemanas; s++) {
    const a = acc.get(s);
    // Segunda-feira da semana s: 4 de janeiro sempre cai na semana 1.
    const ref = new Date(Date.UTC(base.ano, 0, 4));
    const inicio = segundaDa(ref.toISOString().slice(0, 10));
    inicio.setUTCDate(inicio.getUTCDate() + (s - 1) * 7);
    const fim = new Date(inicio);
    fim.setUTCDate(fim.getUTCDate() + 6);

    const receita = a?.receita ?? 0;
    const pedidos = a?.pedidos ?? 0;
    const visitas = a?.visitas ?? 0;
    const cancelado = a?.cancelado ?? 0;
    const ads = a?.ads ?? 0;
    const intervalo = `${dm(inicio)} – ${dm(fim)}`;
    const rotulo = `S${String(s).padStart(2, "0")}`;

    semanas.push({
      n: s,
      rotulo,
      inicio: inicio.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10),
      intervalo,
      titulo: `${rotulo} · ${intervalo}`,
      mes: MESES[inicio.getUTCMonth()],
      receita,
      cancelado,
      receitaLiquida: receita - cancelado,
      pedidos,
      pedidosCancelados: a?.pedCanc ?? 0,
      ticket: pedidos ? receita / pedidos : 0,
      visitas,
      conversao: visitas ? (pedidos * 100) / visitas : 0,
      ads,
      tacos: receita ? (ads * 100) / receita : 0,
      // Parcial = a semana em que os dados param. Marcar evita comparar
      // uma semana pela metade com semanas inteiras e ler queda onde não há.
      parcial: s === ultima && (a?.dias.size ?? 0) < 7,
      comDados: Boolean(a),
    });
  }

  return {
    semanas,
    semanasFechadas: semanas.filter((s) => s.comDados && !s.parcial),
    semanaAtual: ultima,
    totalSemanas,
    ano: base.ano,
    canais: base.canais,
    linhas: base.linhas,
    ultimaData: base.ultimaData!,
    vazio: false,
  };
}

/* ── Anual ───────────────────────────────────────────────────── */

export type MesAnual = {
  mes: number;
  rotulo: string;
  rotuloLongo: string;
  receita: number;
  pedidos: number;
  visitas: number;
  ads: number;
  pedidosCancelados: number;
  valorCancelado: number;
  meta: number;
};

export type DadosAnual = {
  ano: number;
  canais: CanalInfo[];
  /** Série mensal por canal, mais a chave "todos" com o consolidado. */
  series: Record<string, MesAnual[]>;
  /** Fechamento do ano anterior, para a comparação de topo. */
  anoAnterior: Record<string, { receita: number; pedidos: number }>;
  vazio: boolean;
};

const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function mesVazio(m: number): MesAnual {
  return {
    mes: m,
    rotulo: MESES[m],
    rotuloLongo: MESES_LONGOS[m],
    receita: 0,
    pedidos: 0,
    visitas: 0,
    ads: 0,
    pedidosCancelados: 0,
    valorCancelado: 0,
    // Meta fica zerada: as colunas de meta da planilha vêm em branco. Um
    // valor inventado aqui viraria linha de alvo no gráfico, e ninguém
    // desconfia de uma linha de alvo.
    meta: 0,
  };
}

export async function carregarAnual(): Promise<DadosAnual> {
  const base = await carregarBaseVendas();
  if (base.vazio) {
    return { ano: base.ano, canais: [], series: { todos: [] }, anoAnterior: {}, vazio: true };
  }

  const metas = await carregarMetasGravadas(base.ano);

  /*
   * A meta do canal entra na série dele e na consolidada.
   *
   * Somada a partir das linhas de venda, um canal com meta e sem venda
   * nenhuma no mês ficaria de fora — que é justamente o caso em que o
   * alvo importa. Por isso o laço percorre os canais, não as vendas.
   */
  const slugPorCanalReal = new Map<string, string>();
  for (const l of base.linhas) {
    if (l.canalReal) slugPorCanalReal.set(l.canalReal, l.canalId);
  }

  const series: Record<string, MesAnual[]> = {
    todos: Array.from({ length: 12 }, (_, m) => mesVazio(m)),
  };
  for (const c of base.canais) {
    series[c.id] = Array.from({ length: 12 }, (_, m) => mesVazio(m));
  }

  const anterior: Record<string, { receita: number; pedidos: number }> = {
    todos: { receita: 0, pedidos: 0 },
  };
  for (const c of base.canais) anterior[c.id] = { receita: 0, pedidos: 0 };

  for (const l of base.linhas) {
    const ano = Number(l.data.slice(0, 4));
    const m = Number(l.data.slice(5, 7)) - 1;

    if (ano === base.ano) {
      for (const alvo of [series.todos, series[l.canalId]]) {
        if (!alvo) continue;
        alvo[m].receita += l.receita;
        alvo[m].pedidos += l.pedidos;
        alvo[m].visitas += l.visitas;
        alvo[m].ads += l.ads;
        alvo[m].pedidosCancelados += l.pedidosCancelados;
        alvo[m].valorCancelado += l.cancelado;
      }
    } else if (ano === base.ano - 1) {
      anterior.todos.receita += l.receita;
      anterior.todos.pedidos += l.pedidos;
      const a = anterior[l.canalId];
      if (a) { a.receita += l.receita; a.pedidos += l.pedidos; }
    }
  }

  for (const [chave, valor] of metas.porCanalMes) {
    const [canalReal, mesStr] = chave.split("|");
    const m = Number(mesStr) - 1;
    if (m < 0 || m > 11) continue;
    series.todos[m].meta += valor;
    const slug = slugPorCanalReal.get(canalReal);
    if (slug && series[slug]) series[slug][m].meta += valor;
  }

  return { ano: base.ano, canais: base.canais, series, anoAnterior: anterior, vazio: false };
}

/* ── Comparativos ────────────────────────────────────────────── */

export type RegistroDia = {
  visitas: number;
  receita: number;
  pedidos: number;
  ads: number;
  pedidosCancelados: number;
  valorCancelado: number;
  meta: number;
};

export type DadosComparativos = {
  ano: number;
  canais: CanalInfo[];
  /**
   * Série indexada por DIA DO ANO (0 = 1º de janeiro), com a chave "todos"
   * consolidando os canais.
   *
   * O índice tem que ser posicional porque a tela agrega por listas de
   * índices pré-calculadas — "todas as terças de março", "primeira
   * segunda de cada mês". Indexar por data quebraria essas listas.
   */
  serieDiaria: Record<string, RegistroDia[]>;
  vazio: boolean;
};

const vazioDia = (): RegistroDia => ({
  visitas: 0, receita: 0, pedidos: 0, ads: 0,
  pedidosCancelados: 0, valorCancelado: 0, meta: 0,
});

/** Dia do ano, 0-based. */
function diaDoAno(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Math.round(
    (Date.UTC(a, m - 1, d) - Date.UTC(a, 0, 1)) / 86400000
  );
}

export async function carregarComparativos(): Promise<DadosComparativos> {
  const base = await carregarBaseVendas();
  if (base.vazio) {
    return { ano: base.ano, canais: [], serieDiaria: { todos: [] }, vazio: true };
  }

  const bissexto = new Date(Date.UTC(base.ano, 1, 29)).getUTCMonth() === 1;
  const dias = bissexto ? 366 : 365;

  const serieDiaria: Record<string, RegistroDia[]> = {
    todos: Array.from({ length: dias }, vazioDia),
  };
  for (const c of base.canais) {
    serieDiaria[c.id] = Array.from({ length: dias }, vazioDia);
  }

  for (const l of base.linhas) {
    if (Number(l.data.slice(0, 4)) !== base.ano) continue;
    const i = diaDoAno(l.data);
    if (i < 0 || i >= dias) continue;
    for (const alvo of [serieDiaria.todos, serieDiaria[l.canalId]]) {
      if (!alvo) continue;
      alvo[i].visitas += l.visitas;
      alvo[i].receita += l.receita;
      alvo[i].pedidos += l.pedidos;
      alvo[i].ads += l.ads;
      alvo[i].pedidosCancelados += l.pedidosCancelados;
      alvo[i].valorCancelado += l.cancelado;
    }
  }

  return { ano: base.ano, canais: base.canais, serieDiaria, vazio: false };
}

/* ── Lançamentos ─────────────────────────────────────────────── */

export type LancamentoDia = {
  data: string;
  mes: number;
  dia: number;
  diaSemana: number;
  rotuloDiaSemana: string;
  fimDeSemana: boolean;
  futuro: boolean;
  visitas: number;
  receita: number;
  pedidos: number;
  ads: number;
  pedidosCancelados: number;
  valorCancelado: number;
  metaDia: number;
};

export type DadosLancamentos = {
  ano: number;
  mesAtual: number;
  diaAtual: number;
  canais: CanalInfo[];
  /** serie[canalId][mes] = os dias daquele mês. */
  serie: Record<string, LancamentoDia[][]>;
  vazio: boolean;
};

const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export async function carregarLancamentos(): Promise<DadosLancamentos> {
  const base = await carregarBaseVendas();
  if (base.vazio) {
    return {
      ano: base.ano, mesAtual: 0, diaAtual: 1,
      canais: [], serie: {}, vazio: true,
    };
  }

  const ultima = base.ultimaData!;
  const mesAtual = Number(ultima.slice(5, 7)) - 1;
  const diaAtual = Number(ultima.slice(8, 10));

  const metas = await carregarMetasGravadas(base.ano);

  // A meta é gravada por canal de verdade; a tela agrupa por slug de
  // conta. Uma conta herda a meta do canal dela dividida entre as contas
  // daquele canal — senão as duas contas do Meli mostrariam, cada uma, a
  // meta inteira do canal.
  const contasPorCanalReal = new Map<string, Set<string>>();
  const canalRealDoSlug = new Map<string, string>();
  for (const l of base.linhas) {
    if (!l.canalReal) continue;
    canalRealDoSlug.set(l.canalId, l.canalReal);
    const s = contasPorCanalReal.get(l.canalReal) ?? new Set<string>();
    s.add(l.canalId);
    contasPorCanalReal.set(l.canalReal, s);
  }

  const metaDoSlugNoDia = (slug: string, iso: string): number => {
    const real = canalRealDoSlug.get(slug);
    if (!real) return 0;
    const total = metas.porCanalDia.get(`${real}|${iso}`) ?? 0;
    const quantas = contasPorCanalReal.get(real)?.size ?? 1;
    return quantas > 1 ? Number((total / quantas).toFixed(2)) : total;
  };

  const porCanalData = new Map<string, LinhaVendaDia>();
  for (const l of base.linhas) porCanalData.set(`${l.canalId}|${l.data}`, l);

  const serie: Record<string, LancamentoDia[][]> = {};
  const ids = ["todos", ...base.canais.map((c) => c.id)];

  for (const id of ids) {
    const meses: LancamentoDia[][] = [];
    for (let m = 0; m < 12; m++) {
      const nDias = new Date(Date.UTC(base.ano, m + 1, 0)).getUTCDate();
      const dias: LancamentoDia[] = [];
      for (let d = 1; d <= nDias; d++) {
        const iso = `${base.ano}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();

        let v = { visitas: 0, receita: 0, pedidos: 0, ads: 0, pc: 0, vc: 0 };
        // O grupo soma as contas que ele reúne; "todos" soma as contas
        // isoladas — somar os grupos junto contaria cada conta duas vezes.
        const grupo = base.canais.find((c) => c.id === id)?.agrupa;
        if (id === "todos" || grupo) {
          const alvo = grupo
            ? base.canais.filter((c) => grupo.includes(c.id))
            : base.canais.filter((c) => !c.agrupa);
          for (const c of alvo) {
            const l = porCanalData.get(`${c.id}|${iso}`);
            if (!l) continue;
            v = {
              visitas: v.visitas + l.visitas, receita: v.receita + l.receita,
              pedidos: v.pedidos + l.pedidos, ads: v.ads + l.ads,
              pc: v.pc + l.pedidosCancelados, vc: v.vc + l.cancelado,
            };
          }
        } else {
          const l = porCanalData.get(`${id}|${iso}`);
          if (l) {
            v = {
              visitas: l.visitas, receita: l.receita, pedidos: l.pedidos,
              ads: l.ads, pc: l.pedidosCancelados, vc: l.cancelado,
            };
          }
        }

        dias.push({
          data: iso,
          mes: m,
          dia: d,
          diaSemana: dow,
          rotuloDiaSemana: DOW[dow],
          fimDeSemana: dow === 0 || dow === 6,
          // "Futuro" é depois do último dia COM DADO, não depois de hoje: o
          // que a tela precisa distinguir é linha por preencher de linha
          // preenchida com zero.
          futuro: iso > ultima,
          visitas: v.visitas,
          receita: v.receita,
          pedidos: v.pedidos,
          ads: v.ads,
          pedidosCancelados: v.pc,
          valorCancelado: v.vc,
          metaDia:
            id === "todos"
              ? base.canais.reduce((s, c) => s + metaDoSlugNoDia(c.id, iso), 0)
              : metaDoSlugNoDia(id, iso),
        });
      }
      meses.push(dias);
    }
    serie[id] = meses;
  }

  return { ano: base.ano, mesAtual, diaAtual, canais: base.canais, serie, vazio: false };
}

/* ── Vendas por canal ────────────────────────────────────────── */

export type DadosCanais = {
  /** Uma linha por canal por dia — o recorte por período é feito na tela. */
  linhas: LinhaVendaDia[];
  canais: CanalInfo[];
  ultimaData: string;
  vazio: boolean;
};

/**
 * Manda a série diária para a tela em vez de um agregado pronto.
 *
 * O seletor de período (7 / 30 / 90 dias / ano) precisa recortar de
 * verdade. Enviar só o agregado de 30 dias faria os botões mudarem de cor
 * sem mudar o número — que é pior que não ter botão, porque parece que a
 * conta foi refeita.
 *
 * São ~800 linhas pequenas, então mandar tudo é mais barato que uma ida ao
 * servidor a cada clique.
 */
export async function carregarCanais(): Promise<DadosCanais> {
  const base = await carregarBaseVendas();
  if (base.vazio) {
    return { linhas: [], canais: [], ultimaData: "", vazio: true };
  }
  return {
    linhas: base.linhas,
    canais: base.canais,
    ultimaData: base.ultimaData!,
    vazio: false,
  };
}
