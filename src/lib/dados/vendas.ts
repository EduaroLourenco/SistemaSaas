import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
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
  receita: number;
  pedidos: number;
  visitas: number;
  ads: number;
  cancelado: number;
  pedidosCancelados: number;
};

export type CanalInfo = { id: string; nome: string; cor: string };

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

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
};

export async function carregarBaseVendas(): Promise<BaseVendas> {
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

  const canaisLista = canaisBanco ?? [];
  const nomePorId = new Map(canaisLista.map((c) => [c.id as string, c.nome as string]));

  const linhas: LinhaVendaDia[] = (dias ?? []).map((l) => {
    const nome = nomePorId.get(l.canal_id as string) ?? "Outros";
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
    };
  });

  if (!linhas.length) {
    return { linhas: [], canais: [], ano: new Date().getFullYear(), ultimaData: null, vazio: true };
  }

  // Só canais com movimento entram nas telas. Listar canal cadastrado e
  // vazio enche a legenda de linhas retas e esconde o que importa.
  const comMovimento = new Set(linhas.filter((l) => l.receita > 0 || l.pedidos > 0).map((l) => l.canalId));

  const canais: CanalInfo[] = canaisLista
    .map((c) => ({
      id: chaveCanal(c.nome as string),
      nome: c.nome as string,
      cor: `var(--s${(c.cor_serie as number) ?? 1})`,
    }))
    .filter((c) => comMovimento.has(c.id));

  const ultimaData = linhas[linhas.length - 1].data;
  return { linhas, canais, ano: Number(ultimaData.slice(0, 4)), ultimaData, vazio: false };
}

export type DadosSemanal = {
  semanas: SemanaVendas[];
  semanasFechadas: SemanaVendas[];
  semanaAtual: number;
  totalSemanas: number;
  ano: number;
  canais: CanalInfo[];
  vazio: boolean;
};

export async function carregarSemanal(): Promise<DadosSemanal> {
  const base = await carregarBaseVendas();
  if (base.vazio) {
    return {
      semanas: [], semanasFechadas: [], semanaAtual: 1,
      totalSemanas: 52, ano: base.ano, canais: [], vazio: true,
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

  return { ano: base.ano, canais: base.canais, series, anoAnterior: anterior, vazio: false };
}
