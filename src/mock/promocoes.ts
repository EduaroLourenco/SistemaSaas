/**
 * Processamento de planilhas da Central de Promoções — lote e histórico.
 *
 * O que a operação faz hoje na mão, e que estas telas espelham:
 *
 *  1. baixa da Central de Promoções uma planilha por campanha;
 *  2. cruza cada MLB com a "Fórmula base" (abas Base MLB e custos);
 *  3. decide item a item se participa, e devolve a planilha pronta.
 *
 * Duas regras, conforme a campanha reduza ou não a tarifa:
 *
 *  • COM redução de tarifa (SALE_FEE): a comissão cai durante a vigência.
 *    Calcula-se a comissão considerada (padrão − redução, piso de 4,5%),
 *    busca-se o preço de tabela nessa comissão e compara-se com o preço da
 *    oferta proposto pelo Mercado Livre. Participa quando a oferta fica em
 *    pelo menos 95% do preço de tabela.
 *
 *  • SEM redução de tarifa: a comissão segue a padrão (11,5% clássico,
 *    16,5% premium) e o preço final é RECALCULADO para preservar a margem.
 *    Reprova quando o preço recalculado passa do preço cheio praticado.
 *
 * Linha sem base ou sem custo não é reprovada por regra — vira PENDÊNCIA,
 * sai em branco na planilha e volta para conferência humana.
 *
 * Campos do registro, na origem (Supabase): id, mlb, sku, campanha,
 * preco_tabela, preco_oferta, reducao_tarifa, status_aprovacao,
 * tipo_anuncio, data_processamento. Aqui em camelCase, como no resto do app.
 *
 * Tudo determinístico (PRNG semeado) — nada de Math.random no módulo.
 */

export type TipoAnuncio = "Clássico" | "Premium";
export type StatusAprovacao = "Aprovado" | "Reprovado";
export type Decisao = "Participar" | "Não participar";

export type RegistroPromocao = {
  id: string;
  mlb: string;
  sku: string;
  titulo: string;
  /** id da campanha, para filtro e agrupamento */
  campanhaId: string;
  /** nome da campanha como vem da Central de Promoções */
  campanha: string;
  tipoAnuncio: TipoAnuncio;
  /** preço cheio praticado antes da campanha */
  precoOriginal: number;
  /** preço que preserva a margem alvo na comissão considerada — 0 sem base */
  precoTabela: number;
  /** preço final da oferta: o proposto pelo ML ou o recalculado */
  precoOferta: number;
  /** desconto do preço da oferta sobre o preço cheio, em % */
  desconto: number;
  /** redução de comissão da campanha, em pontos percentuais; null quando não há */
  reducaoTarifa: number | null;
  /** comissão padrão do tipo de anúncio, em % */
  comissaoPadrao: number;
  /** comissão considerada depois da redução, em % */
  comissao: number;
  /** margem de contribuição no preço da oferta, em % — 0 sem base */
  margem: number;
  statusAprovacao: StatusAprovacao;
  decisao: Decisao;
  /** o preço da oferta foi recalculado pelo motor (campanha sem redução) */
  recalculado: boolean;
  /** falta dado na Fórmula base — sai em branco e volta para conferência */
  pendencia: boolean;
  /** vazio quando aprovado */
  motivo: string;
  /** ISO (AAAA-MM-DD) */
  dataProcessamento: string;
  /** "14:32" */
  hora: string;
};

export type CampanhaPromo = {
  id: string;
  nome: string;
  /** rótulo curto, para eixo de gráfico e cartão do mobile */
  curto: string;
  temReducao: boolean;
};

export type PlanilhaLote = {
  nome: string;
  campanhaId: string;
  /** em KB */
  tamanho: number;
};

/* ══ Data de referência ══════════════════════════════════════ */

export const HOJE = "2026-08-25";

/* ══ PRNG semeado ════════════════════════════════════════════ */

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = prng(2026_0825);
const entre = (a: number, b: number) => a + rnd() * (b - a);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

const DIA = 86_400_000;

/** Recua `n` dias a partir de uma data ISO. */
function recuar(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - n * DIA)
    .toISOString()
    .slice(0, 10);
}

const umDecimal = (v: number) =>
  v.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/* ══ Catálogo ════════════════════════════════════════════════ */

type Produto = {
  mlb: string;
  sku: string;
  titulo: string;
  tipo: TipoAnuncio;
  custo: number;
  /** frete e embalagem por venda */
  frete: number;
  /** preço cheio praticado */
  preco: number;
  /** margem de contribuição alvo, em % */
  alvo: number;
  /** anúncio sem linha na aba Base MLB */
  semBase?: boolean;
  /** anúncio na Base MLB, mas sem custo cadastrado */
  semCusto?: boolean;
};

function p(
  mlb: string,
  sku: string,
  titulo: string,
  tipo: TipoAnuncio,
  custo: number,
  frete: number,
  preco: number,
  alvo: number,
  falha?: "semBase" | "semCusto"
): Produto {
  return {
    mlb,
    sku,
    titulo,
    tipo,
    custo,
    frete,
    preco,
    alvo,
    semBase: falha === "semBase",
    semCusto: falha === "semCusto",
  };
}

const PRODUTOS: Produto[] = [
  p("MLB1284471029", "CM-PRM-138", "Colchão Casal Molas Ensacadas Premium 138x188", "Premium", 742, 168, 1799.0, 21),
  p("MLB1195033884", "CS-D33-088", "Colchão Solteiro Espuma D33 88x188", "Clássico", 268, 96, 649.9, 24),
  p("MLB1338920117", "CB-BAU-138", "Cama Box Baú Casal Bipartido", "Premium", 946, 214, 2249.0, 20),
  p("MLB1402118765", "TV-NASA-50", "Travesseiro Viscoelástico Nasa 50x70", "Clássico", 41, 19, 129.9, 27),
  p("MLB1290774310", "CQ-LTX-158", "Colchão Queen Híbrido Látex 158x198", "Premium", 1348, 246, 3199.0, 19),
  p("MLB1187446620", "PC-IMP-138", "Protetor de Colchão Impermeável Casal", "Clássico", 28, 16, 89.9, 26),
  p("MLB1451009238", "BB-SIN-088", "Base Box Solteiro Sintético", "Clássico", 214, 88, 549.0, 23, "semBase"),
  p("MLB1366588412", "KT-PLU-002", "Kit 2 Travesseiros Pluma Sintética", "Clássico", 68, 26, 139.9, 28),
  p("MLB1219847766", "CM-D45-138", "Colchão Casal Ortopédico D45 138x188", "Premium", 548, 152, 1349.0, 22),
  p("MLB1478330951", "ED-MIC-138", "Edredom Casal Dupla Face Microfibra", "Clássico", 68, 24, 199.9, 25),
  p("MLB1301226488", "CB-CJG-138", "Cama Box Casal Conjugada Premium", "Premium", 1092, 226, 2649.0, 20, "semCusto"),
  p("MLB1425667109", "CD-DOB-088", "Colchonete Dobrável Solteiro", "Clássico", 62, 26, 179.9, 24),
  p("MLB1512338040", "CQ-MOL-158", "Colchão Queen Molas Superlastic 158x198", "Premium", 1024, 232, 2489.0, 21),
  p("MLB1534907712", "JG-PER-200", "Jogo de Cama Casal 200 Fios 4 Peças", "Clássico", 74, 26, 219.9, 26),
  p("MLB1548112906", "TV-CER-50", "Travesseiro Cervical Alto Perfil 50x70", "Clássico", 53, 20, 169.9, 26),
  p("MLB1560332188", "CB-BAU-158", "Cama Box Baú Queen Bipartido", "Premium", 1186, 248, 2899.0, 20),
  p("MLB1571904455", "CM-EUR-138", "Colchão Casal Euro Pillow 138x188", "Premium", 812, 176, 1949.0, 21),
  p("MLB1583277019", "PT-ANT-090", "Protetor de Travesseiro Antialérgico Par", "Clássico", 19, 14, 69.9, 27),
  p("MLB1594820366", "CS-MOL-088", "Colchão Solteiro Molas Bonnel 88x188", "Clássico", 384, 118, 899.0, 23),
  p("MLB1602445177", "BB-BAU-088", "Base Box Baú Solteiro Suede", "Clássico", 306, 104, 749.0, 23, "semBase"),
  p("MLB1618037241", "CQ-D45-158", "Colchão Queen Ortopédico D45 158x198", "Premium", 872, 198, 2099.0, 21),
  p("MLB1627719508", "MA-CAP-138", "Manta Casal Microfibra Toque de Seda", "Clássico", 44, 20, 139.9, 26),
];

/* ══ Motor de decisão ════════════════════════════════════════ */

const comissaoPadraoDe = (t: TipoAnuncio) => (t === "Premium" ? 16.5 : 11.5);

/** Preço que entrega a margem alvo na comissão informada. */
function precoDeTabela(prod: Produto, comissao: number) {
  const den = 1 - comissao / 100 - prod.alvo / 100;
  return r2((prod.custo + prod.frete) / den);
}

/** Margem de contribuição, em %, de um preço na comissão informada. */
function margemDe(prod: Produto, preco: number, comissao: number) {
  if (preco <= 0) return 0;
  const liquido = preco - prod.custo - prod.frete - (preco * comissao) / 100;
  return (liquido / preco) * 100;
}

/* ══ Campanhas do período ════════════════════════════════════ */

type Def = {
  id: string;
  nome: string;
  curto: string;
  temReducao: boolean;
  /** redução de comissão, em pontos percentuais */
  reducao: [number, number];
  /** desconto pedido sobre o preço cheio, em % */
  desconto: [number, number];
  /** fatia do catálogo elegível */
  fatia: [number, number];
  /** dias atrás em que a planilha foi processada (0 = hoje) */
  diasAtras: number;
  /** nome do arquivo baixado da Central de Promoções */
  arquivo: string;
  /** em KB */
  tamanho: number;
};

const DEFS: Def[] = [
  {
    id: "ofertas-do-dia",
    nome: "Ofertas do Dia",
    curto: "Ofertas do Dia",
    temReducao: true,
    reducao: [4, 7],
    desconto: [22, 38],
    fatia: [0, 10],
    diasAtras: 0,
    arquivo: "ofertas-do-dia-25-08.xlsx",
    tamanho: 84,
  },
  {
    id: "melhor-dia-reducao",
    nome: "O melhor de todos os dias com redução nas suas tarifas",
    curto: "Melhor dia + tarifa",
    temReducao: true,
    reducao: [3.5, 6],
    desconto: [12, 26],
    fatia: [6, 15],
    diasAtras: 0,
    arquivo: "melhor-de-todos-os-dias-reducao.xlsx",
    tamanho: 71,
  },
  {
    id: "semana-consumidor",
    nome: "Semana do Consumidor",
    curto: "Semana do Consumidor",
    temReducao: false,
    reducao: [0, 0],
    desconto: [11, 20],
    fatia: [12, 20],
    diasAtras: 0,
    arquivo: "semana-do-consumidor.xlsx",
    tamanho: 63,
  },
  {
    id: "liquida-casa",
    nome: "Liquida Casa",
    curto: "Liquida Casa",
    temReducao: true,
    reducao: [2.5, 4.5],
    desconto: [16, 28],
    fatia: [3, 11],
    diasAtras: 4,
    arquivo: "liquida-casa-21-08.xlsx",
    tamanho: 58,
  },
  {
    id: "melhor-dia",
    nome: "O melhor de todos os dias",
    curto: "Melhor de todos os dias",
    temReducao: false,
    reducao: [0, 0],
    desconto: [9, 17],
    fatia: [15, 22],
    diasAtras: 7,
    arquivo: "melhor-de-todos-os-dias-18-08.xlsx",
    tamanho: 49,
  },
];

/* ══ Construção dos registros ════════════════════════════════ */

const TODOS: RegistroPromocao[] = [];

for (const def of DEFS) {
  const lote = PRODUTOS.slice(def.fatia[0], def.fatia[1]);

  lote.forEach((prod, i) => {
    const comissaoPadrao = comissaoPadraoDe(prod.tipo);
    const descontoPedido = r1(entre(def.desconto[0], def.desconto[1]));

    let comissao = comissaoPadrao;
    let reducaoTarifa: number | null = null;
    let precoTabela = 0;
    let precoOferta = 0;
    let status: StatusAprovacao = "Aprovado";
    let motivo = "";
    let pendencia = false;

    const semDado = prod.semBase || prod.semCusto;

    if (def.temReducao) {
      /* ── Caso A: a campanha reduz a tarifa ─────────────── */
      const reducaoPP = r1(entre(def.reducao[0], def.reducao[1]));
      reducaoTarifa = reducaoPP;
      // comissão considerada: padrão − redução + 0,5 pp de folga, piso de 4,5%
      comissao = Math.max(r1(comissaoPadrao - reducaoPP + 0.5), 4.5);
      precoOferta = r2(prod.preco * (1 - descontoPedido / 100));

      if (semDado) {
        precoTabela = 0;
        status = "Reprovado";
        pendencia = true;
        motivo = prod.semBase
          ? "MLB fora da aba Base MLB"
          : "custo não cadastrado na Fórmula base";
      } else {
        precoTabela = precoDeTabela(prod, comissao);
        if (precoOferta < precoTabela * 0.95) {
          status = "Reprovado";
          const abaixo = ((precoTabela - precoOferta) / precoTabela) * 100;
          motivo = `oferta ${umDecimal(r1(abaixo))}% abaixo do preço de tabela`;
        }
      }
    } else {
      /* ── Caso B: sem redução, recalcular o preço final ──── */
      if (semDado) {
        precoTabela = 0;
        precoOferta = r2(prod.preco * (1 - descontoPedido / 100));
        status = "Reprovado";
        pendencia = true;
        motivo = prod.semBase
          ? "MLB fora da aba Base MLB"
          : "custo não cadastrado na Fórmula base";
      } else {
        precoTabela = precoDeTabela(prod, comissao);
        precoOferta = precoTabela;
        if (precoOferta > prod.preco) {
          status = "Reprovado";
          const acima = ((precoOferta - prod.preco) / prod.preco) * 100;
          motivo = `preço recalculado ${umDecimal(r1(acima))}% acima do preço cheio`;
        }
      }
    }

    const desconto =
      prod.preco > 0 ? ((prod.preco - precoOferta) / prod.preco) * 100 : 0;

    // o lote de hoje sai todo de uma vez; os antigos foram rodados em
    // levas de três itens ao longo de dias seguidos
    const diasAtras = def.diasAtras === 0 ? 0 : def.diasAtras + (i % 3);

    // hora de processamento: as planilhas do mesmo lote saem em sequência
    const minutos = 9 * 60 + 12 + def.diasAtras * 37 + i * 3;
    const hora = `${String(Math.floor(minutos / 60) % 24).padStart(2, "0")}:${String(
      minutos % 60
    ).padStart(2, "0")}`;

    TODOS.push({
      id: `${def.id}-${prod.mlb}`,
      mlb: prod.mlb,
      sku: prod.sku,
      titulo: prod.titulo,
      campanhaId: def.id,
      campanha: def.nome,
      tipoAnuncio: prod.tipo,
      precoOriginal: prod.preco,
      precoTabela,
      precoOferta,
      desconto: r1(desconto),
      reducaoTarifa,
      comissaoPadrao,
      comissao,
      margem: semDado ? 0 : r1(margemDe(prod, precoOferta, comissao)),
      statusAprovacao: status,
      decisao: status === "Aprovado" ? "Participar" : "Não participar",
      recalculado: !def.temReducao && !semDado,
      pendencia,
      motivo,
      dataProcessamento: recuar(HOJE, def.diasAtras),
      hora,
    });
  });
}

/* ══ Exports ═════════════════════════════════════════════════ */

/** Histórico completo — 42 registros dos últimos sete dias. */
export const HISTORICO: RegistroPromocao[] = [...TODOS].sort((a, b) =>
  `${b.dataProcessamento} ${b.hora}`.localeCompare(
    `${a.dataProcessamento} ${a.hora}`
  )
);

/** O lote em conferência: as três planilhas subidas hoje. */
export const LOTE: RegistroPromocao[] = TODOS.filter(
  (r) => r.dataProcessamento === HOJE
);

export const CAMPANHAS_PROMO: CampanhaPromo[] = DEFS.map((d) => ({
  id: d.id,
  nome: d.nome,
  curto: d.curto,
  temReducao: d.temReducao,
}));

/** Planilhas da Central de Promoções que compõem o lote de hoje. */
export const PLANILHAS_LOTE: PlanilhaLote[] = DEFS.filter(
  (d) => d.diasAtras === 0
).map((d) => ({ nome: d.arquivo, campanhaId: d.id, tamanho: d.tamanho }));

/** A planilha de referência com Base MLB, custos e margens alvo. */
export const FORMULA_BASE = {
  nome: "formula-base-v12.xlsx",
  tamanho: 412,
  linhasBase: PRODUTOS.filter((x) => !x.semBase).length,
  atualizadaEm: "2026-08-22",
};

/** Arquivo que a etapa 3 entrega. */
export const ARQUIVO_SAIDA = {
  nome: "promocoes-processadas-25-08-2026.xlsx",
  tamanho: 196,
  abas: PLANILHAS_LOTE.length,
};
