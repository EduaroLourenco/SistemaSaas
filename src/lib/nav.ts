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
  Warehouse,
  Users,
  Building2,
  BookMarked,
  Bell,
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
  { label: "Regras e histórico", items: [
    { label: "Lógica de promoção", href: "/anuncios/preco-ideal" },
    { label: "Histórico", href: "/promocoes/historico" },
    { label: "Comparar ofertas", href: "/promocoes/comparar" },
  ] },
];
const area = (i: number): NavItem => ({ label: AREAS[i].label, href: AREAS[i].items[0].href, rotas: AREAS[i].items.map((t) => t.href) });

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
  /*
   * Tráfego pago fica FORA do grupo do Mercado Livre, embora hoje só ele
   * mande relatório de mídia. A mídia é comprada por conta — a Probel tem
   * duas no Meli, com verba separada — e todo canal tem a sua: pendurar a
   * tela num canal só obrigaria a movê-la no dia que o segundo chegasse,
   * e a ensinar de novo onde ela está. O recorte por canal já está dentro
   * dela.
   */
  { label: "Tráfego pago", icon: Megaphone, href: "/anuncios/trafego-pago" },
  { label: "Conversar", icon: MessagesSquare, href: "/conversa" },
  { label: "Alertas", icon: Bell, href: "/alertas" },
  { label: "Importar", icon: Upload, href: "/importar" },
  {
    label: "Vendas",
    icon: TrendingUp,
    items: [
      area(0), area(1), area(2),
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
   * Preço-alvo e Comparar ofertas. As rotas continuam de pé, só não são
   * anunciadas — apagar obrigaria a reescrever depois.
   *
   * Tráfego pago entrou: lê UM relatório do canal por vez, porque eles se
   * sobrepõem (agosto aparece em sete janelas) e somá-los inflava o gasto.
   */
  {
    label: "Mercado Livre",
    icon: Tags,
    items: [
      area(3),
      { label: "Campanhas", href: "/promocoes/campanhas" },
      { label: "Processar planilha", href: "/promocoes/processar" },
      area(4),
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
  { label: "Estoques e origens", icon: Warehouse, href: "/integracoes/estoques" },
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
