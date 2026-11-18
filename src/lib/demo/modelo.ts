/** Cenário público fictício. Não importa serviços, banco ou dados de empresas. */
export type CanalDemo = "todos" | "meli" | "site";
export type TelaDemo = "hoje" | "produtos" | "anuncios" | "midia" | "promocoes" | "planejamento" | "financeiro" | "envios" | "conversar";

export const TELAS_DEMO: { id: TelaDemo; nome: string; resumo: string }[] = [
  { id: "hoje", nome: "Hoje", resumo: "O dia, o histórico e a meta" },
  { id: "produtos", nome: "Produtos", resumo: "O resultado de cada SKU" },
  { id: "anuncios", nome: "Anúncios", resumo: "Desempenho e comparação" },
  { id: "midia", nome: "Tráfego pago", resumo: "Investimento com contexto" },
  { id: "promocoes", nome: "Promoções", resumo: "Condições antes de aprovar" },
  { id: "planejamento", nome: "Planejamento", resumo: "Ações para os próximos dias" },
  { id: "financeiro", nome: "Financeiro", resumo: "O caminho até a contribuição" },
  { id: "envios", nome: "Envios", resumo: "Prazo e documentos" },
  { id: "conversar", nome: "Conversar", resumo: "Perguntas sobre os dados" },
];

export const DATA_DEMO = "2026-11-18";
export const CANAIS_DEMO = [{ id: "meli" as const, nome: "Mercado Livre" }, { id: "site" as const, nome: "Loja própria" }];
export const PRODUTOS_DEMO = [
  { id: "p1", sku: "DEMO-001", nome: "Mesa lateral Aurora em madeira", categoria: "Casa", preco: 249.9, custo: 108, estoque: 14, visitas: 620 },
  { id: "p2", sku: "DEMO-002", nome: "Luminária de bancada com luz ajustável", categoria: "Iluminação", preco: 189.9, custo: 72, estoque: 9, visitas: 840 },
  { id: "p3", sku: "DEMO-003", nome: "Kit de três organizadores de mesa", categoria: "Organização", preco: 79.9, custo: 24, estoque: 26, visitas: 390 },
  { id: "p4", sku: "DEMO-004", nome: "Prateleira Horizonte com suporte metálico", categoria: "Casa", preco: 159.9, custo: 61, estoque: 6, visitas: 470 },
  { id: "p5", sku: "DEMO-005", nome: "Vaso de cerâmica artesanal tamanho médio", categoria: "Decoração", preco: 89.9, custo: 31, estoque: 18, visitas: 280 },
  { id: "p6", sku: "DEMO-006", nome: "Almofada de linho com capa removível", categoria: "Decoração", preco: 69.9, custo: 22, estoque: 22, visitas: 210 },
];
export type ProdutoDemo = (typeof PRODUTOS_DEMO)[number];
export type PedidoDemo = { id: string; data: string; canal: Exclude<CanalDemo, "todos">; produto: string; quantidade: number; cancelado: boolean; prazo: string; nota: boolean };
export const PEDIDOS_DEMO: PedidoDemo[] = [
  { id: "D-1001", data: "2026-11-14", canal: "meli", produto: "p1", quantidade: 2, cancelado: false, prazo: "2026-11-16", nota: true },
  { id: "D-1002", data: "2026-11-14", canal: "site", produto: "p3", quantidade: 3, cancelado: false, prazo: "2026-11-17", nota: true },
  { id: "D-1003", data: "2026-11-15", canal: "meli", produto: "p2", quantidade: 2, cancelado: false, prazo: "2026-11-17", nota: true },
  { id: "D-1004", data: "2026-11-15", canal: "site", produto: "p5", quantidade: 2, cancelado: false, prazo: "2026-11-18", nota: true },
  { id: "D-1005", data: "2026-11-16", canal: "meli", produto: "p4", quantidade: 3, cancelado: false, prazo: "2026-11-18", nota: true },
  { id: "D-1006", data: "2026-11-16", canal: "site", produto: "p6", quantidade: 2, cancelado: false, prazo: "2026-11-19", nota: false },
  { id: "D-1007", data: "2026-11-17", canal: "meli", produto: "p1", quantidade: 1, cancelado: false, prazo: "2026-11-18", nota: true },
  { id: "D-1008", data: "2026-11-17", canal: "site", produto: "p2", quantidade: 1, cancelado: true, prazo: "2026-11-19", nota: false },
  { id: "D-1009", data: "2026-11-18", canal: "meli", produto: "p3", quantidade: 4, cancelado: false, prazo: "2026-11-19", nota: true },
  { id: "D-1010", data: "2026-11-18", canal: "site", produto: "p5", quantidade: 2, cancelado: false, prazo: "2026-11-20", nota: true },
];

export const ANUNCIOS_DEMO = [
  { id: "A-01", produto: "p1", tipo: "Clássico", visitas: 620, unidades: 3, estado: "Ativo" },
  { id: "A-02", produto: "p2", tipo: "Premium", visitas: 840, unidades: 2, estado: "Conferir conversão" },
  { id: "A-03", produto: "p3", tipo: "Clássico", visitas: 390, unidades: 4, estado: "Ativo" },
  { id: "A-04", produto: "p4", tipo: "Premium", visitas: 470, unidades: 3, estado: "Ativo" },
];
export const MIDIA_DEMO = [
  { id: "m1", nome: "Casa · produtos principais", produto: "p1", gasto: 62, receita: 749.7, pedidos: 3 },
  { id: "m2", nome: "Iluminação · descoberta", produto: "p2", gasto: 83, receita: 379.8, pedidos: 2 },
  { id: "m3", nome: "Organização · giro", produto: "p3", gasto: 29, receita: 319.6, pedidos: 4 },
];
export const PROMOCOES_DEMO = [
  { id: "c1", produto: "p1", nome: "Semana da Casa", proposta: 229.9, piso: 219.9, prazo: "20/11" },
  { id: "c2", produto: "p2", nome: "Ofertas de novembro", proposta: 159.9, piso: 169.9, prazo: "21/11" },
  { id: "c3", produto: "p3", nome: "Semana da Casa", proposta: 74.9, piso: 69.9, prazo: "20/11" },
];
export type AcaoDemo = { id: string; nome: string; data: string; canal: "meli" | "site"; estado: "Planejada" | "Em andamento" | "Concluída" };
export const ACOES_DEMO: AcaoDemo[] = [
  { id: "t1", nome: "Revisar a página da luminária", data: DATA_DEMO, canal: "meli", estado: "Em andamento" },
  { id: "t2", nome: "Preparar seleção da Semana da Casa", data: "2026-11-19", canal: "meli", estado: "Planejada" },
  { id: "t3", nome: "Publicar coleção de organização", data: "2026-11-20", canal: "site", estado: "Planejada" },
];

export const moneyDemo = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const percentualDemo = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export const dataCurtaDemo = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;
export const produtoDemo = (id: string) => PRODUTOS_DEMO.find(p => p.id === id)!;
export const receitaPedidoDemo = (p: PedidoDemo) => produtoDemo(p.produto).preco * p.quantidade;

export function rankingDemo(canal: CanalDemo) {
  return PRODUTOS_DEMO.map(p => {
    const pedidos = PEDIDOS_DEMO.filter(o => o.produto === p.id && !o.cancelado && (canal === "todos" || o.canal === canal));
    return { ...p, unidades: pedidos.reduce((s, o) => s + o.quantidade, 0), receita: pedidos.reduce((s, o) => s + receitaPedidoDemo(o), 0) };
  }).sort((a, b) => b.receita - a.receita);
}

export function respostaDemo(pergunta: string, canal: CanalDemo) {
  const q = pergunta.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const pedidos = PEDIDOS_DEMO.filter(p => canal === "todos" || p.canal === canal);
  const validos = pedidos.filter(p => !p.cancelado);
  const total = validos.reduce((s, p) => s + receitaPedidoDemo(p), 0);
  if (/cancel/.test(q)) {
    const cancelados = pedidos.filter(p => p.cancelado);
    return { texto: `${cancelados.length} pedido cancelado neste cenário, somando ${moneyDemo(cancelados.reduce((s, p) => s + receitaPedidoDemo(p), 0))}. Você pode separar a leitura por canal usando o seletor do topo.`, fonte: "Pedidos fictícios · 14 a 18/11/2026" };
  }
  if (/produto|sku|ranking|mais vende/.test(q)) {
    const r = rankingDemo(canal).slice(0, 3).filter(p => p.unidades);
    return { texto: `Os produtos com maior receita são: ${r.map(p => `${p.nome} (${moneyDemo(p.receita)}, ${p.unidades} unidades)`).join("; ")}. Esse ranking usa apenas os pedidos válidos do cenário.`, fonte: "Ranking de produtos fictícios · receita por SKU" };
  }
  if (/canal|mercado|meli|vendeu|vendas|receita/.test(q)) {
    const porCanal = CANAIS_DEMO.filter(c => canal === "todos" || c.id === canal).map(c => ({ nome: c.nome, total: validos.filter(p => p.canal === c.id).reduce((s, p) => s + receitaPedidoDemo(p), 0) }));
    return { texto: `A receita dos pedidos válidos é ${moneyDemo(total)}. ${porCanal.map(c => `${c.nome}: ${moneyDemo(c.total)}`).join(". ")}. O período deste exemplo é de 14 a 18 de novembro.`, fonte: "Vendas fictícias · agrupamento por canal" };
  }
  return { texto: "Nesta demonstração, experimente perguntar sobre vendas, canais, produtos ou cancelamentos. As respostas são guiadas pelos dados fictícios; nenhuma consulta é enviada a uma IA ou a uma empresa real.", fonte: "Guia da demonstração" };
}
