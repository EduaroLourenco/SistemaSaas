-- ─────────────────────────────────────────────────────────────────────
--  Uma linha por JANELA, não por anúncio
--
--  O pré-acordo da Probel não é um preço: é uma agenda. O mesmo anúncio
--  tem o preço do mês numa janela de 30 dias (01/11 a 01/12) e o preço
--  do relâmpago em janelas de 12 horas (15h às 3h do dia seguinte), nos
--  dias combinados com o consultor. O MLB5299288202 tem onze janelas em
--  novembro: 2.552,87 no mês e 2.233,00 em dez datas.
--
--  O canal sempre devolveu isso — `/seller-promotions/promotions/{id}/items`
--  manda uma linha por oferta, com start_date, end_date, preço e status.
--  Quem jogava fora era este banco: `unique (promocao_id, codigo_externo)`
--  só cabia UMA janela por anúncio, e por isso `semRepetidos` guardava a
--  última e descartava as outras dez. Era uma agenda entrando e um preço
--  sendo gravado.
--
--  A oferta entra na chave porque é o id da janela no canal
--  (OFFER-MLB5299288202-14263117227). `not null default ''` porque chave
--  única com nulo não deduplica no Postgres: duas linhas com oferta nula
--  passariam as duas, e era justamente a repetição que derrubava o lote
--  inteiro com "ON CONFLICT DO UPDATE command cannot affect row a second
--  time".
--
--  As linhas que já estão lá ficam com oferta '' — são o retrato antigo,
--  de uma janela por anúncio, e a próxima sincronização as reescreve.
-- ─────────────────────────────────────────────────────────────────────

alter table public.promocao_canal_itens
  add column if not exists oferta text not null default '';

alter table public.promocao_canal_itens
  drop constraint if exists promocao_canal_itens_promocao_id_codigo_externo_key;

create unique index if not exists promocao_canal_itens_janela
  on public.promocao_canal_itens (promocao_id, codigo_externo, oferta);

/* A pergunta da tela é "o que está agendado para este anúncio, em ordem
   de data" — e ela atravessa promoções, então o índice começa no anúncio. */
create index if not exists promocao_itens_agenda
  on public.promocao_canal_itens (anuncio_id, inicio);

comment on column public.promocao_canal_itens.oferta is
  'O id da janela no canal (offer_id, ou ref_id quando é convite). Entra '
  'na chave única porque o mesmo anúncio tem várias janelas na mesma '
  'promoção: preço do mês em 30 dias e relâmpago em 12 horas. Ver db/47.';
