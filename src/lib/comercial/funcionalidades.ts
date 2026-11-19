export type CategoriaFuncionalidade = "Vendas" | "Mercado Livre" | "Promoções" | "Operação" | "Dinheiro";

export type Funcionalidade = {
  id: string;
  titulo: string;
  descricao: string;
  categoria: CategoriaFuncionalidade;
  rotaDemo: string;
  /** Orientação editorial em segundos; não é a duração de um vídeo publicado. */
  duracaoSugerida: number;
  video?: { src: string; poster?: string; legendas?: string };
  pergunta: string;
  gancho: string;
  narracao: string;
  cenas: string[];
};

export const CATEGORIAS_FUNCIONALIDADES: CategoriaFuncionalidade[] = ["Vendas", "Mercado Livre", "Promoções", "Operação", "Dinheiro"];
const demo = "/demonstracao/sistema";

/** Vídeos gravados no sistema de exemplo (Atlas Casa), com legenda na própria imagem. */
const LISTA: Omit<Funcionalidade, "video">[] = [
  { id: "v01", titulo: "Do dia à semana", categoria: "Vendas", duracaoSugerida: 42, rotaDemo: `${demo}/vendas/dia`,
    pergunta: "Foi só hoje?", gancho: "Um dia ruim não conta a história sozinho.",
    descricao: "Veja o dia, compare com os anteriores e encontre o ritmo da semana, com a meta sempre à vista.",
    narracao: "Saia do susto do dia para o tamanho real da história.", cenas: ["Hoje", "Calendário", "Semanal"] },
  { id: "v02", titulo: "O que voltou da venda", categoria: "Vendas", duracaoSugerida: 32, rotaDemo: `${demo}/vendas/cancelamentos`,
    pergunta: "Vendeu. Mas ficou tudo?", gancho: "Cancelamento também tem produto e data.",
    descricao: "Descubra quanto foi cancelado, em quais produtos e desde quando.",
    narracao: "O cancelamento deixa de ser um número solto.", cenas: ["Resumo", "Por SKU", "Ao longo do ano"] },
  { id: "v03", titulo: "Por que caiu?", categoria: "Vendas", duracaoSugerida: 48, rotaDemo: `${demo}/vendas/queda`,
    pergunta: "Caiu. Por onde começar?", gancho: "Três produtos, três motivos diferentes.",
    descricao: "Cada produto chega com a pista mais forte: estoque, preço, visitas ou conversão.",
    narracao: "Menos palpite. Mais pista.", cenas: ["Queda", "Visitas", "Preço", "Estoque"] },
  { id: "v12", titulo: "Quem segura a receita", categoria: "Vendas", duracaoSugerida: 44, rotaDemo: `${demo}/vendas/skus`,
    pergunta: "Quem segura a receita?", gancho: "Todo produto deixa pistas.",
    descricao: "Veja quais produtos fazem a receita, troque a medida para unidades e ache qualquer SKU.",
    narracao: "A história do produto em uma linha do tempo.", cenas: ["Busca", "Evolução", "Comparação"] },
  { id: "v10", titulo: "Anúncio contra anúncio", categoria: "Mercado Livre", duracaoSugerida: 42, rotaDemo: `${demo}/anuncios/analise`,
    pergunta: "Mesmo produto. Quem vende mais?", gancho: "Compare antes de mexer.",
    descricao: "Coloque anúncios lado a lado e veja visitas, conversão, preço e vendas.",
    narracao: "Compare preço, visita, venda e conversão.", cenas: ["Seleção", "Comparação", "Evolução"] },
  { id: "v06", titulo: "O anúncio pagou a conta?", categoria: "Mercado Livre", duracaoSugerida: 45, rotaDemo: `${demo}/anuncios/trafego-pago`,
    pergunta: "ROAS bonito. Sobrou?", gancho: "Vender com mídia não garante sobra.",
    descricao: "Veja investimento, retorno e o que sobrou depois da mídia em cada anúncio.",
    narracao: "Investimento e margem na mesma linha.", cenas: ["ROAS", "Sobra", "Alertas"] },
  { id: "v07", titulo: "Promoção com critério", categoria: "Promoções", duracaoSugerida: 50, rotaDemo: `${demo}/automacoes`,
    pergunta: "Essa promoção cabe?", gancho: "Nem toda oferta merece um sim.",
    descricao: "O Gerizo separa o que cabe, o que não cabe e o que pede seu olhar, antes de você aceitar.",
    narracao: "Você decide com a conta pronta.", cenas: ["Planilha", "Critério", "Revisão"] },
  { id: "v05", titulo: "O plano ganha vida", categoria: "Promoções", duracaoSugerida: 52, rotaDemo: `${demo}/planejamento`,
    pergunta: "E o próximo passo da campanha?", gancho: "Planeje. Acompanhe. Aprenda.",
    descricao: "Campanhas com mapa de ações, promoção do dia e resultado comparado.",
    narracao: "Do plano ao resultado no mesmo caminho.", cenas: ["Mapa", "Ficha", "Hoje", "Resultado"] },
  { id: "v04", titulo: "Hoje sai isso", categoria: "Operação", duracaoSugerida: 40, rotaDemo: `${demo}/mercado-livre/envios`,
    pergunta: "O que sai hoje?", gancho: "Pegou. Montou. Saiu.",
    descricao: "Pegue os produtos de uma vez e monte os pedidos iguais em sequência.",
    narracao: "Primeiro pega por produto. Depois monta por pedido.", cenas: ["Pedidos", "Pegar", "Montar"] },
  { id: "v09", titulo: "Pergunte do seu jeito", categoria: "Operação", duracaoSugerida: 38, rotaDemo: `${demo}/conversa`,
    pergunta: "O que caiu nesta semana?", gancho: "Pergunte. Confira. Decida.",
    descricao: "Faça perguntas da rotina e chegue direto ao número e à tela certa.",
    narracao: "Pergunte como falaria com alguém do time.", cenas: ["Vendas", "Pedidos", "Mídia"] },
  { id: "v08", titulo: "Onde o lucro vaza", categoria: "Dinheiro", duracaoSugerida: 48, rotaDemo: `${demo}/financeiro`,
    pergunta: "Faturou. E ficou quanto?", gancho: "Cada real tem um caminho.",
    descricao: "Do faturamento ao resultado, com frete, comissão e Ads entrando na conta.",
    narracao: "Agora dá para ver onde fica cada real.", cenas: ["Receita", "Custos", "Resultado", "SKU"] },
  { id: "v11", titulo: "Quanto cobrar em cada canal", categoria: "Dinheiro", duracaoSugerida: 50, rotaDemo: `${demo}/produtos/precificacao`,
    pergunta: "Subiu o preço. Ganhou?", gancho: "Margem maior pode render menos.",
    descricao: "Simule o preço no Mercado Livre e em outros canais, com frete, taxa e margem.",
    narracao: "Simule antes de mudar o preço.", cenas: ["Preço", "Canais", "Frete", "Comparação"] },
];

export const FUNCIONALIDADES: Funcionalidade[] = LISTA.map((f) => ({ ...f, video: { src: `/site/videos/${f.id}.mp4`, poster: `/site/videos/${f.id}.webp` } }));

export const funcionalidadePorId = (id: string) => FUNCIONALIDADES.find(item => item.id === id);
