import type { DadosPainel } from "@/lib/dados/painel";
import type { DadosAlertas } from "@/lib/dados/alertas";
import type { DadosEnvios } from "@/lib/dados/envios-meli";
import { ANUNCIOS, CANAIS, CANAIS_12_SEMANAS, CANAL_CORES, CANAL_NOMES } from "@/mock";

// Dados sintéticos determinísticos. Nunca conecta banco, autenticação ou canais.
const canaisInfo = CANAIS.slice(0, 3).map(c => ({ id: c.id, nome: c.nome, cor: CANAL_CORES[c.id] }));
const linhas = Array.from({ length: 90 }, (_, i) => canaisInfo.map((c, j) => {
  const data = new Date(Date.UTC(2026, 7, 18 + i)).toISOString().slice(0, 10);
  const receita = Math.round((11000 + i * 39 + Math.sin(i / 3) * 2800) * [1, .42, .22][j]);
  return { data, canal: c.nome, canalId: c.id, receita, pedidos: Math.round(receita / 680), visitas: Math.round(receita / 11), ads: Math.round(receita * .08), cancelado: Math.round(receita * .024), pedidosCancelados: 1 };
})).flat();
export const painel: DadosPainel = {
  kpis: [], faturamento30d: [], canais: CANAIS.slice(0, 3), canaisSemanas: CANAIS_12_SEMANAS,
  canalCores: CANAL_CORES, canalNomes: CANAL_NOMES,
  anuncios: ANUNCIOS.slice(0, 8).map((a, i) => ({ ...a, titulo: i === 0 ? "Colchão de demonstração casal com molas ensacadas e camada de conforto 138 × 188 × 30 cm" : a.titulo })),
  linhas, canaisInfo,
  recomendacoes: [
    { id: "fixture-rec-1", tipo: "queda_sku", severidade: "critico", titulo: "Receita do produto recuou 28%", leitura: "Comparação sintética das últimas duas semanas com coleta completa.", destino: "/vendas/queda", metricas: [{ rotulo: "Antes", valor: "R$ 31.200,00" }, { rotulo: "Agora", valor: "R$ 22.464,00" }] },
    { id: "fixture-rec-2", tipo: "midia", severidade: "atencao", titulo: "Investimento sem retorno em dois anúncios", leitura: "Fixture de teste para investigar retorno de mídia.", destino: "/anuncios/trafego-pago", metricas: [{ rotulo: "Investido", valor: "R$ 380,00" }, { rotulo: "Receita atribuída", valor: "R$ 0,00" }] },
    { id: "fixture-rec-3", tipo: "cancelamento", severidade: "info", titulo: "Cancelamentos dentro do intervalo", leitura: "Dado sintético para verificar hierarquia da fila.", destino: "/vendas/cancelamentos", metricas: [{ rotulo: "Taxa", valor: "2,4%" }] },
  ],
  quedas: [{ sku: "DEMO-001", mlb: "MLB-FIXTURE-001", titulo: "Colchão de demonstração casal com molas ensacadas e camada de conforto 138 × 188 × 30 cm", curva: "A", semanas: Array.from({length: 8}, (_, i) => ({semana: `S${38+i}`, visitas: 2400-i*120, vendas: 31-i*2, receita: 31000-i*2100, conversao: 1.3, preco: 1000})), variacaoReceita: -28, variacaoVisitas: -22, variacaoConversao: -4, variacaoPreco: 0, causaProvavel: "visitas" }],
  ultimaData: "2026-11-15", vazio: false, fontes: { fontes: [], piorAtraso: 1, hoje: "2026-11-16" }, exclusoes: [], removidas: 0,
  canaisDisponiveis: canaisInfo.map(c => ({id: c.id, nome: c.nome})),
};
export const alertas: DadosAlertas = { exclusoes: [], removidas: 0, canaisDisponiveis: painel.canaisDisponiveis, alertas: [
  { id: "fixture-alerta-1", severidade: "critico", tipo: "receita", titulo: "Receita recuou 28% no Mercado Livre", leitura: "Comparação sintética entre as últimas duas semanas. Confira a evidência antes de agir.", numeros: [{ rotulo: "Semana anterior", valor: "R$ 31.200,00" }, { rotulo: "Semana atual", valor: "R$ 22.464,00" }], evidencia: [{rotulo: "S42", valor: 31200}, {rotulo: "S43", valor: 28500}, {rotulo: "S44", valor: 22464}], formato: "moeda", destino: {href: "/vendas/queda", texto: "Investigar queda"} },
  { id: "fixture-alerta-2", severidade: "atencao", tipo: "conversao", titulo: "Conversão caiu com visitas estáveis", leitura: "Fixture com base suficiente para conferir leitura e acesso ao gráfico.", numeros: [{rotulo: "Antes", valor: "2,4%"}, {rotulo: "Agora", valor: "1,8%"}], evidencia: [{rotulo: "S42", valor: 2.4}, {rotulo: "S43", valor: 2.1}, {rotulo: "S44", valor: 1.8}], formato: "percentual", destino: {href: "/anuncios/analise", texto: "Investigar"} },
  { id: "fixture-alerta-3", severidade: "info", tipo: "custo", titulo: "Há produtos sem custo cadastrado", leitura: "Dados sintéticos para validar a situação informativa.", numeros: [{rotulo: "Produtos", valor: "3"}], evidencia: [], formato: "numero", destino: {href: "/financeiro/custos", texto: "Ver custos"} },
] };
export const envios: DadosEnvios = { hoje: "2026-11-16", geradoEm: "2026-11-16T14:00:00-03:00", contas: ["São Paulo — pronta entrega", "2ª conta — venda a prazo"], falhas: [], envios: Array.from({length: 8}, (_, i) => ({ conta: i % 2 ? "2ª conta — venda a prazo" : "São Paulo — pronta entrega", pedido: 200000000000 + i, compra: "2026-11-12T10:00:00-03:00", limite: i === 7 ? null : `2026-11-${String(15 + i).padStart(2, "0")}T16:00:00-03:00`, origem: i === 7 ? null : i % 2 ? "prazo" : "canal", dias: i === 7 ? null : i - 1, situacao: i % 2 ? "Em produção" : "Etiqueta para imprimir", comprador: null, itens: [{titulo: "Colchão de demonstração casal com molas ensacadas e camada de conforto 138 × 188 × 30 cm", sku: `DEMO-${String(i+1).padStart(3,"0")}`, quantidade: 1}], total: 1299.9 })) };
