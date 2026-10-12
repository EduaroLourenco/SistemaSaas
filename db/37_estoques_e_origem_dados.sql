-- 37 · Estoques por origem/local e identificação da origem de cada métrica.
-- Somente estrutura e identificação histórica. Não modifica saldos ou valores.
-- Seguro executar novamente. Execute no SQL Editor do Supabase deste projeto.
begin;

create unique index if not exists integracoes_id_operacao on integracoes(id, operacao_id);

create table if not exists estoque_fontes (
  integracao_id uuid primary key references integracoes(id) on delete cascade,
  operacao_id uuid not null references operacoes(id) on delete cascade,
  provedor text not null,
  estado text not null default 'aguardando' check (estado in ('aguardando','parcial','atualizado','erro')),
  locais jsonb not null default '[]'::jsonb,
  produtos_lidos integer not null default 0,
  proxima_pagina integer,
  iniciada_em timestamptz,
  atualizada_em timestamptz,
  erro text,
  foreign key (integracao_id, operacao_id) references integracoes(id, operacao_id)
);

create table if not exists estoque_saldos (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references operacoes(id) on delete cascade,
  integracao_id uuid not null references integracoes(id) on delete cascade,
  conta_canal_id uuid references contas_canal(id) on delete cascade,
  canal_id uuid references canais(id) on delete cascade,
  provedor text not null,
  origem text not null check (origem in ('canal','erp')),
  produto_externo text not null,
  sku citext,
  titulo text not null default '',
  local_id text not null,
  local_nome text not null,
  local_tipo text not null,
  disponivel numeric(18,4),
  fisico numeric(18,4),
  reservado numeric(18,4),
  anuncios text[] not null default '{}',
  consultado_em timestamptz not null default now(),
  atualizado_origem_em timestamptz,
  observacao text,
  foreign key (integracao_id, operacao_id) references integracoes(id, operacao_id),
  unique (integracao_id, produto_externo, local_id)
);
create index if not exists estoque_saldos_empresa_sku on estoque_saldos(operacao_id, sku);
create index if not exists estoque_saldos_conta on estoque_saldos(conta_canal_id);

comment on table estoque_saldos is 'Saldo informado pela API por produto e localização. ERP e canal podem espelhar o mesmo estoque: não somar entre origens. Null é desconhecido, zero é saldo medido.';
comment on column estoque_saldos.produto_externo is 'Bling: id do produto. Mercado Livre: user_product_id; fallback identificado por item ou inventário. Evita contar novamente anúncios do mesmo User Product.';
comment on column estoque_saldos.reservado is 'Reserva quando fornecida pela origem; não confundir saldo indisponível do Full com reserva.';

alter table estoque_fontes enable row level security;
alter table estoque_fontes force row level security;
alter table estoque_saldos enable row level security;
alter table estoque_saldos force row level security;
drop policy if exists estoque_fontes_leitura on estoque_fontes;
create policy estoque_fontes_leitura on estoque_fontes for select to authenticated
  using (operacao_id in (select operacoes_do_usuario()));
drop policy if exists estoque_saldos_leitura on estoque_saldos;
create policy estoque_saldos_leitura on estoque_saldos for select to authenticated
  using (operacao_id in (select operacoes_do_usuario()));
-- Escritas exclusivamente pelas rotas autenticadas/rotinas com service_role.
grant select on estoque_fontes, estoque_saldos to authenticated;
grant all on estoque_fontes, estoque_saldos to service_role;

alter table vendas_diarias
  add column if not exists origem_vendas text,
  add column if not exists origem_visitas text,
  add column if not exists origem_ads text,
  add column if not exists vendas_atualizadas_em timestamptz,
  add column if not exists visitas_atualizadas_em timestamptz,
  add column if not exists ads_atualizados_em timestamptz;
comment on column vendas_diarias.origem_ads is 'Origem da mídia, independente da origem de vendas/visitas na mesma linha. api, planilha, manual ou mista.';

alter table anuncio_ads
  add column if not exists conta_canal_id uuid references contas_canal(id) on delete set null,
  add column if not exists origem text;
update anuncio_ads ad set conta_canal_id = a.conta_canal_id
  from anuncios a
  where ad.operacao_id = a.operacao_id and ad.codigo_externo = a.codigo_externo
    and ad.conta_canal_id is null;
-- Só é possível afirmar a origem dos relatórios com lote de importação.
update anuncio_ads set origem = 'planilha' where origem is null and importacao_id is not null;
create index if not exists anuncio_ads_conta_periodo on anuncio_ads(conta_canal_id, inicio, fim);

notify pgrst, 'reload schema';
commit;
