import {
  LayoutDashboard,
  Truck,
  Package,
  ShoppingBag,
  TrendingUp,
  Percent,
  Wallet,
  FileBarChart,
  Plug,
  Database,
  Warehouse,
  Users,
  Building2,
  BookMarked,
  MessagesSquare,
  Megaphone,
  Upload,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  soon?: boolean;
  rotas?: string[];
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  href?: string;
  items?: NavItem[];
};

/** Áreas com navegação interna. Endereços antigos continuam válidos. */
export const AREAS: { label: string; items: NavItem[] }[] = [
  { label: "Resultados de vendas", items: [
    { label: "Por canal", href: "/vendas/canais" },
    { label: "Anual", href: "/vendas/anual" },
    { label: "Comparativos", href: "/vendas/comparativos" },
    { label: "Cancelamentos", href: "/vendas/cancelamentos" },
  ] },
  { label: "Acompanhamento", items: [
    { label: "Dia", href: "/vendas/dia" },
    { label: "Mês até aqui", href: "/vendas/mtd" },
    { label: "Semanal", href: "/vendas/semanal" },
    { label: "Comparar período", href: "/vendas/diario" },
    { label: "Produtos / SKU", href: "/vendas/skus" },
    { label: "Por que caiu", href: "/vendas/queda" },
  ] },
  { label: "Lançamentos e metas", items: [
    { label: "Lançamentos", href: "/vendas/lancamentos" },
    { label: "Metas", href: "/vendas/metas" },
  ] },
  { label: "Anúncios", items: [
    { label: "Desempenho", href: "/anuncios/analise" },
    { label: "Clássico vs Premium", href: "/anuncios/tipo" },
    { label: "Disputa de catálogo", href: "/anuncios/catalogo" },
  ] },
  { label: "Promoções", items: [
    { label: "Ofertas", href: "/automacoes" },
    { label: "Histórico", href: "/promocoes/historico", rotas: ["/promocoes/comparar", "/promocoes/campanhas", "/promocoes/processar", "/anuncios/preco-ideal"] },
    { label: "Regras", href: "/automacoes/regras" },
  ] },
];
/* `sem`: rota que já tem lugar próprio no menu, para não acender dois itens. */
const area = (i: number, sem?: string): NavItem => {
  const rotas = AREAS[i].items.flatMap((t) => [t.href, ...(t.rotas ?? [])]).filter((h) => h !== sem);
  return { label: AREAS[i].label, href: rotas[0], rotas };
};

/**
 * Na ordem da rotina de quem opera: o dia, os envios, a mídia, as promoções,
 * os anúncios e o financeiro. Análise fica depois. Alertas mora no sino.
 * Mudar de grupo não muda endereço: links antigos continuam valendo.
 */
export const NAV: NavGroup[] = [
  { label: "Hoje", icon: LayoutDashboard, href: "/vendas/dia" },
  { label: "Envios", icon: Truck, href: "/mercado-livre/envios" },
  /* Fora do Mercado Livre: a mídia é comprada por conta e todo canal terá a sua. */
  { label: "Tráfego pago", icon: Megaphone, href: "/anuncios/trafego-pago" },
  {
    label: "Promoções",
    icon: Percent,
    items: [
      { label: "Calendário e campanhas", href: "/planejamento" },
      { label: "Promoções abertas", href: "/automacoes" },
      { label: "Histórico e análises", href: "/promocoes/historico", rotas: ["/promocoes/historico", "/promocoes/comparar", "/promocoes/campanhas", "/promocoes/processar", "/anuncios/preco-ideal"] },
      { label: "Regras de promoção", href: "/automacoes/regras" },
      { label: "Resultados", href: "/planejamento/resultados" },
    ],
  },
  {
    label: "Mercado Livre",
    icon: ShoppingBag,
    items: [{ label: "Termômetro", href: "/mercado-livre" }, area(3), { label: "Apresentação", href: "/relatorios/apresentacao?roteiro=meli", rotas: ["/relatorios/apresentacao"] }],
  },
  {
    label: "Financeiro",
    icon: Wallet,
    items: [
      { label: "Painel", href: "/financeiro" },
      { label: "Custos", href: "/financeiro/custos" },
      { label: "Categorias", href: "/financeiro/categorias" },
      { label: "Folha de pagamento", href: "/financeiro/folha" },
      { label: "Fornecedores", href: "/financeiro/fornecedores" },
      { label: "Contas a pagar", href: "/financeiro/contas" },
    ],
  },
  { label: "Conversar", icon: MessagesSquare, href: "/conversa" },
  {
    label: "Vendas",
    icon: TrendingUp,
    items: [
      area(1, "/vendas/dia"),
      area(0),
      { label: "Análise do período", href: "/vendas/periodo" },
      area(2),
    ],
  },
  { label: "Produtos e preços", icon: Package, items: [
    { label: "Produtos", href: "/produtos" },
    { label: "Precificação", href: "/produtos/precificacao" },
    { label: "Tabela por faixa", href: "/produtos/faixas" },
  ] },
];

export const NAV_FOOTER: NavGroup[] = [
  { label: "Exportações", icon: FileBarChart, href: "/relatorios/exportacoes" },
  { label: "Importar dados", icon: Upload, href: "/importar" },
  { label: "Empresas", icon: Building2, href: "/empresas" },
  { label: "Canais e contas", icon: Plug, href: "/integracoes/canais" },
  { label: "Fontes de dados", icon: Database, href: "/integracoes" },
  { label: "Estoques e origens", icon: Warehouse, href: "/integracoes/estoques" },
  { label: "Equipe", icon: Users, href: "/equipe" },
  { label: "Glossário", icon: BookMarked, href: "/glossario" },
  { label: "Configurações", icon: Settings, href: "/configuracoes" },
];

/** Barra inferior do celular: 4 atalhos + "Mais". `rotas` mantém a aba acesa nas telas do grupo. */
export const MOBILE_TABS: { label: string; href: string; icon: LucideIcon; rotas?: string[] }[] = [
  { label: "Hoje", href: "/vendas/dia", icon: LayoutDashboard },
  { label: "Envios", href: "/mercado-livre/envios", icon: Truck },
  { label: "Promoções", href: "/planejamento", icon: Percent, rotas: ["/planejamento", "/automacoes", "/promocoes", "/anuncios/preco-ideal"] },
  { label: "Meli", href: "/mercado-livre", icon: ShoppingBag, rotas: ["/anuncios/analise", "/anuncios/tipo", "/anuncios/catalogo"] },
];
