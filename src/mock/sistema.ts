/**
 * Sistema — integrações, glossário e configurações.
 *
 * O glossário veio do glossário real do projeto de KPIs (`full_data.json`),
 * com duas mudanças: as referências a abas de planilha foram trocadas pelo
 * lugar equivalente no sistema, e os termos ganharam a fórmula separada da
 * definição, para a tela poder mostrar o cálculo em fonte monoespaçada.
 */

/* ══════════════════════════════════════════════════════════════
   A) INTEGRAÇÕES
   ══════════════════════════════════════════════════════════════ */

export type StatusIntegracao = "conectada" | "desconectada" | "erro";

export type Integracao = {
  id: string;
  nome: string;
  grupo: "Canais de venda" | "Análise e mídia" | "ERP e gestão";
  sincroniza: string;
  status: StatusIntegracao;
  ultimaSincronizacao: string;
  resumo: string;
  erro?: string;
};

export const INTEGRACOES: Integracao[] = [
  // Canais de venda
  { id: "mercado_livre", nome: "Mercado Livre", grupo: "Canais de venda", sincroniza: "Anúncios, pedidos, visitas, campanhas e tarifas", status: "conectada", ultimaSincronizacao: "há 12 min", resumo: "1.284 anúncios · 2 contas de vendedor" },
  { id: "amazon", nome: "Amazon", grupo: "Canais de venda", sincroniza: "Anúncios, pedidos e relatórios de tráfego", status: "conectada", ultimaSincronizacao: "há 38 min", resumo: "412 anúncios · FBA ativo" },
  { id: "shopee", nome: "Shopee", grupo: "Canais de venda", sincroniza: "Anúncios, pedidos e campanhas", status: "erro", ultimaSincronizacao: "ontem, 22:14", resumo: "Última sincronização falhou", erro: "Token expirado — reconecte a conta para retomar a coleta." },
  { id: "magalu", nome: "Magalu", grupo: "Canais de venda", sincroniza: "Anúncios e pedidos", status: "desconectada", ultimaSincronizacao: "—", resumo: "Não conectado" },
  { id: "casas_bahia", nome: "Casas Bahia", grupo: "Canais de venda", sincroniza: "Anúncios e pedidos", status: "desconectada", ultimaSincronizacao: "—", resumo: "Não conectado" },
  { id: "madeira", nome: "Madeira Madeira", grupo: "Canais de venda", sincroniza: "Anúncios e pedidos", status: "desconectada", ultimaSincronizacao: "—", resumo: "Não conectado" },
  { id: "vtex", nome: "VTEX", grupo: "Canais de venda", sincroniza: "Pedidos e catálogo da loja própria", status: "conectada", ultimaSincronizacao: "há 5 min", resumo: "Loja própria · 1.106 SKUs" },

  // Análise e mídia
  { id: "ga4", nome: "Google Analytics 4", grupo: "Análise e mídia", sincroniza: "Sessões, origem de tráfego e conversão da loja própria", status: "conectada", ultimaSincronizacao: "há 1 h", resumo: "Propriedade 428193044" },
  { id: "google_ads", nome: "Google Ads", grupo: "Análise e mídia", sincroniza: "Investimento, cliques, conversões e ROAS", status: "conectada", ultimaSincronizacao: "há 1 h", resumo: "3 campanhas ativas" },
  { id: "meta_ads", nome: "Meta Ads", grupo: "Análise e mídia", sincroniza: "Investimento, alcance e conversões", status: "desconectada", ultimaSincronizacao: "—", resumo: "Não conectado" },

  // ERP e gestão
  { id: "bling", nome: "Bling", grupo: "ERP e gestão", sincroniza: "Estoque, notas fiscais e contas a pagar", status: "desconectada", ultimaSincronizacao: "—", resumo: "Não conectado" },
  { id: "tiny", nome: "Tiny", grupo: "ERP e gestão", sincroniza: "Estoque, pedidos e expedição", status: "desconectada", ultimaSincronizacao: "—", resumo: "Não conectado" },
];

export const GRUPOS_INTEGRACAO = [
  "Canais de venda",
  "Análise e mídia",
  "ERP e gestão",
] as const;

/* ══════════════════════════════════════════════════════════════
   B) GLOSSÁRIO
   ══════════════════════════════════════════════════════════════ */

export type Termo = {
  id: string;
  secao: string;
  termo: string;
  sigla?: string;
  definicao: string;
  calculo?: string;
  leitura?: string;
  onde: string;
};

export const TERMOS: Termo[] = [
  // — Receita —
  { id: "receita-bruta", secao: "Receita", termo: "Receita bruta", definicao: "Valor total gerado pelas vendas antes de qualquer desconto ou taxa.", calculo: "soma(receita dos pedidos)", leitura: "Compare sempre com a meta do mês, não com o mês anterior isolado.", onde: "Visão geral · Vendas por canal" },
  { id: "receita-paga", secao: "Receita", termo: "Receita paga", sigla: "Receita líquida", definicao: "Receita total menos a receita cancelada. É o valor que efetivamente entrou e não voltou.", calculo: "receita bruta − valor cancelado", leitura: "É a métrica mais próxima do faturamento real. Use-a para meta, ticket e comparativos.", onde: "Vendas · Anual e Semanal" },
  { id: "receita-mtd", secao: "Receita", termo: "Receita acumulada no mês", sigla: "MTD", definicao: "Soma de todas as vendas do primeiro dia do mês até hoje.", calculo: "soma(do dia 1 até hoje)", leitura: "Permite saber se o ritmo do mês está no caminho de atingir a meta.", onde: "Visão geral" },
  { id: "ticket-medio", secao: "Receita", termo: "Ticket médio", definicao: "Receita dividida pelo número de pedidos. Quanto cada comprador gasta em média.", calculo: "receita ÷ pedidos", leitura: "Alta = mix subindo para produtos mais caros. Queda = promoção intensa ou mix diferente.", onde: "Visão geral · Vendas por canal" },
  { id: "ticket-pago", secao: "Receita", termo: "Ticket médio pago", definicao: "Receita paga dividida pelos pedidos que não foram cancelados.", calculo: "receita paga ÷ pedidos não cancelados", leitura: "Mais fiel que o ticket bruto, porque exclui pedidos que nunca se concretizaram.", onde: "Vendas · Semanal e Anual" },
  { id: "gmv", secao: "Receita", termo: "Volume bruto de mercadoria", sigla: "GMV", definicao: "Total transacionado no canal, incluindo o que depois foi cancelado.", calculo: "soma(preço × quantidade)", onde: "Vendas por canal" },
  { id: "margem", secao: "Receita", termo: "Margem de contribuição", definicao: "O que sobra da venda depois de tirar os custos que variam com ela: mercadoria, comissão, frete e mídia.", calculo: "receita − custo variável", leitura: "É o número que diz se vender mais está de fato melhorando o resultado.", onde: "Visão geral · Financeiro · Custos" },

  // — Pedidos —
  { id: "pedidos", secao: "Pedidos", termo: "Pedidos", definicao: "Total de vendas concluídas no período, independentemente do número de itens em cada uma.", calculo: "contagem(pedidos)", leitura: "Compare com conversão e visitas para entender onde o funil trava.", onde: "Visão geral · Vendas" },
  { id: "cancelados", secao: "Pedidos", termo: "Pedidos cancelados", definicao: "Pedidos feitos e depois cancelados pelo comprador ou pela plataforma antes do envio.", calculo: "contagem(pedidos cancelados)", leitura: "Taxa alta derruba a reputação e costuma indicar problema de estoque ou de prazo.", onde: "Vendas · Lançamentos" },
  { id: "taxa-cancelamento", secao: "Pedidos", termo: "Taxa de cancelamento", definicao: "Percentual da receita que foi cancelada no período.", calculo: "(valor cancelado ÷ receita) × 100", leitura: "Acima de 8% já exige investigar a causa. Compare por canal e por dia da semana.", onde: "Vendas · Anual e Comparativos" },

  // — Tráfego —
  { id: "visitas", secao: "Tráfego", termo: "Visitas", definicao: "Quantas vezes a página do anúncio foi aberta. Vem do relatório do canal, normalmente em grão mensal.", calculo: "soma(visitas)", leitura: "Métrica de topo de funil. Queda de visitas pede investigar relevância, posição e mídia.", onde: "Anúncios · Análise de anúncios" },
  { id: "sessoes", secao: "Tráfego", termo: "Sessões", definicao: "Visitas agrupadas por usuário e janela de tempo. É a métrica do GA4 para a loja própria.", calculo: "soma(sessões)", onde: "Integrações · Google Analytics 4" },
  { id: "conversao", secao: "Tráfego", termo: "Taxa de conversão", definicao: "Percentual de visitantes que efetivamente compraram.", calculo: "(pedidos ÷ visitas) × 100", leitura: "Típico do setor: 1% a 3%. Abaixo de 1%, revise preço, fotos e avaliações.", onde: "Anúncios · Análise de anúncios" },
  { id: "curva-a", secao: "Tráfego", termo: "Curva A", definicao: "Os anúncios que, somados, respondem pelos primeiros 80% do total — de receita ou de tráfego.", calculo: "ordenar desc e acumular até 80% do total", leitura: "Poucos itens, quase todo o resultado. É onde a atenção rende mais.", onde: "Anúncios · Análise de anúncios" },

  // — Mídia —
  { id: "inv-ads", secao: "Mídia", termo: "Investimento em mídia", sigla: "ADS", definicao: "Valor total gasto com campanhas pagas dentro do canal.", calculo: "soma(investimento em mídia)", leitura: "Monitorar para não estourar o orçamento. Sempre olhar junto com o retorno.", onde: "Vendas · Anual · Financeiro" },
  { id: "tacos", secao: "Mídia", termo: "Custo de mídia sobre a receita total", sigla: "TACOS", definicao: "Peso do investimento em mídia sobre a receita TOTAL, orgânica mais paga. Mais conservador que o ACOS.", calculo: "(investimento em mídia ÷ receita total) × 100", leitura: "Mostra o peso real da mídia no negócio. Saudável abaixo de 5% a 8%.", onde: "Vendas · Anual" },
  { id: "acos", secao: "Mídia", termo: "Custo de mídia sobre a receita atribuída", sigla: "ACOS", definicao: "Percentual do investimento sobre a receita gerada pelos próprios anúncios.", calculo: "(investimento ÷ receita atribuída) × 100", leitura: "Quanto menor, mais eficiente. Acima de 15% pede revisão das campanhas.", onde: "Integrações · Ads" },
  { id: "roas", secao: "Mídia", termo: "Retorno sobre o investimento em mídia", sigla: "ROAS", definicao: "Receita gerada para cada real investido em publicidade. É o inverso do ACOS.", calculo: "receita atribuída ÷ investimento", leitura: "ROAS 30 significa R$ 30 de receita por real investido. Mínimo saudável em torno de 15.", onde: "Integrações · Ads" },
  { id: "cac", secao: "Mídia", termo: "Custo de aquisição de cliente", sigla: "CAC", definicao: "Quanto se gastou em mídia para conquistar cada comprador novo.", calculo: "investimento em mídia ÷ clientes novos", onde: "Financeiro · Custos" },

  // — Preço —
  { id: "preco-ideal", secao: "Preço", termo: "Preço ideal", definicao: "Preço calculado internamente para entregar a margem alvo, considerando custo, comissão e frete.", calculo: "custo ÷ (1 − margem alvo − comissão)", leitura: "Vender abaixo dele só se justifica se o volume reagir na mesma proporção.", onde: "Anúncios · Preço ideal" },
  { id: "comissao", secao: "Preço", termo: "Comissão", definicao: "Percentual que o canal cobra sobre cada venda. Varia por tipo de anúncio e por categoria.", calculo: "(valor da comissão ÷ preço) × 100", onde: "Anúncios · Catálogo" },
  { id: "sale-fee", secao: "Preço", termo: "Tarifa de venda", sigla: "SALE_FEE", definicao: "Nome técnico da tarifa de venda do Mercado Livre. Em campanha, pode vir reduzida.", onde: "Promoções · Campanhas" },
  { id: "reducao-tarifa", secao: "Preço", termo: "Redução de tarifa", definicao: "Desconto que o canal concede na própria comissão para quem entra na campanha.", calculo: "comissão normal − comissão da campanha", leitura: "Quando existe, participar costuma valer a pena mesmo baixando o preço.", onde: "Promoções · Campanhas" },
  { id: "subsidio", secao: "Preço", termo: "Subsídio", definicao: "Margem entregue ao vender abaixo do preço ideal.", calculo: "soma((preço ideal − preço praticado) × vendas)", leitura: "Só é saudável se trouxer volume proporcional. Sem isso, é margem perdida.", onde: "Anúncios · Análise de anúncios" },

  // — Metas —
  { id: "meta", secao: "Metas", termo: "Meta", definicao: "Valor de receita que a operação se comprometeu a atingir no mês.", onde: "Vendas · Metas" },
  { id: "gap", secao: "Metas", termo: "Diferença para a meta", sigla: "GAP", definicao: "Quanto falta ou quanto sobra em relação à meta do período.", calculo: "realizado − meta", leitura: "Negativo = abaixo da meta. Positivo = já superou.", onde: "Vendas · Metas" },
  { id: "atingimento", secao: "Metas", termo: "Atingimento", sigla: "ATG%", definicao: "Percentual da meta já alcançado.", calculo: "(realizado ÷ meta) × 100", leitura: "Acima de 100% = meta batida.", onde: "Visão geral · Vendas · Metas" },
  { id: "ritmo", secao: "Metas", termo: "Ritmo vs. meta", definicao: "Compara o quanto já se realizou com o quanto do mês já passou.", calculo: "(realizado ÷ meta) ÷ (dias corridos ÷ dias do mês)", leitura: "Diz se dá para bater a meta mantendo o passo atual.", onde: "Visão geral · Vendas · Metas" },
  { id: "projecao", secao: "Metas", termo: "Projeção de fechamento", definicao: "Estimativa de onde o mês termina se o ritmo atual continuar.", calculo: "(realizado ÷ dias corridos) × dias do mês", onde: "Vendas · Metas" },

  // — Operação —
  { id: "share", secao: "Operação", termo: "Participação por canal", sigla: "Share", definicao: "Percentual que cada canal representa sobre a receita total.", calculo: "(receita do canal ÷ receita total) × 100", leitura: "Identifica onde o esforço rende mais e onde há dependência excessiva.", onde: "Vendas por canal" },
  { id: "wow", secao: "Operação", termo: "Variação semanal", sigla: "WoW", definicao: "Comparação de uma semana com a semana imediatamente anterior.", calculo: "((semana atual − anterior) ÷ anterior) × 100", leitura: "Boa para detectar tendência rápida, ruim para julgar sazonalidade.", onde: "Vendas · Semanal" },
  { id: "mom", secao: "Operação", termo: "Variação mensal", sigla: "MoM", definicao: "Comparação de um mês com o mês anterior.", calculo: "((mês atual − anterior) ÷ anterior) × 100", onde: "Vendas · Anual" },
  { id: "yoy", secao: "Operação", termo: "Variação anual", sigla: "YoY", definicao: "Comparação com o mesmo período do ano passado.", calculo: "((ano atual − ano anterior) ÷ ano anterior) × 100", leitura: "Neutraliza a sazonalidade — é a comparação mais honesta.", onde: "Vendas · Anual" },
  { id: "ytd", secao: "Operação", termo: "Acumulado do ano", sigla: "YTD", definicao: "Soma de 1º de janeiro até hoje.", calculo: "soma(de 1º de janeiro até hoje)", onde: "Vendas · Anual" },
  { id: "full", secao: "Operação", termo: "Fulfillment", sigla: "Full / 2P", definicao: "Modelo em que o estoque fica no centro de distribuição do canal e ele cuida da entrega.", leitura: "Muda a margem e o prazo. Compare sempre separado do envio próprio.", onde: "Monitoramento · Fretes" },
];

export const SECOES_GLOSSARIO = [
  "Receita",
  "Pedidos",
  "Tráfego",
  "Mídia",
  "Preço",
  "Metas",
  "Operação",
];

/* ══════════════════════════════════════════════════════════════
   C) CONFIGURAÇÕES
   ══════════════════════════════════════════════════════════════ */

export type Operacao = {
  id: string;
  nome: string;
  descricao: string;
  ativa: boolean;
  canais: number;
};

export const OPERACOES: Operacao[] = [
  { id: "principal", nome: "Operação principal", descricao: "Marketplaces e loja própria", ativa: true, canais: 7 },
  { id: "b2b", nome: "Operação B2B", descricao: "Representantes e revenda", ativa: true, canais: 1 },
  { id: "loja", nome: "Loja própria", descricao: "VTEX e venda direta", ativa: false, canais: 1 },
];

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  papel: "Proprietário" | "Editor" | "Leitor";
  iniciais: string;
};

export const USUARIOS: Usuario[] = [
  { id: "u1", nome: "Eduardo Lourenço", email: "eduardo@empresa.com.br", papel: "Proprietário", iniciais: "EL" },
  { id: "u2", nome: "Ana Beatriz Ramos", email: "ana.ramos@empresa.com.br", papel: "Editor", iniciais: "AR" },
  { id: "u3", nome: "Fernanda Alves", email: "fernanda.alves@empresa.com.br", papel: "Editor", iniciais: "FA" },
  { id: "u4", nome: "Carlos Eduardo Lima", email: "carlos.lima@empresa.com.br", papel: "Leitor", iniciais: "CL" },
];

export type Notificacao = {
  id: string;
  titulo: string;
  descricao: string;
  padrao: boolean;
};

export const NOTIFICACOES: Notificacao[] = [
  { id: "preco", titulo: "Alerta de preço", descricao: "Quando um concorrente cruzar a regra que você definiu.", padrao: true },
  { id: "campanha", titulo: "Campanha vencendo", descricao: "Cinco dias antes do fim de uma campanha com itens sem decisão.", padrao: true },
  { id: "meta", titulo: "Meta em risco", descricao: "Quando o ritmo do mês indicar fechamento abaixo da meta.", padrao: true },
  { id: "estoque", titulo: "Ruptura de estoque", descricao: "Quando um SKU de curva A ficar com menos de 15 dias de cobertura.", padrao: false },
  { id: "frete", titulo: "Variação de frete", descricao: "Quando o frete de uma região subir mais de 10% numa varredura.", padrao: false },
  { id: "resumo", titulo: "Resumo diário por e-mail", descricao: "Todo dia útil às 08:00, com os números do dia anterior.", padrao: true },
];
