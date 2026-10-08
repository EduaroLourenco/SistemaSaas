import {
  estrategiaVazia,
  validarEstrategia,
  type Estrategia,
} from "./estrategia";
export const STATUS = [
  "Rascunho",
  "Planejada",
  "Aprovada",
  "Em andamento",
  "Concluída",
  "Cancelada",
] as const;
export const CORES = [
  "#0f766e",
  "#2563eb",
  "#9333ea",
  "#d97706",
  "#e11d48",
  "#475569",
];
export const TIPOS = [
  "Banner",
  "CRM",
  "Conteúdo",
  "Mídia paga",
  "Product Ads",
  "Revisão de anúncio",
  "Vitrine / Minha Página",
  "Promoção",
  "Preço",
  "Cupom",
  "Frete",
  "Kit",
  "Ação de estoque",
  "Personalizada",
];
export const ETAPAS = [
  "Preparação",
  "Esquenta",
  "Lançamento",
  "Sustentação",
  "Pós-campanha",
];
export type Status = (typeof STATUS)[number];
export type Detalhes = {
  estrategia?: Estrategia;
  visual?: { x: number; y: number; contexto: string };
  ordem?: number;
  objetivo: string;
  responsavel: string;
  divulgacao: string;
  publico: string;
  briefing: string;
  link: string;
  orcamento: number | null;
  meta: string;
  checklist: { texto: string; feito: boolean }[];
  porProduto: Record<string, string>;
  grupos: string[];
};
export type Item = {
  id: string;
  operacao_id: string;
  natureza: "campanha" | "acao";
  campanha_id: string | null;
  titulo: string;
  inicio: string;
  fim: string;
  status: Status;
  tipo: string;
  etapa: string;
  cor: string;
  skus: string[];
  canais: string[];
  contas: string[];
  detalhes: Detalhes;
  revisao: number;
  atualizado_em: string;
};
export type Grupo = {
  id: string;
  operacao_id: string;
  nome: string;
  skus: string[];
  revisao: number;
};
export type Tipo = {
  id: string;
  operacao_id: string;
  nome: string;
  cor: string;
  revisao: number;
};
export type Produto = {
  sku: string;
  titulo: string;
  origem: "produto" | "anuncio";
  /** Curva pela receita dos últimos 90 dias. Sem venda, null. */
  curva?: "A" | "B" | "C" | null;
  receita90?: number;
  unidades90?: number;
  /** Menor preço anunciado ativo; sem anúncio com API, o último vendido. */
  preco?: number | null;
  precoOrigem?: "anuncio" | "vendido" | null;
  estoque?: number | null;
  /** Anúncio ativo sem controle de estoque (venda sob encomenda). */
  semControle?: boolean;
  temCusto?: boolean;
};
export type Canal = { id: string; nome: string };
export type Conta = Canal & { canal_id: string };
export type Anuncio = {
  id: string;
  codigo: string;
  titulo: string;
  sku: string;
  canal: string;
  conta: string;
  tipo: string;
};
export type Promocao = {
  id: string;
  nome: string;
  inicio: string | null;
  fim: string | null;
  canal_id: string;
  ativa: boolean;
  atualizado_em: string;
  ofertas: {
    sku: string;
    conta: string;
    anuncio: string;
    preco: number | null;
    decisao: string;
  }[];
};
export type Dados = {
  operacao: string;
  empresa: string;
  itens: Item[];
  grupos: Grupo[];
  tipos: Tipo[];
  produtos: Produto[];
  anuncios: Anuncio[];
  canais: Canal[];
  contas: Conta[];
  promocoes: Promocao[];
  avisos: string[];
  pronto: boolean;
};
export function detalhesVazios(): Detalhes {
  return {
    estrategia: estrategiaVazia(),
    objetivo: "",
    responsavel: "",
    divulgacao: "",
    publico: "",
    briefing: "",
    link: "",
    orcamento: null,
    meta: "",
    checklist: [],
    porProduto: {},
    grupos: [],
  };
}
export function dataISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function dataUTC(s: string): Date {
  return new Date(s + "T12:00:00Z");
}
export function somarDias(s: string, n: number): string {
  const d = dataUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return dataISO(d);
}
export function dataValida(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = dataUTC(s);
  return (
    Number.isFinite(d.getTime()) &&
    dataISO(d) === s &&
    Number(s.slice(0, 4)) >= 2000 &&
    Number(s.slice(0, 4)) <= 2100
  );
}
export function sobrepoe(a: string, b: string, c: string, d: string): boolean {
  return a <= d && b >= c;
}
export function diasEntre(a: string, b: string): number {
  return Math.round((dataUTC(b).getTime() - dataUTC(a).getTime()) / 86400000);
}
export function segunda(s: string): string {
  return somarDias(s, -((dataUTC(s).getUTCDay() + 6) % 7));
}
export function formatarData(s: string): string {
  return dataUTC(s).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
  });
}
export function novoItem(
  data: string,
  natureza: Item["natureza"] = "acao",
): Item {
  return {
    id: "",
    operacao_id: "",
    natureza,
    campanha_id: null,
    titulo: "",
    inicio: data,
    fim: data,
    status: "Rascunho",
    tipo: natureza === "campanha" ? "Campanha" : "Banner",
    etapa: "Preparação",
    cor: CORES[0],
    skus: [],
    canais: [],
    contas: [],
    detalhes: detalhesVazios(),
    revisao: 0,
    atualizado_em: "",
  };
}

/** Campos permitidos e limites de entrada compartilhados por API e testes. */
export function validarItem(x: unknown): string | null {
  if (!x || typeof x !== "object") return "Ação inválida.";
  const v = x as Item;
  if (!["campanha", "acao"].includes(v.natureza))
    return "Escolha campanha ou ação.";
  if (typeof v.titulo !== "string" || !v.titulo.trim() || v.titulo.length > 160)
    return "Informe um título de até 160 caracteres.";
  if (!dataValida(v.inicio) || !dataValida(v.fim) || v.fim < v.inicio)
    return "Confira as datas: o fim deve ser igual ou posterior ao início.";
  if (diasEntre(v.inicio, v.fim) > 730)
    return "O período máximo é de dois anos.";
  if (!STATUS.includes(v.status)) return "Situação inválida.";
  if (
    typeof v.tipo !== "string" ||
    !v.tipo.trim() ||
    v.tipo.length > 60 ||
    typeof v.etapa !== "string" ||
    v.etapa.length > 80
  )
    return "Confira o tipo e a etapa.";
  if (!/^#[\da-fA-F]{6}$/.test(v.cor)) return "Cor inválida.";
  for (const campo of ["skus", "canais", "contas"] as const) {
    if (
      !Array.isArray(v[campo]) ||
      v[campo].length > 2000 ||
      v[campo].some((s) => typeof s !== "string" || s.length > 150)
    )
      return "Seleção inválida.";
  }
  const d = v.detalhes;
  if (!d || typeof d !== "object") return "Detalhes inválidos.";
  if (
    d.ordem !== undefined &&
    (typeof d.ordem !== "number" ||
      !Number.isFinite(d.ordem) ||
      Math.abs(d.ordem) > 1e15)
  )
    return "Posição do cartão inválida.";
  if (
    d.visual !== undefined &&
    (!d.visual ||
      !Number.isFinite(d.visual.x) ||
      !Number.isFinite(d.visual.y) ||
      d.visual.x < 0 ||
      d.visual.x > 6000 ||
      d.visual.y < 0 ||
      d.visual.y > 4000 ||
      typeof d.visual.contexto !== "string" ||
      d.visual.contexto.length > 80)
  )
    return "Posição no mapa inválida.";
  for (const campo of [
    "objetivo",
    "responsavel",
    "divulgacao",
    "publico",
    "briefing",
    "link",
    "meta",
  ] as const) {
    if (typeof d[campo] !== "string" || d[campo].length > 10000)
      return "Um dos textos ultrapassou o limite de 10 mil caracteres.";
  }
  if (d.link && !/^https?:\/\//i.test(d.link))
    return "O link da arte deve começar com https:// ou http://.";
  if (
    d.orcamento !== null &&
    (typeof d.orcamento !== "number" ||
      !Number.isFinite(d.orcamento) ||
      d.orcamento < 0 ||
      d.orcamento > 1e12)
  )
    return "Orçamento inválido.";
  if (
    !Array.isArray(d.checklist) ||
    d.checklist.length > 100 ||
    d.checklist.some(
      (c) =>
        !c ||
        typeof c.texto !== "string" ||
        c.texto.length > 500 ||
        typeof c.feito !== "boolean",
    )
  )
    return "Checklist inválido.";
  if (
    !Array.isArray(d.grupos) ||
    d.grupos.some((g) => typeof g !== "string" || g.length > 160) ||
    d.grupos.length > 100
  )
    return "Grupos inválidos.";
  if (
    !d.porProduto ||
    typeof d.porProduto !== "object" ||
    Array.isArray(d.porProduto) ||
    Object.entries(d.porProduto).some(
      ([k, val]) =>
        !v.skus.includes(k) || typeof val !== "string" || val.length > 2000,
    )
  )
    return "Confira as orientações por produto.";
  return validarEstrategia(d.estrategia, dataValida);
}
