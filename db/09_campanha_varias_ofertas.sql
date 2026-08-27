-- ═══════════════════════════════════════════════════════════════════════
--  UM ANÚNCIO PODE TER VÁRIAS OFERTAS NA MESMA CAMPANHA
--
--  `campanha_itens` tinha `unique (campanha_id, anuncio_id)` — uma linha
--  por anúncio por campanha. Isso presumia que o canal faz uma proposta
--  por anúncio, e não é o que acontece.
--
--  A planilha de redução de tarifa traz uma linha por FAIXA de desconto
--  oferecida. O arquivo de 27/08 tem 549 linhas para 266 anúncios: o
--  MLB5393282624 aparece três vezes, a R$ 1.510, R$ 1.563,02 e R$ 1.465.
--  São três propostas diferentes para o mesmo anúncio, e a decisão de
--  entrar ou não é tomada olhando as três lado a lado.
--
--  A chave única fazia a gravação inteira falhar com violação de chave —
--  e o arquivo já processado nem chegava a aparecer na tela.
--
--  Guardar só uma delas seria decidir pelo usuário qual proposta importa.
--  Não dá: às vezes vale entrar em mais de uma, às vezes em nenhuma, e
--  isso só se enxerga comparando.
--
--  Sem chave única, o que impede duplicar ao reprocessar é a aplicação:
--  ela apaga as ofertas da campanha antes de gravar as novas. A planilha
--  nova é a verdade corrente sobre o que o canal está oferecendo — não
--  um acréscimo ao que veio antes.
--
--  Executar depois de 07_promocoes_precos.sql. É seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

alter table campanha_itens
  drop constraint if exists campanha_itens_campanha_id_anuncio_id_key;

-- De qual rodada veio esta oferta. Sem isto não há como distinguir o que
-- a planilha de hoje trouxe do que sobrou de uma anterior.
alter table campanha_itens
  add column if not exists processamento_id uuid
    references processamentos_promocao(id) on delete set null;

-- De onde a oferta veio na planilha. O canal não dá nome às faixas, então
-- o que permite conferir uma oferta contra o arquivo é arquivo + linha.
alter table campanha_itens
  add column if not exists arquivo text;

alter table campanha_itens
  add column if not exists linha_planilha integer;

-- A tela de comparação lê todas as ofertas de um anúncio de uma vez.
create index if not exists campanha_itens_por_anuncio
  on campanha_itens (operacao_id, anuncio_id, campanha_id);

-- E a limpeza antes de regravar apaga por campanha.
create index if not exists campanha_itens_por_campanha
  on campanha_itens (campanha_id);
