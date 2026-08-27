import {
  LayoutDashboard,
  TrendingUp,
  Tags,
  Percent,
  Radar,
  Wallet,
  FileBarChart,
  Plug,
  BookMarked,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  soon?: boolean;
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  href?: string;
  items?: NavItem[];
};

/** Estrutura de no máximo 2 níveis. */
export const NAV: NavGroup[] = [
  { label: "Visão geral", icon: LayoutDashboard, href: "/" },
  {
    label: "Vendas",
    icon: TrendingUp,
    items: [
      { label: "Por canal", href: "/vendas/canais" },
      { label: "Anual", href: "/vendas/anual" },
      { label: "Semanal", href: "/vendas/semanal" },
      { label: "Diário", href: "/vendas/diario" },
      { label: "Comparativos", href: "/vendas/comparativos" },
      { label: "Metas", href: "/vendas/metas" },
      { label: "Lançamentos", href: "/vendas/lancamentos" },
    ],
  },
  {
    label: "Anúncios",
    icon: Tags,
    items: [
      { label: "Análise de anúncios", href: "/anuncios/analise" },
      { label: "Catálogo", href: "/anuncios/catalogo" },
      { label: "Preço ideal", href: "/anuncios/preco-ideal" },
    ],
  },
  {
    label: "Promoções",
    icon: Percent,
    items: [
      { label: "Campanhas", href: "/promocoes/campanhas" },
      { label: "Comparar ofertas", href: "/promocoes/comparar" },
      { label: "Processar planilha", href: "/promocoes/processar" },
      { label: "Histórico", href: "/promocoes/historico" },
    ],
  },
  {
    label: "Monitoramento",
    icon: Radar,
    items: [
      { label: "Preços", href: "/monitoramento/precos" },
      { label: "Fretes", href: "/monitoramento/fretes" },
    ],
  },
  {
    label: "Financeiro",
    icon: Wallet,
    items: [
      { label: "Painel", href: "/financeiro" },
      { label: "Custos", href: "/financeiro/custos" },
      { label: "Folha de pagamento", href: "/financeiro/folha" },
      { label: "Fornecedores", href: "/financeiro/fornecedores" },
      { label: "Contas a pagar", href: "/financeiro/contas" },
    ],
  },
  {
    label: "Relatórios",
    icon: FileBarChart,
    items: [
      { label: "Apresentação", href: "/relatorios/apresentacao" },
      { label: "Exportações", href: "/relatorios/exportacoes" },
    ],
  },
];

export const NAV_FOOTER: NavGroup[] = [
  { label: "Integrações", icon: Plug, href: "/integracoes" },
  { label: "Glossário", icon: BookMarked, href: "/glossario" },
  { label: "Configurações", icon: Settings, href: "/configuracoes" },
];

/** Barra inferior do mobile — 5 itens, o resto vai em "Mais". */
export const MOBILE_TABS = [
  { label: "Visão", href: "/", icon: LayoutDashboard },
  { label: "Vendas", href: "/vendas/canais", icon: TrendingUp },
  { label: "Anúncios", href: "/anuncios/analise", icon: Tags },
  { label: "Promoções", href: "/promocoes/campanhas", icon: Percent },
];
