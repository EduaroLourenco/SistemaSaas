import {
  LayoutDashboard,
  CalendarDays,
  TrendingUp,
  Tags,
  Percent, // eslint-disable-line @typescript-eslint/no-unused-vars -- volta se Promoções virar grupo próprio
  Radar, // eslint-disable-line @typescript-eslint/no-unused-vars -- volta com Monitoramento
  Wallet,
  FileBarChart,
  Plug,
  Database,
  Users,
  Building2,
  BookMarked,
  Bell,
  MessagesSquare,
  Upload,
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
    label: "Planejamento",
    icon: CalendarDays,
    items: [
      { label: "Calendário e campanhas", href: "/planejamento" },
      // Deu certo? Cada ação contra o resto do canal no mesmo período.
      { label: "Resultados", href: "/planejamento/resultados" },
    ],
  },
  { label: "Conversar", icon: MessagesSquare, href: "/conversa" },
  { label: "Alertas", icon: Bell, href: "/alertas" },
  { label: "Importar", icon: Upload, href: "/importar" },
  {
    label: "Vendas",
    icon: TrendingUp,
    items: [
      { label: "Por canal", href: "/vendas/canais" },
      { label: "Anual", href: "/vendas/anual" },
      { label: "Dia", href: "/vendas/dia" },
      { label: "Mês até aqui", href: "/vendas/mtd" },
      { label: "Semanal", href: "/vendas/semanal" },
      { label: "Comparar período", href: "/vendas/diario" },
      { label: "Comparativos", href: "/vendas/comparativos" },
      { label: "Análise de SKU", href: "/vendas/skus" },
      { label: "Por que caiu", href: "/vendas/queda" },
      { label: "Cancelamentos", href: "/vendas/cancelamentos" },
      { label: "Metas", href: "/vendas/metas" },
      { label: "Lançamentos", href: "/vendas/lancamentos" },
    ],
  },
  /*
   * Mercado Livre, num grupo só.
   *
   * Anúncios e Promoções eram dois grupos de primeiro nível, como se
   * valessem para qualquer canal. Nenhuma das telas existe sem a API do
   * Mercado Livre: anúncio, estoque, preço de vitrine, visita, catálogo e
   * regra de preço só vêm de lá, e não há planilha equivalente.
   *
   * Numa loja que ainda não conectou, esse grupo inteiro fica vazio — e
   * deixar isso explícito no nome é melhor do que espalhar sete telas
   * mortas pelo menu de quem só tem planilha.
   *
   * Fora da lista, por não estarem prontas: Performance de preço,
   * Tráfego pago, Preço-alvo e Comparar ofertas. As rotas continuam de pé,
   * só não são anunciadas — apagar obrigaria a reescrever depois.
   */
  {
    label: "Mercado Livre",
    icon: Tags,
    items: [
      { label: "Análise de anúncios", href: "/anuncios/analise" },
      { label: "Catálogo", href: "/anuncios/catalogo" },
      { label: "Clássico vs Premium", href: "/anuncios/tipo" },
      { label: "Lógica de promoção", href: "/anuncios/preco-ideal" },
      { label: "Campanhas", href: "/promocoes/campanhas" },
      { label: "Processar planilha", href: "/promocoes/processar" },
      { label: "Histórico", href: "/promocoes/historico" },
    ],
  },
  /*
   * Monitoramento sai do menu enquanto não está sendo desenvolvido.
   *
   * As rotas continuam de pé — só não são anunciadas. Apagar as telas
   * obrigaria a reescrevê-las depois; deixá-las no menu enche a lista de
   * coisa que não responde. Para trazer de volta, descomente.
   */
  // {
  //   label: "Monitoramento",
  //   icon: Radar,
  //   items: [
  //     { label: "Preços", href: "/monitoramento/precos" },
  //     { label: "Fretes", href: "/monitoramento/fretes" },
  //   ],
  // },
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
  {
    /* Apresentação sai: ocupa lugar e não entrega nada ainda. */
    label: "Relatórios",
    icon: FileBarChart,
    items: [{ label: "Exportações", href: "/relatorios/exportacoes" }],
  },
];

export const NAV_FOOTER: NavGroup[] = [
  /*
   * "Integrações" era uma tela de vitrine, sem nada ligado. O que importa
   * dela — conectar a conta do canal — vive em /integracoes/canais, e é
   * para lá que o nome aponta agora.
   */
  { label: "Empresas", icon: Building2, href: "/empresas" },
  { label: "Canais e contas", icon: Plug, href: "/integracoes/canais" },
  // Saiu da Visão geral: até onde cada fonte vai, e quando chegou.
  { label: "Fontes de dados", icon: Database, href: "/integracoes" },
  { label: "Equipe", icon: Users, href: "/equipe" },
  { label: "Glossário", icon: BookMarked, href: "/glossario" },
  { label: "Configurações", icon: Settings, href: "/configuracoes" },
];

/** Barra inferior do mobile — 5 itens, o resto vai em "Mais". */
/* Acompanha o menu: Anúncios e Promoções viraram um grupo só, Mercado Livre. */
export const MOBILE_TABS = [
  { label: "Visão", href: "/", icon: LayoutDashboard },
  { label: "Vendas", href: "/vendas/canais", icon: TrendingUp },
  { label: "Meli", href: "/anuncios/analise", icon: Tags },
  { label: "Importar", href: "/importar", icon: Upload },
];
