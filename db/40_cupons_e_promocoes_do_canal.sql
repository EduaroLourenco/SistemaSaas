-- ═══════════════════════════════════════════════════════════════════════
--  40. Cupons e as promoções VIVAS do canal
--
--  O que faltava
--  ─────────────
--  A plataforma conhecia promoção só pelo que foi PROCESSADO: a planilha
--  da Central de Promoções passa pelo motor, grava `historico_promocoes` e
--  `campanhas`. Isso responde "o que decidimos", e não "o que está no ar".
--
--  E cupom não aparecia em lugar nenhum. A Probel roda hoje um cupom de 5%
--  ("Semana Pro", C-MLB6017095, compra de R$ 950 a R$ 1.000, de 15 a
--  23/10) e não tinha como medir.
--
--  O que a API devolve de verdade
--  ──────────────────────────────
--  Perguntei à conta real em 16/10/2026. `GET /seller-promotions/users/
--  {id}?app_version=v2` devolve as promoções vivas, e na Probel são oito,
--  de seis tipos:
--
--    LIGHTNING                relâmpago
--    SMART                    desconto inteligente do canal
--    PRE_NEGOTIATED           o pré-acordo, com tarifa reduzida
--    SELLER_CAMPAIGN          campanha do próprio vendedor
--    SELLER_COUPON_CAMPAIGN   cupom
--    DEAL                     oferta do dia / evento
--
--  Os itens de cada uma saem de `promotions/{id}/items`, com preço
--  original, percentual e janela por anúncio.
--
--  O USO do cupom, porém, não está na API de cupom: ela diz o que foi
--  configurado. Quem diz o que foi usado é o PEDIDO, em `coupon.amount` —
--  nos 20 últimos pedidos da Probel, 11 vieram com cupom. Por isso a
--  coluna em `pedidos`.
--
--  Afiliados ficou de fora, e não por escolha: `/affiliate-program/...`,
--  `/affiliates/...`, `/marketplace/affiliates/...` e
--  `/advertising/affiliates/...` devolvem 404 para esta aplicação. Sem
--  endpoint não há tela honesta — ver o registro em docs/adr.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  1. O cupom concedido no pedido
--
--  Zero e nulo são diferentes: zero é pedido sem cupom, nulo é pedido de
--  antes desta coluna existir, ou de canal que não informa.
-- ─────────────────────────────────────────────────────────────────────
alter table pedidos
  add column if not exists cupom numeric(14,2) check (cupom >= 0);

comment on column pedidos.cupom is
  'Desconto de cupom concedido no pedido, em reais, como o canal informa em '
  'coupon.amount. É a única medida de USO de cupom: a API de campanha diz o '
  'que foi configurado, não o que foi usado. Ver db/40.';

-- ─────────────────────────────────────────────────────────────────────
--  2. As promoções vivas do canal
--
--  Tabela própria, e não `campanhas`: aquela guarda o que o motor
--  processou de planilha, com decisão por item e preço de tabela. Esta é o
--  retrato do que o canal diz estar no ar agora, incluindo tipo que nunca
--  passa por planilha (cupom, relâmpago, smart).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists promocoes_canal (
  id              uuid primary key default gen_random_uuid(),
  operacao_id     uuid not null references operacoes(id)    on delete cascade,
  conta_canal_id  uuid not null references contas_canal(id) on delete cascade,

  /* O id do canal: C-MLB6017095, P-MLB18061018, LGH-MLB1000. */
  codigo          text not null,
  tipo            text not null,
  sub_tipo        text,
  nome            text,
  status          text,
  inicio          timestamptz,
  fim             timestamptz,

  /* Cupom e desconto percentual. */
  percentual      numeric(8,4),
  valor_fixo      numeric(14,2),
  compra_minima   numeric(14,2),
  compra_maxima   numeric(14,2),
  /* O que o canal mandou, inteiro: ele acrescenta campo sem avisar, e
     migração por isso seria dívida. */
  bruto           jsonb not null default '{}'::jsonb,

  lido_em         timestamptz not null default now(),
  criado_em       timestamptz not null default now(),
  unique (conta_canal_id, codigo)
);
create index if not exists promocoes_canal_operacao on promocoes_canal (operacao_id, fim desc);
create index if not exists promocoes_canal_tipo on promocoes_canal (operacao_id, tipo);

create table if not exists promocao_canal_itens (
  id               uuid primary key default gen_random_uuid(),
  operacao_id      uuid not null references operacoes(id)       on delete cascade,
  promocao_id      uuid not null references promocoes_canal(id) on delete cascade,
  /* O MLB, e o anúncio quando o catálogo já o conhece. */
  codigo_externo   text not null,
  anuncio_id       uuid references anuncios(id) on delete set null,
  status           text,
  preco_original   numeric(14,2),
  preco_promocional numeric(14,2),
  percentual       numeric(8,4),
  inicio           timestamptz,
  fim              timestamptz,
  criado_em        timestamptz not null default now(),
  unique (promocao_id, codigo_externo)
);
create index if not exists promocao_itens_promocao on promocao_canal_itens (promocao_id);
create index if not exists promocao_itens_anuncio on promocao_canal_itens (anuncio_id);

comment on table promocoes_canal is
  'Retrato das promoções que o canal diz estar no ar, de GET '
  '/seller-promotions/users/{id}. Diferente de `campanhas`, que guarda o '
  'que o motor processou de planilha. Ver db/40.';

-- ─────────────────────────────────────────────────────────────────────
--  3. RLS no padrão das outras tabelas de dado
-- ─────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['promocoes_canal', 'promocao_canal_itens']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists %I_leitura on %I', t, t);
    execute format('create policy %I_leitura on %I for select using (pode_ver_operacao(operacao_id))', t, t);
    execute format('drop policy if exists %I_escrita on %I', t, t);
    execute format(
      'create policy %I_escrita on %I for all using (pode_editar_operacao(operacao_id)) with check (pode_editar_operacao(operacao_id))', t, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
--  CONFERIR
--
--    select tipo, count(*), min(inicio)::date, max(fim)::date
--      from promocoes_canal group by tipo order by 2 desc;
--
--    select p.nome, p.percentual, count(i.*) as itens
--      from promocoes_canal p
--      left join promocao_canal_itens i on i.promocao_id = p.id
--     where p.tipo = 'SELLER_COUPON_CAMPAIGN'
--     group by 1, 2;
--
--    select count(*) filter (where cupom > 0) as com_cupom,
--           count(*)                          as total,
--           sum(cupom)                        as desconto_dado
--      from pedidos where data >= current_date - 30;
--
--  SE ALGO QUEBRAR: O DESFAZER
--
--    drop table if exists promocao_canal_itens;
--    drop table if exists promocoes_canal;
--    alter table pedidos drop column if exists cupom;
-- ═══════════════════════════════════════════════════════════════════════
