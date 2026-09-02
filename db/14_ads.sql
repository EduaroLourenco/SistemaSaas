-- ─────────────────────────────────────────────────────────────────────
--  Tráfego pago: o relatório de Product Ads, por anúncio e campanha
--
--  O sistema já registrava investimento em mídia, mas só como um total
--  por dia e por canal, digitado à mão na tela de Lançamentos. Isso
--  responde "quanto gastei" e nada mais.
--
--  Este relatório traz o gasto POR ANÚNCIO e POR CAMPANHA, o que abre a
--  pergunta que interessa: o ads está pagando a própria conta em cada
--  anúncio? Com a margem por MLB que o sistema já calcula, dá para
--  responder — e nos dados reais quatro anúncios gastam mais mídia do
--  que a margem que produzem.
--
--  ── A granularidade é o período do relatório ──
--
--  O Meli exporta por intervalo (um mês, tipicamente), não por dia. A
--  chave natural inclui início e fim: subir o mesmo período duas vezes
--  sobrescreve, e subir o mês seguinte acrescenta. É a mesma regra das
--  outras importações — nenhuma delas soma.
--
--  ── Por que guarda o MLB e não só o anuncio_id ──
--
--  274 dos 277 anúncios do relatório existem em `anuncios`, mas três
--  não. Guardar o código bruto além da chave estrangeira permite gravar
--  o gasto de um anúncio que ainda não foi catalogado, em vez de perder
--  a linha — o catálogo pode chegar depois.
-- ─────────────────────────────────────────────────────────────────────

begin;

create table if not exists anuncio_ads (
  id              uuid primary key default gen_random_uuid(),
  operacao_id     uuid    not null references operacoes(id) on delete cascade,
  anuncio_id      uuid    references anuncios(id) on delete set null,
  codigo_externo  citext  not null,
  campanha        text    not null,
  inicio          date    not null,
  fim             date    not null,
  status          text,

  impressoes      integer       not null default 0 check (impressoes  >= 0),
  cliques         integer       not null default 0 check (cliques     >= 0),
  investimento    numeric(14,2) not null default 0 check (investimento >= 0),
  /* Receita que o canal ATRIBUI ao anúncio patrocinado. Não é a receita
     real do anúncio: nos dados medidos, o Meli atribui ao ads 55,9% de
     tudo que esses anúncios venderam no período. */
  receita         numeric(14,2) not null default 0 check (receita     >= 0),
  vendas_diretas   integer      not null default 0,
  vendas_indiretas integer      not null default 0,
  receita_direta   numeric(14,2) not null default 0,
  receita_indireta numeric(14,2) not null default 0,

  importacao_id   uuid    references importacoes(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  check (fim >= inicio),
  unique (operacao_id, codigo_externo, campanha, inicio, fim)
);

create index if not exists idx_anuncio_ads_periodo
  on anuncio_ads (operacao_id, inicio, fim);
create index if not exists idx_anuncio_ads_anuncio
  on anuncio_ads (anuncio_id) where anuncio_id is not null;

comment on table anuncio_ads is
  'Product Ads por anúncio e campanha, no período do relatório do canal.';
comment on column anuncio_ads.receita is
  'Receita ATRIBUÍDA pelo canal ao ads — inclui venda indireta e sobrepõe o orgânico.';

alter table anuncio_ads enable row level security;
alter table anuncio_ads force  row level security;

drop policy if exists anuncio_ads_leitura   on anuncio_ads;
drop policy if exists anuncio_ads_insercao  on anuncio_ads;
drop policy if exists anuncio_ads_alteracao on anuncio_ads;
drop policy if exists anuncio_ads_exclusao  on anuncio_ads;

create policy anuncio_ads_leitura on anuncio_ads
  for select using (pode_ver_operacao(operacao_id));
create policy anuncio_ads_insercao on anuncio_ads
  for insert with check (pode_editar_operacao(operacao_id));
create policy anuncio_ads_alteracao on anuncio_ads
  for update using (pode_editar_operacao(operacao_id))
             with check (pode_editar_operacao(operacao_id));
create policy anuncio_ads_exclusao on anuncio_ads
  for delete using (pode_editar_operacao(operacao_id));

commit;
