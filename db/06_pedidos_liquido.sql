-- ══════════════════════════════════════════════════════════════
-- 06 — Frete do vendedor e líquido recebido, em pedidos
-- ══════════════════════════════════════════════════════════════
--
-- Rode depois dos scripts 01 a 05. É seguro repetir: tudo aqui é
-- `if not exists`.
--
-- POR QUE:
--
-- A listagem de pedidos do hub traz três números financeiros diferentes,
-- e o schema só tinha lugar para um deles (`comissao`).
--
-- Nos relatórios reais, a coluna de comissão vem preenchida em poucos
-- pedidos — 66 de 722 no arquivo de agosto/2026 —, enquanto o "valor a
-- receber" aparece em praticamente todos os do Mercado Livre (225 de 227).
-- O líquido é o número mais completo E é o que bate com o extrato.
--
-- Guardar o líquido dentro de `comissao` seria mais rápido e estaria
-- errado: o líquido já desconta frete e outras taxas, então o campo
-- passaria a significar algo diferente do nome, e quem lesse depois não
-- teria como desconfiar. Coisas diferentes, colunas diferentes.

alter table pedidos
  add column if not exists frete_vendedor   numeric(14,2),
  add column if not exists liquido_recebido numeric(14,2);

comment on column pedidos.frete_vendedor is
  'Custo de frete bancado pelo vendedor, como o canal informa.';

comment on column pedidos.liquido_recebido is
  'O que sobra para o vendedor depois de tudo que o canal retém. Nos relatórios do hub vem mais completo que `comissao`, e é o número que bate com o extrato.';

-- Conferência: deve devolver as duas colunas.
-- select column_name from information_schema.columns
--  where table_name = 'pedidos'
--    and column_name in ('frete_vendedor', 'liquido_recebido');
