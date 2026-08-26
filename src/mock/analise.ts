import type { Anuncio, SemanaDesempenho, DiaVenda } from "@/lib/analise";

/**
 * Carteira estática da Análise de anúncios.
 *
 * Gerada com um PRNG semeado — precisa ser determinística, senão o servidor
 * e o navegador renderizam números diferentes e o React acusa hidratação.
 * O perfil de cada item é escolhido de propósito para que todas as lentes
 * tenham exemplo real: saudável, sangrando, joia, desperdício e falsa tração.
 */

function prng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const SEMANAS: { semana: string; intervalo: string; inicio: string }[] = [
  { semana: "S27", intervalo: "29/06 a 05/07", inicio: "2026-06-29" },
  { semana: "S28", intervalo: "06/07 a 12/07", inicio: "2026-07-06" },
  { semana: "S29", intervalo: "13/07 a 19/07", inicio: "2026-07-13" },
  { semana: "S30", intervalo: "20/07 a 26/07", inicio: "2026-07-20" },
  { semana: "S31", intervalo: "27/07 a 02/08", inicio: "2026-07-27" },
  { semana: "S32", intervalo: "03/08 a 09/08", inicio: "2026-08-03" },
  { semana: "S33", intervalo: "10/08 a 16/08", inicio: "2026-08-10" },
  { semana: "S34", intervalo: "17/08 a 23/08", inicio: "2026-08-17" },
];

const DIA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** Soma dias a uma data ISO sem passar por fuso. */
function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(a, m - 1, d) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export const CONTAS = ["Conta principal", "Segunda conta"] as const;

type Perfil =
  | "saudavel"
  | "sangrando"
  | "joia"
  | "desperdicio"
  | "falsa_tracao"
  | "caindo";

type Semente = {
  mlb: string;
  sku: string;
  titulo: string;
  categoria: string;
  tipo: "Clássico" | "Premium";
  status: "ativo" | "pausado";
  conta: string;
  perfil: Perfil;
  preco: number;
  /** Visitas na primeira semana. */
  visitas: number;
  /** Conversão base, em %. */
  conversao: number;
  comissao: number;
};

const CATALOGO: Semente[] = [
  { mlb: "MLB1284471029", sku: "CM-PRM-138", titulo: "Colchão Casal Molas Ensacadas Premium 138x188", categoria: "Colchões", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "sangrando", preco: 1799, visitas: 6100, conversao: 0.86, comissao: 16.5 },
  { mlb: "MLB1195033884", sku: "CS-D33-088", titulo: "Colchão Solteiro Espuma D33 88x188", categoria: "Colchões", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "saudavel", preco: 649.9, visitas: 4950, conversao: 1.28, comissao: 13 },
  { mlb: "MLB1338920117", sku: "CB-BAU-138", titulo: "Cama Box Baú Casal Bipartido", categoria: "Camas", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "falsa_tracao", preco: 2249, visitas: 3420, conversao: 0.52, comissao: 16.5 },
  { mlb: "MLB1402118765", sku: "TV-NASA-50", titulo: "Travesseiro Viscoelástico Nasa 50x70", categoria: "Acessórios", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "saudavel", preco: 129.9, visitas: 7680, conversao: 1.96, comissao: 12.5 },
  { mlb: "MLB1290774310", sku: "CQ-LTX-158", titulo: "Colchão Queen Híbrido Látex 158x198", categoria: "Colchões", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "desperdicio", preco: 3199, visitas: 2730, conversao: 0.44, comissao: 16.5 },
  { mlb: "MLB1187446620", sku: "PC-IMP-138", titulo: "Protetor de Colchão Impermeável Casal", categoria: "Acessórios", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "joia", preco: 89.9, visitas: 1180, conversao: 3.4, comissao: 12.5 },
  { mlb: "MLB1451009238", sku: "BB-SIN-088", titulo: "Base Box Solteiro Sintético", categoria: "Camas", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "saudavel", preco: 549, visitas: 1870, conversao: 0.79, comissao: 13 },
  { mlb: "MLB1366588412", sku: "KT-PLU-002", titulo: "Kit 2 Travesseiros Pluma Sintética", categoria: "Acessórios", tipo: "Clássico", status: "pausado", conta: "Segunda conta", perfil: "caindo", preco: 149.9, visitas: 1580, conversao: 1.9, comissao: 12.5 },
  { mlb: "MLB1219847766", sku: "CM-D45-138", titulo: "Colchão Casal Ortopédico D45 138x188", categoria: "Colchões", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "sangrando", preco: 1349, visitas: 4265, conversao: 0.78, comissao: 16.5 },
  { mlb: "MLB1478330951", sku: "ED-MIC-138", titulo: "Edredom Casal Dupla Face Microfibra", categoria: "Enxoval", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "joia", preco: 199.9, visitas: 1230, conversao: 2.6, comissao: 12.5 },
  { mlb: "MLB1301226488", sku: "CB-CJG-138", titulo: "Cama Box Casal Conjugada Premium", categoria: "Camas", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "falsa_tracao", preco: 2649, visitas: 3210, conversao: 0.51, comissao: 16.5 },
  { mlb: "MLB1425667109", sku: "CD-DOB-088", titulo: "Colchonete Dobrável Solteiro", categoria: "Acessórios", tipo: "Clássico", status: "pausado", conta: "Segunda conta", perfil: "caindo", preco: 179.9, visitas: 930, conversao: 1.27, comissao: 12.5 },
  { mlb: "MLB1512088437", sku: "CM-PIL-158", titulo: "Colchão Queen Pillow Top Molas 158x198", categoria: "Colchões", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "desperdicio", preco: 2549, visitas: 5140, conversao: 0.38, comissao: 16.5 },
  { mlb: "MLB1533901266", sku: "LC-ALG-002", titulo: "Jogo de Lençol Casal 200 Fios Algodão", categoria: "Enxoval", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "saudavel", preco: 159.9, visitas: 2980, conversao: 1.62, comissao: 12.5 },
  { mlb: "MLB1547722810", sku: "TV-CERV-01", titulo: "Travesseiro Cervical Ergonômico", categoria: "Acessórios", tipo: "Clássico", status: "ativo", conta: "Segunda conta", perfil: "joia", preco: 109.9, visitas: 1040, conversao: 3.1, comissao: 12.5 },
  { mlb: "MLB1559340077", sku: "CM-INF-070", titulo: "Colchão Infantil Berço Americano 70x130", categoria: "Colchões", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "saudavel", preco: 289.9, visitas: 2140, conversao: 1.44, comissao: 13 },
  { mlb: "MLB1566119284", sku: "CB-SOL-088", titulo: "Cama Box Solteiro com Auxiliar", categoria: "Camas", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "sangrando", preco: 899, visitas: 2610, conversao: 0.71, comissao: 13 },
  { mlb: "MLB1578402913", sku: "PT-ANT-138", titulo: "Protetor de Colchão Antialérgico Casal", categoria: "Acessórios", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "saudavel", preco: 119.9, visitas: 1720, conversao: 1.85, comissao: 12.5 },
  { mlb: "MLB1584771002", sku: "CM-KIN-193", titulo: "Colchão King Molas Ensacadas 193x203", categoria: "Colchões", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "falsa_tracao", preco: 4199, visitas: 2260, conversao: 0.34, comissao: 16.5 },
  { mlb: "MLB1592230845", sku: "MT-SOF-002", titulo: "Manta Cobertor Casal Soft Touch", categoria: "Enxoval", tipo: "Clássico", status: "ativo", conta: "Segunda conta", perfil: "caindo", preco: 89.9, visitas: 1490, conversao: 1.55, comissao: 12.5 },
  { mlb: "MLB1601884377", sku: "BB-CAS-138", titulo: "Base Box Casal Sintético Reforçado", categoria: "Camas", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "desperdicio", preco: 749, visitas: 3890, conversao: 0.46, comissao: 13 },
  { mlb: "MLB1618003991", sku: "CM-VIS-138", titulo: "Colchão Casal Viscoelástico Gel 138x188", categoria: "Colchões", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "sangrando", preco: 2199, visitas: 3340, conversao: 0.62, comissao: 16.5 },
  { mlb: "MLB1627719450", sku: "KT-LEN-004", titulo: "Kit Enxoval Casal 4 Peças", categoria: "Enxoval", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "joia", preco: 249.9, visitas: 980, conversao: 2.9, comissao: 12.5 },
  { mlb: "MLB1634556182", sku: "CM-ESP-088", titulo: "Colchão Solteiro Espuma D28 Selado", categoria: "Colchões", tipo: "Clássico", status: "ativo", conta: "Segunda conta", perfil: "saudavel", preco: 449.9, visitas: 2470, conversao: 1.36, comissao: 13 },
  { mlb: "MLB1641220738", sku: "CB-BAU-158", titulo: "Cama Box Baú Queen com Gás", categoria: "Camas", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "falsa_tracao", preco: 3349, visitas: 2050, conversao: 0.41, comissao: 16.5 },
  { mlb: "MLB1658901447", sku: "TV-PLU-070", titulo: "Travesseiro Pluma de Ganso 70x50", categoria: "Acessórios", tipo: "Clássico", status: "ativo", conta: "Conta principal", perfil: "caindo", preco: 199.9, visitas: 1360, conversao: 1.48, comissao: 12.5 },
  { mlb: "MLB1663388209", sku: "CM-ORT-158", titulo: "Colchão Queen Ortopédico Firme 158x198", categoria: "Colchões", tipo: "Premium", status: "ativo", conta: "Conta principal", perfil: "desperdicio", preco: 1999, visitas: 4420, conversao: 0.42, comissao: 16.5 },
  { mlb: "MLB1671045523", sku: "PR-SAI-138", titulo: "Saia Box Casal com Elástico", categoria: "Enxoval", tipo: "Clássico", status: "ativo", conta: "Segunda conta", perfil: "joia", preco: 79.9, visitas: 860, conversao: 3.6, comissao: 12.5 },
];

const CAMPANHAS = [
  "O melhor de todos os dias",
  "O melhor de todos os dias com redução nas suas tarifas",
  "Ofertas do Dia",
  "Semana do Consumidor",
  "Liquida Casa",
];

/** Fatores que moldam a curva de cada perfil ao longo das 8 semanas. */
const CURVA: Record<Perfil, { volume: number[]; preco: number[] }> = {
  // volume relativo · preço relativo ao de tabela
  saudavel: {
    volume: [1, 1.04, 1.02, 1.1, 1.08, 1.15, 1.13, 1.2],
    preco: [1, 1, 0.99, 1, 1, 0.99, 1, 1],
  },
  // preço cai, volume não reage → subsídio puro
  sangrando: {
    volume: [1, 0.99, 1.01, 0.98, 1.0, 0.97, 0.99, 0.96],
    preco: [1, 0.98, 0.95, 0.93, 0.9, 0.89, 0.87, 0.86],
  },
  // pouco tráfego, conversão alta e estável
  joia: {
    volume: [1, 1.06, 1.05, 1.12, 1.14, 1.18, 1.22, 1.28],
    preco: [1, 1, 1, 1.01, 1, 1.01, 1, 1.01],
  },
  // muita visita, conversão fraca
  desperdicio: {
    volume: [1, 0.97, 1.02, 0.95, 0.99, 0.94, 0.97, 0.93],
    preco: [1, 1, 1.01, 1, 1.01, 1, 1.01, 1],
  },
  // volume sobe, mas comprado com desconto
  falsa_tracao: {
    volume: [1, 1.12, 1.2, 1.31, 1.4, 1.52, 1.61, 1.74],
    preco: [1, 0.97, 0.94, 0.91, 0.89, 0.87, 0.85, 0.83],
  },
  // perdendo tração
  caindo: {
    volume: [1, 0.94, 0.88, 0.83, 0.77, 0.71, 0.66, 0.6],
    preco: [1, 1, 0.99, 0.99, 0.98, 0.98, 0.97, 0.97],
  },
};

/** Multiplicador de tráfego por perfil — define quem fica acima da média. */
const TRAFEGO: Record<Perfil, number[]> = {
  saudavel: [1, 1.03, 1.01, 1.06, 1.04, 1.09, 1.07, 1.12],
  sangrando: [1, 1.02, 1.04, 1.03, 1.06, 1.05, 1.08, 1.07],
  joia: [1, 1.01, 0.99, 1.02, 1.0, 1.03, 1.01, 1.04],
  desperdicio: [1, 1.08, 1.14, 1.19, 1.26, 1.31, 1.38, 1.44],
  falsa_tracao: [1, 1.05, 1.09, 1.13, 1.18, 1.22, 1.27, 1.31],
  caindo: [1, 0.96, 0.92, 0.88, 0.84, 0.8, 0.77, 0.73],
};

function construir(s: Semente, indice: number): Anuncio {
  const rand = prng(indice * 7919 + 13);
  const curva = CURVA[s.perfil];
  const trafego = TRAFEGO[s.perfil];

  const semanas: SemanaDesempenho[] = SEMANAS.map((w, i) => {
    const ruido = 0.94 + rand() * 0.12;

    const visitas = Math.round(s.visitas * trafego[i] * ruido);
    const conversao = (s.conversao * curva.volume[i] * (0.96 + rand() * 0.08)) / 100;
    const vendas = Math.max(0, Math.round(visitas * conversao));

    // O preço da vitrine na semana.
    const precoAnunciado = +(s.preco * curva.preco[i]).toFixed(2);

    // Distribui as vendas pelos dias. Fim de semana puxa menos.
    const peso = [1, 1.05, 1.0, 1.08, 1.15, 0.82, 0.62];
    const totalPeso = peso.reduce((a, b) => a + b, 0);
    const dias: DiaVenda[] = [];
    let restante = vendas;

    for (let d = 0; d < 7; d++) {
      const alvo = d === 6 ? restante : Math.round((vendas * peso[d]) / totalPeso);
      const qtd = Math.max(0, Math.min(alvo, restante));
      restante -= qtd;
      if (qtd === 0) continue;

      // O preço pago oscila um pouco em torno do anunciado: cupom,
      // campanha relâmpago, frete embutido.
      const precoDia = +(precoAnunciado * (0.985 + rand() * 0.02)).toFixed(2);
      dias.push({
        data: somarDias(w.inicio, d),
        diaSemana: DIA_SEMANA[d],
        vendas: qtd,
        preco: precoDia,
      });
    }

    const receita = +dias.reduce((s2, d) => s2 + d.vendas * d.preco, 0).toFixed(2);
    const precoRealizado = vendas > 0 ? +(receita / vendas).toFixed(2) : null;

    // O preço ideal oscila pouco: é o custo mais a margem alvo.
    const precoIdeal = +(s.preco * (0.97 + (i % 3) * 0.012)).toFixed(2);

    // Itens que descontam estão quase sempre dentro de alguma campanha.
    const emCampanha = curva.preco[i] < 0.97;
    const campanhas = emCampanha
      ? [
          {
            nome: CAMPANHAS[(indice + i) % CAMPANHAS.length],
            preco: precoAnunciado,
          },
        ]
      : [];

    return {
      semana: w.semana,
      intervalo: w.intervalo,
      visitas,
      vendas,
      receita,
      precoAnunciado,
      precoRealizado,
      precoIdeal,
      comissao: s.comissao,
      dias,
      campanhas,
    };
  });

  return {
    mlb: s.mlb,
    sku: s.sku,
    titulo: s.titulo,
    tipo: s.tipo,
    status: s.status,
    conta: s.conta,
    categoria: s.categoria,
    semanas,
  };
}

export const ANUNCIOS_ANALISE: Anuncio[] = CATALOGO.map(construir);

export const CATEGORIAS = Array.from(
  new Set(CATALOGO.map((c) => c.categoria))
).sort();

/** Relatórios já importados, para a tela de importação mostrar o histórico. */
export const IMPORTACOES = [
  {
    id: "imp-04",
    arquivo: "Relatorio_desempenho_publicacoes_2026_08_17-2026_08_23.xlsx",
    tipo: "Desempenho de publicações",
    periodo: "S34 · 17/08 a 23/08",
    linhas: 28,
    enviadoEm: "24/08/2026 09:12",
  },
  {
    id: "imp-03",
    arquivo: "ReportIdealSalePrice_2026_08_18.xlsx",
    tipo: "Preço ideal",
    periodo: "Data-base 18/08/2026",
    linhas: 28,
    enviadoEm: "19/08/2026 14:40",
  },
  {
    id: "imp-02",
    arquivo: "Relatorio_desempenho_publicacoes_2026_08_10-2026_08_16.xlsx",
    tipo: "Desempenho de publicações",
    periodo: "S33 · 10/08 a 16/08",
    linhas: 28,
    enviadoEm: "17/08/2026 08:55",
  },
  {
    id: "imp-01",
    arquivo: "Relatorio_desempenho_publicacoes_2026_08_03-2026_08_09.xlsx",
    tipo: "Desempenho de publicações",
    periodo: "S32 · 03/08 a 09/08",
    linhas: 27,
    enviadoEm: "10/08/2026 09:02",
  },
];
