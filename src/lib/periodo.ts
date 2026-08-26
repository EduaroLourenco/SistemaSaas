import type { Kpi, DiaFaturamento, Canal } from "@/mock";

/**
 * Agregação por período, no navegador.
 *
 * Fica fora de `lib/dados` de propósito: aqui não há `server-only`, porque
 * quem chama é a tela, a cada clique no seletor de período. Mandar a série
 * diária uma vez e recortar aqui é mais barato que uma ida ao servidor por
 * clique — e é o que faz o botão mudar o número, não só a cor.
 */

export type LinhaDia = {
  data: string;
  canal: string;
  canalId: string;
  receita: number;
  pedidos: number;
  visitas: number;
  ads: number;
  cancelado: number;
  pedidosCancelados: number;
};

export type CanalInfo = { id: string; nome: string; cor: string };

/** Quantos dias COM MOVIMENTO cada opção cobre. */
export const DIAS_DO_PERIODO: Record<string, number> = {
  "7 dias": 7,
  "30 dias": 30,
  "90 dias": 90,
  Ano: 366,
};

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function variacao(atual: number, anterior: number) {
  if (!anterior) return 0;
  return ((atual - anterior) / anterior) * 100;
}

export type Recorte = {
  kpis: Kpi[];
  canais: Canal[];
  faturamento: DiaFaturamento[];
  intervalo: string;
  dias: number;
};

/**
 * Recorta a série pelos últimos N dias COM MOVIMENTO e compara com os N
 * anteriores.
 *
 * Dias com movimento e não dias de calendário: a operação alimenta os dados
 * com atraso e a planilha tem lacunas. Contar o calendário faria "7 dias"
 * cair numa faixa com três dias preenchidos, e a queda seria do arquivo,
 * não da operação.
 */
export function recortar(
  linhas: LinhaDia[],
  canaisInfo: CanalInfo[],
  periodo: string
): Recorte {
  const n = DIAS_DO_PERIODO[periodo] ?? 30;
  const datas = [...new Set(linhas.map((l) => l.data))].sort();
  const janela = new Set(datas.slice(-n));
  const antes = new Set(datas.slice(-n * 2, -n));
  const ordenadas = [...janela].sort();

  const somar = (filtro: Set<string>) => {
    const t = { receita: 0, pedidos: 0, visitas: 0, ads: 0, cancelado: 0, pedCanc: 0 };
    for (const l of linhas) {
      if (!filtro.has(l.data)) continue;
      t.receita += l.receita;
      t.pedidos += l.pedidos;
      t.visitas += l.visitas;
      t.ads += l.ads;
      t.cancelado += l.cancelado;
      t.pedCanc += l.pedidosCancelados;
    }
    return t;
  };
  const a = somar(janela);
  const b = somar(antes);

  const ticket = (t: typeof a) => (t.pedidos ? t.receita / t.pedidos : 0);
  const conv = (t: typeof a) => (t.visitas ? (t.pedidos * 100) / t.visitas : 0);

  const porDia = new Map<string, DiaFaturamento>();
  for (const l of linhas) {
    if (!janela.has(l.data)) continue;
    const d = porDia.get(l.data) ?? { data: l.data, faturamento: 0, pedidos: 0 };
    d.faturamento += l.receita;
    d.pedidos += l.pedidos;
    porDia.set(l.data, d);
  }
  const faturamento = ordenadas
    .map((d) => porDia.get(d))
    .filter((d): d is DiaFaturamento => Boolean(d));

  const paraSpark = ordenadas.slice(-12);
  const spark = (campo: (l: LinhaDia) => number) =>
    paraSpark.map((d) =>
      Math.round(linhas.filter((l) => l.data === d).reduce((s, l) => s + campo(l), 0))
    );

  const dica = `vs. ${n} dias anteriores`;
  const kpis: Kpi[] = [
    { id: "faturamento", label: "Faturamento", value: a.receita, format: "money",
      delta: variacao(a.receita, b.receita), hint: dica, spark: spark((l) => l.receita) },
    { id: "pedidos", label: "Pedidos", value: a.pedidos, format: "count",
      delta: variacao(a.pedidos, b.pedidos), hint: dica, spark: spark((l) => l.pedidos) },
    { id: "ticket", label: "Ticket médio", value: ticket(a), format: "money",
      delta: variacao(ticket(a), ticket(b)), hint: dica, spark: spark((l) => l.receita) },
    { id: "conversao", label: "Conversão", value: conv(a), format: "pct",
      delta: variacao(conv(a), conv(b)), hint: dica, spark: spark((l) => l.visitas) },
    { id: "ads", label: "Investimento em ADS", value: a.ads, format: "money",
      delta: variacao(a.ads, b.ads), inverse: true, hint: dica, spark: spark((l) => l.ads) },
    { id: "cancelado", label: "Valor cancelado", value: a.cancelado, format: "money",
      delta: variacao(a.cancelado, b.cancelado), inverse: true, hint: dica,
      spark: spark((l) => l.cancelado) },
  ];

  const agr = new Map<string, { rec: number; ped: number; vis: number; ant: number }>();
  for (const l of linhas) {
    const g = agr.get(l.canalId) ?? { rec: 0, ped: 0, vis: 0, ant: 0 };
    if (janela.has(l.data)) {
      g.rec += l.receita;
      g.ped += l.pedidos;
      g.vis += l.visitas;
    } else if (antes.has(l.data)) {
      g.ant += l.receita;
    }
    agr.set(l.canalId, g);
  }
  const total = [...agr.values()].reduce((s, g) => s + g.rec, 0);

  const canais: Canal[] = canaisInfo
    .map((c) => {
      const g = agr.get(c.id) ?? { rec: 0, ped: 0, vis: 0, ant: 0 };
      return {
        id: c.id,
        nome: c.nome,
        faturamento: g.rec,
        pedidos: g.ped,
        ticket: g.ped ? g.rec / g.ped : 0,
        conversao: g.vis ? (g.ped * 100) / g.vis : 0,
        // Sem custo por canal em nenhuma planilha, margem não existe ainda.
        margem: 0,
        delta: variacao(g.rec, g.ant),
        participacao: total ? (g.rec * 100) / total : 0,
        spark: paraSpark.map((d) =>
          Math.round(
            linhas
              .filter((l) => l.data === d && l.canalId === c.id)
              .reduce((s, l) => s + l.receita, 0) / 1000
          )
        ),
      };
    })
    .filter((c) => c.faturamento > 0 || c.pedidos > 0)
    .sort((x, y) => y.faturamento - x.faturamento);

  return {
    kpis,
    canais,
    faturamento,
    intervalo: ordenadas.length
      ? `${dm(ordenadas[0])} – ${dm(ordenadas[ordenadas.length - 1])}`
      : "sem dados",
    dias: ordenadas.length,
  };
}

/* ── Semanas ─────────────────────────────────────────────────── */

export type SemanaAgregada = {
  n: number;
  rotulo: string;
  inicio: string;
  fim: string;
  intervalo: string;
  titulo: string;
  mes: string;
  receita: number;
  cancelado: number;
  receitaLiquida: number;
  pedidos: number;
  pedidosCancelados: number;
  ticket: number;
  visitas: number;
  conversao: number;
  ads: number;
  tacos: number;
  parcial: boolean;
  comDados: boolean;
};

const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function semanaIso(iso: string): { ano: number; semana: number } {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ano = d.getUTCFullYear();
  const q = new Date(Date.UTC(ano, 0, 4));
  q.setUTCDate(q.getUTCDate() - ((q.getUTCDay() + 6) % 7) + 3);
  return { ano, semana: 1 + Math.round((d.getTime() - q.getTime()) / (7 * 86400000)) };
}

/**
 * Agrupa a série diária em semanas ISO, opcionalmente de um canal só.
 *
 * `canal` vazio significa todos. Poder olhar um canal por vez é o que
 * permite responder "o Mercado Livre caiu ou foi a VTEX?" — no
 * consolidado, uma alta cobre a queda da outra e a semana parece estável.
 */
export function agruparSemanas(
  linhas: LinhaDia[],
  ano: number,
  ultimaData: string,
  canal?: string
): SemanaAgregada[] {
  const fonte = canal ? linhas.filter((l) => l.canalId === canal) : linhas;

  const acc = new Map<
    number,
    { rec: number; ped: number; vis: number; ads: number; canc: number; pc: number; dias: Set<string> }
  >();

  for (const l of fonte) {
    const { ano: a, semana } = semanaIso(l.data);
    if (a !== ano) continue;
    const g = acc.get(semana) ?? {
      rec: 0, ped: 0, vis: 0, ads: 0, canc: 0, pc: 0, dias: new Set<string>(),
    };
    g.rec += l.receita;
    g.ped += l.pedidos;
    g.vis += l.visitas;
    g.ads += l.ads;
    g.canc += l.cancelado;
    g.pc += l.pedidosCancelados;
    g.dias.add(l.data);
    acc.set(semana, g);
  }

  const ultima = semanaIso(ultimaData).semana;
  const total = semanaIso(`${ano}-12-28`).semana;
  const dm = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const saida: SemanaAgregada[] = [];
  for (let s = 1; s <= total; s++) {
    const g = acc.get(s);
    // 4 de janeiro sempre cai na semana 1 — âncora da norma ISO.
    const inicio = new Date(Date.UTC(ano, 0, 4));
    inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7) + (s - 1) * 7);
    const fim = new Date(inicio);
    fim.setUTCDate(fim.getUTCDate() + 6);

    const rec = g?.rec ?? 0;
    const ped = g?.ped ?? 0;
    const vis = g?.vis ?? 0;
    const ads = g?.ads ?? 0;
    const canc = g?.canc ?? 0;
    const intervalo = `${dm(inicio)} – ${dm(fim)}`;
    const rotulo = `S${String(s).padStart(2, "0")}`;

    saida.push({
      n: s,
      rotulo,
      inicio: inicio.toISOString().slice(0, 10),
      fim: fim.toISOString().slice(0, 10),
      intervalo,
      titulo: `${rotulo} · ${intervalo}`,
      mes: MESES_CURTOS[inicio.getUTCMonth()],
      receita: rec,
      cancelado: canc,
      receitaLiquida: rec - canc,
      pedidos: ped,
      pedidosCancelados: g?.pc ?? 0,
      ticket: ped ? rec / ped : 0,
      visitas: vis,
      conversao: vis ? (ped * 100) / vis : 0,
      ads,
      tacos: rec ? (ads * 100) / rec : 0,
      // Semana em curso: tem dado, mas não sete dias. Comparar uma semana
      // pela metade com semanas inteiras produz queda que não existe.
      parcial: s === ultima && (g?.dias.size ?? 0) < 7,
      comDados: Boolean(g),
    });
  }
  return saida;
}
