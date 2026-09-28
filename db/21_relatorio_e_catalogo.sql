-- ═══════════════════════════════════════════════════════════════════════
--  O QUE O RELATÓRIO SEMANAL PRECISA E O BANCO NÃO GUARDAVA
--
--  Quatro coisas, e todas vinham sendo jogadas fora depois de cada
--  sincronização:
--
--   1. ESTOQUE. O catálogo do canal traz `available_quantity` em toda
--      leitura, e nada era gravado. Sem ele não existe cobertura de
--      estoque — a métrica que diz quantos dias faltam para a ruptura, e
--      que em 24/09 mostrou 11 anúncios de curva A zerados somando R$ 170
--      mil de receita em 90 dias.
--
--   2. CATÁLOGO. `price_to_win` diz se o anúncio ganha ou perde a página
--      de produto, por quanto ganharia, e quais alavancas fora de preço
--      estão em aberto. É o dado mais estratégico do Mercado Livre, e o
--      único que explica visita caindo sem nada ter mudado no anúncio.
--
--   3. FRETE DE VERDADE. `/shipments/{id}/costs` separa o que o vendedor
--      paga do que o comprador paga e do subsídio da campanha. Sem isso a
--      margem por pedido usa frete estimado.
--
--   4. MÍDIA DE FORA DO CANAL. O Google Ads do site não tem onde entrar.
--
--  Executar depois de 20_cadastro_e_convites.sql. Seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────
--  1. Estoque no anúncio
-- ─────────────────────────────────────────────────────────────────────

alter table anuncios add column if not exists estoque integer;
alter table anuncios add column if not exists vendidos_total integer;
alter table anuncios add column if not exists frete_gratis boolean;
alter table anuncios add column if not exists logistica text;

comment on column anuncios.estoque is
  'available_quantity da última sincronização. Nulo = nunca lido, que é '
  'diferente de zero. Zero é ruptura.';

/*
 * Série de estoque, para cobertura e para saber QUANDO zerou.
 *
 * O estoque em `anuncios` responde "quanto tem agora" e é sobrescrito. A
 * pergunta do relatório é outra: "há quantos dias está zerado" e "quanto
 * caiu na semana". Isso só uma série responde.
 */
create table if not exists anuncio_estoque_diario (
  id          uuid primary key default gen_random_uuid(),
  operacao_id uuid    not null references operacoes(id) on delete cascade,
  anuncio_id  uuid    not null references anuncios(id)  on delete cascade,
  data        date    not null,
  estoque     integer not null check (estoque >= 0),
  criado_em   timestamptz not null default now(),
  unique (anuncio_id, data)
);
create index if not exists estoque_diario_operacao on anuncio_estoque_diario (operacao_id, data desc);

-- ─────────────────────────────────────────────────────────────────────
--  2. Catálogo: ganhando, perdendo, e o preço que faria ganhar
-- ─────────────────────────────────────────────────────────────────────

create table if not exists anuncio_catalogo_diario (
  id                   uuid primary key default gen_random_uuid(),
  operacao_id          uuid    not null references operacoes(id) on delete cascade,
  anuncio_id           uuid    not null references anuncios(id)  on delete cascade,
  data                 date    not null,

  -- winning | sharing_first_place | losing | listed | not_listed
  situacao             text    not null,
  preco_atual          numeric(14,2),
  preco_para_ganhar    numeric(14,2),
  -- maximum | high | medium | low — a fatia de visita que a posição dá
  fatia_visita         text,
  dividindo_primeiro   integer,
  vencedor_preco       numeric(14,2),
  catalogo_produto_id  text,
  elegivel             boolean,
  /* Por que não compete, quando não compete. Lista do canal, ex.:
     item_not_opted_in. */
  motivos              text[] not null default '{}',
  /* Alavancas fora de preço: fulfillment, free_installments,
     free_shipping, shipping_collect, same_day_shipping — cada uma como
     boosted ou opportunity. Fica jsonb porque o canal acrescenta tipo
     novo sem avisar, e migração por isso seria dívida. */
  alavancas            jsonb  not null default '[]'::jsonb,

  criado_em            timestamptz not null default now(),
  unique (anuncio_id, data)
);
create index if not exists catalogo_diario_operacao on anuncio_catalogo_diario (operacao_id, data desc);
create index if not exists catalogo_diario_situacao on anuncio_catalogo_diario (operacao_id, data desc, situacao);

-- ─────────────────────────────────────────────────────────────────────
--  3. Frete por pedido, do jeito que o canal cobra
-- ─────────────────────────────────────────────────────────────────────

alter table pedidos add column if not exists logistica text;
alter table pedidos add column if not exists frete_lista numeric(14,2);
alter table pedidos add column if not exists frete_comprador numeric(14,2);
alter table pedidos add column if not exists subsidio_frete numeric(14,2);
alter table pedidos add column if not exists uf_destino char(2);

comment on column pedidos.frete_lista is
  'Preço de tabela do frete. O que o vendedor paga fica em frete_vendedor '
  'e o que o comprador paga em frete_comprador; a diferença é subsídio.';

-- ─────────────────────────────────────────────────────────────────────
--  4. Mídia de fora do canal (Google Ads do site)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists midia_externa (
  id            uuid primary key default gen_random_uuid(),
  operacao_id   uuid    not null references operacoes(id) on delete cascade,
  canal_id      uuid    references canais(id) on delete set null,
  -- 'google_ads', 'meta_ads', 'tiktok'… texto livre: prender a enum
  -- obrigaria migração a cada plataforma nova.
  plataforma    text    not null,
  campanha      text,
  data          date    not null,

  investimento  numeric(14,2) not null default 0 check (investimento >= 0),
  impressoes    integer       not null default 0 check (impressoes >= 0),
  cliques       integer       not null default 0 check (cliques >= 0),
  /* Receita ATRIBUÍDA pela plataforma. Não é receita do canal: as duas
     medem coisas diferentes e somá-las conta venda duas vezes. */
  receita       numeric(14,2) not null default 0 check (receita >= 0),
  pedidos       integer       not null default 0 check (pedidos >= 0),

  origem        origem_dado   not null default 'manual',
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now(),
  unique (operacao_id, plataforma, coalesce(campanha, ''), data)
);
create index if not exists midia_externa_periodo on midia_externa (operacao_id, data desc);

-- ─────────────────────────────────────────────────────────────────────
--  5. Reputação da conta, por dia
-- ─────────────────────────────────────────────────────────────────────

create table if not exists conta_reputacao_diaria (
  id                uuid primary key default gen_random_uuid(),
  operacao_id       uuid not null references operacoes(id)    on delete cascade,
  conta_canal_id    uuid not null references contas_canal(id) on delete cascade,
  data              date not null,

  nivel             text,              -- 5_green, 4_light_green…
  categoria         text,              -- platinum, gold, silver
  reclamacoes_taxa  numeric(8,5),
  cancelamentos_taxa numeric(8,5),
  atrasos_taxa      numeric(8,5),
  vendas_60d        integer,
  perguntas_sem_resposta integer,

  criado_em         timestamptz not null default now(),
  unique (conta_canal_id, data)
);

-- ─────────────────────────────────────────────────────────────────────
--  6. RLS — o padrão das outras tabelas de dado
-- ─────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['anuncio_estoque_diario', 'anuncio_catalogo_diario', 'midia_externa', 'conta_reputacao_diaria']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_leitura on %I', t, t);
    execute format(
      'create policy %I_leitura on %I for select using (pode_ver_operacao(operacao_id))', t, t);
    execute format('drop policy if exists %I_escrita on %I', t, t);
    execute format(
      'create policy %I_escrita on %I for all using (pode_editar_operacao(operacao_id)) with check (pode_editar_operacao(operacao_id))', t, t);
  end loop;
end $$;

commit;
