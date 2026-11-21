/** Orientação da demonstração. Não contém dados de clientes nem ações de negócio. */
export type AlvoTourReal = { seletor: string; texto?: string };
export type PassoTourReal = {
  id: string;
  rota: string;
  titulo: string;
  descricao: string;
  experimentar: string;
  alvo?: AlvoTourReal;
};
export type CapituloTourReal = {
  id: string;
  nome: string;
  passos: readonly PassoTourReal[];
};

const ROTA_QUEDA_CASOS = "/vendas/queda?de=2026-11-12&ate=2026-11-18";

export const TOUR_REAL: readonly CapituloTourReal[] = [
  { id: "dia", nome: "Hoje e histórico", passos: [
    { id: "resultado-dia", rota: "/vendas/dia", titulo: "Comece pelo resultado do dia", descricao: "Receita, meta e pedidos mostram o movimento da operação. A data identifica exatamente o dia que você está lendo.", experimentar: "Escolha um dos dias recentes e compare o resultado.", alvo: { seletor: '#conteudo [aria-label="Últimos dias"]' } },
    { id: "calendario-dia", rota: "/vendas/dia", titulo: "Volte no tempo sem perder o contexto", descricao: "O calendário permite abrir cada dia. As comparações e listas de canais e produtos acompanham essa escolha.", experimentar: "Toque em um dia do mês e abra Por canal ou Produtos vendidos.", alvo: { seletor: "#conteudo .decision-calendar" } },
  ] },
  { id: "semanal", nome: "Vendas semanais", passos: [
    { id: "ritmo-semanal", rota: "/vendas/semanal", titulo: "Enxergue o ritmo das vendas", descricao: "A semana atual aparece separada das semanas fechadas. O gráfico ajuda a comparar períodos sem confundir um dia parcial com uma semana completa.", experimentar: "Troque a métrica do gráfico nos filtros.", alvo: { seletor: "#conteudo .workspace-hero" } },
    { id: "semanas-comparar", rota: "/vendas/semanal", titulo: "Investigue uma semana", descricao: "Matriz e lista oferecem duas leituras dos mesmos períodos. É possível abrir uma semana e conferir seus indicadores.", experimentar: "Abra Semana a semana ou alterne para Lista ordenável.", alvo: { seletor: "#conteudo button", texto: "Semana a semana" } },
  ] },
  { id: "produtos", nome: "Produtos e SKUs", passos: [
    { id: "buscar-produto", rota: "/vendas/skus", titulo: "Encontre o resultado de um produto", descricao: "O SKU conecta as vendas do mesmo produto em contas e canais diferentes. A busca permite chegar ao item sem percorrer toda a tabela.", experimentar: "Busque um SKU ou parte do nome de um produto.", alvo: { seletor: '#conteudo [aria-label="Buscar SKU ou título"]' } },
    { id: "produto-recortes", rota: "/vendas/skus", titulo: "Mude a pergunta, mantenha o produto", descricao: "As visões por período e canal ajudam a localizar onde houve mudança. Receita, unidades e outras métricas continuam disponíveis no mesmo contexto.", experimentar: "Alterne a visão dos produtos e a métrica da tabela.", alvo: { seletor: '#conteudo [aria-label="Tabela de produtos, com rolagem horizontal"]' } },
  ] },
  { id: "queda", nome: "Por que caiu?", passos: [
    { id: "sinais-queda", rota: ROTA_QUEDA_CASOS, titulo: "Por que a luminária caiu?", descricao: "As vendas caíram. O preço subiu: vamos investigar essa pista.", experimentar: "Caso 1 · Luminária Arco", alvo: { seletor: '#conteudo [data-queda-sku="AT-LUZ-02"] > button' } },
    { id: "evidencia-queda", rota: ROTA_QUEDA_CASOS, titulo: "Quando o preço mudou?", descricao: "O gráfico mostra a mudança de preço a partir de 12/11.", experimentar: "Toque nos pontos para comparar os dias.", alvo: { seletor: '#conteudo [data-queda-detalhe="AT-LUZ-02"] [data-gerizo-tour="queda-grafico-preco"]' } },
    { id: "conversao-preco-queda", rota: ROTA_QUEDA_CASOS, titulo: "As visitas continuaram. E as vendas?", descricao: "Com as mesmas visitas, a conversão caiu de 2% para 1,16%.", experimentar: "É uma pista para investigar a oferta, não uma prova de causa.", alvo: { seletor: '#conteudo [data-queda-detalhe="AT-LUZ-02"] [data-gerizo-tour="queda-conversao"]' } },
    { id: "estoque-queda", rota: ROTA_QUEDA_CASOS, titulo: "E se faltou produto?", descricao: "O puff tem estoque agora, mas ficou cinco dias sem saldo.", experimentar: "Caso 2 · Puff Linho", alvo: { seletor: '#conteudo [data-queda-detalhe="AT-PUFF-03"] [data-gerizo-tour="queda-estoque"]' } },
    { id: "historico-estoque-queda", rota: ROTA_QUEDA_CASOS, titulo: "Veja quando o estoque zerou", descricao: "O histórico separa os dias sem saldo da retomada do produto.", experimentar: "Compare as datas antes de mexer no preço.", alvo: { seletor: '#conteudo [data-queda-detalhe="AT-PUFF-03"] [data-gerizo-tour="queda-grafico-estoque"]' } },
  ] },
  { id: "anuncios", nome: "Anúncios", passos: [
    { id: "anuncios-resultado", rota: "/anuncios/analise", titulo: "Chegue ao detalhe de cada anúncio", descricao: "A lista coloca desempenho, preço e situação no contexto da conta e do período. O detalhe mantém a relação com o produto e o estoque.", experimentar: "Busque um anúncio e abra seu detalhe.", alvo: { seletor: "#conteudo .ads-workbench, #conteudo .ads-list, #conteudo .ads-results" } },
    { id: "anuncios-comparar", rota: "/anuncios/tipo", titulo: "Compare formatos com a mesma régua", descricao: "Clássico e Premium ficam lado a lado por receita, conversão e tarifa. Os pares do mesmo SKU ajudam a separar a comparação do efeito do mix de produtos.", experimentar: "Confira um produto anunciado nos dois formatos.", alvo: { seletor: '#conteudo [aria-label="Comparação de Clássico e Premium por indicador"]' } },
  ] },
  { id: "trafego", nome: "Tráfego pago", passos: [
    { id: "midia-margem", rota: "/anuncios/trafego-pago", titulo: "Relacione o investimento ao que sobra", descricao: "O painel reúne mídia, faturamento e margem com a cobertura dos custos. Receita atribuída pelo canal e faturamento da conta mantêm suas próprias definições.", experimentar: "Confira a margem depois da mídia e os indicadores do período.", alvo: { seletor: "#conteudo .workspace-hero" } },
    { id: "midia-anuncio", rota: "/anuncios/trafego-pago", titulo: "Investigue campanhas e anúncios", descricao: "A busca e a ordenação ajudam a comparar os itens. A origem do relatório e a série diária podem ser abertas quando você precisar conferir a leitura.", experimentar: "Busque um produto, abra Mais dados e confira a série diária.", alvo: { seletor: "#conteudo .analysis-source" } },
  ] },
  { id: "promocoes", nome: "Promoções abertas", passos: [
    { id: "campanhas-abertas", rota: "/automacoes", titulo: "Veja quais ofertas precisam de resposta", descricao: "As campanhas mostram os itens pendentes, as datas e a situação no canal. Os filtros ajudam a chegar ao tipo de promoção relevante.", experimentar: "Abra uma campanha e confira os produtos convidados.", alvo: { seletor: "#conteudo .auto-lista" } },
    { id: "revisar-proposta", rota: "/automacoes", titulo: "Revise as condições do produto", descricao: "Preço, piso, custos e critérios ficam no contexto da proposta. A revisão permite conferir o que vai participar antes da confirmação.", experimentar: "Abra um produto da campanha e examine a decisão sugerida.", alvo: { seletor: "#conteudo .auto-detalhe, #conteudo .auto-items, #conteudo .auto-lista" } },
    { id: "fila-aprovacao", rota: "/automacoes", titulo: "Acompanhe a revisão das ofertas", descricao: "A fila mantém as propostas que aguardam conferência. As ações desta demonstração ficam somente no cenário fictício.", experimentar: "Selecione a aba Fila e confira os itens para revisão.", alvo: { seletor: "#conteudo button", texto: "Fila" } },
  ] },
  { id: "automacao", nome: "Regras de automação", passos: [
    { id: "ordem-regras", rota: "/automacoes/regras", titulo: "Transforme critérios em uma ordem de decisão", descricao: "As regras analisam as condições do item. A primeira regra que corresponder define a decisão sugerida.", experimentar: "Confira os critérios e a ordem das regras cadastradas.", alvo: { seletor: "#conteudo .op-section-title" } },
    { id: "editar-regra", rota: "/automacoes/regras", titulo: "Experimente um critério de promoção", descricao: "O editor permite ajustar condições e ação. A cobertura dos cadastros mostra quando faltam dados para uma condição funcionar completamente.", experimentar: "Abra uma regra ou escolha Nova regra para conhecer os campos.", alvo: { seletor: "#conteudo button", texto: "Nova regra" } },
  ] },
  { id: "planilhas", nome: "Planilha de promoção", passos: [
    { id: "subir-planilha", rota: "/promocoes/processar", titulo: "Traga a proposta da planilha para a análise", descricao: "A tela recebe os arquivos da campanha e organiza o processamento. Na demonstração, use os arquivos de exemplo disponibilizados para este cenário.", experimentar: "Escolha a planilha de campanha de exemplo na área de arquivos.", alvo: { seletor: "#conteudo input[type=file], #conteudo .op-processing-steps" } },
    { id: "piso-planilha", rota: "/promocoes/processar", titulo: "Defina o limite antes de processar", descricao: "A regra de preço mínimo pode considerar referência de tabela, margem pelos custos ou os dois critérios. Custos incompletos continuam identificados.", experimentar: "Confira a regra escolhida e processe o exemplo.", alvo: { seletor: "#conteudo h3", texto: "Regra do preço mínimo" } },
    { id: "resultado-planilha", rota: "/promocoes/processar", titulo: "Revise as decisões e o arquivo de saída", descricao: "O resultado separa participação, recusas e pendências, com motivo e preço por item. A conferência mantém a proposta ligada à linha da planilha.", experimentar: "Abra os itens para revisar e conheça a planilha pronta.", alvo: { seletor: "#conteudo h3", texto: "Conferência do lote" } },
  ] },
  { id: "historico", nome: "Acompanhar promoções", passos: [
    { id: "rodadas-campanha", rota: "/promocoes/campanhas", titulo: "Acompanhe as campanhas processadas", descricao: "Cada rodada reúne seus itens e a situação das decisões. O detalhe permite retornar aos preços e condições usados no processamento.", experimentar: "Abra uma campanha e confira os itens da rodada.", alvo: { seletor: "#conteudo .promo-campaign, #conteudo .promo-campaigns, #conteudo .promo-campaign-card" } },
    { id: "memoria-produto", rota: "/promocoes/historico", titulo: "Consulte a memória de cada produto", descricao: "O histórico agrupa as decisões pelo SKU. Ao abrir o produto, todas as rodadas, os preços, os pisos e os motivos ficam disponíveis para comparação.", experimentar: "Abra um produto e escolha Comparar propostas.", alvo: { seletor: "#conteudo .promo-product" } },
  ] },
  { id: "custos", nome: "Custos por SKU", passos: [
    { id: "cadastro-custo", rota: "/financeiro/custos", titulo: "Monte o custo do produto por SKU", descricao: "Mercadoria, embalagem, impostos e peso compõem o cadastro. Quando falta um componente, o sistema identifica a lacuna em vez de assumir custo zero.", experimentar: "Abra Editar custos do produto ou uma célula editável na tabela.", alvo: { seletor: '#conteudo [aria-label="Cobertura dos custos por SKU"]' } },
    { id: "frete-comissao", rota: "/financeiro/custos", titulo: "Compare o praticado com a tabela", descricao: "Comissão e frete recebidos do canal aparecem no custo praticado. O recorte de datas e conta mostra o que foi observado nas vendas, ao lado das referências de tabela.", experimentar: "Confira comissão e frete de um SKU no período selecionado.", alvo: { seletor: '#conteudo [aria-label="Recorte do custo praticado"]' } },
    { id: "faixas-frete", rota: "/financeiro/custos", titulo: "Conheça fretes e despesas da operação", descricao: "As abas mantêm as faixas de frete e os custos do canal junto do cadastro dos produtos. É possível examinar as referências sem sair da área financeira.", experimentar: "Alterne para Frete e depois para as despesas do canal.", alvo: { seletor: "#conteudo button", texto: "Frete" } },
  ] },
  { id: "dre", nome: "Financeiro e DRE", passos: [
    { id: "resultado-cobertura", rota: "/financeiro", titulo: "Leia o resultado com a cobertura dos custos", descricao: "O resumo coloca resultado, receita e contribuição no mesmo período. A cobertura informa quanto da receita tem os custos necessários para a apuração.", experimentar: "Confira o resultado e a cobertura da operação de exemplo.", alvo: { seletor: '#conteudo [aria-label="Resultado e cobertura do período"]' } },
    { id: "dre-composicao", rota: "/financeiro", titulo: "Entenda o caminho da receita ao resultado", descricao: "O demonstrativo separa cancelamentos, custos da venda e despesas da operação. A tabela ao lado permite investigar mês, canal, conta, SKU e anúncio.", experimentar: "Abra Receita, custos e margem e escolha uma dimensão.", alvo: { seletor: "#conteudo .finance-statement" } },
    { id: "dre-mensal", rota: "/financeiro", titulo: "Compare a composição mês a mês", descricao: "O demonstrativo mensal apresenta os valores e a participação na receita líquida. A evolução permite acompanhar contribuição e resultado ao longo dos meses.", experimentar: "Abra Demonstrativo mês a mês para comparar os períodos.", alvo: { seletor: "#conteudo button", texto: "Demonstrativo mês a mês" } },
  ] },
  { id: "planejamento", nome: "Campanhas e planejamento", passos: [
    { id: "campanha-plano", rota: "/planejamento", titulo: "Conecte a campanha às ações do time", descricao: "Uma campanha reúne período, produtos e ações. A seleção da campanha mantém o contexto enquanto você muda a forma de acompanhar o plano.", experimentar: "Escolha uma campanha na navegação da área.", alvo: { seletor: "#conteudo .st-project-list" } },
    { id: "quadro-plano", rota: "/planejamento", titulo: "Acompanhe a execução pelo quadro", descricao: "O quadro organiza as ações por andamento. Os detalhes mantêm responsáveis, datas e contexto junto da tarefa.", experimentar: "Escolha Quadro e abra uma ação para conferir os campos.", alvo: { seletor: "#conteudo button", texto: "Quadro" } },
    { id: "mapa-plano", rota: "/planejamento", titulo: "Veja as relações no mapa da campanha", descricao: "O mapa apresenta a organização das ações em outra leitura. Calendário e foco continuam disponíveis para acompanhar datas e prioridades.", experimentar: "Selecione Mapa e explore a campanha; depois compare com Calendário.", alvo: { seletor: "#conteudo button", texto: "Mapa" } },
  ] },
  { id: "envios", nome: "Envios e documentos", passos: [
    { id: "prioridade-envios", rota: "/mercado-livre/envios", titulo: "Priorize o que precisa ser despachado", descricao: "A lista reúne prazo, situação e produtos dos pedidos. O recorte da conta mantém cada operação no contexto correto.", experimentar: "Filtre os pedidos e selecione um envio do exemplo.", alvo: { seletor: "#conteudo .shipping-workspace, #conteudo .envios-lista" } },
    { id: "documentos-envios", rota: "/mercado-livre/envios", titulo: "Confira os documentos antes de gerar", descricao: "A revisão reúne os pedidos selecionados e as opções de documentos. No cenário fictício, qualquer arquivo gerado é apenas um exemplo de demonstração.", experimentar: "Abra a revisão de documentos para conhecer etiquetas, DANFE e separação.", alvo: { seletor: "#conteudo button", texto: "documentos" } },
  ] },
  { id: "anual", nome: "Vendas no ano", passos: [
    { id: "resultado-anual", rota: "/vendas/anual", titulo: "Veja o ano por inteiro", descricao: "Receita e meta mostram o caminho percorrido no ano.", experimentar: "Confira os meses com movimento no exemplo.", alvo: { seletor: "#conteudo .gerizo-annual .decision-comparison" } },
    { id: "evolucao-anual", rota: "/vendas/anual", titulo: "Compare mês com mês", descricao: "As barras colocam a receita realizada ao lado da meta.", experimentar: "Toque no gráfico para ver os valores.", alvo: { seletor: '#conteudo [data-gerizo-tour="anual-mensal"]' } },
  ] },
  { id: "cancelamentos", nome: "Cancelamentos", passos: [
    { id: "cancelamentos-valor", rota: "/vendas/cancelamentos", titulo: "Quanto voltou da venda?", descricao: "O valor cancelado mostra a parte que saiu do faturamento.", experimentar: "Confira o valor e o período.", alvo: { seletor: '#conteudo [aria-label="Valor cancelado"]' } },
    { id: "cancelamentos-sku", rota: "/vendas/cancelamentos", titulo: "Encontre o produto", descricao: "A lista mostra quais produtos concentraram os cancelamentos.", experimentar: "Compare unidades e valor por SKU.", alvo: { seletor: '#conteudo [data-gerizo-tour="cancelamentos-sku"]' } },
  ] },
  { id: "precificacao", nome: "Preço e cotação", passos: [
    { id: "precos-canais", rota: "/produtos/precificacao", titulo: "O preço fecha a conta?", descricao: "Preço, frete e taxas entram no cálculo da margem.", experimentar: "Experimente outro preço na coluna Simular.", alvo: { seletor: '#conteudo [aria-label="Tabela de preços e custos"]' } },
    { id: "cotacao-preco", rota: "/produtos/precificacao", titulo: "Compare os canais", descricao: "A cotação calcula o preço para a margem que você escolheu.", experimentar: "Selecione um produto e informe suas medidas.", alvo: { seletor: '#conteudo [data-gerizo-tour="cotacao-produto"]' } },
  ] },
  { id: "conversa", nome: "Conversar", passos: [
    { id: "perguntas-conversa", rota: "/conversa", titulo: "Comece por uma pergunta", descricao: "As sugestões ajudam a investigar vendas, mídia e envios.", experimentar: "Toque em uma sugestão ou escreva sua pergunta.", alvo: { seletor: '#conteudo [data-gerizo-tour="perguntas-conversa"], #conteudo .op-conversation form' } },
    { id: "sua-pergunta", rota: "/conversa", titulo: "Pergunte do seu jeito", descricao: "Use a conversa para chegar ao número e à tela certa.", experimentar: "Escreva sua pergunta e toque em enviar.", alvo: { seletor: '#conteudo .op-conversation form' } },
  ] },
];

export function caminhoTourReal(pathname: string) {
  const caminho = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return caminho || "/";
}
export function correspondeRotaTourReal(atual: string, destino: string) {
  if (caminhoTourReal(atual) !== caminhoTourReal(destino)) return false;
  const exigidos = new URLSearchParams(destino.split("?")[1]?.split("#")[0] ?? "");
  const consulta = new URLSearchParams(atual.split("?")[1]?.split("#")[0] ?? "");
  return [...exigidos].every(([chave, valor]) => consulta.get(chave) === valor);
}
export function capituloDaRotaTourReal(pathname: string) {
  const caminho = caminhoTourReal(pathname);
  return TOUR_REAL.find(c => c.passos.some(p => caminhoTourReal(p.rota) === caminho));
}
