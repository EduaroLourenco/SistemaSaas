import type { GrupoRecorte } from "@/lib/recorte";

/** Dados exclusivamente fictícios. O cenário não contém identificadores reais. */
export const DEMO_HOJE = "2026-11-18";
export const DEMO_INICIO = "2026-10-05";
export const DEMO_SINCRONIZADO = `${DEMO_HOJE}T10:30:00-03:00`;
export const DEMO_OPERACAO = "d0000000-0000-4000-8000-000000000001";
export const DEMO_EMPRESA = "Atlas Casa";
export const canaisDemo = [
  { id: "d1000000-0000-4000-8000-000000000001", nome: "Mercado Livre", codigo: "mercado_livre", cor: "#7045d1", contaCanalId: "d2000000-0000-4000-8000-000000000001" },
];
export const contasDemo = canaisDemo.map(c => ({ id: c.contaCanalId, nome: `${DEMO_EMPRESA} · ${c.nome}`, canal_id: c.id, canalCodigo: c.codigo }));
export const opcoesDemo: GrupoRecorte[] = [{ rotulo: "Canais", opcoes: canaisDemo.map(c => ({ valor: c.id, rotulo: c.nome })) }];
export const produtosDemo = [
  { id: "d3000000-0000-4000-8000-000000000001", sku: "AT-MESA-01", titulo: "Mesa lateral Aurora", preco: 749.9, custo: 295, embalagem: 12, peso: 8.4, estoque: 32, categoria: "Móveis", tipo: "classico" },
  { id: "d3000000-0000-4000-8000-000000000002", sku: "AT-LUZ-02", titulo: "Luminária de mesa Arco", preco: 239.9, custo: 84, embalagem: 6, peso: 1.8, estoque: 54, categoria: "Iluminação", tipo: "premium" },
  { id: "d3000000-0000-4000-8000-000000000003", sku: "AT-PUFF-03", titulo: "Puff Linho com pés de madeira", preco: 489.9, custo: 192, embalagem: 10, peso: 5.6, estoque: 12, categoria: "Móveis", tipo: "classico" },
  { id: "d3000000-0000-4000-8000-000000000004", sku: "AT-EST-04", titulo: "Estante Horizonte com quatro prateleiras", preco: 1399.9, custo: 575, embalagem: 24, peso: 22, estoque: 18, categoria: "Móveis", tipo: "premium" },
  { id: "d3000000-0000-4000-8000-000000000005", sku: "AT-CAD-05", titulo: "Cadeira de jantar Serena", preco: 829.9, custo: 318, embalagem: 18, peso: 7.9, estoque: 26, categoria: "Móveis", tipo: "classico" },
  { id: "d3000000-0000-4000-8000-000000000006", sku: "AT-ORG-06", titulo: "Kit organizador de mesa em madeira", preco: 119.9, custo: 36, embalagem: 4, peso: .9, estoque: 78, categoria: "Organização", tipo: "classico" },
] as const;
export type ProdutoCenarioDemo = (typeof produtosDemo)[number];
export const moedaDemo = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const diasDemo = (inicio: string, fim: string) => {
  const dias: string[] = [];
  for (let t = Date.parse(inicio + "T12:00:00Z"); t <= Date.parse(fim + "T12:00:00Z"); t += 86400000) dias.push(new Date(t).toISOString().slice(0, 10));
  return dias;
};
export const somarDiasDemo = (data: string, quantidade: number) => new Date(Date.parse(data + "T12:00:00Z") + quantidade * 86400000).toISOString().slice(0, 10);
export const mlbDemo = (i: number) => `MLB9000000000${String(i + 1).padStart(2, "0")}`;
/** Episódio encerrado do cenário: permite comparar antes/durante/depois sem prever vendas. */
export const RELAMPAGO_HISTORICA_DEMO = {
  id: "d5000000-0000-4000-8000-000000000003", codigo: "P-DEMO-ORG-RELAMPAGO", nome: "Relâmpago · Organização em foco",
  sku: "AT-ORG-06", data: "2026-11-10", inicio: "2026-11-10T08:00:00-03:00", fim: "2026-11-10T20:00:00-03:00",
  preco: 110.31, unidades: 9, visitas: 238, comissaoPct: 4.5,
} as const;
export type MovimentoDemo = { data: string; canalId: string; contaId: string; produtoId: string; sku: string; titulo: string; quantidade: number; pedidos: number; receita: number; visitas: number; preco: number; ads: number; comissaoPct: number; freteUnidade: number; estoque: number };
export const movimentosDemo: MovimentoDemo[] = diasDemo(DEMO_INICIO, DEMO_HOJE).flatMap((data, d) => canaisDemo.flatMap((canal, c) => produtosDemo.map((p, i) => {
  const recente = data >= "2026-11-12";
  const semEstoque = i === 2 && data >= "2026-11-12" && data <= "2026-11-16";
  const unidadesBase = 1 + ((d + i * 2 + c) % 4);
  const emCampanha = data >= "2026-10-19" && data <= "2026-11-01" && i < 3;
  const ofertaAtual = data >= "2026-11-16" && [0, 3, 4, 5].includes(i);
  const relampagoHistorica = p.sku === RELAMPAGO_HISTORICA_DEMO.sku && data === RELAMPAGO_HISTORICA_DEMO.data;
  const quantidade = relampagoHistorica ? RELAMPAGO_HISTORICA_DEMO.unidades : semEstoque ? 0 : recente && i < 2 ? Math.max(1, unidadesBase - 1) : unidadesBase + (emCampanha ? 1 : 0);
  const preco = relampagoHistorica ? RELAMPAGO_HISTORICA_DEMO.preco : moedaDemo(p.preco * (emCampanha || ofertaAtual ? .94 : i === 1 && recente ? 1.08 : 1));
  const visitas = relampagoHistorica ? RELAMPAGO_HISTORICA_DEMO.visitas : Math.round((95 + (d % 7) * 8 + i * 17) * (c ? .6 : 1) * (recente && i === 0 ? .62 : 1));
  return { data, canalId: canal.id, contaId: canal.contaCanalId, produtoId: p.id, sku: p.sku, titulo: p.titulo, quantidade, pedidos: quantidade ? 1 : 0, receita: moedaDemo(preco * quantidade), visitas, preco, ads: c ? 0 : moedaDemo(11 + i * 4 + (d % 5)), comissaoPct: relampagoHistorica ? RELAMPAGO_HISTORICA_DEMO.comissaoPct : c ? 14 : p.tipo === "premium" ? 13.5 : 8.5, freteUnidade: c ? 9.8 : p.peso > 20 ? 39.9 : p.peso > 5 ? 24.9 : 13.9, estoque: semEstoque ? 0 : p.estoque };
})));
export function filtrarMovimentosDemo(inicio = DEMO_INICIO, fim = DEMO_HOJE, canal = "") {
  const selecionados = canal.split(",").filter(Boolean);
  return movimentosDemo.filter(m => m.data >= inicio && m.data <= fim && (!selecionados.length || selecionados.some(c => c === m.canalId || c === m.contaId || c === `conta:${m.contaId}`)));
}
export const somarDemo = <T,>(linhas: T[], valor: (l: T) => number) => moedaDemo(linhas.reduce((s, l) => s + valor(l), 0));
export const precoAtualProdutoDemo = (sku: string) => movimentosDemo.findLast(m => m.sku === sku)?.preco ?? produtosDemo.find(p => p.sku === sku)?.preco ?? 0;

/** Os movimentos acima representam vendas válidas; estes três pedidos completam o bruto. */
export const cancelamentosCenarioDemo = [
  { id: "cancelamento-demo-1", codigo: "990000009001", data: "2026-10-14", produto: produtosDemo[0], quantidade: 1, total: produtosDemo[0].preco },
  { id: "cancelamento-demo-2", codigo: "990000009002", data: "2026-11-04", produto: produtosDemo[2], quantidade: 2, total: moedaDemo(produtosDemo[2].preco * 2) },
  { id: "cancelamento-demo-3", codigo: "990000009003", data: "2026-11-14", produto: produtosDemo[1], quantidade: 1, total: moedaDemo(produtosDemo[1].preco * 1.08) },
];
export function resumoCancelamentosDemo(inicio = DEMO_INICIO, fim = DEMO_HOJE, canal = "") {
  const dentro = !canal || canal.split(",").some(c => [canaisDemo[0].id, contasDemo[0].id, `conta:${contasDemo[0].id}`].includes(c));
  const linhas = dentro ? cancelamentosCenarioDemo.filter(c => c.data >= inicio && c.data <= fim) : [];
  return { pedidos: linhas.length, valor: somarDemo(linhas, c => c.total), linhas };
}
