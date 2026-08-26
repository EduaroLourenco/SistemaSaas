/**
 * Central de Promoções — campanhas e itens elegíveis.
 *
 * Regra real do Mercado Livre, espelhada aqui:
 *
 *  • Campanha COM redução de tarifa (SALE_FEE):
 *    a comissão cai durante a vigência. Calcula-se a comissão considerada
 *    (comissão padrão − redução, com piso de 4,5%), busca-se o preço de
 *    tabela nessa comissão e decide-se Participar / Não participar.
 *    Aprova quando o preço da oferta fica em pelo menos 95% do preço de tabela.
 *
 *  • Campanha SEM redução de tarifa:
 *    a comissão continua a padrão (11,5% clássico, 16,5% premium) e o que se
 *    faz é RECALCULAR o preço final para preservar a margem. Reprova quando o
 *    preço recalculado passa do preço original ou quando falta base do anúncio.
 *
 * Tudo determinístico (PRNG semeado) — nada de Math.random no módulo.
 */

export type TipoAnuncio = "Clássico" | "Premium";
export type StatusItem = "Aprovado" | "Reprovado";
export type Decisao = "participar" | "fora";

export type Campanha = {
  id: string;
  nome: string;
  /** ISO da abertura */
  inicio: string;
  /** ISO do encerramento */
  fim: string;
  /** "01/08 – 30/09" */
  vigencia: string;
  /** dias até o encerramento, contados a partir de HOJE */
  diasRestantes: number;
  /** campanha com redução de tarifa (SALE_FEE) */
  temReducao: boolean;
  /** redução média de comissão, em pontos percentuais (0 quando não há) */
  reducaoMedia: number;
  /** desconto médio pedido pela campanha, em % */
  descontoMedio: number;
  /** quantidade de itens elegíveis */
  elegiveis: number;
  /** o que a campanha pede da operação, em uma linha */
  resumo: string;
};

export type ItemCampanha = {
  id: string;
  campanhaId: string;
  mlb: string;
  sku: string;
  titulo: string;
  tipo: TipoAnuncio;
  /** preço cheio praticado hoje */
  precoOriginal: number;
  /** preço que preserva a margem alvo na comissão considerada — 0 quando não há base */
  precoTabela: number;
  /** preço final da oferta: o proposto pelo ML (com redução) ou o recalculado (sem redução) */
  precoOferta: number;
  /** desconto sobre o preço original, em % */
  desconto: number;
  /** comissão padrão do tipo de anúncio, em % */
  comissaoPadrao: number;
  /** comissão considerada depois da redução, em % */
  comissao: number;
  /** redução de tarifa por venda, em R$; null quando a campanha não reduz */
  tarifaReduzida: number | null;
  /** margem de contribuição no preço da oferta, em % — 0 quando não há base */
  margem: number;
  /** margem que o preço de tabela entrega, em % */
  margemAlvo: number;
  /** lucro de contribuição por unidade, em R$ */
  lucroUnitario: number;
  /** unidades esperadas na vigência */
  giro: number;
  status: StatusItem;
  /** vazio quando aprovado */
  motivo: string;
  /** decisão já registrada na conta; null = ainda sem decisão */
  decisaoInicial: Decisao | null;
};

/* ══ Data de referência ══════════════════════════════════════ */

export const HOJE = "2026-08-25";

const DIA = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const diasAte = (iso: string) => Math.round((ms(iso) - ms(HOJE)) / DIA);

function ddmm(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

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

const rnd = prng(20260825);
const entre = (a: number, b: number) => a + rnd() * (b - a);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/* ══ Catálogo elegível ═══════════════════════════════════════ */

type Produto = {
  mlb: string;
  sku: string;
  titulo: string;
  tipo: TipoAnuncio;
  /** custo do produto */
  custo: number;
  /** frete e embalagem por venda */
  frete: number;
  /** preço cheio praticado */
  preco: number;
  /** margem de contribuição alvo, em % */
  alvo: number;
  /** anúncio sem linha na aba Base MLB — reprova direto */
  semBase?: boolean;
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
  semBase = false
): Produto {
  return { mlb, sku, titulo, tipo, custo, frete, preco, alvo, semBase };
}

const PRODUTOS: Produto[] = [
  p("MLB1284471029", "CM-PRM-138", "Colchão Casal Molas Ensacadas Premium 138x188", "Premium", 742, 168, 1799.0, 21),
  p("MLB1195033884", "CS-D33-088", "Colchão Solteiro Espuma D33 88x188", "Clássico", 268, 96, 649.9, 24),
  p("MLB1338920117", "CB-BAU-138", "Cama Box Baú Casal Bipartido", "Premium", 946, 214, 2249.0, 20),
  p("MLB1402118765", "TV-NASA-50", "Travesseiro Viscoelástico Nasa 50x70", "Clássico", 41, 19, 129.9, 27),
  p("MLB1290774310", "CQ-LTX-158", "Colchão Queen Híbrido Látex 158x198", "Premium", 1348, 246, 3199.0, 19),
  p("MLB1187446620", "PC-IMP-138", "Protetor de Colchão Impermeável Casal", "Clássico", 28, 16, 89.9, 26),
  p("MLB1451009238", "BB-SIN-088", "Base Box Solteiro Sintético", "Clássico", 214, 88, 549.0, 23, true),
  p("MLB1366588412", "KT-PLU-002", "Kit 2 Travesseiros Pluma Sintética", "Clássico", 68, 26, 139.9, 28),
  p("MLB1219847766", "CM-D45-138", "Colchão Casal Ortopédico D45 138x188", "Premium", 548, 152, 1349.0, 22),
  p("MLB1478330951", "ED-MIC-138", "Edredom Casal Dupla Face Microfibra", "Clássico", 68, 24, 199.9, 25),
  p("MLB1301226488", "CB-CJG-138", "Cama Box Casal Conjugada Premium", "Premium", 1092, 226, 2649.0, 20),
  p("MLB1425667109", "CD-DOB-088", "Colchonete Dobrável Solteiro", "Clássico", 62, 26, 179.9, 24),
  p("MLB1512338040", "CQ-MOL-158", "Colchão Queen Molas Superlastic 158x198", "Premium", 1024, 232, 2489.0, 21),
  p("MLB1534907712", "JG-PER-200", "Jogo de Cama Casal 200 Fios 4 Peças", "Clássico", 74, 26, 219.9, 26),
  p("MLB1548112906", "TV-CER-50", "Travesseiro Cervical Alto Perfil 50x70", "Clássico", 53, 20, 169.9, 26),
  p("MLB1560332188", "CB-BAU-158", "Cama Box Baú Queen Bipartido", "Premium", 1186, 248, 2899.0, 20),
  p("MLB1571904455", "CM-EUR-138", "Colchão Casal Euro Pillow 138x188", "Premium", 812, 176, 1949.0, 21),
  p("MLB1583277019", "PT-ANT-090", "Protetor de Travesseiro Antialérgico Par", "Clássico", 19, 14, 69.9, 27),
  p("MLB1594820366", "CS-MOL-088", "Colchão Solteiro Molas Bonnel 88x188", "Clássico", 384, 118, 899.0, 23),
  p("MLB1602445177", "BB-BAU-088", "Base Box Baú Solteiro Suede", "Clássico", 306, 104, 749.0, 23, true),
  p("MLB1618037241", "CQ-D45-158", "Colchão Queen Ortopédico D45 158x198", "Premium", 872, 198, 2099.0, 21),
  p("MLB1627719508", "MA-CAP-138", "Manta Casal Microfibra Toque de Seda", "Clássico", 44, 20, 139.9, 26),
  p("MLB1639108833", "CK-MOL-193", "Colchão King Molas Ensacadas 193x203", "Premium", 1642, 288, 3899.0, 19, true),
  p("MLB1644920716", "TV-LAT-50", "Travesseiro Látex Natural 50x70", "Premium", 118, 32, 329.9, 24),
  p("MLB1657283094", "CB-CJG-158", "Cama Box Queen Conjugada Reforçada", "Premium", 1284, 254, 3049.0, 20),
  p("MLB1663550281", "JG-PER-400", "Jogo de Cama Queen 400 Fios 4 Peças", "Clássico", 168, 38, 349.9, 30),
  p("MLB1671448902", "CS-EUR-088", "Colchão Solteiro Euro Pillow 88x188", "Clássico", 428, 124, 999.0, 23),
  p("MLB1688027365", "PC-IMP-158", "Protetor de Colchão Impermeável Queen", "Clássico", 36, 18, 109.9, 26),
  p("MLB1694116470", "CD-VIS-088", "Colchonete Viscoelástico Solteiro", "Clássico", 96, 30, 259.9, 25),
  p("MLB1701839558", "CK-BAU-193", "Cama Box Baú King Bipartido Linho", "Premium", 1728, 296, 4199.0, 19),
];

/* ══ Motor de decisão ════════════════════════════════════════ */

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

function lucroDe(prod: Produto, preco: number, comissao: number) {
  return preco - prod.custo - prod.frete - (preco * comissao) / 100;
}

const comissaoPadraoDe = (t: TipoAnuncio) => (t === "Premium" ? 16.5 : 11.5);

/* ══ Campanhas ═══════════════════════════════════════════════ */

type Def = {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  temReducao: boolean;
  /** redução de comissão, em pontos percentuais */
  reducao: [number, number];
  /** desconto pedido sobre o preço original, em % */
  desconto: [number, number];
  /** fatia do catálogo elegível */
  fatia: [number, number];
  resumo: string;
};

const DEFS: Def[] = [
  {
    id: "melhor-dia",
    nome: "O melhor de todos os dias",
    inicio: "2026-08-01",
    fim: "2026-09-30",
    temReducao: false,
    reducao: [0, 0],
    desconto: [9, 17],
    fatia: [0, 8],
    resumo: "Sem redução de tarifa — o preço final precisa ser recalculado.",
  },
  {
    id: "melhor-dia-reducao",
    nome: "O melhor de todos os dias com redução nas suas tarifas",
    inicio: "2026-08-10",
    fim: "2026-09-09",
    temReducao: true,
    reducao: [3.5, 6],
    desconto: [12, 30],
    fatia: [8, 15],
    resumo: "Redução de tarifa no período — decidir item a item.",
  },
  {
    id: "ofertas-do-dia",
    nome: "Ofertas do Dia",
    inicio: "2026-08-24",
    fim: "2026-08-28",
    temReducao: true,
    reducao: [4, 7],
    desconto: [22, 42],
    fatia: [15, 20],
    resumo: "Vitrine curta, desconto agressivo e tarifa reduzida.",
  },
  {
    id: "semana-consumidor",
    nome: "Semana do Consumidor",
    inicio: "2026-08-15",
    fim: "2026-08-30",
    temReducao: false,
    reducao: [0, 0],
    desconto: [11, 20],
    fatia: [20, 26],
    resumo: "Sem redução de tarifa — recalcular para não comer a margem.",
  },
  {
    id: "liquida-casa",
    nome: "Liquida Casa",
    inicio: "2026-08-20",
    fim: "2026-09-20",
    temReducao: true,
    reducao: [2.5, 4.5],
    desconto: [16, 30],
    fatia: [26, 30],
    resumo: "Redução modesta de tarifa, foco em girar estoque parado.",
  },
];

/* ── construção dos itens ─────────────────────────────────── */

const ITENS_TODOS: ItemCampanha[] = [];

for (const def of DEFS) {
  const lote = PRODUTOS.slice(def.fatia[0], def.fatia[1]);

  for (const prod of lote) {
    const comissaoPadrao = comissaoPadraoDe(prod.tipo);
    const desconto = r1(entre(def.desconto[0], def.desconto[1]));
    const giro = Math.round(entre(6, 74));

    let comissao = comissaoPadrao;
    let tarifaReduzida: number | null = null;
    let precoTabela = 0;
    let precoOferta = 0;
    let status: StatusItem = "Aprovado";
    let motivo = "";

    if (def.temReducao) {
      /* ── Caso A: a campanha reduz a tarifa ─────────────── */
      const reducaoPP = r1(entre(def.reducao[0], def.reducao[1]));
      // comissão considerada: padrão − redução + 0,5 pp de folga, piso de 4,5%
      comissao = Math.max(r1(comissaoPadrao - reducaoPP + 0.5), 4.5);
      precoOferta = r2(prod.preco * (1 - desconto / 100));
      tarifaReduzida = r2((reducaoPP / 100) * precoOferta);

      if (prod.semBase) {
        precoTabela = 0;
        status = "Reprovado";
        motivo = "MLB fora da aba Base MLB";
      } else {
        precoTabela = precoDeTabela(prod, comissao);
        if (precoOferta < precoTabela * 0.95) {
          status = "Reprovado";
          const abaixo = ((precoTabela - precoOferta) / precoTabela) * 100;
          motivo = `preço da oferta ${r1(abaixo)
            .toLocaleString("pt-BR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}% abaixo do preço de tabela`;
        }
      }
    } else {
      /* ── Caso B: sem redução, recalcular o preço final ──── */
      if (prod.semBase) {
        precoTabela = 0;
        precoOferta = r2(prod.preco * (1 - desconto / 100));
        status = "Reprovado";
        motivo = "MLB fora da aba Base MLB";
      } else {
        precoTabela = precoDeTabela(prod, comissao);
        precoOferta = precoTabela;
        if (precoOferta > prod.preco) {
          status = "Reprovado";
          motivo = "preço recalculado acima do preço original";
        }
      }
    }

    const descontoReal =
      prod.preco > 0 ? ((prod.preco - precoOferta) / prod.preco) * 100 : 0;

    const margem = prod.semBase ? 0 : margemDe(prod, precoOferta, comissao);
    const lucroUnitario = prod.semBase ? 0 : lucroDe(prod, precoOferta, comissao);

    /* decisão já registrada — parte dos itens ainda está em aberto */
    const sorteio = rnd();
    let decisaoInicial: Decisao | null = null;
    if (sorteio > 0.62) decisaoInicial = status === "Aprovado" ? "participar" : "fora";
    else if (sorteio > 0.42 && status === "Aprovado") decisaoInicial = "participar";

    ITENS_TODOS.push({
      id: `${def.id}-${prod.mlb}`,
      campanhaId: def.id,
      mlb: prod.mlb,
      sku: prod.sku,
      titulo: prod.titulo,
      tipo: prod.tipo,
      precoOriginal: prod.preco,
      precoTabela,
      precoOferta,
      desconto: r1(descontoReal),
      comissaoPadrao,
      comissao,
      tarifaReduzida,
      margem: r1(margem),
      margemAlvo: prod.alvo,
      lucroUnitario: r2(lucroUnitario),
      giro,
      status,
      motivo,
      decisaoInicial,
    });
  }
}

export const ITENS: ItemCampanha[] = ITENS_TODOS;

export const CAMPANHAS: Campanha[] = DEFS.map((def) => {
  const itens = ITENS_TODOS.filter((it) => it.campanhaId === def.id);
  const reducaoMedia = def.temReducao
    ? r1(
        itens.reduce((t, it) => t + (it.comissaoPadrao - it.comissao), 0) /
          Math.max(1, itens.length)
      )
    : 0;
  const descontoMedio = r1(
    itens.reduce((t, it) => t + it.desconto, 0) / Math.max(1, itens.length)
  );
  return {
    id: def.id,
    nome: def.nome,
    inicio: def.inicio,
    fim: def.fim,
    vigencia: `${ddmm(def.inicio)} – ${ddmm(def.fim)}`,
    diasRestantes: diasAte(def.fim),
    temReducao: def.temReducao,
    reducaoMedia,
    descontoMedio,
    elegiveis: itens.length,
    resumo: def.resumo,
  };
});

export const TOTAL_ELEGIVEIS = ITENS_TODOS.length;
