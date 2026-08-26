/**
 * Financeiro — dados estáticos das cinco telas.
 * Operação que fatura ~1,2 milhão por mês. Nomes de pessoas e empresas são
 * fictícios. PRNG semeado: nada de Math.random, senão a hidratação quebra.
 */

function prng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const c2 = (v: number) => Math.round(v * 100) / 100;

export const HOJE = "2026-08-25";

export const MESES = [
  "Set/25", "Out/25", "Nov/25", "Dez/25", "Jan/26", "Fev/26",
  "Mar/26", "Abr/26", "Mai/26", "Jun/26", "Jul/26", "Ago/26",
];

/* ══════════════════════════════════════════════════════════════
   A) PAINEL — fluxo de 12 meses
   ══════════════════════════════════════════════════════════════ */

export type MesFluxo = {
  mes: string;
  entradas: number;
  saidas: number;
  resultado: number;
};

export const FLUXO_12_MESES: MesFluxo[] = (() => {
  const r = prng(26_08_2026);
  // sazonalidade: novembro e dezembro puxam, fevereiro afunda
  const peso = [0.94, 0.97, 1.22, 1.31, 0.86, 0.81, 0.95, 0.98, 1.09, 1.01, 1.03, 1.07];
  return MESES.map((mes, i) => {
    const entradas = c2(1_150_000 * peso[i] * (0.97 + r() * 0.06));
    const saidas = c2(entradas * (0.83 + r() * 0.09));
    return { mes, entradas, saidas, resultado: c2(entradas - saidas) };
  });
})();

const ULTIMO = FLUXO_12_MESES[FLUXO_12_MESES.length - 1];
const PENULTIMO = FLUXO_12_MESES[FLUXO_12_MESES.length - 2];

export const RESUMO_PAINEL = {
  entradas: ULTIMO.entradas,
  entradasDelta: c2(((ULTIMO.entradas - PENULTIMO.entradas) / PENULTIMO.entradas) * 100),
  saidas: ULTIMO.saidas,
  saidasDelta: c2(((ULTIMO.saidas - PENULTIMO.saidas) / PENULTIMO.saidas) * 100),
  resultado: ULTIMO.resultado,
  resultadoDelta: c2(
    ((ULTIMO.resultado - PENULTIMO.resultado) / PENULTIMO.resultado) * 100
  ),
  saldoCaixa: 486_240.35,
  aReceber: 742_180.9,
  aPagar: 398_455.12,
  serieResultado: FLUXO_12_MESES.map((m) => m.resultado),
  serieEntradas: FLUXO_12_MESES.map((m) => m.entradas),
};

/* ══════════════════════════════════════════════════════════════
   B) CUSTOS
   ══════════════════════════════════════════════════════════════ */

export type Custo = {
  id: string;
  categoria: string;
  grupo: string;
  cor: string;
  valor: number;
  anterior: number;
  /** % da receita do mês */
  pctReceita: number;
  variacao: number;
  serie: number[];
};

const RECEITA_MES = ULTIMO.entradas;

const DEF_CUSTOS: { id: string; categoria: string; grupo: string; cor: string; pct: number }[] = [
  { id: "mercadoria", categoria: "Compra de mercadoria", grupo: "Mercadoria", cor: "var(--s1)", pct: 41.2 },
  { id: "comissao", categoria: "Comissão de marketplace", grupo: "Canais", cor: "var(--s2)", pct: 14.8 },
  { id: "frete", categoria: "Frete de venda", grupo: "Mercadoria", cor: "var(--s3)", pct: 8.6 },
  { id: "folha", categoria: "Folha de pagamento", grupo: "Pessoal", cor: "var(--s4)", pct: 7.9 },
  { id: "ads", categoria: "Investimento em mídia", grupo: "Canais", cor: "var(--s5)", pct: 5.4 },
  { id: "impostos", categoria: "Impostos", grupo: "Tributário", cor: "var(--s6)", pct: 5.1 },
  { id: "estrutura", categoria: "Aluguel e estrutura", grupo: "Estrutura", cor: "var(--s7)", pct: 2.8 },
  { id: "embalagem", categoria: "Embalagem", grupo: "Mercadoria", cor: "var(--s8)", pct: 1.9 },
  { id: "terceiros", categoria: "Serviços de terceiros", grupo: "Estrutura", cor: "var(--s9)", pct: 1.4 },
  { id: "bancarias", categoria: "Tarifas bancárias", grupo: "Financeiro", cor: "var(--s10)", pct: 0.6 },
];

export const CUSTOS: Custo[] = (() => {
  const r = prng(770_311);
  return DEF_CUSTOS.map((d) => {
    const valor = c2((RECEITA_MES * d.pct) / 100);
    const variacao = c2((r() - 0.42) * 18);
    const anterior = c2(valor / (1 + variacao / 100));
    const serie = MESES.map((_, i) =>
      c2(valor * (0.86 + (i / 11) * 0.2) * (0.96 + r() * 0.08))
    );
    return {
      ...d,
      valor,
      anterior,
      pctReceita: d.pct,
      variacao,
      serie,
    };
  });
})();

export const CUSTO_TOTAL = c2(CUSTOS.reduce((s, c) => s + c.valor, 0));

/** Evolução empilhada: uma linha por mês com uma chave por categoria. */
export const CUSTOS_12_MESES = MESES.map((mes, i) => {
  const linha: Record<string, string | number> = { mes };
  for (const c of CUSTOS) linha[c.id] = c.serie[i];
  return linha;
});

/* ══════════════════════════════════════════════════════════════
   C) FOLHA DE PAGAMENTO
   ══════════════════════════════════════════════════════════════ */

export type Funcionario = {
  id: string;
  nome: string;
  cargo: string;
  setor: string;
  admissao: string;
  salarioBase: number;
  beneficios: number;
  encargos: number;
  custoTotal: number;
};

const PESSOAL: [string, string, string, string, number][] = [
  ["Ana Beatriz Ramos", "Gerente de operações", "Operações", "2022-03-14", 11_800],
  ["Carlos Eduardo Lima", "Analista de marketplace", "Comercial", "2023-01-09", 5_400],
  ["Daniela Moraes", "Analista de marketplace", "Comercial", "2023-07-03", 5_100],
  ["Eduardo Nunes", "Assistente de e-commerce", "Comercial", "2024-02-19", 3_200],
  ["Fernanda Alves", "Coordenadora financeira", "Financeiro", "2021-11-08", 9_600],
  ["Gabriel Souza", "Assistente financeiro", "Financeiro", "2024-05-06", 2_900],
  ["Helena Barros", "Analista de mídia", "Marketing", "2023-04-17", 6_200],
  ["Igor Tavares", "Designer", "Marketing", "2024-08-12", 4_800],
  ["Juliana Prado", "Supervisora de expedição", "Logística", "2022-06-20", 6_800],
  ["Lucas Ferreira", "Auxiliar de expedição", "Logística", "2023-09-11", 2_400],
  ["Marina Castro", "Auxiliar de expedição", "Logística", "2024-01-15", 2_400],
  ["Nelson Rocha", "Conferente", "Logística", "2023-02-27", 2_700],
  ["Patrícia Gomes", "Atendimento ao cliente", "Atendimento", "2023-05-22", 3_100],
  ["Rafael Pinto", "Atendimento ao cliente", "Atendimento", "2024-03-04", 3_000],
  ["Sofia Mendes", "Analista de dados", "Operações", "2024-06-10", 7_400],
];

export const FUNCIONARIOS: Funcionario[] = PESSOAL.map(
  ([nome, cargo, setor, admissao, salarioBase], i) => {
    const beneficios = c2(salarioBase * 0.18 + 420);
    const encargos = c2(salarioBase * 0.68);
    return {
      id: `fun-${i + 1}`,
      nome,
      cargo,
      setor,
      admissao,
      salarioBase,
      beneficios,
      encargos,
      custoTotal: c2(salarioBase + beneficios + encargos),
    };
  }
);

export const SETORES = Array.from(new Set(FUNCIONARIOS.map((f) => f.setor))).sort();

export const FOLHA_POR_SETOR = SETORES.map((setor, i) => {
  const linhas = FUNCIONARIOS.filter((f) => f.setor === setor);
  return {
    setor,
    cor: `var(--s${(i % 10) + 1})`,
    colaboradores: linhas.length,
    custoTotal: c2(linhas.reduce((s, f) => s + f.custoTotal, 0)),
  };
}).sort((a, b) => b.custoTotal - a.custoTotal);

export const RESUMO_FOLHA = {
  colaboradores: FUNCIONARIOS.length,
  custoTotal: c2(FUNCIONARIOS.reduce((s, f) => s + f.custoTotal, 0)),
  salarios: c2(FUNCIONARIOS.reduce((s, f) => s + f.salarioBase, 0)),
  encargos: c2(FUNCIONARIOS.reduce((s, f) => s + f.encargos, 0)),
  beneficios: c2(FUNCIONARIOS.reduce((s, f) => s + f.beneficios, 0)),
};

/* ══════════════════════════════════════════════════════════════
   D) FORNECEDORES
   ══════════════════════════════════════════════════════════════ */

export type CompraFornecedor = {
  numero: string;
  data: string;
  valor: number;
  status: "Recebido" | "Em trânsito" | "Confirmado";
};

export type Fornecedor = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  categoria: string;
  contato: string;
  email: string;
  condicao: string;
  totalAno: number;
  emAberto: number;
  proximoVencimento: string;
  status: "Em dia" | "A vencer" | "Atrasado";
  compras: CompraFornecedor[];
};

const DEF_FORN: [string, string, string, string, string, string, number, number, string, Fornecedor["status"]][] = [
  ["Espuma Sul Indústria Ltda", "Espuma Sul", "12345678000190", "Matéria-prima", "Roberto Dias", "30/60/90", 1_842_300, 184_500, "2026-08-28", "A vencer"],
  ["Tecidos Aurora S.A.", "Tecidos Aurora", "23456789000181", "Matéria-prima", "Claudia Menezes", "30/60", 968_400, 72_300, "2026-09-04", "Em dia"],
  ["Molas Precision Ltda", "Molas Precision", "34567890000172", "Componentes", "Sérgio Vilela", "28 dias", 1_204_900, 96_800, "2026-08-22", "Atrasado"],
  ["Embalagens Norte Ltda", "Emb. Norte", "45678901000163", "Embalagem", "Tatiana Lopes", "à vista", 214_600, 0, "—", "Em dia"],
  ["Transportes Via Rápida", "Via Rápida", "56789012000154", "Logística", "Marcos Pereira", "15 dias", 486_200, 41_900, "2026-08-30", "A vencer"],
  ["Estúdio Imagem Digital", "Estúdio Imagem", "67890123000145", "Serviços", "Bianca Ferraz", "30 dias", 96_800, 12_400, "2026-09-10", "Em dia"],
  ["Contabilidade Meridiano", "Meridiano", "78901234000136", "Serviços", "Otávio Brandão", "mensal", 78_000, 6_500, "2026-09-05", "Em dia"],
  ["Madeireira Campo Verde", "Campo Verde", "89012345000127", "Matéria-prima", "Renata Aguiar", "45 dias", 642_100, 128_700, "2026-08-26", "A vencer"],
  ["Ferragens União Ltda", "Ferragens União", "90123456000118", "Componentes", "Paulo Sá", "30 dias", 187_400, 15_200, "2026-09-12", "Em dia"],
  ["Limpeza Total Serviços", "Limpeza Total", "01234567000109", "Serviços", "Silvia Nogueira", "mensal", 42_600, 3_550, "2026-09-05", "Em dia"],
];

export const FORNECEDORES: Fornecedor[] = DEF_FORN.map(
  ([razaoSocial, nomeFantasia, cnpj, categoria, contato, condicao, totalAno, emAberto, proximoVencimento, status], i) => {
    const r = prng(4400 + i);
    const compras: CompraFornecedor[] = Array.from({ length: 5 }, (_, k) => ({
      numero: `LC-2026-${String(i * 5 + k + 101).padStart(4, "0")}`,
      data: `2026-0${((k % 7) + 2)}-${String(4 + k * 5).padStart(2, "0")}`,
      valor: c2((totalAno / 12) * (0.7 + r() * 0.8)),
      status: k === 0 ? "Em trânsito" : k === 1 ? "Confirmado" : "Recebido",
    }));
    return {
      id: `for-${i + 1}`,
      razaoSocial,
      nomeFantasia,
      cnpj,
      categoria,
      contato,
      email: `${contato.split(" ")[0].toLowerCase()}@${nomeFantasia
        .toLowerCase()
        .replace(/[^a-z]/g, "")}.com.br`,
      condicao,
      totalAno,
      emAberto,
      proximoVencimento,
      status,
      compras,
    };
  }
);

export const CATEGORIAS_FORNECEDOR = Array.from(
  new Set(FORNECEDORES.map((f) => f.categoria))
).sort();

/** CNPJ só com dígitos no dado; a máscara é responsabilidade da tela. */
export function formatarCnpj(cnpj: string) {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/* ══════════════════════════════════════════════════════════════
   E) CONTAS A PAGAR
   ══════════════════════════════════════════════════════════════ */

export type Faixa = "vencida" | "hoje" | "sete_dias" | "mes" | "futura";

export type Conta = {
  id: string;
  descricao: string;
  fornecedor: string;
  categoria: string;
  documento: string;
  valor: number;
  vencimento: string;
  faixa: Faixa;
  pago: boolean;
};

/** Diferença em dias entre duas datas ISO, sem depender de fuso. */
function diasEntre(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000
  );
}

function faixaDe(vencimento: string): Faixa {
  const d = diasEntre(HOJE, vencimento);
  if (d < 0) return "vencida";
  if (d === 0) return "hoje";
  if (d <= 7) return "sete_dias";
  if (d <= 31) return "mes";
  return "futura";
}

const DEF_CONTAS: [string, string, string, string, number, string][] = [
  ["Lote de espuma D33 — parcela 2/3", "Espuma Sul", "Compra de mercadoria", "NF 84512", 184_500, "2026-08-19"],
  ["Molas ensacadas — parcela 1/2", "Molas Precision", "Compra de mercadoria", "NF 22178", 96_800, "2026-08-21"],
  ["Frete de coleta — agosto", "Via Rápida", "Frete de compra", "NF 5541", 18_400, "2026-08-24"],
  ["Comissão de marketplace — agosto", "Mercado Livre", "Comissão de marketplace", "Extrato 08/26", 172_300, "2026-08-25"],
  ["Energia elétrica — galpão", "Companhia Energética", "Aluguel e estrutura", "Fatura 9912", 8_740, "2026-08-25"],
  ["Madeira para base box — parcela 2/2", "Campo Verde", "Compra de mercadoria", "NF 3341", 128_700, "2026-08-26"],
  ["Aluguel do galpão — setembro", "Imobiliária Central", "Aluguel e estrutura", "Contrato 44", 32_500, "2026-08-28"],
  ["Espuma laminada — parcela 3/3", "Espuma Sul", "Compra de mercadoria", "NF 84980", 96_200, "2026-08-28"],
  ["Frete de entrega — semana 34", "Via Rápida", "Frete de venda", "NF 5602", 41_900, "2026-08-30"],
  ["Folha de pagamento — agosto", "Folha interna", "Folha de pagamento", "Guia 08/26", 142_800, "2026-08-31"],
  ["FGTS e INSS — agosto", "Receita Federal", "Encargos e benefícios", "DARF 08/26", 61_400, "2026-09-07"],
  ["Tecido jacquard — parcela 1/2", "Tecidos Aurora", "Compra de mercadoria", "NF 11204", 72_300, "2026-09-04"],
  ["Honorários contábeis — setembro", "Meridiano", "Serviços de terceiros", "NF 881", 6_500, "2026-09-05"],
  ["Limpeza e conservação", "Limpeza Total", "Serviços de terceiros", "NF 341", 3_550, "2026-09-05"],
  ["Simples Nacional — competência 08", "Receita Federal", "Impostos", "DAS 08/26", 58_900, "2026-09-20"],
  ["Ensaios fotográficos — lote novo", "Estúdio Imagem", "Serviços de terceiros", "NF 214", 12_400, "2026-09-10"],
  ["Ferragens e parafusos", "Ferragens União", "Compra de mercadoria", "NF 7781", 15_200, "2026-09-12"],
  ["Investimento em mídia — agosto", "Mercado Livre Ads", "Investimento em mídia", "Extrato 08/26", 62_100, "2026-09-15"],
  ["Embalagens — pedido mensal", "Emb. Norte", "Embalagem", "NF 1180", 21_800, "2026-09-18"],
  ["Tarifas bancárias — agosto", "Banco Comercial", "Tarifas bancárias", "Extrato 08/26", 2_340, "2026-09-02"],
];

export const CONTAS: Conta[] = DEF_CONTAS.map(
  ([descricao, fornecedor, categoria, documento, valor, vencimento], i) => ({
    id: `cp-${i + 1}`,
    descricao,
    fornecedor,
    categoria,
    documento,
    valor,
    vencimento,
    faixa: faixaDe(vencimento),
    pago: false,
  })
);

export const RESUMO_CONTAS = {
  total: c2(CONTAS.reduce((s, c) => s + c.valor, 0)),
  vencido: c2(
    CONTAS.filter((c) => c.faixa === "vencida").reduce((s, c) => s + c.valor, 0)
  ),
  hoje: c2(CONTAS.filter((c) => c.faixa === "hoje").reduce((s, c) => s + c.valor, 0)),
  seteDias: c2(
    CONTAS.filter((c) => c.faixa === "sete_dias").reduce((s, c) => s + c.valor, 0)
  ),
};

/** Próximos vencimentos que o painel mostra. */
export const PROXIMOS_VENCIMENTOS = CONTAS.filter(
  (c) => c.faixa === "vencida" || c.faixa === "hoje" || c.faixa === "sete_dias"
).sort((a, b) => a.vencimento.localeCompare(b.vencimento));

/* ══════════════════════════════════════════════════════════════
   F) MOVIMENTAÇÕES RECENTES (painel)
   ══════════════════════════════════════════════════════════════ */

export type Movimentacao = {
  id: string;
  data: string;
  descricao: string;
  categoria: string;
  tipo: "entrada" | "saida";
  valor: number;
};

export const MOVIMENTACOES: Movimentacao[] = [
  { id: "mv-1", data: "2026-08-25", descricao: "Repasse Mercado Livre — ciclo 08/2", categoria: "Repasse de marketplace", tipo: "entrada", valor: 218_440.7 },
  { id: "mv-2", data: "2026-08-24", descricao: "Pagamento Molas Precision — NF 22178", categoria: "Compra de mercadoria", tipo: "saida", valor: 96_800 },
  { id: "mv-3", data: "2026-08-24", descricao: "Repasse Shopee — ciclo semanal", categoria: "Repasse de marketplace", tipo: "entrada", valor: 71_320.15 },
  { id: "mv-4", data: "2026-08-23", descricao: "Frete de coleta — Via Rápida", categoria: "Frete de compra", tipo: "saida", valor: 18_400 },
  { id: "mv-5", data: "2026-08-22", descricao: "Venda direta B2B — Rede Dormir Bem", categoria: "Venda de mercadoria", tipo: "entrada", valor: 84_600 },
  { id: "mv-6", data: "2026-08-22", descricao: "Investimento em mídia — Ads", categoria: "Investimento em mídia", tipo: "saida", valor: 14_280.4 },
  { id: "mv-7", data: "2026-08-21", descricao: "Repasse Amazon — ciclo quinzenal", categoria: "Repasse de marketplace", tipo: "entrada", valor: 96_180.55 },
  { id: "mv-8", data: "2026-08-20", descricao: "Embalagens Norte — NF 1174", categoria: "Embalagem", tipo: "saida", valor: 19_640 },
];
