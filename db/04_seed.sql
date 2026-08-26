-- ═══════════════════════════════════════════════════════════════════════
--  PLATAFORMA — DADOS DE PARTIDA
--
--  Cria uma organização, três operações, os canais, as categorias
--  financeiras e o glossário completo. Idempotente: pode rodar de novo.
--
--  Executar depois de 03_views.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  1. Organização e operações
-- ─────────────────────────────────────────────────────────────────────

insert into organizacoes (id, nome, slug)
values ('00000000-0000-0000-0000-000000000001', 'Minha empresa', 'principal')
on conflict (slug) do nothing;

insert into operacoes (id, organizacao_id, nome, slug) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Operação principal', 'principal'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Operação B2B',       'b2b'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Loja própria',       'loja')
on conflict (organizacao_id, slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────
--  2. Canais e contas
--
--  cor_serie aponta para --s1..--s10 do design system: o canal tem a
--  mesma cor no gráfico, no cartão e na legenda, em toda a aplicação.
-- ─────────────────────────────────────────────────────────────────────

-- Os canais são os mesmos da planilha de acompanhamento, na mesma ordem.
-- "2P / Full" ficou de fora a pedido — é modalidade de envio, não canal.
insert into canais (operacao_id, codigo, nome, tipo, cor_serie, ordem) values
  ('00000000-0000-0000-0000-000000000101', 'mercado_livre', 'Mercado Livre',      'marketplace',  1, 1),
  ('00000000-0000-0000-0000-000000000101', 'amazon',        'Amazon',             'marketplace',  2, 2),
  ('00000000-0000-0000-0000-000000000101', 'magalu',        'Magalu',             'marketplace',  3, 3),
  ('00000000-0000-0000-0000-000000000101', 'madeira',       'Madeira Madeira',    'marketplace',  4, 4),
  ('00000000-0000-0000-0000-000000000101', 'zema',          'Zema',               'marketplace',  5, 5),
  ('00000000-0000-0000-0000-000000000101', 'casas_bahia',   'Casas Bahia',        'marketplace',  6, 6),
  ('00000000-0000-0000-0000-000000000101', 'vtex',          'Loja própria (VTEX)','loja_propria', 7, 7),
  ('00000000-0000-0000-0000-000000000101', 'outros',        'Outros',             'outro',        9, 8),
  ('00000000-0000-0000-0000-000000000102', 'venda_direta',  'Venda direta',       'b2b',          8, 1)
on conflict (operacao_id, codigo) do nothing;

-- ── Contas por canal ────────────────────────────────────────────────
--
-- O Mercado Livre opera com DUAS contas de vendedor, e elas vendem coisas
-- diferentes: a de São Paulo é pronta entrega, a segunda vende a prazo.
-- Ficam como contas do MESMO canal, não como canais separados — assim o
-- "Mercado Livre" do painel soma as duas, e ainda dá para abrir por conta
-- quando a pergunta for sobre uma delas.
--
-- Importante: cada conta tem seu PRÓPRIO token na API. Uma autorização não
-- enxerga os pedidos da outra.

insert into contas_canal (operacao_id, canal_id, nome, padrao, fulfillment)
select c.operacao_id, c.id, 'Conta principal', true, c.codigo in ('amazon')
from canais c
where c.codigo <> 'mercado_livre'
on conflict (canal_id, nome) do nothing;

insert into contas_canal (operacao_id, canal_id, nome, padrao, fulfillment)
select c.operacao_id, c.id, 'São Paulo — pronta entrega', true, true
from canais c
where c.codigo = 'mercado_livre'
on conflict (canal_id, nome) do nothing;

insert into contas_canal (operacao_id, canal_id, nome, padrao, fulfillment)
select c.operacao_id, c.id, '2ª conta — venda a prazo', false, false
from canais c
where c.codigo = 'mercado_livre'
on conflict (canal_id, nome) do nothing;

-- ─────────────────────────────────────────────────────────────────────
--  3. Categorias financeiras
-- ─────────────────────────────────────────────────────────────────────

insert into categorias_financeiras (operacao_id, nome, tipo, grupo, cor_serie) values
  ('00000000-0000-0000-0000-000000000101', 'Venda de mercadoria',      'entrada', 'Operacional',  1),
  ('00000000-0000-0000-0000-000000000101', 'Repasse de marketplace',   'entrada', 'Operacional',  2),
  ('00000000-0000-0000-0000-000000000101', 'Outras receitas',          'entrada', 'Não operacional', 9),

  ('00000000-0000-0000-0000-000000000101', 'Compra de mercadoria',     'saida',   'Mercadoria',   1),
  ('00000000-0000-0000-0000-000000000101', 'Frete de venda',           'saida',   'Mercadoria',   2),
  ('00000000-0000-0000-0000-000000000101', 'Frete de compra',          'saida',   'Mercadoria',   3),
  ('00000000-0000-0000-0000-000000000101', 'Comissão de marketplace',  'saida',   'Canais',       4),
  ('00000000-0000-0000-0000-000000000101', 'Investimento em mídia',    'saida',   'Canais',       5),
  ('00000000-0000-0000-0000-000000000101', 'Embalagem',                'saida',   'Mercadoria',   6),
  ('00000000-0000-0000-0000-000000000101', 'Folha de pagamento',       'saida',   'Pessoal',      7),
  ('00000000-0000-0000-0000-000000000101', 'Encargos e benefícios',    'saida',   'Pessoal',      8),
  ('00000000-0000-0000-0000-000000000101', 'Impostos',                 'saida',   'Tributário',   9),
  ('00000000-0000-0000-0000-000000000101', 'Aluguel e estrutura',      'saida',   'Estrutura',   10),
  ('00000000-0000-0000-0000-000000000101', 'Serviços de terceiros',    'saida',   'Estrutura',    4),
  ('00000000-0000-0000-0000-000000000101', 'Tarifas bancárias',        'saida',   'Financeiro',   9)
on conflict (operacao_id, nome) do nothing;

-- ─────────────────────────────────────────────────────────────────────
--  4. Glossário
--
--  A coluna `calculo` é o que a tela mostra em fonte monoespaçada.
-- ─────────────────────────────────────────────────────────────────────

insert into glossario (secao, termo, sigla, definicao, calculo, onde_encontrar, ordem) values
 ('Receita', 'Receita bruta', null,
  'Soma de tudo que foi vendido no período, antes de qualquer dedução.',
  'soma(receita dos pedidos)', 'Visão geral · Vendas por canal', 1),
 ('Receita', 'Receita líquida', null,
  'Receita bruta menos o valor dos pedidos cancelados. É o número que representa dinheiro que ficou.',
  'receita bruta − valor cancelado', 'Vendas · Anual e Semanal', 2),
 ('Receita', 'Receita paga', null,
  'Parcela da receita cujo pagamento foi confirmado pelo canal.',
  'soma(receita dos pedidos com pagamento aprovado)', 'Visão geral', 3),
 ('Receita', 'Ticket médio', null,
  'Valor médio de cada pedido. Sobe quando se vende itens mais caros ou mais itens por pedido.',
  'receita ÷ pedidos', 'Visão geral · Vendas por canal', 4),
 ('Receita', 'GMV', 'GMV',
  'Volume bruto de mercadoria — o total transacionado no canal, incluindo o que depois foi cancelado.',
  'soma(preço × quantidade)', 'Vendas por canal', 5),
 ('Receita', 'Margem de contribuição', null,
  'O que sobra da venda depois de tirar os custos que variam com ela: mercadoria, comissão, frete e mídia.',
  'receita − custo variável', 'Visão geral · Financeiro · Custos', 6),

 ('Pedidos', 'Pedidos', null,
  'Quantidade de compras fechadas no período, independentemente do número de itens em cada uma.',
  'contagem(pedidos)', 'Visão geral · Vendas', 1),
 ('Pedidos', 'Pedidos cancelados', null,
  'Pedidos desfeitos após a venda — por desistência, falha de pagamento ou ruptura de estoque.',
  'contagem(pedidos cancelados)', 'Vendas · Lançamentos', 2),
 ('Pedidos', 'Taxa de cancelamento', null,
  'Quanto da receita se perdeu em cancelamento. Acima de 5% costuma indicar problema de estoque ou de prazo.',
  '(valor cancelado ÷ receita) × 100', 'Vendas · Anual', 3),

 ('Tráfego', 'Visitas', null,
  'Quantas vezes a página do anúncio foi aberta. Vem do relatório do canal, normalmente em grão mensal.',
  'soma(visitas)', 'Anúncios · Análise de anúncios', 1),
 ('Tráfego', 'Sessões', null,
  'Visitas agrupadas por usuário e janela de tempo. É a métrica do GA4 para a loja própria.',
  'soma(sessões)', 'Integrações · Google Analytics 4', 2),
 ('Tráfego', 'Conversão', null,
  'Percentual de visitas que viraram pedido. É o indicador mais direto da qualidade do anúncio.',
  '(pedidos ÷ visitas) × 100', 'Anúncios · Análise de anúncios', 3),
 ('Tráfego', 'Curva A', null,
  'Os anúncios que, somados, respondem pelos primeiros 80% do total — de receita ou de tráfego. Poucos itens, quase todo o resultado.',
  'ordenar desc e acumular até 80% do total', 'Anúncios · Análise de anúncios', 4),

 ('Mídia', 'Investimento em ADS', 'ADS',
  'Quanto foi gasto em anúncios patrocinados dentro do canal.',
  'soma(investimento em mídia)', 'Vendas · Anual · Financeiro', 1),
 ('Mídia', 'TACOS', 'TACOS',
  'Custo de mídia sobre a receita TOTAL, não só a atribuída. Mostra o peso real da mídia no negócio.',
  '(investimento em mídia ÷ receita total) × 100', 'Vendas · Anual', 2),
 ('Mídia', 'ACOS', 'ACOS',
  'Custo de mídia sobre a receita ATRIBUÍDA à própria mídia. Mede a eficiência da campanha isoladamente.',
  '(investimento ÷ receita atribuída) × 100', 'Integrações · Ads', 3),
 ('Mídia', 'ROAS', 'ROAS',
  'Quantos reais de receita cada real investido em mídia trouxe. É o inverso do ACOS.',
  'receita atribuída ÷ investimento', 'Integrações · Ads', 4),
 ('Mídia', 'CAC', 'CAC',
  'Custo de aquisição de cliente: quanto se gastou em mídia para conquistar cada comprador novo.',
  'investimento em mídia ÷ clientes novos', 'Financeiro · Custos', 5),

 ('Preço', 'Preço ideal', null,
  'Preço calculado internamente para entregar a margem alvo, considerando custo, comissão e frete.',
  'custo ÷ (1 − margem alvo − comissão)', 'Anúncios · Preço ideal', 1),
 ('Preço', 'Comissão', null,
  'Percentual que o canal cobra sobre cada venda. Varia por tipo de anúncio e por categoria.',
  '(valor da comissão ÷ preço) × 100', 'Anúncios · Catálogo', 2),
 ('Preço', 'SALE_FEE', 'SALE_FEE',
  'Nome técnico da tarifa de venda do Mercado Livre. Em campanha, pode vir reduzida.',
  'tarifa aplicada pelo canal sobre a venda', 'Promoções · Campanhas', 3),
 ('Preço', 'Redução de tarifa', null,
  'Desconto que o canal concede na própria comissão para quem entra na campanha. Quando existe, participar costuma valer a pena mesmo baixando o preço.',
  'comissão normal − comissão da campanha', 'Promoções · Campanhas', 4),
 ('Preço', 'Subsídio', null,
  'Margem entregue ao vender abaixo do preço ideal. Só é saudável se trouxer volume proporcional.',
  'soma((preço ideal − preço praticado) × vendas)', 'Anúncios · Análise de anúncios', 5),

 ('Metas', 'Meta', null,
  'Objetivo de receita definido para o mês, por canal ou para a operação inteira.',
  'valor definido em Vendas · Metas', 'Vendas · Metas', 1),
 ('Metas', 'Ritmo vs. meta', null,
  'Compara o quanto já se realizou com o quanto do mês já passou. Diz se dá para bater a meta mantendo o passo.',
  '(realizado ÷ meta) ÷ (dias corridos ÷ dias do mês)', 'Visão geral · Vendas · Metas', 2),
 ('Metas', 'Projeção de fechamento', null,
  'Estimativa de onde o mês termina se o ritmo atual continuar.',
  '(realizado ÷ dias corridos) × dias do mês', 'Vendas · Metas', 3),

 ('Operação', 'WoW', 'WoW',
  'Variação sobre a semana anterior (week over week).',
  '((semana atual − semana anterior) ÷ semana anterior) × 100', 'Vendas · Semanal', 1),
 ('Operação', 'MoM', 'MoM',
  'Variação sobre o mês anterior (month over month).',
  '((mês atual − mês anterior) ÷ mês anterior) × 100', 'Vendas · Anual', 2),
 ('Operação', 'MTD', 'MTD',
  'Acumulado do mês até hoje (month to date).',
  'soma(do dia 1 até hoje)', 'Visão geral', 3),
 ('Operação', 'YTD', 'YTD',
  'Acumulado do ano até hoje (year to date).',
  'soma(de 1º de janeiro até hoje)', 'Vendas · Anual', 4)
on conflict (secao, termo) do nothing;
