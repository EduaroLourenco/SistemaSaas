-- ══════════════════════════════════════════════════════════════
-- 07 — Piso e desconto extra no histórico de promoções
-- ══════════════════════════════════════════════════════════════
--
-- Rode depois dos scripts 01 a 06. Seguro repetir: tudo é `if not exists`.
--
-- POR QUÊ
--
-- O histórico guardava o preço de tabela e o preço ofertado. Faltavam os
-- dois números que decidem a promoção:
--
--   piso        = tabela − 5%, o menor preço que preserva a margem
--   com extra   = piso menos o desconto extra da campanha
--
-- Poderiam ser calculados na tela a partir da tabela. Não devem: a regra
-- do piso pode mudar, e um histórico recalculado com a regra de hoje
-- passaria a mostrar uma decisão que ninguém tomou. O que foi decidido na
-- época fica gravado como foi.
--
-- O desconto extra vai no PROCESSAMENTO, não no item: ele vale para a
-- rodada inteira, e repetir em cada linha abriria espaço para divergirem.

alter table historico_promocoes
  add column if not exists preco_piso       numeric(14,2),
  add column if not exists preco_com_extra  numeric(14,2),
  add column if not exists tipo_campanha    text,
  add column if not exists tags             text[];

comment on column historico_promocoes.preco_piso is
  'Tabela menos 5% — o menor preço ofertável sem furar a margem, como valia no processamento.';

comment on column historico_promocoes.preco_com_extra is
  'Piso com o desconto extra da rodada. Nulo em campanha COM redução de tarifa: ali o preço é do canal.';

comment on column historico_promocoes.tipo_campanha is
  '"Com Redução" ou "Sem Redução" — decide qual das duas regras foi aplicada.';

comment on column historico_promocoes.tags is
  'Cenários de revisão do item: tabela_acima_ml, tabela_acima_original, quase, folga.';

alter table processamentos_promocao
  add column if not exists desconto_extra numeric(7,4) not null default 0,
  add column if not exists arquivos       text[];

comment on column processamentos_promocao.desconto_extra is
  'Desconto extra aplicado sobre o piso nesta rodada, em fração (0.10 = 10%).';

comment on column processamentos_promocao.arquivos is
  'Nomes das planilhas enviadas juntas nesta rodada.';

-- O histórico é consultado por anúncio e por data o tempo todo.
create index if not exists historico_promocoes_mlb_data_idx
  on historico_promocoes (mlb, data_processamento desc);

create index if not exists historico_promocoes_sku_idx
  on historico_promocoes (sku);

-- Conferência:
-- select column_name from information_schema.columns
--  where table_name = 'historico_promocoes'
--    and column_name in ('preco_piso','preco_com_extra','tipo_campanha','tags');
