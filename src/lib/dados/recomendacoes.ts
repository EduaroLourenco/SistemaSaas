import "server-only";
import { carregarBaseVendas } from "./vendas";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/**
 * Fila de recomendações do dia.
 *
 * Cada card é uma coisa que MUDOU e merece decisão. Não é alerta de
 * limiar — "conversão abaixo de 1%" dispara todo dia e vira ruído que
 * ninguém lê. É movimento: o que estava assim e ficou assado.
 *
 * A fila é derivada, não guardada: recalcula a cada abertura contra os
 * dados de então. O que o usuário guarda é só o que já resolveu, para o
 * card não voltar amanhã.
 */

export type Recomendacao = {
  id: string;
  tipo: "queda_sku" | "alta_sku" | "conversao" | "midia" | "cancelamento" | "preco";
  severidade: "critico" | "atencao" | "info";
  titulo: string;
  /** A frase que explica o número. */
  leitura: string;
  /** Para onde ir para agir. */
  destino: string;
  /** Números que sustentam o card. */
  metricas: { rotulo: string; valor: string }[];
};

export type SkuEmQueda = {
  sku: string;
  mlb: string;
  titulo: string;
  curva: "A" | "B" | "C";
  /** Séries semanais, para a evolução. */
  semanas: {
    semana: string;
    visitas: number;
    vendas: number;
    receita: number;
    conversao: number | null;
    preco: number | null;
  }[];
  variacaoReceita: number;
  variacaoVisitas: number;
  variacaoConversao: number | null;
  variacaoPreco: number | null;
  /** O que mais explica a queda, em uma palavra. */
  causaProvavel: string;
};

export type DadosPainelNovo = {
  recomendacoes: Recomendacao[];
  quedas: SkuEmQueda[];
  ultimaData: string;
  vazio: boolean;
};

const pc = (v: number) =>
  `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function variacao(atual: number, anterior: number): number {
  if (!anterior) return 0;
  return ((atual - anterior) / anterior) * 100;
}

export async function carregarPainelNovo(): Promise<DadosPainelNovo> {
  const sb = await clienteServidor();

  const [base, semanas] = await Promise.all([
    carregarBaseVendas(),
    paginar(() =>
      sb
        .from("anuncio_desempenho_semanal")
        .select(
          "ano_iso,semana_iso,visitas,vendas,receita,preco_praticado," +
            "anuncios(codigo_externo,titulo,sku_canal)"
        )
        .order("semana_iso", { ascending: true })
    ),
  ]);

  if (base.vazio) {
    return { recomendacoes: [], quedas: [], ultimaData: "", vazio: true };
  }

  const ultimaData = base.ultimaData!;
  const datas = [...new Set(base.linhas.map((l) => l.data))].sort();

  /* ── Movimento da operação, 7 dias contra 7 ──────────────── */

  const janela = new Set(datas.slice(-7));
  const antes = new Set(datas.slice(-14, -7));

  const somar = (filtro: Set<string>) => {
    const t = { rec: 0, ped: 0, vis: 0, ads: 0, canc: 0, pedComVis: 0 };
    for (const l of base.linhas) {
      if (!filtro.has(l.data)) continue;
      t.rec += l.receita;
      t.ped += l.pedidos;
      t.vis += l.visitas;
      t.ads += l.ads;
      t.canc += l.cancelado;
      if (l.visitas > 0) t.pedComVis += l.pedidos;
    }
    return t;
  };
  const a = somar(janela);
  const b = somar(antes);

  const recomendacoes: Recomendacao[] = [];

  const dRec = variacao(a.rec, b.rec);
  if (Math.abs(dRec) >= 10) {
    // Quem puxou: a maior diferença em reais, não em percentual — um canal
    // pequeno dobrando não explica a receita da operação.
    const porCanal = new Map<string, { at: number; an: number }>();
    for (const l of base.linhas) {
      const g = porCanal.get(l.canal) ?? { at: 0, an: 0 };
      if (janela.has(l.data)) g.at += l.receita;
      else if (antes.has(l.data)) g.an += l.receita;
      porCanal.set(l.canal, g);
    }
    const lider = [...porCanal.entries()]
      .map(([nome, v]) => ({ nome, dif: v.at - v.an }))
      .sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif))[0];

    recomendacoes.push({
      id: "receita-7d",
      tipo: dRec < 0 ? "queda_sku" : "alta_sku",
      severidade: dRec < -20 ? "critico" : dRec < 0 ? "atencao" : "info",
      titulo: dRec < 0 ? "Receita caiu na semana" : "Receita subiu na semana",
      leitura: lider
        ? `${pc(dRec)} contra os 7 dias anteriores, ${
            lider.dif < 0 ? "puxada para baixo por" : "puxada por"
          } ${lider.nome} (${lider.dif > 0 ? "+" : "−"}${brl(Math.abs(lider.dif))}).`
        : `${pc(dRec)} contra os 7 dias anteriores.`,
      destino: "/vendas/canais",
      metricas: [
        { rotulo: "7 dias", valor: brl(a.rec) },
        { rotulo: "7 anteriores", valor: brl(b.rec) },
      ],
    });
  }

  const convA = a.vis ? (a.pedComVis * 100) / a.vis : 0;
  const convB = b.vis ? (b.pedComVis * 100) / b.vis : 0;
  const dConv = variacao(convA, convB);
  if (convB > 0 && Math.abs(dConv) >= 15) {
    recomendacoes.push({
      id: "conversao-7d",
      tipo: "conversao",
      severidade: dConv < -25 ? "critico" : "atencao",
      titulo: dConv < 0 ? "Conversão caiu" : "Conversão subiu",
      leitura:
        dConv < 0
          ? `De ${convB.toFixed(2)}% para ${convA.toFixed(2)}%. Visita continua chegando e virando menos venda — preço ou concorrência.`
          : `De ${convB.toFixed(2)}% para ${convA.toFixed(2)}%. A mesma visita está rendendo mais.`,
      destino: "/anuncios/analise",
      metricas: [
        { rotulo: "Conversão", valor: `${convA.toFixed(2)}%` },
        { rotulo: "Visitas", valor: a.vis.toLocaleString("pt-BR") },
      ],
    });
  }

  const tacosA = a.rec ? (a.ads * 100) / a.rec : 0;
  const tacosB = b.rec ? (b.ads * 100) / b.rec : 0;
  if (tacosB > 0 && tacosA - tacosB >= 1.5) {
    recomendacoes.push({
      id: "midia-7d",
      tipo: "midia",
      severidade: tacosA - tacosB >= 3 ? "critico" : "atencao",
      titulo: "Mídia pesando mais na receita",
      leitura: `TACOS foi de ${tacosB.toFixed(2)}% para ${tacosA.toFixed(
        2
      )}%. Ou o investimento subiu, ou a receita que ele traz caiu.`,
      destino: "/vendas/canais",
      metricas: [
        { rotulo: "Investido", valor: brl(a.ads) },
        { rotulo: "TACOS", valor: `${tacosA.toFixed(2)}%` },
      ],
    });
  }

  const cancA = a.rec ? (a.canc / a.rec) * 100 : 0;
  if (cancA >= 5) {
    recomendacoes.push({
      id: "cancelamento-7d",
      tipo: "cancelamento",
      severidade: cancA >= 10 ? "critico" : "atencao",
      titulo: "Cancelamento acima do normal",
      leitura: `${brl(a.canc)} cancelados na semana — ${cancA.toFixed(
        1
      )}% da receita bruta.`,
      destino: "/vendas/diario",
      metricas: [
        { rotulo: "Cancelado", valor: brl(a.canc) },
        { rotulo: "Sobre a receita", valor: `${cancA.toFixed(1)}%` },
      ],
    });
  }

  /* ── SKUs em queda, com o que mudou neles ────────────────── */

  type L = {
    semana_iso: number;
    visitas: number;
    vendas: number;
    receita: string;
    preco_praticado: string | null;
    anuncios: { codigo_externo: string; titulo: string; sku_canal: string | null } | null;
  };

  const porSku = new Map<
    string,
    {
      sku: string;
      mlb: string;
      titulo: string;
      receita: number;
      semanas: Map<number, { vis: number; ven: number; rec: number }>;
    }
  >();

  for (const s of semanas as unknown as L[]) {
    const an = s.anuncios;
    if (!an) continue;
    const sku = (an.sku_canal ?? "").trim() || an.codigo_externo;
    const g =
      porSku.get(sku) ??
      { sku, mlb: an.codigo_externo, titulo: an.titulo, receita: 0, semanas: new Map() };
    const w = g.semanas.get(s.semana_iso) ?? { vis: 0, ven: 0, rec: 0 };
    w.vis += s.visitas;
    w.ven += s.vendas;
    w.rec += Number(s.receita) || 0;
    g.semanas.set(s.semana_iso, w);
    g.receita += Number(s.receita) || 0;
    porSku.set(sku, g);
  }

  const listaSku = [...porSku.values()].sort((x, y) => y.receita - x.receita);
  const totalSku = listaSku.reduce((s, x) => s + x.receita, 0);
  const curvaPorSku = new Map<string, "A" | "B" | "C">();
  let acumulado = 0;
  for (const item of listaSku) {
    acumulado += item.receita;
    const p = totalSku ? (acumulado / totalSku) * 100 : 100;
    curvaPorSku.set(item.sku, p <= 80 ? "A" : p <= 95 ? "B" : "C");
  }

  const todasSemanas = [
    ...new Set((semanas as unknown as L[]).map((s) => s.semana_iso)),
  ].sort((x, y) => x - y);
  const metade = Math.floor(todasSemanas.length / 2);

  const quedas: SkuEmQueda[] = [];

  for (const g of listaSku) {
    if (metade < 1) break;
    const primeiras = todasSemanas.slice(0, metade);
    const ultimas = todasSemanas.slice(metade);

    const med = (lista: number[], campo: "vis" | "ven" | "rec") =>
      lista.reduce((s, w) => s + (g.semanas.get(w)?.[campo] ?? 0), 0) / lista.length;

    const recAntes = med(primeiras, "rec");
    const recDepois = med(ultimas, "rec");
    if (recAntes <= 0) continue;

    const dReceita = variacao(recDepois, recAntes);
    // Só queda relevante entra: -10% em receita alta importa, -60% num SKU
    // que fez R$ 200 no período é ruído.
    if (dReceita > -10 || g.receita < 1000) continue;

    const visAntes = med(primeiras, "vis");
    const visDepois = med(ultimas, "vis");
    const venAntes = med(primeiras, "ven");
    const venDepois = med(ultimas, "ven");

    const convAntes = visAntes ? (venAntes * 100) / visAntes : null;
    const convDepois = visDepois ? (venDepois * 100) / visDepois : null;
    const precoAntes = venAntes ? recAntes / venAntes : null;
    const precoDepois = venDepois ? recDepois / venDepois : null;

    const dVisitas = variacao(visDepois, visAntes);

    /*
     * Comparação explícita com null, e não truthiness.
     *
     * `convAntes && convDepois` é FALSO quando a conversão do segundo
     * período é zero — que é exatamente o caso de um SKU que parou de
     * converter. O bug fazia o pior cenário virar "queda distribuída",
     * silenciando o que mais precisa aparecer: tráfego chegando e nada
     * virando venda.
     */
    const dConversao =
      convAntes != null && convDepois != null && convAntes > 0
        ? variacao(convDepois, convAntes)
        : null;
    const dPreco =
      precoAntes != null && precoDepois != null && precoAntes > 0
        ? variacao(precoDepois, precoAntes)
        : null;

    /*
     * A causa provável sai de qual componente caiu mais. Receita é visita
     * × conversão × preço: se a visita caiu, o problema é de vitrine; se a
     * conversão caiu com visita estável, é preço ou concorrência.
     */
    let causaProvavel = "queda distribuída";
    if (venDepois === 0 && visDepois > 0) {
      // O caso mais grave: continua recebendo visita e não vende nenhuma.
      causaProvavel = "parou de vender";
    } else if (dConversao != null && dConversao <= -20 && dVisitas > -10) {
      causaProvavel = "parou de converter";
    } else if (dVisitas <= -20 && (dConversao == null || dConversao > -10)) {
      causaProvavel = "perdeu visitas";
    } else if (dVisitas <= -15 && dConversao != null && dConversao <= -15) {
      causaProvavel = "visitas e conversão";
    } else if (dPreco != null && dPreco <= -10) {
      causaProvavel = "vendeu mais barato";
    }

    quedas.push({
      sku: g.sku,
      mlb: g.mlb,
      titulo: g.titulo,
      curva: curvaPorSku.get(g.sku) ?? "C",
      semanas: todasSemanas.map((w) => {
        const s = g.semanas.get(w);
        return {
          semana: `S${w}`,
          visitas: s?.vis ?? 0,
          vendas: s?.ven ?? 0,
          receita: s?.rec ?? 0,
          conversao: s && s.vis ? (s.ven * 100) / s.vis : null,
          preco: s && s.ven ? s.rec / s.ven : null,
        };
      }),
      variacaoReceita: dReceita,
      variacaoVisitas: dVisitas,
      variacaoConversao: dConversao,
      variacaoPreco: dPreco,
      causaProvavel,
    });
  }

  quedas.sort((x, y) => {
    // Curva A primeiro: a mesma queda percentual pesa mais em quem fatura
    // mais, e é onde a decisão vale.
    const peso = (c: string) => (c === "A" ? 0 : c === "B" ? 1 : 2);
    return peso(x.curva) - peso(y.curva) || x.variacaoReceita - y.variacaoReceita;
  });

  if (quedas.length) {
    const a1 = quedas.filter((q) => q.curva === "A").length;
    recomendacoes.unshift({
      id: "skus-queda",
      tipo: "queda_sku",
      severidade: a1 > 0 ? "critico" : "atencao",
      titulo: `${quedas.length} ${quedas.length === 1 ? "SKU caiu" : "SKUs caíram"}`,
      leitura: a1
        ? `${a1} ${a1 === 1 ? "é de curva A" : "são de curva A"} — a mesma queda percentual pesa mais em quem fatura mais.`
        : "Nenhum deles é curva A, mas vale entender o que mudou.",
      destino: "/anuncios/analise",
      metricas: [
        { rotulo: "Curva A", valor: String(a1) },
        { rotulo: "Total", valor: String(quedas.length) },
      ],
    });
  }

  return { recomendacoes, quedas: quedas.slice(0, 20), ultimaData, vazio: false };
}
