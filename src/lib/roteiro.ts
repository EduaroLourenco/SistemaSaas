import type { LinhaDia, CanalInfo } from "./periodo";

/**
 * Monta o roteiro da apresentação a partir dos números do recorte.
 *
 * Cada comentário é derivado do próprio dado — quem cresceu, quanto, em
 * cima de quê. Quando o número não sustenta uma frase, o comentário diz
 * isso em vez de preencher: numa tela que vai ser lida em reunião, uma
 * frase inventada não tem como ser conferida por quem escuta.
 */

export type Slide = {
  id: string;
  titulo: string;
  subtitulo: string;
  valor: number;
  formato: "money" | "count" | "pct";
  delta: number;
  inverso?: boolean;
  comentario: string;
  tipo: "linha" | "barra";
  serie: { rotulo: string; valor: number }[];
};

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const pc = (v: number) =>
  `${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function variacao(atual: number, anterior: number): number {
  if (!anterior) return 0;
  return ((atual - anterior) / anterior) * 100;
}

/** "subiu 12%" / "caiu 4%" / "ficou estável". */
function movimento(d: number): string {
  if (!Number.isFinite(d) || Math.abs(d) < 1) return "ficou estável";
  return d > 0 ? `subiu ${pc(d)}` : `caiu ${pc(d)}`;
}

export type Recorte = {
  de: string;
  ate: string;
  /** Mesmo tamanho, imediatamente antes — a base de comparação. */
  deAnterior: string;
  ateAnterior: string;
};

/** O período anterior de mesmo tamanho, colado no início do atual. */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const d1 = new Date(`${de}T00:00:00Z`);
  const d2 = new Date(`${ate}T00:00:00Z`);
  const dias = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
  const fim = new Date(d1);
  fim.setUTCDate(fim.getUTCDate() - 1);
  const inicio = new Date(fim);
  inicio.setUTCDate(inicio.getUTCDate() - dias + 1);
  return { de: inicio.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
}

type Soma = {
  receita: number;
  pedidos: number;
  visitas: number;
  ads: number;
  cancelado: number;
  pedidosComVisita: number;
};

function somar(linhas: LinhaDia[], de: string, ate: string, canal?: string): Soma {
  const t: Soma = {
    receita: 0, pedidos: 0, visitas: 0, ads: 0, cancelado: 0, pedidosComVisita: 0,
  };
  for (const l of linhas) {
    if (l.data < de || l.data > ate) continue;
    if (canal && l.canalId !== canal) continue;
    t.receita += l.receita;
    t.pedidos += l.pedidos;
    t.visitas += l.visitas;
    t.ads += l.ads;
    t.cancelado += l.cancelado;
    // Só pedido com visita registrada entra na conversão — ver periodo.ts.
    if (l.visitas > 0) t.pedidosComVisita += l.pedidos;
  }
  return t;
}

export function montarRoteiro(
  linhas: LinhaDia[],
  canais: CanalInfo[],
  de: string,
  ate: string,
  canal?: string
): Slide[] {
  const ant = periodoAnterior(de, ate);
  const a = somar(linhas, de, ate, canal);
  const b = somar(linhas, ant.de, ant.ate, canal);

  const nomeCanal = canal ? canais.find((c) => c.id === canal)?.nome : null;
  const escopo = nomeCanal ?? "todos os canais";

  /* ── séries ── */

  const porDia = new Map<string, { receita: number; pedidos: number }>();
  for (const l of linhas) {
    if (l.data < de || l.data > ate) continue;
    if (canal && l.canalId !== canal) continue;
    const d = porDia.get(l.data) ?? { receita: 0, pedidos: 0 };
    d.receita += l.receita;
    d.pedidos += l.pedidos;
    porDia.set(l.data, d);
  }
  const dias = [...porDia.entries()].sort(([x], [y]) => x.localeCompare(y));
  const serieReceita = dias.map(([d, v]) => ({ rotulo: dm(d), valor: v.receita }));
  const seriePedidos = dias.map(([d, v]) => ({ rotulo: dm(d), valor: v.pedidos }));

  const porCanal = new Map<string, { atual: number; antes: number }>();
  for (const l of linhas) {
    const dentro = l.data >= de && l.data <= ate;
    const fora = l.data >= ant.de && l.data <= ant.ate;
    if (!dentro && !fora) continue;
    const g = porCanal.get(l.canalId) ?? { atual: 0, antes: 0 };
    if (dentro) g.atual += l.receita;
    else g.antes += l.receita;
    porCanal.set(l.canalId, g);
  }
  const nomes = new Map(canais.map((c) => [c.id, c.nome]));
  const serieCanais = [...porCanal.entries()]
    .filter(([, v]) => v.atual > 0)
    .map(([id, v]) => ({ rotulo: nomes.get(id) ?? id, valor: v.atual }))
    .sort((x, y) => y.valor - x.valor);

  /* ── comentários derivados ── */

  const ticket = (t: Soma) => (t.pedidos ? t.receita / t.pedidos : 0);
  const conv = (t: Soma) => (t.visitas ? (t.pedidosComVisita * 100) / t.visitas : 0);
  const tacos = (t: Soma) => (t.receita ? (t.ads * 100) / t.receita : 0);

  // Quem mais puxou a variação de receita, em reais.
  const puxaram = [...porCanal.entries()]
    .map(([id, v]) => ({ nome: nomes.get(id) ?? id, dif: v.atual - v.antes }))
    .filter((x) => Math.abs(x.dif) > 0)
    .sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif));

  const comentarioReceita = (() => {
    if (!a.receita) return "Sem receita registrada no período.";
    if (!b.receita) return `${brl(a.receita)} em ${escopo}. Sem período anterior comparável.`;
    const lider = puxaram[0];
    if (!lider || canal) return `Receita ${movimento(variacao(a.receita, b.receita))} contra o período anterior.`;
    const direcao = lider.dif > 0 ? "puxada por" : "segurada por";
    return `Receita ${movimento(variacao(a.receita, b.receita))}, ${direcao} ${lider.nome} (${lider.dif > 0 ? "+" : "−"}${brl(Math.abs(lider.dif))}).`;
  })();

  const comentarioPedidos = (() => {
    if (!a.pedidos) return "Nenhum pedido no período.";
    const dR = variacao(a.receita, b.receita);
    const dP = variacao(a.pedidos, b.pedidos);
    if (!b.pedidos) return `${a.pedidos.toLocaleString("pt-BR")} pedidos no período.`;
    if (Math.abs(dR - dP) < 2) return `Pedidos e receita andaram juntos: ambos ${movimento(dP)}.`;
    return dR > dP
      ? `Receita cresce mais que pedidos — o ticket é que está subindo, não o número de compradores.`
      : `Pedidos crescem mais que receita — está vendendo mais unidades a preço menor.`;
  })();

  const comentarioTicket = (() => {
    if (!a.pedidos) return "Sem pedidos para calcular ticket.";
    const d = variacao(ticket(a), ticket(b));
    if (!b.pedidos) return `Ticket de ${brl(ticket(a))} no período.`;
    return `Ticket ${movimento(d)} contra o período anterior.`;
  })();

  const comentarioConversao = (() => {
    if (!a.visitas) return "Sem visitas registradas — conversão indisponível neste recorte.";
    const d = variacao(conv(a), conv(b));
    if (!b.visitas) return `${pc(conv(a))} das visitas viraram pedido.`;
    return `Conversão ${movimento(d)}: ${pc(conv(a))} contra ${pc(conv(b))}.`;
  })();

  const comentarioCanais = (() => {
    if (!serieCanais.length) return "Sem receita por canal no período.";
    const total = serieCanais.reduce((s, c) => s + c.valor, 0);
    const p = serieCanais[0];
    const fatia = total ? (p.valor / total) * 100 : 0;
    return `${p.rotulo} responde por ${pc(fatia)} da receita do período.`;
  })();

  const comentarioAds = (() => {
    if (!a.ads) return "Sem investimento em mídia registrado no período.";
    const d = variacao(tacos(a), tacos(b));
    return b.ads
      ? `TACOS ${movimento(d)}: ${pc(tacos(a))} da receita foi para mídia.`
      : `${pc(tacos(a))} da receita foi para mídia.`;
  })();

  const comentarioCancelado = (() => {
    if (!a.cancelado) return "Nenhum cancelamento no período.";
    const fatia = a.receita ? (a.cancelado / a.receita) * 100 : 0;
    return `${brl(a.cancelado)} cancelados — ${pc(fatia)} da receita bruta.`;
  })();

  const intervalo = `${dm(de)} a ${dm(ate)}`;

  return [
    {
      id: "faturamento",
      titulo: "Faturamento",
      subtitulo: `${intervalo} · ${escopo}`,
      valor: a.receita,
      formato: "money",
      delta: variacao(a.receita, b.receita),
      comentario: comentarioReceita,
      tipo: "linha",
      serie: serieReceita,
    },
    {
      id: "pedidos",
      titulo: "Pedidos",
      subtitulo: "Volume de vendas concluídas",
      valor: a.pedidos,
      formato: "count",
      delta: variacao(a.pedidos, b.pedidos),
      comentario: comentarioPedidos,
      tipo: "linha",
      serie: seriePedidos,
    },
    {
      id: "ticket",
      titulo: "Ticket médio",
      subtitulo: "Valor médio por pedido",
      valor: ticket(a),
      formato: "money",
      delta: variacao(ticket(a), ticket(b)),
      comentario: comentarioTicket,
      tipo: "linha",
      serie: serieReceita,
    },
    {
      id: "canais",
      titulo: "Participação por canal",
      subtitulo: "Onde o faturamento é gerado",
      valor: serieCanais.length,
      formato: "count",
      delta: 0,
      comentario: comentarioCanais,
      tipo: "barra",
      serie: serieCanais,
    },
    {
      id: "conversao",
      titulo: "Conversão",
      subtitulo: "Visitas que viraram pedido",
      valor: conv(a),
      formato: "pct",
      delta: variacao(conv(a), conv(b)),
      comentario: comentarioConversao,
      tipo: "linha",
      serie: seriePedidos,
    },
    {
      id: "ads",
      titulo: "Investimento em mídia",
      subtitulo: "TACOS — mídia sobre receita total",
      valor: tacos(a),
      formato: "pct",
      delta: variacao(tacos(a), tacos(b)),
      inverso: true,
      comentario: comentarioAds,
      tipo: "linha",
      serie: serieReceita,
    },
    {
      id: "cancelado",
      titulo: "Cancelamentos",
      subtitulo: "Receita que não se concretizou",
      valor: a.cancelado,
      formato: "money",
      delta: variacao(a.cancelado, b.cancelado),
      inverso: true,
      comentario: comentarioCancelado,
      tipo: "barra",
      serie: serieCanais,
    },
  ];
}
