/**
 * Dados estáticos da fase 1.
 * Cada export tem o MESMO formato que a API real vai devolver na fase 3 —
 * trocar por `fetch` é uma linha por tela.
 */

/* ── Visão geral ─────────────────────────────────────────────── */

export type Kpi = {
  id: string;
  label: string;
  value: number;
  format: "money" | "count" | "pct";
  delta: number;
  inverse?: boolean;
  hint: string;
  spark: number[];
};

export const KPIS: Kpi[] = [
  {
    id: "faturamento",
    label: "Faturamento",
    value: 1284530.4,
    format: "money",
    delta: 12.4,
    hint: "vs. mês anterior",
    spark: [38, 41, 39, 46, 44, 52, 49, 58, 55, 63, 61, 72],
  },
  {
    id: "pedidos",
    label: "Pedidos",
    value: 3417,
    format: "count",
    delta: 8.1,
    hint: "vs. mês anterior",
    spark: [120, 128, 119, 141, 136, 152, 147, 163, 158, 171, 168, 184],
  },
  {
    id: "ticket",
    label: "Ticket médio",
    value: 375.86,
    format: "money",
    delta: 3.9,
    hint: "vs. mês anterior",
    spark: [352, 349, 358, 361, 355, 366, 362, 371, 368, 374, 372, 376],
  },
  {
    id: "margem",
    label: "Margem de contribuição",
    value: 27.3,
    format: "pct",
    delta: -1.6,
    hint: "pressão de campanhas",
    spark: [30.1, 29.8, 29.4, 29.6, 28.9, 28.7, 28.4, 28.1, 27.9, 27.6, 27.4, 27.3],
  },
];

export type DiaFaturamento = { data: string; faturamento: number; pedidos: number };

export const FATURAMENTO_30D: DiaFaturamento[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2026, 6, 26 + i);
  const base = 34000 + i * 950;
  const fim = d.getDay() === 0 || d.getDay() === 6 ? -0.28 : 0;
  const onda = Math.sin(i / 2.6) * 6200;
  const faturamento = Math.round(base * (1 + fim) + onda);
  return {
    data: d.toISOString().slice(0, 10),
    faturamento,
    pedidos: Math.round(faturamento / 376),
  };
});

/* ── Canais ──────────────────────────────────────────────────── */

export type Canal = {
  id: string;
  nome: string;
  faturamento: number;
  pedidos: number;
  ticket: number;
  conversao: number;
  margem: number;
  delta: number;
  participacao: number;
  spark: number[];
};

export const CANAIS: Canal[] = [
  {
    id: "ml",
    nome: "Mercado Livre",
    faturamento: 612480.2,
    pedidos: 1742,
    ticket: 351.6,
    conversao: 2.84,
    margem: 24.1,
    delta: 15.2,
    participacao: 47.7,
    spark: [42, 45, 43, 51, 49, 56, 54, 61, 59, 66, 64, 72],
  },
  {
    id: "shopee",
    nome: "Shopee",
    faturamento: 268310.5,
    pedidos: 942,
    ticket: 284.8,
    conversao: 3.41,
    margem: 19.8,
    delta: 24.6,
    participacao: 20.9,
    spark: [18, 20, 19, 23, 24, 27, 26, 31, 30, 34, 36, 41],
  },
  {
    id: "amazon",
    nome: "Amazon",
    faturamento: 184920.1,
    pedidos: 418,
    ticket: 442.4,
    conversao: 2.12,
    margem: 26.7,
    delta: -4.3,
    participacao: 14.4,
    spark: [22, 21, 23, 20, 21, 19, 20, 18, 19, 17, 18, 17],
  },
  {
    id: "site",
    nome: "Loja própria",
    faturamento: 142870.9,
    pedidos: 211,
    ticket: 677.1,
    conversao: 1.68,
    margem: 41.2,
    delta: 31.8,
    participacao: 11.1,
    spark: [8, 9, 9, 11, 12, 13, 14, 16, 17, 19, 21, 24],
  },
  {
    id: "b2b",
    nome: "B2B / Representantes",
    faturamento: 75948.7,
    pedidos: 104,
    ticket: 730.3,
    conversao: 0,
    margem: 33.5,
    delta: -11.2,
    participacao: 5.9,
    spark: [14, 13, 14, 12, 13, 11, 12, 10, 11, 10, 9, 9],
  },
];

export type SerieCanalSemana = {
  semana: string;
  ml: number;
  shopee: number;
  amazon: number;
  site: number;
  b2b: number;
};

export const CANAIS_12_SEMANAS: SerieCanalSemana[] = [
  { semana: "S23", ml: 108, shopee: 41, amazon: 52, site: 19, b2b: 21 },
  { semana: "S24", ml: 114, shopee: 44, amazon: 49, site: 21, b2b: 20 },
  { semana: "S25", ml: 111, shopee: 43, amazon: 51, site: 22, b2b: 21 },
  { semana: "S26", ml: 126, shopee: 52, amazon: 47, site: 26, b2b: 18 },
  { semana: "S27", ml: 122, shopee: 55, amazon: 48, site: 28, b2b: 19 },
  { semana: "S28", ml: 138, shopee: 61, amazon: 44, site: 31, b2b: 17 },
  { semana: "S29", ml: 134, shopee: 59, amazon: 45, site: 33, b2b: 18 },
  { semana: "S30", ml: 149, shopee: 68, amazon: 42, site: 38, b2b: 16 },
  { semana: "S31", ml: 146, shopee: 66, amazon: 43, site: 40, b2b: 17 },
  { semana: "S32", ml: 158, shopee: 74, amazon: 40, site: 45, b2b: 15 },
  { semana: "S33", ml: 155, shopee: 79, amazon: 41, site: 49, b2b: 15 },
  { semana: "S34", ml: 171, shopee: 88, amazon: 39, site: 56, b2b: 14 },
];

export const CANAL_CORES: Record<string, string> = {
  ml: "var(--s1)",
  shopee: "var(--s2)",
  amazon: "var(--s3)",
  site: "var(--s4)",
  b2b: "var(--s5)",
};

export const CANAL_NOMES: Record<string, string> = {
  ml: "Mercado Livre",
  shopee: "Shopee",
  amazon: "Amazon",
  site: "Loja própria",
  b2b: "B2B",
};

/* ── Alertas ─────────────────────────────────────────────────── */

export type Alerta = {
  id: string;
  tipo: "preco" | "campanha" | "meta" | "estoque";
  severidade: "warn" | "down" | "info";
  titulo: string;
  detalhe: string;
  quando: string;
};

export const ALERTAS: Alerta[] = [
  {
    id: "a1",
    tipo: "preco",
    severidade: "down",
    titulo: "Concorrente baixou 8,4% em Colchão Casal Premium",
    detalhe: "MLB1284471029 · agora R$ 1.649,00 contra seus R$ 1.799,00",
    quando: "há 2 h",
  },
  {
    id: "a2",
    tipo: "campanha",
    severidade: "warn",
    titulo: "Campanha “O melhor de todos os dias” encerra em 3 dias",
    detalhe: "142 anúncios elegíveis · 38 ainda sem decisão",
    quando: "há 5 h",
  },
  {
    id: "a3",
    tipo: "meta",
    severidade: "warn",
    titulo: "Amazon a 74% da meta com 21% do mês restante",
    detalhe: "Projeção de fechamento: R$ 224.100 de R$ 260.000",
    quando: "hoje",
  },
  {
    id: "a4",
    tipo: "estoque",
    severidade: "info",
    titulo: "6 SKUs de curva A com cobertura abaixo de 15 dias",
    detalhe: "Risco de ruptura antes do próximo lote",
    quando: "ontem",
  },
];

/* ── Anúncios ────────────────────────────────────────────────── */

export type Anuncio = {
  mlb: string;
  titulo: string;
  sku: string;
  curva: "A" | "B" | "C";
  tipo: "Clássico" | "Premium";
  visitas: number;
  vendas: number;
  conversao: number;
  receita: number;
  preco: number;
  precoIdeal: number;
  comissao: number;
  campanhas: number;
  status: "ativo" | "pausado";
  historico: number[];
};

function anuncio(
  mlb: string,
  titulo: string,
  sku: string,
  curva: Anuncio["curva"],
  tipo: Anuncio["tipo"],
  visitas: number,
  vendas: number,
  preco: number,
  precoIdeal: number,
  comissao: number,
  campanhas: number,
  status: Anuncio["status"],
  historico: number[]
): Anuncio {
  return {
    mlb,
    titulo,
    sku,
    curva,
    tipo,
    visitas,
    vendas,
    conversao: +((vendas / visitas) * 100).toFixed(2),
    receita: +(vendas * preco).toFixed(2),
    preco,
    precoIdeal,
    comissao,
    campanhas,
    status,
    historico,
  };
}

export const ANUNCIOS: Anuncio[] = [
  anuncio("MLB1284471029", "Colchão Casal Molas Ensacadas Premium 138x188", "CM-PRM-138", "A", "Premium", 48210, 412, 1799.0, 1712.4, 16.5, 2, "ativo", [31, 34, 33, 38, 36, 41, 39, 44]),
  anuncio("MLB1195033884", "Colchão Solteiro Espuma D33 88x188", "CS-D33-088", "A", "Clássico", 39640, 508, 649.9, 662.1, 13.0, 1, "ativo", [42, 44, 41, 47, 46, 50, 49, 53]),
  anuncio("MLB1338920117", "Cama Box Baú Casal Bipartido", "CB-BAU-138", "A", "Premium", 27350, 143, 2249.0, 2098.5, 16.5, 3, "ativo", [12, 13, 11, 15, 14, 16, 13, 15]),
  anuncio("MLB1402118765", "Travesseiro Viscoelástico Nasa 50x70", "TV-NASA-50", "B", "Clássico", 61480, 1204, 129.9, 124.8, 12.5, 2, "ativo", [98, 104, 101, 118, 112, 126, 121, 134]),
  anuncio("MLB1290774310", "Colchão Queen Híbrido Látex 158x198", "CQ-LTX-158", "A", "Premium", 21870, 96, 3199.0, 3044.2, 16.5, 1, "ativo", [8, 9, 7, 10, 9, 11, 10, 12]),
  anuncio("MLB1187446620", "Protetor de Colchão Impermeável Casal", "PC-IMP-138", "C", "Clássico", 18420, 386, 89.9, 94.3, 12.5, 0, "ativo", [38, 41, 39, 44, 42, 47, 45, 49]),
  anuncio("MLB1451009238", "Base Box Solteiro Sintético", "BB-SIN-088", "B", "Clássico", 14980, 118, 549.0, 528.7, 13.0, 1, "ativo", [11, 12, 10, 14, 13, 15, 14, 16]),
  anuncio("MLB1366588412", "Kit 2 Travesseiros Pluma Sintética", "KT-PLU-002", "C", "Clássico", 12640, 241, 149.9, 151.2, 12.5, 2, "pausado", [24, 26, 23, 28, 27, 30, 29, 31]),
  anuncio("MLB1219847766", "Colchão Casal Ortopédico D45 138x188", "CM-D45-138", "A", "Premium", 34120, 267, 1349.0, 1288.6, 16.5, 2, "ativo", [22, 24, 23, 27, 26, 29, 28, 31]),
  anuncio("MLB1478330951", "Edredom Casal Dupla Face Microfibra", "ED-MIC-138", "B", "Clássico", 9840, 158, 199.9, 206.4, 12.5, 1, "ativo", [14, 15, 14, 17, 16, 18, 17, 19]),
  anuncio("MLB1301226488", "Cama Box Casal Conjugada Premium", "CB-CJG-138", "A", "Premium", 25680, 131, 2649.0, 2503.1, 16.5, 3, "ativo", [10, 11, 10, 13, 12, 14, 13, 15]),
  anuncio("MLB1425667109", "Colchonete Dobrável Solteiro", "CD-DOB-088", "C", "Clássico", 7420, 94, 179.9, 183.5, 12.5, 0, "pausado", [8, 9, 8, 10, 9, 11, 10, 11]),
];
