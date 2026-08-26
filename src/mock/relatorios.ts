import { CANAIS, FATURAMENTO_30D, KPIS } from "@/mock";
import { FLUXO_12_MESES } from "@/mock/financeiro";

/** Relatórios — roteiro de apresentação e central de exportações. */

/* ══════════════════════════════════════════════════════════════
   A) APRESENTAÇÃO
   ══════════════════════════════════════════════════════════════ */

export type FormatoDeck = "diaria" | "semanal" | "personalizada";

export type Slide = {
  id: string;
  titulo: string;
  subtitulo: string;
  /** Valor grande do slide, já formatado pela tela. */
  valor: number;
  formato: "money" | "count" | "pct";
  delta: number;
  /** true quando cair é bom. */
  inverso?: boolean;
  comentario: string;
  tipo: "linha" | "barra";
  serie: { rotulo: string; valor: number }[];
};

const serieDias = FATURAMENTO_30D.slice(-14).map((d) => ({
  rotulo: d.data.slice(8) + "/" + d.data.slice(5, 7),
  valor: d.faturamento,
}));

const seriePedidos = FATURAMENTO_30D.slice(-14).map((d) => ({
  rotulo: d.data.slice(8) + "/" + d.data.slice(5, 7),
  valor: d.pedidos,
}));

const serieCanais = CANAIS.map((c) => ({
  rotulo: c.nome,
  valor: c.faturamento,
}));

const serieResultado = FLUXO_12_MESES.slice(-8).map((m) => ({
  rotulo: m.mes,
  valor: m.resultado,
}));

export const SLIDES: Slide[] = [
  {
    id: "faturamento",
    titulo: "Faturamento",
    subtitulo: "Acumulado do mês até 25 de agosto",
    valor: KPIS[0].value,
    formato: "money",
    delta: KPIS[0].delta,
    comentario:
      "Crescimento puxado por Mercado Livre e Shopee. A loja própria acelerou pela terceira semana seguida.",
    tipo: "linha",
    serie: serieDias,
  },
  {
    id: "pedidos",
    titulo: "Pedidos",
    subtitulo: "Volume de vendas concluídas no mês",
    valor: KPIS[1].value,
    formato: "count",
    delta: KPIS[1].delta,
    comentario:
      "O volume cresce menos que o faturamento — sinal de que o ticket está subindo, não o número de compradores.",
    tipo: "linha",
    serie: seriePedidos,
  },
  {
    id: "ticket",
    titulo: "Ticket médio",
    subtitulo: "Valor médio por pedido",
    valor: KPIS[2].value,
    formato: "money",
    delta: KPIS[2].delta,
    comentario:
      "Mix migrando para colchões de molas e cama box, que têm preço maior e margem melhor.",
    tipo: "barra",
    serie: serieCanais,
  },
  {
    id: "margem",
    titulo: "Margem de contribuição",
    subtitulo: "O que sobra depois do custo variável",
    valor: KPIS[3].value,
    formato: "pct",
    delta: KPIS[3].delta,
    comentario:
      "Queda de 1,6 ponto vem da pressão de campanha. Vale rever a participação nos itens de curva A.",
    tipo: "barra",
    serie: serieResultado,
  },
  {
    id: "canais",
    titulo: "Participação por canal",
    subtitulo: "Onde o faturamento é gerado",
    valor: CANAIS[0].participacao,
    formato: "pct",
    delta: CANAIS[0].delta,
    comentario:
      "Mercado Livre segue como quase metade do resultado. Concentração alta é risco a acompanhar.",
    tipo: "barra",
    serie: serieCanais,
  },
  {
    id: "conversao",
    titulo: "Conversão",
    subtitulo: "Visitas que viraram pedido",
    valor: 1.15,
    formato: "pct",
    delta: -2.1,
    comentario:
      "Queda concentrada em anúncios com muito tráfego e ficha fraca. Já mapeados na lente de desperdício.",
    tipo: "linha",
    serie: seriePedidos,
  },
  {
    id: "subsidio",
    titulo: "Margem subsidiada",
    subtitulo: "Deixada na mesa por vender abaixo do preço ideal",
    valor: 270_535.4,
    formato: "money",
    delta: -15,
    inverso: true,
    comentario:
      "Caiu 15% depois do ajuste de preço em 8 anúncios. Ainda concentrada em 14 itens.",
    tipo: "barra",
    serie: serieCanais,
  },
  {
    id: "resultado",
    titulo: "Resultado financeiro",
    subtitulo: "Entradas menos saídas no mês",
    valor: FLUXO_12_MESES[FLUXO_12_MESES.length - 1].resultado,
    formato: "money",
    delta: 6.8,
    comentario:
      "Resultado positivo pelo oitavo mês seguido, mesmo com a folha e a mídia crescendo.",
    tipo: "barra",
    serie: serieResultado,
  },
];

export const FORMATOS: { value: FormatoDeck; label: string; descricao: string }[] = [
  {
    value: "diaria",
    label: "Diária",
    descricao: "Números do mês até hoje. Roteiro curto, para a reunião de abertura.",
  },
  {
    value: "semanal",
    label: "Semanal",
    descricao: "Fechamento da semana com comparação contra a anterior e a meta.",
  },
  {
    value: "personalizada",
    label: "Personalizada",
    descricao: "Você escolhe quais indicadores entram e em que ordem.",
  },
];

/** Quais slides cada formato traz por padrão. */
export const ROTEIRO_PADRAO: Record<FormatoDeck, string[]> = {
  diaria: ["faturamento", "pedidos", "ticket", "canais"],
  semanal: ["faturamento", "pedidos", "ticket", "margem", "canais", "conversao"],
  personalizada: SLIDES.map((s) => s.id),
};

/* ══════════════════════════════════════════════════════════════
   B) EXPORTAÇÕES
   ══════════════════════════════════════════════════════════════ */

export type FormatoExportacao = {
  id: string;
  nome: string;
  descricao: string;
  extensao: string;
  tamanho: string;
};

export const FORMATOS_EXPORTACAO: FormatoExportacao[] = [
  {
    id: "consolidado_xlsx",
    nome: "Consolidado do período",
    descricao:
      "Uma aba por tela: canais, anual, semanal, metas e comparativos, com fórmulas preservadas.",
    extensao: "XLSX",
    tamanho: "~ 2,4 MB",
  },
  {
    id: "diario_csv",
    nome: "Lançamentos diários",
    descricao:
      "Uma linha por canal por dia, com visitas, receita, pedidos, mídia e cancelamentos.",
    extensao: "CSV",
    tamanho: "~ 480 KB",
  },
  {
    id: "mensal_csv",
    nome: "Consolidado mensal",
    descricao: "Doze linhas por canal, já com ticket, conversão e TACOS calculados.",
    extensao: "CSV",
    tamanho: "~ 38 KB",
  },
  {
    id: "anuncios_xlsx",
    nome: "Desempenho de anúncios",
    descricao:
      "Matriz evolutiva com o histórico semanal, preço ideal e subsídio por anúncio.",
    extensao: "XLSX",
    tamanho: "~ 860 KB",
  },
  {
    id: "executivo_pdf",
    nome: "Relatório executivo",
    descricao:
      "Resumo de uma página com os indicadores principais, gráficos e leitura automática.",
    extensao: "PDF",
    tamanho: "~ 320 KB",
  },
  {
    id: "backup_json",
    nome: "Backup completo",
    descricao:
      "Todos os dados da operação em JSON, para guardar fora do sistema ou migrar.",
    extensao: "JSON",
    tamanho: "~ 6,1 MB",
  },
];

export type Exportacao = {
  id: string;
  arquivo: string;
  tipo: string;
  periodo: string;
  geradoEm: string;
  tamanho: string;
  status: "Concluída" | "Processando" | "Falhou";
};

export const HISTORICO_EXPORTACOES: Exportacao[] = [
  { id: "ex-8", arquivo: "consolidado-ago-2026.xlsx", tipo: "Consolidado do período", periodo: "01/08 a 25/08/2026", geradoEm: "25/08/2026 09:41", tamanho: "2,4 MB", status: "Concluída" },
  { id: "ex-7", arquivo: "anuncios-s34.xlsx", tipo: "Desempenho de anúncios", periodo: "S34 · 17/08 a 23/08", geradoEm: "24/08/2026 08:12", tamanho: "864 KB", status: "Concluída" },
  { id: "ex-6", arquivo: "executivo-s33.pdf", tipo: "Relatório executivo", periodo: "S33 · 10/08 a 16/08", geradoEm: "17/08/2026 08:05", tamanho: "318 KB", status: "Concluída" },
  { id: "ex-5", arquivo: "backup-completo-2026-08-15.json", tipo: "Backup completo", periodo: "Toda a base", geradoEm: "15/08/2026 23:00", tamanho: "6,1 MB", status: "Concluída" },
  { id: "ex-4", arquivo: "diario-jul-2026.csv", tipo: "Lançamentos diários", periodo: "01/07 a 31/07/2026", geradoEm: "01/08/2026 07:30", tamanho: "472 KB", status: "Concluída" },
  { id: "ex-3", arquivo: "anuncios-s32.xlsx", tipo: "Desempenho de anúncios", periodo: "S32 · 03/08 a 09/08", geradoEm: "10/08/2026 08:11", tamanho: "—", status: "Falhou" },
  { id: "ex-2", arquivo: "mensal-2026.csv", tipo: "Consolidado mensal", periodo: "Jan a Jul de 2026", geradoEm: "02/08/2026 10:22", tamanho: "36 KB", status: "Concluída" },
  { id: "ex-1", arquivo: "executivo-jul-2026.pdf", tipo: "Relatório executivo", periodo: "Julho de 2026", geradoEm: "01/08/2026 07:35", tamanho: "306 KB", status: "Concluída" },
];

export type Agendamento = {
  id: string;
  titulo: string;
  descricao: string;
  quando: string;
  ativo: boolean;
};

export const AGENDAMENTOS: Agendamento[] = [
  { id: "ag-1", titulo: "Resumo semanal", descricao: "Relatório executivo em PDF por e-mail", quando: "Toda segunda, 08:00", ativo: true },
  { id: "ag-2", titulo: "Consolidado mensal", descricao: "Planilha completa do mês fechado", quando: "Dia 1, 07:30", ativo: true },
  { id: "ag-3", titulo: "Desempenho de anúncios", descricao: "Matriz evolutiva da semana", quando: "Toda segunda, 08:10", ativo: true },
  { id: "ag-4", titulo: "Backup completo", descricao: "Cópia de toda a base em JSON", quando: "Dia 15, 23:00", ativo: true },
  { id: "ag-5", titulo: "Lançamentos diários", descricao: "CSV do mês corrente", quando: "Todo dia, 06:00", ativo: false },
];
