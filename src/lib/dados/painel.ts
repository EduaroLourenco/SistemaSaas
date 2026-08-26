import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { Kpi, DiaFaturamento, Canal, Anuncio } from "@/mock";

/**
 * Dados do painel, lidos do banco.
 *
 * Devolve exatamente as formas que as telas já consomem — trocar mock por
 * banco não deve virar refatoração de gráfico. Onde a planilha não tem o
 * número que o mock inventava (margem por canal, por exemplo), o campo vem
 * zerado e a tela mostra vazio: número inventado num painel de decisão é
 * pior que campo em branco.
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
  /** Última data com movimento — o painel diz a que dia se refere. */
  ultimaData: string | null;
  vazio: boolean;
};

type LinhaDia = {
  data: string;
  receita: string;
  pedidos: number;
  visitas: number;
  investimento_ads: string;
  valor_cancelado: string;
  pedidos_cancelados: number;
  canal_id: string;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

/** Nome do canal como chave estável para série e cor. */
function chave(nome: string) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

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
  const sb = await clienteServidor();

  const [{ data: dias }, { data: canaisBanco }] = await Promise.all([
    sb
      .from("vendas_diarias")
      .select(
        "data,receita,pedidos,visitas,investimento_ads,valor_cancelado,pedidos_cancelados,canal_id"
      )
      .order("data", { ascending: true })
      .limit(20000),
    sb.from("canais").select("id,nome,cor_serie").order("ordem"),
  ]);

  const linhas = (dias ?? []) as unknown as LinhaDia[];
  const canais = canaisBanco ?? [];

  if (!linhas.length) {
    return {
      kpis: [],
      faturamento30d: [],
      canais: [],
      canaisSemanas: [],
      canalCores: {},
      canalNomes: {},
      anuncios: [],
      ultimaData: null,
      vazio: true,
    };
  }

  const nomePorId = new Map(canais.map((c) => [c.id as string, c.nome as string]));
  const ultimaData = linhas[linhas.length - 1].data;

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
      t.receita += n(l.receita);
      t.pedidos += l.pedidos;
      t.visitas += l.visitas;
      t.ads += n(l.investimento_ads);
      t.cancelado += n(l.valor_cancelado);
    }
    return t;
  };
  const a = somar(janela);
  const b = somar(anterior);

  const ultimas12 = datas.slice(-12);
  const spark = (campo: (l: LinhaDia) => number) =>
    ultimas12.map((d) =>
      Math.round(
        linhas.filter((l) => l.data === d).reduce((s, l) => s + campo(l), 0)
      )
    );

  const ticket = (t: typeof a) => (t.pedidos ? t.receita / t.pedidos : 0);
  const conv = (t: typeof a) => (t.visitas ? (t.pedidos * 100) / t.visitas : 0);

  const kpis: Kpi[] = [
    {
      id: "faturamento",
      label: "Faturamento",
      value: a.receita,
      format: "money",
      delta: delta(a.receita, b.receita),
      hint: "vs. 30 dias anteriores",
      spark: spark((l) => n(l.receita)),
    },
    {
      id: "pedidos",
      label: "Pedidos",
      value: a.pedidos,
      format: "count",
      delta: delta(a.pedidos, b.pedidos),
      hint: "vs. 30 dias anteriores",
      spark: spark((l) => l.pedidos),
    },
    {
      id: "ticket",
      label: "Ticket médio",
      value: ticket(a),
      format: "money",
      delta: delta(ticket(a), ticket(b)),
      hint: "vs. 30 dias anteriores",
      spark: spark((l) => n(l.receita)),
    },
    {
      id: "conversao",
      label: "Conversão",
      value: conv(a),
      format: "pct",
      delta: delta(conv(a), conv(b)),
      hint: "vs. 30 dias anteriores",
      spark: spark((l) => l.visitas),
    },
    {
      id: "ads",
      label: "Investimento em ADS",
      value: a.ads,
      format: "money",
      delta: delta(a.ads, b.ads),
      inverse: true,
      hint: "vs. 30 dias anteriores",
      spark: spark((l) => n(l.investimento_ads)),
    },
    {
      id: "cancelado",
      label: "Valor cancelado",
      value: a.cancelado,
      format: "money",
      delta: delta(a.cancelado, b.cancelado),
      inverse: true,
      hint: "vs. 30 dias anteriores",
      spark: spark((l) => n(l.valor_cancelado)),
    },
  ];

  const porDia = new Map<string, DiaFaturamento>();
  for (const l of linhas) {
    const d = porDia.get(l.data) ?? { data: l.data, faturamento: 0, pedidos: 0 };
    d.faturamento += n(l.receita);
    d.pedidos += l.pedidos;
    porDia.set(l.data, d);
  }
  const faturamento30d = datas
    .slice(-30)
    .map((d) => porDia.get(d))
    .filter((d): d is DiaFaturamento => Boolean(d));

  const agr = new Map<string, { rec: number; ped: number; vis: number; recAnt: number }>();
  for (const l of linhas) {
    const g = agr.get(l.canal_id) ?? { rec: 0, ped: 0, vis: 0, recAnt: 0 };
    if (janela.has(l.data)) {
      g.rec += n(l.receita);
      g.ped += l.pedidos;
      g.vis += l.visitas;
    } else if (anterior.has(l.data)) {
      g.recAnt += n(l.receita);
    }
    agr.set(l.canal_id, g);
  }
  const totalRec = [...agr.values()].reduce((s, g) => s + g.rec, 0);

  const listaCanais: Canal[] = [...agr.entries()]
    .filter(([, g]) => g.rec > 0 || g.ped > 0)
    .map(([id, g]) => {
      const nome = nomePorId.get(id) ?? "—";
      return {
        id: chave(nome),
        nome,
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
              .filter((l) => l.data === d && l.canal_id === id)
              .reduce((s, l) => s + n(l.receita), 0) / 1000
          )
        ),
      };
    })
    .sort((x, y) => y.faturamento - x.faturamento);

  const porSemana = new Map<string, Record<string, number>>();
  for (const l of linhas) {
    const s = semanaDe(l.data);
    const linha = porSemana.get(s) ?? {};
    const k = chave(nomePorId.get(l.canal_id) ?? "outro");
    linha[k] = (linha[k] ?? 0) + n(l.receita) / 1000;
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
  for (const c of canais) {
    const k = chave(c.nome as string);
    cores[k] = `var(--s${(c.cor_serie as number) ?? 1})`;
    nomes[k] = c.nome as string;
  }

  return {
    kpis,
    faturamento30d,
    canais: listaCanais,
    canaisSemanas,
    canalCores: cores,
    canalNomes: nomes,
    anuncios: await carregarAnuncios(sb),
    ultimaData,
    vazio: false,
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
  const { data } = await sb
    .from("anuncio_desempenho_semanal")
    .select(
      "visitas,vendas,receita,preco_praticado,semana_iso,anuncios(codigo_externo,titulo,sku_canal,tipo,status)"
    )
    .order("semana_iso", { ascending: true })
    .limit(20000);

  const mapa = new Map<string, Anuncio & { _receitas: number[] }>();

  for (const r of (data ?? []) as unknown as BrutoAnuncio[]) {
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
