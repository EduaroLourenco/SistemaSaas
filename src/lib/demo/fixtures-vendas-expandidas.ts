import type { DadosComparativos, DadosLancamentos, RegistroDia, LancamentoDia } from "@/lib/dados/vendas";
import type { DadosDiario } from "@/lib/dados/diario";
import type { DadosPlanejamento } from "@/lib/dados/metas-planejamento";
import type { DadosPainel } from "@/lib/dados/painel";
import type { SkuEmQueda } from "@/lib/dados/recomendacoes";
import type { DiaPeriodo, Periodo, PeriodoId } from "@/mock/diario";
import type { LinhaDia } from "@/lib/periodo";
import { recortar } from "@/lib/periodo";
import { pesosDaSemana, ratearNoMes } from "@/lib/dados/ratear-meta";
import type { DemoState } from "./store";
import { DEMO_HOJE, DEMO_INICIO, DEMO_SINCRONIZADO, canaisDemo, contasDemo, produtosDemo, movimentosDemo, diasDemo, somarDiasDemo, somarDemo, moedaDemo, mlbDemo, opcoesDemo, resumoCancelamentosDemo } from "./fixtures-base";

type MetaMensalDemo = { total: number; canais: string[]; fixos: Record<string, number> };
type MetaDiaDemo = { valor: number; manual: boolean };
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const br = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const inicioMes = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}-01`;
const fimMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
const variacao = (atual: number, anterior: number) => anterior ? (atual / anterior - 1) * 100 : 0;
const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** A mesma base bruta alimenta as cinco telas; não cria histórico antes de outubro. */
export function linhasVendasDemo(estado?: DemoState): LinhaDia[] {
  return diasDemo(DEMO_INICIO, DEMO_HOJE).map(data => {
    const m = movimentosDemo.filter(m => m.data === data), cancelamentos = resumoCancelamentosDemo(data, data);
    const edicao = estado?.lancamentos?.[data] ?? {};
    return {
      data, canal: canaisDemo[0].nome, canalId: canaisDemo[0].id,
      receita: edicao.receita ?? moedaDemo(somarDemo(m, l => l.receita) + cancelamentos.valor),
      pedidos: edicao.pedidos ?? somarDemo(m, l => l.pedidos) + cancelamentos.pedidos,
      visitas: edicao.visitas ?? somarDemo(m, l => l.visitas),
      ads: edicao.investimentoAds ?? somarDemo(m, l => l.ads),
      cancelado: edicao.valorCancelado ?? cancelamentos.valor,
      pedidosCancelados: edicao.pedidosCancelados ?? cancelamentos.pedidos,
    };
  });
}

export function metaMensalDemo(ano: number, mes: number, estado?: DemoState): MetaMensalDemo {
  const salva = estado?.metas[`mes:${ano}-${String(mes).padStart(2, "0")}`] as MetaMensalDemo | undefined;
  return salva ?? { total: ano === 2026 && mes >= 10 && mes <= 11 ? 150000 : 0, canais: [canaisDemo[0].id], fixos: {} };
}

export function metasDosDiasDemo(ano: number, mes: number, estado?: DemoState) {
  const linhas = linhasVendasDemo(estado), pesos = pesosDaSemana(linhas.map(l => ({ data: l.data, receita: l.receita - l.cancelado })));
  const mensal = metaMensalDemo(ano, mes, estado);
  const metaCanal = mensal.canais.includes(canaisDemo[0].id) ? (mensal.fixos[canaisDemo[0].id] ?? mensal.total) : 0;
  const distribuicao = ratearNoMes(metaCanal, diasDemo(inicioMes(ano, mes), fimMes(ano, mes)).map(data => {
    const dia = estado?.metas[`dia:${data}`] as MetaDiaDemo | undefined;
    return { data, peso: pesos[new Date(data + "T12:00:00Z").getUTCDay()], manual: dia?.manual ?? false, valor: dia?.valor };
  }));
  return { ...distribuicao, pesos, mensal };
}

export function comparativosDemo(estado?: DemoState): DadosComparativos {
  const linhas = new Map(linhasVendasDemo(estado).map(l => [l.data, l]));
  const metas = new Map(Array.from({ length: 12 }, (_, i) => i + 1).flatMap(mes => metasDosDiasDemo(2026, mes, estado).dias.map(d => [d.data, d.valor] as const)));
  const serie: RegistroDia[] = diasDemo("2026-01-01", "2026-12-31").map(data => {
    const l = linhas.get(data);
    return { visitas: l?.visitas ?? 0, receita: l?.receita ?? 0, pedidos: l?.pedidos ?? 0, ads: l?.ads ?? 0, pedidosCancelados: l?.pedidosCancelados ?? 0, valorCancelado: l?.cancelado ?? 0, meta: metas.get(data) ?? 0 };
  });
  return { ano: 2026, canais: canaisDemo, serieDiaria: { todos: serie, [canaisDemo[0].id]: serie }, vazio: false };
}

export function lancamentosDemo(estado?: DemoState): DadosLancamentos {
  const linhas = new Map(linhasVendasDemo(estado).map(l => [l.data, l]));
  const meses = Array.from({ length: 12 }, (_, mes) => {
    const metas = new Map(metasDosDiasDemo(2026, mes + 1, estado).dias.map(d => [d.data, d.valor]));
    return diasDemo(inicioMes(2026, mes + 1), fimMes(2026, mes + 1)).map((data): LancamentoDia => {
      const l = linhas.get(data), dow = new Date(data + "T12:00:00Z").getUTCDay();
      return { data, mes, dia: Number(data.slice(8, 10)), diaSemana: dow, rotuloDiaSemana: DOW[dow], fimDeSemana: dow === 0 || dow === 6, futuro: data > DEMO_HOJE, visitas: l?.visitas ?? 0, receita: l?.receita ?? 0, pedidos: l?.pedidos ?? 0, ads: l?.ads ?? 0, pedidosCancelados: l?.pedidosCancelados ?? 0, valorCancelado: l?.cancelado ?? 0, metaDia: metas.get(data) ?? 0 };
    });
  });
  return { ano: 2026, mesAtual: 10, diaAtual: 18, canais: canaisDemo, serie: { todos: meses, [canaisDemo[0].id]: meses }, vazio: false };
}

export const automacaoLancamentosDemo = { [contasDemo[0].id]: { vendas: "Mercado Livre", visitas: "Mercado Livre", ads: "Mercado Ads" } };

export function diarioDemo(query = new URLSearchParams(), estado?: DemoState): DadosDiario {
  const canal = query.get("canal") || "";
  const dentro = !canal || canal.split(",").some(c => [canaisDemo[0].id, contasDemo[0].id, `conta:${contasDemo[0].id}`].includes(c));
  const dias: DiaPeriodo[] = (dentro ? linhasVendasDemo(estado) : []).map((l, i) => ({ data: l.data, dia: i + 1, receita: l.receita, pedidos: l.pedidos, visitas: l.visitas, pedidosComVisita: l.visitas ? l.pedidos - l.pedidosCancelados : 0, ads: l.ads, cancelado: l.cancelado, pedidosCancelados: l.pedidosCancelados }));
  const periodo = (id: PeriodoId, rotulo: string, inicio: string, fim: string): Periodo => ({ id, rotulo, intervalo: `${br(inicio)} a ${br(fim)}`, dias: dias.filter(d => d.data! >= inicio && d.data! <= fim).map((d, i) => ({ ...d, dia: i + 1 })) });
  return {
    periodos: [periodo("hoje", "Hoje", DEMO_HOJE, DEMO_HOJE), periodo("ontem", "Ontem", somarDiasDemo(DEMO_HOJE, -1), somarDiasDemo(DEMO_HOJE, -1)), periodo("d7", "Últimos 7 dias", somarDiasDemo(DEMO_HOJE, -6), DEMO_HOJE), periodo("mesAtual", "Novembro", "2026-11-01", DEMO_HOJE), periodo("mesAnterior", "Outubro · desde 05/10", DEMO_INICIO, "2026-10-31")],
    dias, primeiraData: DEMO_INICIO, ultimaData: DEMO_HOJE, vazio: !dias.length, canais: canaisDemo, opcoes: opcoesDemo, exclusoes: [], removidas: 0,
  };
}

export function metasPlanejamentoDemo(query = new URLSearchParams(), estado?: DemoState): DadosPlanejamento {
  const ano = 2026, mesPedido = Number(query.get("mes") || 11), mes = Math.max(1, Math.min(12, Number.isInteger(mesPedido) ? mesPedido : 11));
  const distribuicao = metasDosDiasDemo(ano, mes, estado), linhas = linhasVendasDemo(estado), porData = new Map(linhas.map(l => [l.data, l]));
  const receitaRecente = somarDemo(linhas, l => l.receita - l.cancelado), pedidos = somarDemo(linhas, l => l.pedidos - l.pedidosCancelados);
  return { ano, mes, metaTotal: distribuicao.mensal.total, canais: [{ ...canaisDemo[0], receitaRecente, peso: 100, ticket: pedidos ? receitaRecente / pedidos : null, metaAtual: distribuicao.mensal.canais.includes(canaisDemo[0].id) ? distribuicao.mensal.fixos[canaisDemo[0].id] ?? distribuicao.mensal.total : null, selecionado: distribuicao.mensal.canais.includes(canaisDemo[0].id) }], dias: distribuicao.dias.map(d => { const l = porData.get(d.data); return { data: d.data, diaSemana: new Date(d.data + "T12:00:00Z").getUTCDay(), meta: d.valor, manual: d.manual, realizado: d.data <= DEMO_HOJE ? l ? l.receita - l.cancelado : 0 : null }; }), pesosSemana: distribuicao.pesos, janela: { inicio: DEMO_INICIO, fim: DEMO_HOJE }, ultimaData: DEMO_HOJE, vazio: false };
}

export function painelPeriodoDemo(estado?: DemoState): DadosPainel {
  const linhas = linhasVendasDemo(estado), recorte = recortar(linhas, canaisDemo, "30 dias");
  const queda = (indice: number): SkuEmQueda => {
    const p = produtosDemo[indice];
    const lado = (inicio: string, fim: string) => { const m = movimentosDemo.filter(m => m.sku === p.sku && m.data >= inicio && m.data <= fim), visitas = somarDemo(m, l => l.visitas), vendas = somarDemo(m, l => l.quantidade), receita = somarDemo(m, l => l.receita); return { semana: `${br(inicio)}–${br(fim)}`, visitas, vendas, receita, conversao: visitas ? vendas / visitas * 100 : null, preco: vendas ? receita / vendas : null }; };
    const antes = lado("2026-11-05", "2026-11-11"), agora = lado("2026-11-12", DEMO_HOJE);
    return { sku: p.sku, mlb: mlbDemo(indice), titulo: p.titulo, curva: "A", semanas: Array.from({ length: 6 }, (_, i) => { const inicio = somarDiasDemo(DEMO_INICIO, i * 7); return lado(inicio, somarDiasDemo(inicio, 6)); }), variacaoReceita: variacao(agora.receita, antes.receita), variacaoVisitas: variacao(agora.visitas, antes.visitas), variacaoConversao: antes.conversao && agora.conversao != null ? variacao(agora.conversao, antes.conversao) : null, variacaoPreco: antes.preco && agora.preco != null ? variacao(agora.preco, antes.preco) : null, causaProvavel: indice === 0 ? "visitas" : indice === 1 ? "preço" : "estoque" };
  };
  const quedas = [0, 1, 2].map(queda);
  const canaisSemanas = Array.from({ length: 7 }, (_, i) => { const inicio = somarDiasDemo(DEMO_INICIO, i * 7), fim = somarDiasDemo(inicio, 6); return { semana: br(inicio), [canaisDemo[0].id]: somarDemo(linhas.filter(l => l.data >= inicio && l.data <= fim), l => l.receita - l.cancelado) }; });
  return {
    kpis: recorte.kpis, faturamento30d: recorte.faturamento, canais: recorte.canais, canaisSemanas, canalCores: { [canaisDemo[0].id]: canaisDemo[0].cor }, canalNomes: { [canaisDemo[0].id]: canaisDemo[0].nome }, linhas, canaisInfo: canaisDemo,
    anuncios: produtosDemo.map((p, i) => { const m = movimentosDemo.filter(m => m.sku === p.sku && m.data >= "2026-10-20"), receita = somarDemo(m, l => l.receita), visitas = somarDemo(m, l => l.visitas), vendas = somarDemo(m, l => l.quantidade); return { mlb: mlbDemo(i), titulo: p.titulo, sku: p.sku, canalId: canaisDemo[0].id, curva: i < 4 ? "A" : "B", tipo: p.tipo === "premium" ? "Premium" : "Clássico", visitas, vendas, conversao: visitas ? vendas / visitas * 100 : 0, receita, preco: m.at(-1)?.preco ?? p.preco, precoIdeal: p.preco, comissao: p.tipo === "premium" ? 13.5 : 8.5, campanhas: 1, status: "ativo", historico: diasDemo("2026-11-12", DEMO_HOJE).map(data => somarDemo(m.filter(l => l.data === data), l => l.receita)) }; }),
    recomendacoes: [{ id: "demo-mesa-visitas", tipo: "queda_sku", severidade: "atencao", titulo: "A Mesa Aurora perdeu visitas", leitura: "Compare a última semana com a anterior e investigue a exposição do anúncio.", destino: "/vendas/queda?sku=AT-MESA-01", metricas: [{ rotulo: "Receita · 7 dias", valor: `${Math.round(quedas[0].variacaoReceita)}%` }, { rotulo: "Visitas", valor: `${Math.round(quedas[0].variacaoVisitas)}%` }] }, { id: "demo-luz-preco", tipo: "preco", severidade: "atencao", titulo: "A Luminária mudou de preço", leitura: "O preço subiu 8%. Confira volume, conversão e margem antes de decidir.", destino: "/produtos/precificacao", metricas: [{ rotulo: "Preço atual", valor: brl(produtosDemo[1].preco * 1.08) }] }, { id: "demo-puff-estoque", tipo: "queda_sku", severidade: "info", titulo: "Puff Linho voltou a ter estoque", leitura: "Foram cinco dias sem saldo. Acompanhe a retomada das vendas e a reposição.", destino: "/planejamento", metricas: [{ rotulo: "Saldo", valor: `${produtosDemo[2].estoque} unidades` }] }],
    quedas, ultimaData: DEMO_HOJE, vazio: false, fontes: { hoje: DEMO_HOJE, piorAtraso: 0, fontes: [{ id: "demo-vendas", nome: "Mercado Livre · exemplo", alimenta: "Vendas e cancelamentos", cobertura: DEMO_HOJE, importadoEm: DEMO_SINCRONIZADO, registros: movimentosDemo.filter(m => m.pedidos).length, atrasoDias: 0, origem: "api" }, { id: "demo-ads", nome: "Mercado Ads · exemplo", alimenta: "Investimento e receita atribuída", cobertura: DEMO_HOJE, importadoEm: DEMO_SINCRONIZADO, registros: movimentosDemo.length, atrasoDias: 0, origem: "api" }] }, exclusoes: [], removidas: 0, canaisDisponiveis: canaisDemo,
  };
}
