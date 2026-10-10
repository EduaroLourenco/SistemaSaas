-- ═══════════════════════════════════════════════════════════════════════
--  35. Frete por produto, quando a faixa de peso não serve
--
--  ── Por que a faixa de peso não basta ──
--
--  `faixas_frete` (migração 10) resolve o frete pelo peso, que é como o
--  canal cobra na maioria dos casos. Mas o Mercado Livre cobra pelo peso
--  CUBADO, e aí o peso da balança deixa de prever o frete. Na Bom de
--  Compras, com os números da tabela de preços do cliente:
--
--    caçarola  3,143 kg → R$ 25,00
--    skate     2,532 kg → R$ 44,45
--
--  O skate é mais leve e paga quase o dobro, porque é comprido. Nenhuma
--  faixa de peso reproduz isso: qualquer intervalo que acerte um erra o
--  outro. Insistir na faixa obrigaria a inventar bandas que não existem, e
--  o preço mínimo sairia errado nos dois.
--
--  ── A decisão ──
--
--  Uma coluna no produto, que GANHA da faixa quando preenchida. A ordem
--  de precedência passa a ser, em `carregarPrecoAlvo()`:
--
--    1. frete praticado  — a média do que o canal cobrou nas vendas reais
--                          daquele SKU. Continua primeiro: é medição, não
--                          estimativa.
--    2. frete_unitario   — este. O número que a operação conhece do
--                          produto, inclusive o cubado.
--    3. faixa de peso    — o ponto de partida de quem ainda não tem nem um
--                          nem outro.
--
--  Fica em `produtos` e não numa tabela nova porque é um número por
--  produto, como a embalagem e a alíquota ao lado dele. Tabela própria só
--  se um dia precisar variar por canal — e aí a faixa já cobre o caso.
-- ═══════════════════════════════════════════════════════════════════════

alter table produtos
  add column if not exists frete_unitario numeric(14,2)
    check (frete_unitario >= 0);

comment on column produtos.frete_unitario is
  'Frete por unidade, por produto. Ganha da faixa de peso (faixas_frete) e '
  'perde do frete praticado nas vendas. Existe porque o Mercado Livre cobra '
  'pelo peso cubado: produto comprido e leve paga mais que pesado e '
  'compacto, e nenhuma faixa de peso acerta os dois. Ver db/35.';

-- ═══════════════════════════════════════════════════════════════════════
--  CONFERIR
--
--    select sku, custo_unitario, embalagem, frete_unitario, aliquota_impostos
--    from produtos
--    where frete_unitario is not null
--    order by sku;
--
--  SE ALGO QUEBRAR: O DESFAZER
--
--    alter table produtos drop column if exists frete_unitario;
--
--  A precedência volta a ser praticado → faixa, como antes.
-- ═══════════════════════════════════════════════════════════════════════
