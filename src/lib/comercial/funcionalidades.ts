export type CategoriaFuncionalidade = "Vendas" | "Mercado Livre" | "Promoções" | "Operação" | "Dinheiro";

export type Funcionalidade = {
  id: string;
  titulo: string;
  descricao: string;
  categoria: CategoriaFuncionalidade;
  rotaDemo: string;
  /** Duração do MP4 final, medida em segundos. Ausente enquanto a mídia não estiver pronta. */
  duracaoSegundos?: number;
  video?: { src: string; poster?: string; legendas?: string };
  pergunta: string;
  gancho: string;
  narracao: string;
  cenas: string[];
};

export const CATEGORIAS_FUNCIONALIDADES: CategoriaFuncionalidade[] = ["Vendas", "Mercado Livre", "Promoções", "Operação", "Dinheiro"];
const demo = "/demonstracao/sistema";

/** Motions com telas da Atlas Casa e explicação em uma faixa fora da interface. */
const LISTA: Omit<Funcionalidade, "video">[] = [
  { id: "v01", titulo: "O dia conta a história toda?", categoria: "Vendas", duracaoSegundos: 32.334, rotaDemo: `${demo}/vendas/dia?data=2026-11-18`,
    pergunta: "Um dia conta tudo?", gancho: "O número do dia pede contexto.",
    descricao: "Passe do dia para a semana, reconheça os períodos em curso e compare semanas fechadas com dados.",
    narracao: "Veja o dia, abra a semana e escolha o que investigar.", cenas: ["Hoje", "Receita líquida do dia", "Semana em curso", "Semanas fechadas", "Contexto"] },
  { id: "v02", titulo: "Cancelou pouco. Quanto voltou?", categoria: "Vendas", duracaoSegundos: 32.625, rotaDemo: `${demo}/vendas/cancelamentos`,
    pergunta: "Cancelou só um pouquinho?", gancho: "Uma taxa pequena também vira dinheiro.",
    descricao: "Descubra quanto foi cancelado, em quais produtos e desde quando.",
    narracao: "Confira o valor, a taxa e o produto antes de investigar os pedidos.", cenas: ["Valor cancelado", "Pedidos", "Taxa por valor", "Por SKU", "Histórico dos pedidos"] },
  { id: "v03", titulo: "Caiu. E agora, mexer em quê?", categoria: "Vendas", duracaoSegundos: 33.083, rotaDemo: `${demo}/vendas/queda?de=2026-11-12&ate=2026-11-18`,
    pergunta: "Caiu. Por onde começar?", gancho: "Uma queda pode pedir perguntas diferentes.",
    descricao: "Compare a queda de visitas da Mesa e os dias sem estoque do Puff. Os sinais ajudam a investigar a variação.",
    narracao: "Sinais ajudam a investigar. Eles não provam a causa.", cenas: ["Queda de receita", "Visitas da Mesa", "Conversão", "Disponibilidade do Puff", "Investigação"] },
  { id: "v12", titulo: "Unidade e receita contam o quê?", categoria: "Vendas", duracaoSegundos: 34.250, rotaDemo: `${demo}/vendas/skus?de=2026-10-05&ate=2026-11-18`,
    pergunta: "Quantas saíram? E quanto entrou?", gancho: "A pergunta guia a leitura.",
    descricao: "Encontre um SKU e alterne unidades e receita, mantendo o mesmo produto e período na comparação.",
    narracao: "Unidades mostram o volume. Receita acompanha o faturamento.", cenas: ["Busca do SKU", "Unidades", "Receita", "Mesmo recorte", "Decisão"] },
  { id: "v10", titulo: "Anúncios lado a lado", categoria: "Mercado Livre", duracaoSegundos: 33.462, rotaDemo: `${demo}/anuncios/analise?de=2026-10-05&ate=2026-11-18&vs=nenhum`,
    pergunta: "Qual anúncio merece atenção?", gancho: "Compare antes de mexer.",
    descricao: "Coloque anúncios lado a lado e veja visitas, conversão, preço e vendas.",
    narracao: "Compare preço, visita, venda e conversão.", cenas: ["Seleção", "Comparação", "Evolução"] },
  { id: "v06", titulo: "ROAS bonito. E a sobra?", categoria: "Mercado Livre", duracaoSegundos: 25.128, rotaDemo: `${demo}/anuncios/trafego-pago?de=2026-11-01&ate=2026-11-18`,
    pergunta: "ROAS bonito. Sobrou?", gancho: "Vender com mídia não garante sobra.",
    descricao: "Confira investimento, contribuição depois dos Ads e sinais do diagnóstico antes de decidir sobre a mídia.",
    narracao: "Investimento e custos entram na mesma investigação.", cenas: ["Pergunta", "Investimento", "Sobra após Ads", "Diagnóstico"] },
  { id: "v07", titulo: "Promoção com a conta à vista", categoria: "Promoções", duracaoSegundos: 33.333333, rotaDemo: `${demo}/automacoes`,
    pergunta: "Essa promoção cabe?", gancho: "Nem toda oferta merece um sim.",
    descricao: "Confira preço, piso e comissão; revise as sugestões e os itens da planilha antes de decidir.",
    narracao: "A conta acompanha a promoção e a conferência final.", cenas: ["Convites", "Preço e piso", "Comissão", "Planilha", "Revisão"] },
  { id: "v05", titulo: "A campanha ganha um caminho", categoria: "Promoções", duracaoSegundos: 27.432, rotaDemo: `${demo}/planejamento`,
    pergunta: "E o próximo passo da campanha?", gancho: "Planeje. Acompanhe. Aprenda.",
    descricao: "Organize as ações no quadro, explore o mapa, confira a ficha e acompanhe o resultado da campanha.",
    narracao: "Do quadro ao resultado, cada ação tem seu lugar.", cenas: ["Quadro", "Mapa", "Ficha", "Resultado"] },
  { id: "v04", titulo: "Do produto à etiqueta", categoria: "Operação", duracaoSegundos: 28.958333, rotaDemo: `${demo}/mercado-livre/envios`,
    pergunta: "O que sai hoje?", gancho: "Pegou. Montou. Saiu.",
    descricao: "Escolha o prazo, reúna as quantidades por produto, monte os pedidos e revise o lote das etiquetas.",
    narracao: "Prazo, produto, pedido e conferência das etiquetas.", cenas: ["Prazo", "Pegar", "Montar", "Etiquetas"] },
  { id: "v09", titulo: "Três perguntas para a rotina", categoria: "Operação", duracaoSegundos: 31.083333, rotaDemo: `${demo}/conversa`,
    pergunta: "O que caiu nesta semana?", gancho: "Pergunte. Confira. Decida.",
    descricao: "Veja três perguntas guiadas da demonstração sobre queda de vendas, peso dos Ads e pedidos para despachar.",
    narracao: "A resposta aponta o dado e a tela para continuar a conferência.", cenas: ["Perguntas guiadas", "Vendas", "Ads", "Envios"] },
  { id: "v08", titulo: "Faturou. E o resultado?", categoria: "Dinheiro", duracaoSegundos: 32.670, rotaDemo: `${demo}/financeiro?inicio=2026-11-01&fim=2026-11-18`,
    pergunta: "Faturou. E ficou quanto?", gancho: "Cada real tem um caminho.",
    descricao: "Do faturamento ao resultado, com frete, comissão e Ads entrando na conta.",
    narracao: "Agora dá para ver onde fica cada real.", cenas: ["Receita", "Custos", "Resultado", "SKU"] },
  { id: "v11", titulo: "Um preço para cada conta", categoria: "Dinheiro", duracaoSegundos: 30.630, rotaDemo: `${demo}/produtos/precificacao`,
    pergunta: "Um preço para todo canal?", gancho: "Cada canal muda a conta do preço.",
    descricao: "Confira custo e cotação no Mercado Livre e compare simulações identificadas de preço, taxa e margem em outros canais.",
    narracao: "Simule antes de mudar o preço.", cenas: ["Preço", "Canais", "Frete", "Comparação"] },
];

/** Histórias curtas: dados observados na loja fictícia, sem previsão de resultado. */
export const HISTORIAS_DECISOES: Funcionalidade[] = [
  { id:"v13",titulo:"O preço mudou. E as vendas?",categoria:"Dinheiro",duracaoSegundos:41.052,
    pergunta:"Mais caro. Vendeu menos. E agora?",gancho:"Olhe além da margem de uma unidade.",
    descricao:"Comece em Por que caiu, encontre o sinal de preço subiu da luminária e aprofunde a comparação de preço, volume, visitas e conversão.",
    rotaDemo:`${demo}/vendas/queda?de=2026-11-12&ate=2026-11-18`,
    narracao:"Da queda de receita ao sinal do preço, uma pista para investigar com o histórico.",cenas:["Por que caiu","Preço subiu","Histórico de preço","Unidades e visitas","Conversão","Receita"],
    video:{src:"/site/videos/v13-motion.mp4",poster:"/site/videos/v13-motion.webp"}},
  { id:"v14",titulo:"Caiu. Foi mesmo o preço?",categoria:"Mercado Livre",duracaoSegundos:36.125,
    pergunta:"Foi o preço ou faltou visita?",gancho:"Dois anúncios podem cair por caminhos diferentes.",
    descricao:"A mesa perdeu visitas, mas converteu melhor. Use os gráficos para separar os sinais e escolher o que investigar.",
    rotaDemo:`${demo}/anuncios/analise?de=2026-11-12&ate=2026-11-18&vs=anterior&anuncio=MLB900000000001`,
    narracao:"Visitas, conversão e preço lado a lado, sem concluir a causa por um único número.",cenas:["Visitas","Conversão","Preço","Evolução de outro produto"],
    video:{src:"/site/videos/v14-motion.mp4",poster:"/site/videos/v14-motion.webp"}},
  { id:"v15",titulo:"Relâmpago: vendeu e sobrou?",categoria:"Promoções",duracaoSegundos:41.508,
    pergunta:"O desconto trouxe resultado?",gancho:"O pico de vendas é só o começo da conta.",
    descricao:"Confira preço, piso, vendas e o que sobrou depois da mídia. Volte ao histórico antes de repetir a oferta.",
    rotaDemo:`${demo}/planejamento/resultados`,
    narracao:"Uma oferta encerrada da loja fictícia, do preço mínimo ao resultado observado.",cenas:["Preço e piso","Antes e durante","Gráfico da campanha","Contribuição depois da mídia","Histórico"],
    video:{src:"/site/videos/v15-motion.mp4",poster:"/site/videos/v15-motion.webp"}},
];
export const FUNCIONALIDADES: Funcionalidade[] = [...HISTORIAS_DECISOES,...LISTA.map((f) => ({ ...f, video: { src: `/site/videos/${f.id}-motion.mp4`, poster: `/site/videos/${f.id}-motion.webp` } }))];

export const funcionalidadePorId = (id: string) => FUNCIONALIDADES.find(item => item.id === id);
