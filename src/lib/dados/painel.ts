import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { carregarBaseVendas, chaveCanal } from "./vendas";
import { paginar } from "./paginar";
import { carregarPainelNovo, type Recomendacao, type SkuEmQueda } from "./recomendacoes";
import type { Kpi, DiaFaturamento, Canal, Anuncio } from "@/mock";

/**
 * Dados do painel, lidos do banco.
 *
 * Usa a MESMA base das telas de vendas (`carregarBaseVendas`). Duas
 * agregações separadas do mesmo dado é como um painel passa a mostrar um
 * total e a tela de canais outro, sem ninguém saber qual está certo.
 *
 * A unidade é a CONTA DE VENDEDOR, não o canal: o Mercado Livre opera com
 * duas contas que vendem de formas diferentes, e somá-las esconde a
 * comparação que interessa.
 */

export type SerieCanalSemana = { semana: string } & Record<string, number | string>;

export type DadosPainel = {
  kpis: Kpi[];
  faturamento30d: DiaFaturamento[];
  canais: Canal[];
  canaisSemanas: SerieCanalSemana[];
  canalCores: Record<string, string>;
  canalNomes: Record<string, string>;
  anuncios: Anuncio[];
  /** Série diária: a tela recorta por período sem voltar ao servidor. */
  linhas: import("@/lib/periodo").LinhaDia[];
  canaisInfo: import("@/lib/periodo").CanalInfo[];
  /** Fila do dia: o que mudou e merece decisão. */
  recomendacoes: Recomendacao[];
  /** SKUs que caíram, com a evolução que explica. */
  quedas: SkuEmQueda[];
  /** Última data com movimento — o painel diz a que dia se refere. */
  ultimaData: string | null;
  vazio: boolean;
  /** Períodos fora da análise. O painel precisa dizer que os aplicou. */
  exclusoes: import("./exclusoes").Exclusao[];
  removidas: number;
  canaisDisponiveis: { id: string; nome: string }[];
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

/** Variação percentual; zero quando não há base de comparação. */
function delta(atual: number, anterior: number): number {
  if (!anterior) return 0;
  return ((atual - anterior) / anterior) * 100;
}

/** Semana ISO no formato "S34". */
function semanaDe(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ano = d.getUTCFullYear();
  const q = new Date(Date.UTC(ano, 0, 4));
  q.setUTCDate(q.getUTCDate() - ((q.getUTCDay() + 6) % 7) + 3);
  return `S${1 + Math.round((d.getTime() - q.getTime()) / (7 * 86400000))}`;
}

export async function carregarPainel(): Promise<DadosPainel> {
  const base = await carregarBaseVendas();

  if (base.vazio) {
    return {
      kpis: [],
      faturamento30d: [],
      canais: [],
      canaisSemanas: [],
      canalCores: {},
      canalNomes: {},
      anuncios: [],
      linhas: [],
      canaisInfo: [],
      recomendacoes: [],
      quedas: [],
      ultimaData: null,
      vazio: true,
      exclusoes: base.exclusoes,
      removidas: base.removidas,
      canaisDisponiveis: base.canaisDisponiveis,
    };
  }

  const linhas = base.linhas;
  const ultimaData = base.ultimaData!;

  /*
   * Janela de comparação: os 30 últimos DIAS COM MOVIMENTO, contra os 30
   * anteriores. Dias com movimento e não dias de calendário porque a
   * planilha tem lacunas — contar o calendário faria um mês pela metade
   * parecer despencar.
   */
  const datas = [...new Set(linhas.map((l) => l.data))].sort();
  const janela = new Set(datas.slice(-30));
  const anterior = new Set(datas.slice(-60, -30));

  const somar = (filtro: Set<string>) => {
    const t = { receita: 0, pedidos: 0, visitas: 0, ads: 0, cancelado: 0 };
    for (const l of linhas) {
      if (!filtro.has(l.data)) continue;
      t.receita += l.receita;
      t.pedidos += l.pedidos;
      t.visitas += l.visitas;
      t.ads += l.ads;
      t.cancelado += l.cancelado;
    }
    return t;
  };
  const a = somar(janela);
  const b = somar(anterior);

  const ultimas12 = datas.slice(-12);
  const spark = (campo: (l: (typeof linhas)[number]) => number) =>
    ultimas12.map((d) =>
      Math.round(linhas.filter((l) => l.data === d).reduce((s, l) => s + campo(l), 0))
    );

  const ticket = (t: typeof a) => (t.pedidos ? t.receita / t.pedidos : 0);
  const conv = (t: typeof a) => (t.visitas ? (t.pedidos * 100) / t.visitas : 0);

  const kpis: Kpi[] = [
    {
      id: "faturamento", label: "Faturamento", value: a.receita, format: "money",
      delta: delta(a.receita, b.receita), hint: "vs. 30 dias anteriores",
      spark: spark((l) => l.receita),
    },
    {
      id: "pedidos", label: "Pedidos", value: a.pedidos, format: "count",
      delta: delta(a.pedidos, b.pedidos), hint: "vs. 30 dias anteriores",
      spark: spark((l) => l.pedidos),
    },
    {
      id: "ticket", label: "Ticket médio", value: ticket(a), format: "money",
      delta: delta(ticket(a), ticket(b)), hint: "vs. 30 dias anteriores",
      spark: spark((l) => l.receita),
    },
    {
      id: "conversao", label: "Conversão", value: conv(a), format: "pct",
      delta: delta(conv(a), conv(b)), hint: "vs. 30 dias anteriores",
      spark: spark((l) => l.visitas),
    },
    {
      id: "ads", label: "Investimento em ADS", value: a.ads, format: "money",
      delta: delta(a.ads, b.ads), inverse: true, hint: "vs. 30 dias anteriores",
      spark: spark((l) => l.ads),
    },
    {
      id: "cancelado", label: "Valor cancelado", value: a.cancelado, format: "money",
      delta: delta(a.cancelado, b.cancelado), inverse: true, hint: "vs. 30 dias anteriores",
      spark: spark((l) => l.cancelado),
    },
  ];

  const porDia = new Map<string, DiaFaturamento>();
  for (const l of linhas) {
    const d = porDia.get(l.data) ?? { data: l.data, faturamento: 0, pedidos: 0 };
    d.faturamento += l.receita;
    d.pedidos += l.pedidos;
    porDia.set(l.data, d);
  }
  const faturamento30d = datas
    .slice(-30)
    .map((d) => porDia.get(d))
    .filter((d): d is DiaFaturamento => Boolean(d));

  const agr = new Map<string, { rec: number; ped: number; vis: number; recAnt: number }>();
  for (const l of linhas) {
    const g = agr.get(l.canalId) ?? { rec: 0, ped: 0, vis: 0, recAnt: 0 };
    if (janela.has(l.data)) {
      g.rec += l.receita;
      g.ped += l.pedidos;
      g.vis += l.visitas;
    } else if (anterior.has(l.data)) {
      g.recAnt += l.receita;
    }
    agr.set(l.canalId, g);
  }
  const totalRec = [...agr.values()].reduce((s, g) => s + g.rec, 0);

  const listaCanais: Canal[] = base.canais
    .map((c) => {
      const g = agr.get(c.id) ?? { rec: 0, ped: 0, vis: 0, recAnt: 0 };
      return {
        id: c.id,
        nome: c.nome,
        faturamento: g.rec,
        pedidos: g.ped,
        ticket: g.ped ? g.rec / g.ped : 0,
        conversao: g.vis ? (g.ped * 100) / g.vis : 0,
        // A planilha não traz custo por canal, então margem ainda não existe.
        margem: 0,
        delta: delta(g.rec, g.recAnt),
        participacao: totalRec ? (g.rec * 100) / totalRec : 0,
        spark: ultimas12.map((d) =>
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

  const porSemana = new Map<string, Record<string, number>>();
  for (const l of linhas) {
    const s = semanaDe(l.data);
    const linha = porSemana.get(s) ?? {};
    linha[l.canalId] = (linha[l.canalId] ?? 0) + l.receita / 1000;
    porSemana.set(s, linha);
  }
  const canaisSemanas = [...porSemana.entries()]
    .sort((x, y) => Number(x[0].slice(1)) - Number(y[0].slice(1)))
    .slice(-12)
    .map(([semana, v]) => {
      const o: SerieCanalSemana = { semana };
      for (const [k, val] of Object.entries(v)) o[k] = Math.round(val);
      return o;
    });

  const cores: Record<string, string> = {};
  const nomes: Record<string, string> = {};
  for (const c of base.canais) {
    cores[c.id] = c.cor;
    nomes[c.id] = c.nome;
  }

  const sb = await clienteServidor();
  const novo = await carregarPainelNovo();

  return {
    kpis,
    recomendacoes: novo.recomendacoes,
    quedas: novo.quedas,
    faturamento30d,
    canais: listaCanais,
    canaisSemanas,
    canalCores: cores,
    canalNomes: nomes,
    anuncios: await carregarAnuncios(sb),
    linhas,
    canaisInfo: base.canais,
    ultimaData,
    vazio: false,
    exclusoes: base.exclusoes,
    removidas: base.removidas,
    canaisDisponiveis: base.canaisDisponiveis,
  };
}

type BrutoAnuncio = {
  visitas: number;
  vendas: number;
  receita: string;
  preco_praticado: string | null;
  semana_iso: number;
  anuncios: {
    codigo_externo: string;
    titulo: string;
    sku_canal: string | null;
    tipo: string;
    status: string;
  } | null;
};

/** Anúncios com o acumulado das semanas importadas. */
async function carregarAnuncios(
  sb: Awaited<ReturnType<typeof clienteServidor>>
): Promise<Anuncio[]> {
  const data = await paginar(() =>
    sb
      .from("anuncio_desempenho_semanal")
      .select(
        "visitas,vendas,receita,preco_praticado,semana_iso,anuncios(codigo_externo,titulo,sku_canal,tipo,status)"
      )
      .order("semana_iso", { ascending: true })
  );

  const mapa = new Map<string, Anuncio & { _receitas: number[] }>();

  for (const r of data as unknown as BrutoAnuncio[]) {
    const a = r.anuncios;
    if (!a) continue;
    const atual =
      mapa.get(a.codigo_externo) ??
      ({
        mlb: a.codigo_externo,
        titulo: a.titulo,
        sku: a.sku_canal ?? "",
        curva: "C",
        tipo: a.tipo === "premium" ? "Premium" : "Clássico",
        visitas: 0,
        vendas: 0,
        conversao: 0,
        receita: 0,
        preco: 0,
        precoIdeal: 0,
        comissao: 0,
        campanhas: 0,
        status: a.status === "pausado" ? "pausado" : "ativo",
        historico: [],
        _receitas: [],
      } as Anuncio & { _receitas: number[] });

    atual.visitas += r.visitas;
    atual.vendas += r.vendas;
    atual.receita += n(r.receita);
    atual._receitas.push(n(r.receita));
    mapa.set(a.codigo_externo, atual);
  }

  const lista = [...mapa.values()].map((a) => ({
    ...a,
    conversao: a.visitas ? (a.vendas * 100) / a.visitas : 0,
    preco: a.vendas ? a.receita / a.vendas : 0,
    historico: a._receitas,
  }));
  lista.sort((x, y) => y.receita - x.receita);

  /*
   * Curva ABC por Pareto sobre a receita acumulada: até 80% é A, até 95% é
   * B, o resto é C. É a mesma regra do relatório antigo, para os números
   * continuarem comparáveis.
   */
  const total = lista.reduce((s, x) => s + x.receita, 0);
  let acumulado = 0;
  for (const item of lista) {
    acumulado += item.receita;
    const p = total ? (acumulado / total) * 100 : 100;
    item.curva = p <= 80 ? "A" : p <= 95 ? "B" : "C";
  }

  return lista.map((item) => {
    const copia = { ...item } as Anuncio & { _receitas?: number[] };
    delete copia._receitas;
    return copia as Anuncio;
  });
}

export { chaveCanal };
