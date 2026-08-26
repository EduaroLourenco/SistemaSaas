/**
 * Catálogo de anúncios — espelho da planilha exportada do canal.
 *
 * Mesmo formato que a API vai devolver na fase 3: uma linha por MLB, com o
 * preço praticado, a comissão do tipo de anúncio e a situação da publicação.
 *
 * O histórico de preço é gerado com PRNG semeado. Precisa ser determinístico:
 * `Math.random` no módulo faz o servidor e o navegador renderizarem números
 * diferentes e o React acusa erro de hidratação.
 */

export type StatusAnuncio = "ativo" | "pausado" | "finalizado";
export type TipoAnuncio = "Clássico" | "Premium";

export type ItemCatalogo = {
  mlb: string;
  sku: string;
  titulo: string;
  categoria: string;
  tipo: TipoAnuncio;
  /** Preço praticado hoje, em reais. */
  precoAtual: number;
  /** Comissão do canal para o tipo de anúncio, em %. */
  comissaoAtual: number;
  status: StatusAnuncio;
  conta: string;
  estoque: number;
  /** ISO curto (yyyy-mm-dd). */
  atualizadoEm: string;
  criadoEm: string;
  freteGratis: boolean;
  historicoPreco: { semana: string; preco: number }[];
};

export const SEMANAS_CATALOGO = [
  "S23", "S24", "S25", "S26", "S27", "S28",
  "S29", "S30", "S31", "S32", "S33", "S34",
] as const;

function prng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Caminho do preço até o valor de hoje. A última semana fecha no preço atual. */
function historico(preco: number, semente: number) {
  const r = prng(semente * 977 + 13);
  let p = preco * (1 + (r() - 0.3) * 0.14);
  return SEMANAS_CATALOGO.map((semana, i) => {
    if (i === SEMANAS_CATALOGO.length - 1) p = preco;
    else p = p * (1 + (r() - 0.5) * 0.045);
    return { semana, preco: +p.toFixed(2) };
  });
}

type Semente = [
  mlb: string,
  sku: string,
  titulo: string,
  categoria: string,
  tipo: TipoAnuncio,
  precoAtual: number,
  comissaoAtual: number,
  status: StatusAnuncio,
  conta: string,
  estoque: number,
  atualizadoEm: string,
  criadoEm: string,
  freteGratis: boolean,
];

const SEMENTES: Semente[] = [
  ["MLB1284471029", "CM-PRM-138", "Colchão Casal Molas Ensacadas Premium 138x188", "Colchões", "Premium", 1799.0, 16.5, "ativo", "Conta principal", 84, "2026-08-24", "2024-03-11", true],
  ["MLB1195033884", "CS-D33-088", "Colchão Solteiro Espuma D33 88x188", "Colchões", "Clássico", 649.9, 13.0, "ativo", "Conta principal", 212, "2026-08-24", "2023-11-02", true],
  ["MLB1338920117", "CB-BAU-138", "Cama Box Baú Casal Bipartido", "Camas e bases", "Premium", 2249.0, 16.5, "ativo", "Conta principal", 41, "2026-08-23", "2024-06-19", true],
  ["MLB1402118765", "TV-NASA-50", "Travesseiro Viscoelástico Nasa 50x70", "Travesseiros", "Clássico", 129.9, 12.5, "ativo", "Conta principal", 1340, "2026-08-25", "2023-08-27", false],
  ["MLB1290774310", "CQ-LTX-158", "Colchão Queen Híbrido Látex 158x198", "Colchões", "Premium", 3199.0, 16.5, "ativo", "Conta principal", 22, "2026-08-22", "2024-01-30", true],
  ["MLB1187446620", "PC-IMP-138", "Protetor de Colchão Impermeável Casal", "Acessórios", "Clássico", 89.9, 12.5, "ativo", "Segunda conta", 964, "2026-08-25", "2023-05-14", false],
  ["MLB1451009238", "BB-SIN-088", "Base Box Solteiro Sintético", "Camas e bases", "Clássico", 549.0, 13.0, "ativo", "Conta principal", 96, "2026-08-21", "2024-09-08", true],
  ["MLB1366588412", "KT-PLU-002", "Kit 2 Travesseiros Pluma Sintética", "Travesseiros", "Clássico", 149.9, 12.5, "pausado", "Segunda conta", 318, "2026-08-12", "2024-02-06", false],
  ["MLB1219847766", "CM-D45-138", "Colchão Casal Ortopédico D45 138x188", "Colchões", "Premium", 1349.0, 16.5, "ativo", "Conta principal", 118, "2026-08-24", "2023-09-23", true],
  ["MLB1478330951", "ED-MIC-138", "Edredom Casal Dupla Face Microfibra", "Cama posta", "Clássico", 199.9, 12.5, "ativo", "Segunda conta", 452, "2026-08-23", "2024-11-15", false],
  ["MLB1301226488", "CB-CJG-138", "Cama Box Casal Conjugada Premium", "Camas e bases", "Premium", 2649.0, 16.5, "ativo", "Conta principal", 33, "2026-08-20", "2024-04-25", true],
  ["MLB1425667109", "CD-DOB-088", "Colchonete Dobrável Solteiro", "Colchões", "Clássico", 179.9, 12.5, "pausado", "Segunda conta", 78, "2026-07-30", "2024-07-17", false],
  ["MLB1512230874", "CQ-PRM-158", "Colchão Queen Molas Ensacadas Premium 158x198", "Colchões", "Premium", 2899.0, 16.5, "ativo", "Conta principal", 57, "2026-08-25", "2025-01-21", true],
  ["MLB1534991206", "CK-ESP-193", "Colchão King Espuma D45 193x203", "Colchões", "Premium", 3499.0, 16.5, "pausado", "Conta principal", 9, "2026-08-08", "2025-02-13", true],
  ["MLB1548772310", "BB-BAU-088", "Base Box Baú Solteiro Sintético", "Camas e bases", "Clássico", 749.0, 13.0, "ativo", "Conta principal", 64, "2026-08-22", "2025-03-04", true],
  ["MLB1560118447", "TV-LTX-050", "Travesseiro Látex Natural 50x70", "Travesseiros", "Premium", 249.9, 14.0, "ativo", "Segunda conta", 286, "2026-08-24", "2025-04-09", false],
  ["MLB1573660982", "LC-PER-200", "Lençol Casal Percal 200 Fios", "Cama posta", "Clássico", 179.9, 12.5, "ativo", "Segunda conta", 512, "2026-08-25", "2025-05-27", false],
  ["MLB1584220119", "LC-PER-400", "Jogo de Lençol Queen Percal 400 Fios", "Cama posta", "Premium", 389.9, 14.0, "ativo", "Segunda conta", 174, "2026-08-23", "2025-06-30", true],
  ["MLB1596448073", "PT-FIB-158", "Pillow Top Queen Fibra Siliconada", "Acessórios", "Clássico", 299.9, 12.5, "ativo", "Conta principal", 231, "2026-08-21", "2025-08-12", false],
  ["MLB1607331264", "CB-BER-070", "Colchão Berço Americano 70x130", "Colchões", "Clássico", 279.9, 12.5, "ativo", "Conta principal", 143, "2026-08-24", "2025-09-18", false],
  ["MLB1618902551", "CB-BAU-158", "Cama Box Baú Queen Bipartido", "Camas e bases", "Premium", 2999.0, 16.5, "ativo", "Conta principal", 27, "2026-08-25", "2025-10-22", true],
  ["MLB1620774138", "AC-SUP-004", "Kit 4 Suportes Antiderrapantes para Cama", "Acessórios", "Clássico", 59.9, 12.5, "finalizado", "Segunda conta", 0, "2026-06-11", "2025-11-05", false],
  ["MLB1639118702", "ED-PLU-158", "Edredom Queen Pluma Siliconada", "Cama posta", "Clássico", 349.9, 12.5, "finalizado", "Segunda conta", 0, "2026-05-29", "2025-12-14", false],
  ["MLB1644280915", "CM-EUR-138", "Colchão Casal Euro Pillow Molas 138x188", "Colchões", "Premium", 1999.0, 16.5, "ativo", "Conta principal", 71, "2026-08-25", "2026-01-16", true],
];

export const CATALOGO: ItemCatalogo[] = SEMENTES.map((s, i) => ({
  mlb: s[0],
  sku: s[1],
  titulo: s[2],
  categoria: s[3],
  tipo: s[4],
  precoAtual: s[5],
  comissaoAtual: s[6],
  status: s[7],
  conta: s[8],
  estoque: s[9],
  atualizadoEm: s[10],
  criadoEm: s[11],
  freteGratis: s[12],
  historicoPreco: historico(s[5], i + 1),
}));

/** Índice por MLB — o join com o relatório de preço ideal passa por aqui. */
export const CATALOGO_POR_MLB: Record<string, ItemCatalogo> = Object.fromEntries(
  CATALOGO.map((i) => [i.mlb, i])
);

export const CATEGORIAS_CATALOGO = [
  "Colchões",
  "Camas e bases",
  "Travesseiros",
  "Cama posta",
  "Acessórios",
] as const;

export const CONTAS_CATALOGO = ["Conta principal", "Segunda conta"] as const;

export type ImportacaoCatalogo = {
  id: string;
  arquivo: string;
  enviadoEm: string;
  linhas: number;
  novos: number;
  atualizados: number;
};

export const IMPORTACOES_CATALOGO: ImportacaoCatalogo[] = [
  { id: "ic4", arquivo: "Anuncios-2026-08-25.xlsx", enviadoEm: "25/08/2026 07:12", linhas: 24, novos: 0, atualizados: 11 },
  { id: "ic3", arquivo: "Anuncios-2026-08-18.xlsx", enviadoEm: "18/08/2026 07:09", linhas: 24, novos: 1, atualizados: 9 },
  { id: "ic2", arquivo: "Anuncios-2026-08-11.xlsx", enviadoEm: "11/08/2026 07:14", linhas: 23, novos: 2, atualizados: 14 },
  { id: "ic1", arquivo: "Anuncios-2026-08-04.xlsx", enviadoEm: "04/08/2026 07:11", linhas: 21, novos: 0, atualizados: 7 },
];
