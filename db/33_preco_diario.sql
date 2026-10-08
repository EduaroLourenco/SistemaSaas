-- ═══════════════════════════════════════════════════════════════════════
--  33 · Preço da vitrine, um por anúncio por dia
--
--  A análise de queda precisa responder "foi preço?". O preço vendido sai
--  dos pedidos, mas só existe em dia com venda — e o dia sem venda depois
--  de um aumento é justamente o que interessa. A sincronização já tira um
--  retrato diário de cada anúncio (o estoque); o preço entra no mesmo
--  retrato, sem chamada nova ao canal.
--
--  Seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

alter table anuncio_estoque_diario
  add column if not exists preco          numeric(14,2),
  add column if not exists preco_original numeric(14,2);

comment on column anuncio_estoque_diario.preco is
  'Preço na vitrine no dia da sincronização (o que o comprador paga).';
comment on column anuncio_estoque_diario.preco_original is
  'Preço riscado, quando o anúncio está com desconto.';

notify pgrst, 'reload schema';
