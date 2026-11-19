import type { DemoState } from "./store";
import type { DadosEnvios } from "@/lib/dados/envios-meli";
import type { Dados as DadosPlanejamento } from "@/lib/planejamento/modelo";
import type { DadosPromocoes } from "@/lib/dados/promocoes";
import type { Regra } from "@/lib/planilhas/avaliar-regras";
import type { Fila } from "@/lib/dados/fila-aprovacao";
import type { CoberturaCampo } from "@/lib/dados/cobertura-regras";
import { lerPeriodo } from "@/lib/periodo-anuncios";
import { DEMO_HOJE, DEMO_SINCRONIZADO, contasDemo, produtosDemo, somarDiasDemo } from "./fixtures-base";
import { dadosDiaDemo, dadosSemanalDemo, dadosSkusDemo, dadosQuedaDemo, dadosTrafegoDemo, termometroDemo } from "./fixtures-vendas";
import { dadosFinanceiroDemo, dadosCustosDemo, precificacaoDemo } from "./fixtures-financeiro";
import { analiseDemo, automacoesDemo, regrasDemo, filaDemo, promocoesDemo, comparacaoDemo, idealDemo } from "./fixtures-promocoes";
import { planejamentoDemo, resultadosDemo, promocoesNoCanalDemo } from "./fixtures-planejamento";
import { anualDemo, canaisVendasDemo, mtdDemo, produtosPrecosDemo } from "./fixtures-complementares";

export * from "./fixtures-base";
export * from "./fixtures-vendas";
export * from "./fixtures-financeiro";
export * from "./fixtures-promocoes";
export * from "./fixtures-planejamento";

export const enviosDemo: DadosEnvios = { hoje: DEMO_HOJE, contas: [contasDemo[0].nome], geradoEm: DEMO_SINCRONIZADO, falhas: [], envios: produtosDemo.slice(0, 4).map((p, i) => ({ conta: contasDemo[0].nome, contaId: contasDemo[0].id, envio: 990000001 + i, pedido: 990000001001 + i, venda: 990000001001 + i, substatus: i === 3 ? "invoice_pending" : "ready_to_print", saiu: false, compra: `${somarDiasDemo(DEMO_HOJE, -2)}T12:00:00-03:00`, limite: `${somarDiasDemo(DEMO_HOJE, i < 2 ? 0 : i === 2 ? 1 : -1)}T18:00:00-03:00`, origem: "canal", dias: i < 2 ? 0 : i === 2 ? 1 : -1, situacao: i === 3 ? "Falta emitir a nota" : "Etiqueta para imprimir", comprador: `Comprador do exemplo ${i + 1}`, itens: [{ titulo: p.titulo, sku: p.sku, quantidade: i === 1 ? 2 : 1 }], total: p.preco * (i === 1 ? 2 : 1) })), enviados: [] };

export function planejamentoComEstadoDemo(estado?: DemoState): DadosPlanejamento {
  return { ...planejamentoDemo, itens: estado?.planejamento.itens as DadosPlanejamento["itens"] ?? planejamentoDemo.itens, grupos: estado?.planejamento.grupos as DadosPlanejamento["grupos"] ?? planejamentoDemo.grupos, tipos: estado?.planejamento.tipos as DadosPlanejamento["tipos"] ?? planejamentoDemo.tipos };
}
export function promocoesComEstadoDemo(estado?: DemoState): DadosPromocoes {
  return { ...promocoesDemo, processamentos: [...(estado?.promocoes.processamentos || []) as DadosPromocoes["processamentos"], ...promocoesDemo.processamentos], historico: [...(estado?.promocoes.historico || []) as DadosPromocoes["historico"], ...promocoesDemo.historico], campanhas: [...(estado?.promocoes.campanhas || []) as DadosPromocoes["campanhas"], ...promocoesDemo.campanhas] };
}
export const coberturaRegrasDemo: CoberturaCampo[] = [
  { campo: "anuncio.estoque", rotulo: "Estoque", com: 6, total: 6, onde: null, aviso: null },
  { campo: "venda.unidades30", rotulo: "Unidades em 30 dias", com: 6, total: 6, onde: null, aviso: null },
  { campo: "visita.visitas30", rotulo: "Visitas em 30 dias", com: 6, total: 6, onde: null, aviso: null },
  { campo: "ads.acos", rotulo: "ACoS", com: 6, total: 6, onde: null, aviso: null },
  { campo: "margem.pct", rotulo: "Margem de contribuição", com: 6, total: 6, onde: null, aviso: null },
];
/** Props dos componentes reais. Não executa carregadores, consultas ou chamadas remotas. */
export function getDemoFixture(rota: string, query = new URLSearchParams(), estado?: DemoState): Record<string, unknown> {
  const custos = estado?.custos || {};
  switch (rota) {
    case "/": case "/vendas/dia": return { dados: dadosDiaDemo(query) };
    case "/vendas/semanal": return { dados: dadosSemanalDemo(query) };
    case "/vendas/mtd": return { dados: mtdDemo(query) };
    case "/vendas/anual": return { dados: anualDemo() };
    case "/vendas/canais": return { dados: canaisVendasDemo(query) };
    case "/produtos": return { dados: produtosPrecosDemo(query) };
    case "/vendas/skus": return { dados: dadosSkusDemo(query) };
    case "/vendas/queda": return { dados: dadosQuedaDemo(query) };
    case "/mercado-livre": return { dados: { ...termometroDemo, noCanal: promocoesNoCanalDemo } };
    case "/mercado-livre/envios": return { dados: { ...enviosDemo, envios: enviosDemo.envios.map(e => estado?.enviosImpressos.includes(String(e.envio)) ? { ...e, substatus: "printed", situacao: "Etiqueta impressa" } : e) } };
    case "/anuncios/analise": return { dados: analiseDemo, inicial: lerPeriodo(Object.fromEntries(query), DEMO_HOJE) };
    case "/anuncios/trafego-pago": return { dados: dadosTrafegoDemo(query) };
    case "/anuncios/preco-ideal": return { dados: idealDemo };
    case "/automacoes": return { dados: automacoesDemo, ads: dadosTrafegoDemo(query), regras: estado?.regras as Regra[] ?? regrasDemo, fila: { ...filaDemo, linhas: estado?.promocoes.fila as Fila["linhas"] ?? filaDemo.linhas }, folgas: { porTipo: { DEAL: 3, MARKETPLACE_CAMPAIGN: 0, PRE_NEGOTIATED: 0 }, faltaMigracao: null } };
    case "/automacoes/regras": return { regras: estado?.regras as Regra[] ?? regrasDemo, faltaMigracao: null, cobertura: coberturaRegrasDemo, contas: [contasDemo[0]] };
    case "/promocoes/historico": case "/promocoes/campanhas": return { dados: promocoesComEstadoDemo(estado) };
    case "/promocoes/comparar": return { dados: comparacaoDemo, buscaInicial: query.get("sku") || "" };
    case "/promocoes/processar": return {};
    case "/financeiro": return dadosFinanceiroDemo(query, custos);
    case "/financeiro/custos": return { ...dadosCustosDemo(query, custos), ...(estado?.faixasFrete ? { faixas: estado.faixasFrete } : {}), ...(estado?.despesasCanal ? { despesas: estado.despesasCanal } : {}) };
    case "/produtos/precificacao": return { dados: { ...precificacaoDemo, produtos: precificacaoDemo.produtos.map(p => { const e=custos[p.id]||{};return{...p,...("custoMercadoria" in e?{custo:e.custoMercadoria}:{}),...("embalagem" in e?{embalagem:e.embalagem}:{}),...("freteUnitario" in e?{freteSalvo:e.freteUnitario}:{}),...("aliquotaImpostos" in e?{impostoPct:e.aliquotaImpostos}:{}),...("pesoKg" in e?{pesoKg:e.pesoKg}:{}),...("margemMinimaPct" in e?{margemMinimaPct:e.margemMinimaPct}:{})};}) } };
    case "/planejamento": return { dados: planejamentoComEstadoDemo(estado), hoje: DEMO_HOJE };
    case "/planejamento/resultados": return { dados: resultadosDemo };
    default: return {};
  }
}
