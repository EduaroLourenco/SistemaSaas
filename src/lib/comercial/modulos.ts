/**
 * Módulos do Gerizo para a página comercial.
 *
 * Por enquanto é só escolha comercial: a liberação real por módulo ainda
 * não existe no sistema. O preço é passado na conversa.
 */

/** WhatsApp que recebe os pedidos, só números com DDI. */
export const WHATSAPP_COMERCIAL = "5516994447044";

export type ModuloId =
  | "vendas" | "anuncios" | "queda" | "envios" | "promocoes"
  | "precos" | "custos" | "trafego" | "planejamento" | "conversar";

export type Modulo = {
  id: ModuloId;
  nome: string;
  frase: string;
  telas: string[];
  cor: string;
  /** Sem este módulo, a tela fica sem dado essencial. */
  requer?: { modulos: ModuloId[]; porque: string };
  /** Precisa de pelo menos um destes. */
  requerUm?: { modulos: ModuloId[]; porque: string };
  combina?: { id: ModuloId; porque: string }[];
  obrigatorio?: boolean;
};

export const MODULOS: Modulo[] = [
  { id: "vendas", nome: "Vendas", obrigatorio: true, cor: "var(--gz-c1)",
    frase: "Seu dia, a semana e o ano, com metas e cancelamentos.",
    telas: ["Hoje", "Semanal", "Anual", "Por canal", "Cancelamentos"] },
  { id: "anuncios", nome: "Anúncios do Mercado Livre", cor: "var(--gz-c2)",
    frase: "Evolução, comparação e quem pede atenção hoje.",
    telas: ["Análise de anúncios", "Catálogo", "Clássico e Premium"],
    combina: [{ id: "queda", porque: "transforma a queda de um anúncio em pistas para agir" }] },
  { id: "queda", nome: "Por que caiu", cor: "var(--gz-c3)",
    frase: "Estoque, preço, visitas e conversão separados por produto.",
    telas: ["Por que caiu", "Evolução do produto"],
    requer: { modulos: ["anuncios"], porque: "as pistas usam visitas e preço dos anúncios" } },
  { id: "envios", nome: "Envios e Separador", cor: "var(--gz-c4)",
    frase: "O que sai hoje, o que pegar e a etiqueta revisada.",
    telas: ["Fila de envios", "Separador", "Etiquetas"],
    combina: [{ id: "conversar", porque: "permite perguntar quais pedidos pedem atenção" }] },
  { id: "promocoes", nome: "Promoções e automações", cor: "var(--gz-c5)",
    frase: "Ofertas abertas, regras e aceite com revisão.",
    telas: ["Promoções abertas", "Regras", "Fila", "Planilha de promoções"],
    requerUm: { modulos: ["precos", "custos"], porque: "para saber se a oferta cabe, precisa de preço mínimo ou de custo" },
    combina: [{ id: "planejamento", porque: "coloca a promoção dentro da campanha e mede o resultado" }] },
  { id: "precos", nome: "Produtos e preços", cor: "var(--gz-c6)",
    frase: "Planilha de preço mínimo e preço por canal com frete.",
    telas: ["Precificação", "Cotação", "Tabela de preços"],
    combina: [{ id: "promocoes", porque: "usa seu preço mínimo para dizer se a promoção cabe" }, { id: "custos", porque: "mostra a margem real de cada preço" }] },
  { id: "custos", nome: "Custos e resultado", cor: "var(--gz-c7)",
    frase: "DRE, custo por SKU, frete, comissão e Ads na conta.",
    telas: ["Financeiro", "Demonstrativo", "Custos por SKU"],
    combina: [{ id: "trafego", porque: "mostra se a mídia deixou sobra" }, { id: "promocoes", porque: "calcula quanto sobra em cada oferta" }] },
  { id: "trafego", nome: "Tráfego pago", cor: "var(--gz-c8)",
    frase: "Investimento, retorno e o que sobrou depois da mídia.",
    telas: ["Tráfego pago", "Alertas de mídia"],
    combina: [{ id: "custos", porque: "sem custo, o anúncio mostra venda mas não mostra sobra" }] },
  { id: "planejamento", nome: "Planejamento", cor: "var(--gz-c9)",
    frase: "Campanhas, mapa de ações e o resultado de cada uma.",
    telas: ["Hoje no plano", "Mapa", "Fichas", "Resultados"],
    combina: [{ id: "promocoes", porque: "mostra a promoção no ar no dia da campanha" }] },
  { id: "conversar", nome: "Conversar", cor: "var(--gz-c10)",
    frase: "Pergunte do seu jeito e chegue no número certo.",
    telas: ["Conversar"],
    combina: [{ id: "anuncios", porque: "dá mais assunto para as respostas" }] },
];

export const PACOTES: { nome: string; frase: string; modulos: ModuloId[] }[] = [
  { nome: "Começar simples", frase: "Vendas e anúncios", modulos: ["vendas", "anuncios", "queda"] },
  { nome: "Promoção sem susto", frase: "Preço, margem e campanha", modulos: ["vendas", "promocoes", "precos", "custos", "planejamento"] },
  { nome: "Operação em dia", frase: "Envios e perguntas rápidas", modulos: ["vendas", "envios", "conversar"] },
  { nome: "Tudo", frase: "O Gerizo completo", modulos: MODULOS.map((m) => m.id) },
];

export const moduloPorId = (id: ModuloId) => MODULOS.find((m) => m.id === id)!;

/** Acrescenta o que o módulo exige. Devolve também o que entrou junto. */
export function adicionar(atual: ModuloId[], id: ModuloId): { modulos: ModuloId[]; junto: ModuloId[] } {
  const set = new Set(atual);
  const junto: ModuloId[] = [];
  const incluir = (m: ModuloId) => {
    if (set.has(m)) return;
    set.add(m);
    const def = moduloPorId(m);
    def.requer?.modulos.forEach((r) => { if (!set.has(r)) { junto.push(r); incluir(r); } });
    if (def.requerUm && !def.requerUm.modulos.some((r) => set.has(r))) { const r = def.requerUm.modulos[0]; junto.push(r); incluir(r); }
  };
  incluir(id);
  return { modulos: MODULOS.map((m) => m.id).filter((m) => set.has(m)), junto };
}

/** Motivo para não remover, ou null quando pode sair. */
export function bloqueioParaRemover(atual: ModuloId[], id: ModuloId): string | null {
  const def = moduloPorId(id);
  if (def.obrigatorio) return "Vendas é a base de tudo e fica sempre incluído.";
  const sem = atual.filter((m) => m !== id);
  for (const m of sem) {
    const d = moduloPorId(m);
    if (d.requer?.modulos.includes(id)) return `${d.nome} precisa de ${def.nome}: ${d.requer.porque}.`;
    if (d.requerUm?.modulos.includes(id) && !d.requerUm.modulos.some((r) => sem.includes(r))) return `${d.nome} precisa de ${d.requerUm.modulos.map((r) => moduloPorId(r).nome).join(" ou ")}: ${d.requerUm.porque}.`;
  }
  return null;
}

export function sugestoes(atual: ModuloId[]) {
  const vistos = new Set<ModuloId>();
  const lista: { de: Modulo; para: Modulo; porque: string }[] = [];
  for (const id of atual) for (const c of moduloPorId(id).combina ?? []) {
    if (atual.includes(c.id) || vistos.has(c.id)) continue;
    vistos.add(c.id);
    lista.push({ de: moduloPorId(id), para: moduloPorId(c.id), porque: c.porque });
  }
  return lista.slice(0, 3);
}

export const idsValidos = (ids: unknown): ModuloId[] =>
  Array.isArray(ids) ? MODULOS.map((m) => m.id).filter((id) => ids.includes(id)) : [];
