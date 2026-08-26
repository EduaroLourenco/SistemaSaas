/**
 * Monitoramento — varredura periódica dos links publicados nos canais.
 *
 * "Busca preço" abre o link do anúncio de tempos em tempos e registra o preço
 * praticado por mim e pelos concorrentes que disputam a mesma oferta.
 * "Busca frete" faz o mesmo com o frete cotado por faixa de CEP.
 *
 * Os conectores ainda não existem. O formato abaixo é o que a varredura vai
 * devolver na fase 3 — trocar por `fetch` é uma linha por tela.
 * Toda geração é determinística (PRNG semeado): `Math.random` no módulo
 * produziria HTML diferente no servidor e no cliente e quebraria a hidratação.
 */

import { ANUNCIOS, type Anuncio } from "@/mock";

/* ══ utilidades determinísticas ═══════════════════════════════ */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — transforma o MLB numa semente estável. */
function semente(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const c2 = (v: number) => +v.toFixed(2);

const DIA = 86_400_000;
/** Data de referência da última varredura completa: 25/08/2026. */
const HOJE = Date.UTC(2026, 7, 25);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Os 30 dias de histórico que a varredura mantém em janela quente. */
export const DIAS_30: string[] = Array.from({ length: 30 }, (_, i) =>
  iso(HOJE - (29 - i) * DIA)
);

const PORMLB = new Map<string, Anuncio>(ANUNCIOS.map((a) => [a.mlb, a]));

/* ══ canais varridos ══════════════════════════════════════════ */

export const CANAIS_MONITORADOS = ["ml", "shopee", "amazon", "site"] as const;
export type CanalMonitorado = (typeof CANAIS_MONITORADOS)[number];

/* ══════════════════════════════════════════════════════════════
   A) BUSCA PREÇO
   ══════════════════════════════════════════════════════════════ */

export type ConcorrenteRastreado = {
  vendedor: string;
  preco: number;
  reputacao: "Verde" | "Amarelo" | "Vermelho";
  reputacaoDetalhe: string;
  frete: string;
  estoque: string;
  visto: string;
  catalogo: boolean;
};

export type PontoPreco = {
  data: string;
  meu: number;
  concorrente: number;
};

export type MonitorPreco = {
  id: string;
  mlb: string;
  produto: string;
  apelido: string;
  sku: string;
  canal: CanalMonitorado;
  link: string;
  /** Preço que estou praticando na varredura mais recente. */
  meuPreco: number;
  /** Menor preço encontrado entre os concorrentes rastreados. */
  menorConcorrente: number;
  /** (meu − concorrente) / concorrente × 100. Positivo = estou mais caro. */
  diferenca: number;
  vendedor: string;
  /** Avisar quando o concorrente ficar N% abaixo do meu preço. */
  regraPct: number;
  alertaAberto: boolean;
  ativo: boolean;
  frequencia: string;
  ultimaVerificacao: string;
  serie: PontoPreco[];
  /** Série de 30 dias do menor concorrente — alimenta o sparkline da tabela. */
  spark: number[];
  concorrentes: ConcorrenteRastreado[];
};

type ConfigPreco = {
  mlb: string;
  apelido: string;
  canal: CanalMonitorado;
  meuPreco: number;
  menorConcorrente: number;
  vendedor: string;
  regraPct: number;
  frequencia: string;
  ultimaVerificacao: string;
  ativo: boolean;
  rivais: number;
};

const CONFIG_PRECO: ConfigPreco[] = [
  { mlb: "MLB1284471029", apelido: "Casal Premium 138", canal: "ml", meuPreco: 1799.0, menorConcorrente: 1649.0, vendedor: "SonoBom Store", regraPct: 5, frequencia: "a cada 3 h", ultimaVerificacao: "há 12 min", ativo: true, rivais: 4 },
  { mlb: "MLB1195033884", apelido: "Solteiro D33", canal: "ml", meuPreco: 649.9, menorConcorrente: 679.9, vendedor: "MegaLar Oficial", regraPct: 5, frequencia: "a cada 6 h", ultimaVerificacao: "há 41 min", ativo: true, rivais: 3 },
  { mlb: "MLB1338920117", apelido: "Box Baú Bipartido", canal: "shopee", meuPreco: 2249.0, menorConcorrente: 2098.0, vendedor: "CasaViva Shop", regraPct: 5, frequencia: "a cada 3 h", ultimaVerificacao: "há 1 h", ativo: true, rivais: 3 },
  { mlb: "MLB1402118765", apelido: "Travesseiro Nasa", canal: "shopee", meuPreco: 129.9, menorConcorrente: 134.9, vendedor: "OutletDoLar", regraPct: 8, frequencia: "a cada 12 h", ultimaVerificacao: "há 2 h", ativo: true, rivais: 5 },
  { mlb: "MLB1290774310", apelido: "Queen Látex", canal: "amazon", meuPreco: 3199.0, menorConcorrente: 3349.0, vendedor: "Prime Colchões", regraPct: 5, frequencia: "a cada 6 h", ultimaVerificacao: "há 2 h", ativo: true, rivais: 2 },
  { mlb: "MLB1187446620", apelido: "Protetor Casal", canal: "amazon", meuPreco: 89.9, menorConcorrente: 79.9, vendedor: "Loja Reposta", regraPct: 10, frequencia: "a cada 12 h", ultimaVerificacao: "há 3 h", ativo: true, rivais: 4 },
  { mlb: "MLB1451009238", apelido: "Base Box Solteiro", canal: "site", meuPreco: 549.0, menorConcorrente: 559.0, vendedor: "DormeBem Distribuidora", regraPct: 5, frequencia: "diária", ultimaVerificacao: "há 5 h", ativo: true, rivais: 2 },
  { mlb: "MLB1219847766", apelido: "Ortopédico D45", canal: "ml", meuPreco: 1349.0, menorConcorrente: 1279.0, vendedor: "NoiteFeliz Store", regraPct: 5, frequencia: "a cada 3 h", ultimaVerificacao: "há 18 min", ativo: true, rivais: 4 },
  { mlb: "MLB1478330951", apelido: "Edredom Dupla Face", canal: "shopee", meuPreco: 199.9, menorConcorrente: 189.9, vendedor: "ConfortMax Oficial", regraPct: 3, frequencia: "a cada 6 h", ultimaVerificacao: "há 1 h", ativo: true, rivais: 3 },
  { mlb: "MLB1301226488", apelido: "Box Conjugada Premium", canal: "ml", meuPreco: 2649.0, menorConcorrente: 2699.0, vendedor: "Prime Colchões", regraPct: 5, frequencia: "a cada 6 h", ultimaVerificacao: "há 47 min", ativo: true, rivais: 2 },
  { mlb: "MLB1425667109", apelido: "Colchonete Dobrável", canal: "site", meuPreco: 179.9, menorConcorrente: 174.9, vendedor: "Direto da Fábrica", regraPct: 5, frequencia: "diária", ultimaVerificacao: "ontem", ativo: false, rivais: 3 },
  { mlb: "MLB1366588412", apelido: "Kit 2 Travesseiros", canal: "amazon", meuPreco: 149.9, menorConcorrente: 139.9, vendedor: "MegaLar Oficial", regraPct: 5, frequencia: "a cada 12 h", ultimaVerificacao: "há 4 h", ativo: true, rivais: 4 },
];

const OUTROS_VENDEDORES = [
  "SonoBom Store",
  "MegaLar Oficial",
  "CasaViva Shop",
  "DormeBem Distribuidora",
  "Prime Colchões",
  "OutletDoLar",
  "NoiteFeliz Store",
  "ConfortMax Oficial",
  "Loja Reposta",
  "Direto da Fábrica",
];

const VISTO_EM = ["há 12 min", "há 38 min", "há 1 h", "há 2 h", "há 4 h", "há 7 h"];

function serieDePreco(
  cfg: ConfigPreco,
  r: () => number
): { serie: PontoPreco[]; spark: number[] } {
  // Meu preço muda em degraus (reajuste), o concorrente oscila todo dia.
  const degrau = Math.floor(8 + r() * 10);
  const meuAntes = c2(cfg.meuPreco * (1 + (0.03 + r() * 0.05)));
  const quedaRival = 0.03 + r() * 0.07;
  const fase = r() * 6;

  const serie: PontoPreco[] = DIAS_30.map((data, k) => {
    const t = k / (DIAS_30.length - 1);
    const meu = k < degrau ? meuAntes : cfg.meuPreco;
    const ruido = (r() - 0.5) * 0.012;
    const onda = Math.sin(k / 3.6 + fase) * 0.011;
    const concorrente = c2(
      cfg.menorConcorrente * (1 + (1 - t) * quedaRival + onda + ruido)
    );
    return { data, meu: c2(meu), concorrente };
  });

  // A varredura mais recente é a verdade da tabela — crava o último ponto.
  serie[serie.length - 1] = {
    data: DIAS_30[DIAS_30.length - 1],
    meu: cfg.meuPreco,
    concorrente: cfg.menorConcorrente,
  };

  return { serie, spark: serie.map((p) => p.concorrente) };
}

function concorrentesDe(
  cfg: ConfigPreco,
  r: () => number
): ConcorrenteRastreado[] {
  const lista: ConcorrenteRastreado[] = [
    {
      vendedor: cfg.vendedor,
      preco: cfg.menorConcorrente,
      reputacao: "Verde",
      reputacaoDetalhe: "98% de aprovação",
      frete: cfg.menorConcorrente >= 79 ? "Grátis" : "R$ 22,90",
      estoque: "Disponível",
      visto: cfg.ultimaVerificacao,
      catalogo: true,
    },
  ];

  const pool = OUTROS_VENDEDORES.filter((v) => v !== cfg.vendedor);
  for (let i = 1; i < cfg.rivais; i++) {
    const preco = c2(cfg.menorConcorrente * (1 + i * 0.028 + r() * 0.035));
    const rep = r();
    lista.push({
      vendedor: pool[(semente(cfg.mlb) + i * 3) % pool.length],
      preco,
      reputacao: rep > 0.72 ? "Verde" : rep > 0.28 ? "Amarelo" : "Vermelho",
      reputacaoDetalhe:
        rep > 0.72
          ? `${(94 + Math.floor(r() * 6))}% de aprovação`
          : rep > 0.28
            ? `${(84 + Math.floor(r() * 8))}% de aprovação`
            : `${(66 + Math.floor(r() * 12))}% de aprovação`,
      frete: preco >= 79 ? "Grátis" : `R$ ${(18 + Math.floor(r() * 14))},90`,
      estoque: r() > 0.18 ? "Disponível" : "Últimas unidades",
      visto: VISTO_EM[(semente(cfg.mlb) + i) % VISTO_EM.length],
      catalogo: r() > 0.55,
    });
  }

  return lista.sort((a, b) => a.preco - b.preco);
}

export const MONITORES_PRECO: MonitorPreco[] = CONFIG_PRECO.map((cfg, i) => {
  const base = PORMLB.get(cfg.mlb)!;
  const r = rng(semente(cfg.mlb) + i);
  const { serie, spark } = serieDePreco(cfg, r);
  const diferenca = +(
    ((cfg.meuPreco - cfg.menorConcorrente) / cfg.menorConcorrente) *
    100
  ).toFixed(1);

  return {
    id: `mp-${i + 1}`,
    mlb: cfg.mlb,
    produto: base.titulo,
    apelido: cfg.apelido,
    sku: base.sku,
    canal: cfg.canal,
    link: `https://produto.${cfg.canal === "site" ? "lojapropria.com.br" : cfg.canal === "ml" ? "mercadolivre.com.br" : cfg.canal + ".com.br"}/${cfg.mlb.toLowerCase()}`,
    meuPreco: cfg.meuPreco,
    menorConcorrente: cfg.menorConcorrente,
    diferenca,
    vendedor: cfg.vendedor,
    regraPct: cfg.regraPct,
    alertaAberto: cfg.ativo && diferenca >= cfg.regraPct,
    ativo: cfg.ativo,
    frequencia: cfg.frequencia,
    ultimaVerificacao: cfg.ultimaVerificacao,
    serie,
    spark,
    concorrentes: concorrentesDe(cfg, r),
  };
});

/* ── alertas abertos, derivados da última varredura ─────────── */

export type AlertaMonitoramento = {
  id: string;
  severidade: "warn" | "down" | "info";
  titulo: string;
  detalhe: string;
  quando: string;
};

export const ALERTAS_PRECO: AlertaMonitoramento[] = MONITORES_PRECO.filter(
  (m) => m.alertaAberto
)
  .sort((a, b) => b.diferenca - a.diferenca)
  .slice(0, 4)
  .map((m) => ({
    id: `alp-${m.id}`,
    severidade: m.diferenca >= 8 ? "down" : "warn",
    titulo: `${m.vendedor} está ${m.diferenca.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}% abaixo em ${m.apelido}`,
    detalhe: `${m.mlb} · regra de ${m.regraPct}% ultrapassada na varredura de ${m.ultimaVerificacao}`,
    quando: m.ultimaVerificacao,
  }));

export const RESUMO_PRECO = {
  monitorados: MONITORES_PRECO.length,
  ativos: MONITORES_PRECO.filter((m) => m.ativo).length,
  alertas: MONITORES_PRECO.filter((m) => m.alertaAberto).length,
  abaixo: MONITORES_PRECO.filter((m) => m.diferenca < 0).length,
  concorrentes: MONITORES_PRECO.reduce((s, m) => s + m.concorrentes.length, 0),
  ultimaVarredura: "há 12 min",
  proximaVarredura: "em 2 h 48 min",
  /** Varreduras concluídas por dia nos últimos 12 dias — sparkline do tile. */
  varreduras: [38, 41, 40, 44, 42, 47, 45, 48, 46, 51, 49, 54],
};

/* ══════════════════════════════════════════════════════════════
   B) BUSCA FRETE
   ══════════════════════════════════════════════════════════════ */

export const MODALIDADES = ["Full", "Coleta", "Agência", "Flex"] as const;
export type Modalidade = (typeof MODALIDADES)[number];

export const REGIOES = [
  "Norte",
  "Nordeste",
  "Centro-Oeste",
  "Sudeste",
  "Sul",
] as const;
export type Regiao = (typeof REGIOES)[number];

export type RegiaoKey = "norte" | "nordeste" | "centroOeste" | "sudeste" | "sul";

export const REGIAO_KEY: Record<Regiao, RegiaoKey> = {
  Norte: "norte",
  Nordeste: "nordeste",
  "Centro-Oeste": "centroOeste",
  Sudeste: "sudeste",
  Sul: "sul",
};

export const REGIAO_COR: Record<Regiao, string> = {
  Norte: "var(--s6)",
  Nordeste: "var(--s3)",
  "Centro-Oeste": "var(--s4)",
  Sudeste: "var(--s1)",
  Sul: "var(--s2)",
};

export type FaixaCep = {
  id: string;
  faixa: string;
  rotulo: string;
  uf: string;
  regiao: Regiao;
};

export const FAIXAS_CEP: FaixaCep[] = [
  { id: "sp-cap", faixa: "01000-000 a 05999-999", rotulo: "São Paulo capital", uf: "SP", regiao: "Sudeste" },
  { id: "sp-int", faixa: "13000-000 a 19999-999", rotulo: "Interior de SP", uf: "SP", regiao: "Sudeste" },
  { id: "rj", faixa: "20000-000 a 26600-999", rotulo: "Rio de Janeiro", uf: "RJ", regiao: "Sudeste" },
  { id: "mg", faixa: "30000-000 a 39999-999", rotulo: "Minas Gerais", uf: "MG", regiao: "Sudeste" },
  { id: "ba", faixa: "40000-000 a 48999-999", rotulo: "Bahia", uf: "BA", regiao: "Nordeste" },
  { id: "pe", faixa: "50000-000 a 56999-999", rotulo: "Pernambuco", uf: "PE", regiao: "Nordeste" },
  { id: "ce", faixa: "60000-000 a 63999-999", rotulo: "Ceará", uf: "CE", regiao: "Nordeste" },
  { id: "pa", faixa: "66000-000 a 68899-999", rotulo: "Pará", uf: "PA", regiao: "Norte" },
  { id: "am", faixa: "69000-000 a 69299-999", rotulo: "Amazonas", uf: "AM", regiao: "Norte" },
  { id: "df", faixa: "70000-000 a 73699-999", rotulo: "Distrito Federal", uf: "DF", regiao: "Centro-Oeste" },
  { id: "mt", faixa: "78000-000 a 78899-999", rotulo: "Mato Grosso", uf: "MT", regiao: "Centro-Oeste" },
  { id: "pr", faixa: "80000-000 a 87999-999", rotulo: "Paraná", uf: "PR", regiao: "Sul" },
  { id: "rs", faixa: "90000-000 a 99999-999", rotulo: "Rio Grande do Sul", uf: "RS", regiao: "Sul" },
];

/** Custo e prazo de referência da região, antes de peso e modalidade. */
const BASE_REGIAO: Record<Regiao, { frete: number; prazo: number }> = {
  Sudeste: { frete: 24.9, prazo: 2 },
  Sul: { frete: 32.5, prazo: 4 },
  "Centro-Oeste": { frete: 38.9, prazo: 5 },
  Nordeste: { frete: 46.2, prazo: 7 },
  Norte: { frete: 58.7, prazo: 11 },
};

const FATOR_MODALIDADE: Record<Modalidade, { frete: number; prazo: number }> = {
  Full: { frete: 0.92, prazo: -1 },
  Coleta: { frete: 1.0, prazo: 0 },
  Agência: { frete: 1.09, prazo: 1 },
  Flex: { frete: 0.84, prazo: -2 },
};

type ProdutoFrete = { mlb: string; peso: number; classe: "Leve" | "Médio" | "Volumoso" };

const PRODUTOS_FRETE: ProdutoFrete[] = [
  { mlb: "MLB1284471029", peso: 2.7, classe: "Volumoso" },
  { mlb: "MLB1195033884", peso: 2.1, classe: "Volumoso" },
  { mlb: "MLB1338920117", peso: 3.2, classe: "Volumoso" },
  { mlb: "MLB1402118765", peso: 0.6, classe: "Leve" },
  { mlb: "MLB1290774310", peso: 3.6, classe: "Volumoso" },
  { mlb: "MLB1187446620", peso: 0.5, classe: "Leve" },
  { mlb: "MLB1451009238", peso: 2.2, classe: "Volumoso" },
  { mlb: "MLB1478330951", peso: 0.9, classe: "Médio" },
];

export type MonitorFrete = {
  id: string;
  mlb: string;
  produto: string;
  sku: string;
  classe: ProdutoFrete["classe"];
  canal: CanalMonitorado;
  modalidade: Modalidade;
  faixaId: string;
  faixa: string;
  faixaRotulo: string;
  uf: string;
  regiao: Regiao;
  freteAtual: number;
  freteAnterior: number;
  /** (atual − anterior) / anterior × 100. Positivo = frete subiu. */
  variacao: number;
  prazoDias: number;
  prazoAnterior: number;
  ultimaVerificacao: string;
};

const VERIFICADO_EM = [
  "há 22 min",
  "há 1 h",
  "há 2 h",
  "há 3 h",
  "há 5 h",
  "há 8 h",
  "ontem",
];

export const MONITORES_FRETE: MonitorFrete[] = PRODUTOS_FRETE.flatMap((p, i) => {
  const base = PORMLB.get(p.mlb)!;
  const r = rng(semente(p.mlb) + 977);

  return [0, 1, 2].map((j) => {
    const faixa = FAIXAS_CEP[(i * 3 + j * 4) % FAIXAS_CEP.length];
    const canal = CANAIS_MONITORADOS[(i + j) % CANAIS_MONITORADOS.length];
    const modalidade = MODALIDADES[(i * 2 + j) % MODALIDADES.length];
    const bs = BASE_REGIAO[faixa.regiao];
    const fm = FATOR_MODALIDADE[modalidade];

    const freteAtual = c2(
      bs.frete * fm.frete * (0.62 + p.peso * 0.31) * (0.95 + r() * 0.12)
    );
    const variacao = +(((r() - 0.42) * 17)).toFixed(1);
    const freteAnterior = c2(freteAtual / (1 + variacao / 100));

    const prazoDias = Math.max(1, bs.prazo + fm.prazo + Math.floor(r() * 3));
    const prazoAnterior = Math.max(
      1,
      prazoDias + (r() > 0.72 ? 1 : r() < 0.14 ? -1 : 0)
    );

    return {
      id: `mf-${i + 1}-${j + 1}`,
      mlb: p.mlb,
      produto: base.titulo,
      sku: base.sku,
      classe: p.classe,
      canal,
      modalidade,
      faixaId: faixa.id,
      faixa: faixa.faixa,
      faixaRotulo: faixa.rotulo,
      uf: faixa.uf,
      regiao: faixa.regiao,
      freteAtual,
      freteAnterior,
      variacao,
      prazoDias,
      prazoAnterior,
      ultimaVerificacao: VERIFICADO_EM[(i * 3 + j) % VERIFICADO_EM.length],
    };
  });
});

/* ── frete médio por região, 12 semanas ─────────────────────── */

export type SemanaFrete = {
  semana: string;
  norte: number;
  nordeste: number;
  centroOeste: number;
  sudeste: number;
  sul: number;
};

const SEMANAS_12 = [
  "S23", "S24", "S25", "S26", "S27", "S28",
  "S29", "S30", "S31", "S32", "S33", "S34",
];

export const FRETE_12_SEMANAS: SemanaFrete[] = (() => {
  const r = rng(20260825);
  const inicio: Record<RegiaoKey, number> = {
    norte: 71.4,
    nordeste: 56.8,
    centroOeste: 47.2,
    sudeste: 29.6,
    sul: 38.4,
  };
  const inclinacao: Record<RegiaoKey, number> = {
    norte: 0.94,
    nordeste: 0.61,
    centroOeste: 0.38,
    sudeste: 0.12,
    sul: 0.29,
  };

  return SEMANAS_12.map((semana, k) => {
    const ponto = { semana } as SemanaFrete;
    (Object.keys(inicio) as RegiaoKey[]).forEach((key) => {
      const onda = Math.sin(k / 2.7 + inicio[key]) * (inicio[key] * 0.012);
      const ruido = (r() - 0.5) * (inicio[key] * 0.016);
      ponto[key] = c2(inicio[key] + inclinacao[key] * k + onda + ruido);
    });
    return ponto;
  });
})();

/* ── quadro das 5 regiões ───────────────────────────────────── */

export type ResumoRegiao = {
  regiao: Regiao;
  key: RegiaoKey;
  cor: string;
  freteMedio: number;
  prazoMedio: number;
  variacao: number;
  /** Participação nos pedidos do mês, em %. */
  participacao: number;
  faixas: number;
  ufs: string[];
  linhas: number;
  /** Frete grátis bancado pelo vendedor, em % dos pedidos da região. */
  subsidiado: number;
};

const PARTICIPACAO: Record<Regiao, number> = {
  Sudeste: 52.4,
  Nordeste: 17.8,
  Sul: 15.1,
  "Centro-Oeste": 9.2,
  Norte: 5.5,
};

const SUBSIDIADO: Record<Regiao, number> = {
  Sudeste: 71.2,
  Sul: 58.4,
  "Centro-Oeste": 44.6,
  Nordeste: 31.9,
  Norte: 18.3,
};

export const RESUMO_REGIOES: ResumoRegiao[] = REGIOES.map((regiao) => {
  const linhas = MONITORES_FRETE.filter((m) => m.regiao === regiao);
  const key = REGIAO_KEY[regiao];
  const primeira = FRETE_12_SEMANAS[0][key];
  const ultima = FRETE_12_SEMANAS[FRETE_12_SEMANAS.length - 1][key];
  const faixas = FAIXAS_CEP.filter((f) => f.regiao === regiao);

  const freteMedio = linhas.length
    ? c2(linhas.reduce((s, m) => s + m.freteAtual, 0) / linhas.length)
    : ultima;
  const prazoMedio = linhas.length
    ? +(linhas.reduce((s, m) => s + m.prazoDias, 0) / linhas.length).toFixed(1)
    : BASE_REGIAO[regiao].prazo;

  return {
    regiao,
    key,
    cor: REGIAO_COR[regiao],
    freteMedio,
    prazoMedio,
    variacao: +(((ultima - primeira) / primeira) * 100).toFixed(1),
    participacao: PARTICIPACAO[regiao],
    faixas: faixas.length,
    ufs: faixas.map((f) => f.uf),
    linhas: linhas.length,
    subsidiado: SUBSIDIADO[regiao],
  };
});

export const RESUMO_FRETE = {
  produtos: PRODUTOS_FRETE.length,
  linhas: MONITORES_FRETE.length,
  faixas: FAIXAS_CEP.length,
  freteMedio: c2(
    MONITORES_FRETE.reduce((s, m) => s + m.freteAtual, 0) /
      MONITORES_FRETE.length
  ),
  freteMedioAnterior: c2(
    MONITORES_FRETE.reduce((s, m) => s + m.freteAnterior, 0) /
      MONITORES_FRETE.length
  ),
  prazoMedio: +(
    MONITORES_FRETE.reduce((s, m) => s + m.prazoDias, 0) /
    MONITORES_FRETE.length
  ).toFixed(1),
  ultimaVarredura: "há 22 min",
  /** Frete médio geral nas 12 semanas — sparkline do tile. */
  serieMedia: FRETE_12_SEMANAS.map((s) =>
    c2((s.norte + s.nordeste + s.centroOeste + s.sudeste + s.sul) / 5)
  ),
};

export const VARIACAO_MES = +(
  ((RESUMO_FRETE.freteMedio - RESUMO_FRETE.freteMedioAnterior) /
    RESUMO_FRETE.freteMedioAnterior) *
  100
).toFixed(1);
