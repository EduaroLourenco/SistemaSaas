-- ─────────────────────────────────────────────────────────────────────
--  O segundo número do pedido
--
--  O Mercado Livre identifica o mesmo pedido por dois números, e cada
--  relatório escolhe um:
--
--    listagem da Vtrina        id_pedido_marketplace   2000018217091300
--    painel de ERP e Meli      id_pedido_secundario    2000014803202263
--
--  São o mesmo pedido — mesma data, mesmo valor, mesma conta. Conferido
--  no dia 31/08: os nove pedidos batem um a um, e a soma dá R$ 11.442,68
--  nos dois lugares. Só o número mostrado difere.
--
--  Acontece em ~22% dos pedidos do Meli (2 de 6 e 4 de 18 nas amostras).
--  Sem guardar o segundo número, o relatório de tarifas do Meli não acha
--  esses pedidos: eram os 178 de 681 que não casavam.
-- ─────────────────────────────────────────────────────────────────────

begin;

alter table pedidos
  add column if not exists codigo_secundario citext;

comment on column pedidos.codigo_secundario is
  'Segundo identificador do canal (id_pedido_secundario). O relatório de tarifas do Meli usa este.';

-- Índice, não restrição única: o campo vem vazio na maioria dos pedidos,
-- e é usado para BUSCAR o pedido a partir do relatório do canal.
create index if not exists idx_pedidos_codigo_secundario
  on pedidos (operacao_id, codigo_secundario)
  where codigo_secundario is not null;

commit;
