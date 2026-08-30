-- ════════════════════════════════════════════════════════════════
--  06 — Importação de planilhas
--  Rode depois dos scripts 01 a 05.
-- ════════════════════════════════════════════════════════════════

/* ── Por que existe uma tabela diária ─────────────────────────────

   O relatório de desempenho do Mercado Livre é DIÁRIO: o cabeçalho diz
   "no dia 27 de agosto de 2026". A tabela semanal tem chave única por
   (anúncio, ano, semana) — subir o dia 27 e depois o 28, que caem na
   mesma semana ISO, faria o segundo sobrescrever o primeiro.

   Não seria erro visível. Seria a semana inteira valendo o último dia
   importado, e ninguém notaria até o número não bater com o do canal.

   A regra é guardar no grão em que o dado chega. De diário se sobe para
   semanal quando quiser; de semanal não se desce para diário nunca.     */

create table anuncio_desempenho_diario (
  id            uuid     primary key default gen_random_uuid(),
  operacao_id   uuid     not null references operacoes(id) on delete cascade,
  anuncio_id    uuid     not null references anuncios(id)  on delete cascade,
  data          date     not null,

  visitas       integer       not null default 0 check (visitas >= 0),
  vendas        integer       not null default 0 check (vendas  >= 0),
  unidades      integer       not null default 0 check (unidades >= 0),
  receita       numeric(14,2) not null default 0 check (receita >= 0),
  participacao  numeric(7,4),

  conversao numeric(7,4)
    generated always as (round((vendas::numeric * 100) / nullif(visitas, 0), 4)) stored,

  importacao_id uuid references importacoes(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- A chave natural. É ela que faz reimportar o mesmo dia sobrescrever
  -- em vez de somar.
  unique (anuncio_id, data)
);

create index on anuncio_desempenho_diario (operacao_id, data desc);
create index on anuncio_desempenho_diario (anuncio_id, data desc);

/* ── Comissão e frete no item ─────────────────────────────────────

   Ficam anuláveis de propósito. Nulo diz "este canal não informa por
   item" e manda a tela cair no rateio, avisando que é rateio. Zero diria
   "não houve custo", que é outra afirmação.

   Confirmado com o export do Vtrina: a soma dos fretes de item bate
   exatamente com o frete do pedido, então ali não há rateio a fazer.     */

alter table pedido_itens
  add column if not exists comissao numeric(14,2),
  add column if not exists frete    numeric(14,2),
  add column if not exists desconto numeric(14,2);

comment on column pedido_itens.comissao is
  'Comissão do item. Nula quando o canal só informa por pedido.';
comment on column pedido_itens.frete is
  'Frete do item. Nulo quando o canal só informa por pedido.';

/* ── Reimportar substitui os itens do pedido ──────────────────────

   `pedidos` já tem unique (canal_id, codigo_externo), então o pedido em
   si é upsert. Os itens não têm chave natural confiável — o mesmo SKU
   pode aparecer duas vezes no mesmo pedido — então a importação apaga os
   itens do pedido e regrava.

   O cascade abaixo garante que apagar o pedido não deixe item órfão.     */

-- (a restrição já é on delete cascade em pedido_itens.pedido_id)

/* ── O enum de tipo de importação não previa pedidos ──────────── */

alter type tipo_relatorio add value if not exists 'pedidos';

/* ── Anotações em qualquer entidade ───────────────────────────────

   A versão anterior só servia para anúncio. O motivo de um número quase
   nunca está no número — "caiu porque o fornecedor atrasou" é
   conhecimento que hoje mora na cabeça de alguém e some nas férias.     */

create table anotacoes (
  id          uuid    primary key default gen_random_uuid(),
  operacao_id uuid    not null references operacoes(id) on delete cascade,
  -- 'anuncio', 'produto', 'canal', 'campanha'… texto livre de propósito:
  -- prender a um enum obrigaria migração a cada tela nova.
  entidade    text    not null check (length(trim(entidade)) > 0),
  entidade_id text    not null check (length(trim(entidade_id)) > 0),
  data        date    not null,
  texto       text    not null check (length(trim(texto)) > 0),
  criado_por  uuid    references usuarios(id) on delete set null,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index on anotacoes (operacao_id, entidade, entidade_id, data desc);

/* ── RLS nas tabelas novas ────────────────────────────────────── */

alter table anuncio_desempenho_diario enable row level security;
create policy adiario_leitura on anuncio_desempenho_diario
  for select using (pode_ver_operacao(operacao_id));
create policy adiario_escrita on anuncio_desempenho_diario
  for all using (pode_editar_operacao(operacao_id))
  with check (pode_editar_operacao(operacao_id));

alter table anotacoes enable row level security;
create policy anotacoes_leitura on anotacoes
  for select using (pode_ver_operacao(operacao_id));
create policy anotacoes_escrita on anotacoes
  for all using (pode_editar_operacao(operacao_id))
  with check (pode_editar_operacao(operacao_id));

/* ── Gatilho de atualizado_em ─────────────────────────────────── */

create trigger set_atualizado_em_anuncio_desempenho_diario
  before update on anuncio_desempenho_diario
  for each row execute function set_atualizado_em();

create trigger set_atualizado_em_anotacoes
  before update on anotacoes
  for each row execute function set_atualizado_em();
