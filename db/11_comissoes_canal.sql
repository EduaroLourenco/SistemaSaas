-- ─────────────────────────────────────────────────────────────────────
--  Comissão por canal e tipo de anúncio
--
--  A alíquota vivia só em `anuncios.comissao_atual`, que vem da planilha
--  de catálogo. Isso resolve o Mercado Livre, onde há catálogo, e deixa
--  os outros oito canais sem nenhuma — e são justamente os que não
--  informam comissão nos pedidos. Fora do Meli, hoje, não há tarifa
--  medida nem de tabela: não há nada.
--
--  ── Por que o tipo entra na chave ──
--
--  No Mercado Livre o mesmo produto vive em dois anúncios com tarifas
--  diferentes: clássico a 11,54% e premium a 16,54% (médias medidas nos
--  457 anúncios com alíquota). Cinco pontos de diferença mudam o preço
--  que fecha uma margem, então clássico e premium precisam de contas
--  separadas — e de margens-alvo que podem ser diferentes uma da outra.
--
--  `tipo` nulo é a alíquota que vale para qualquer anúncio do canal. A
--  maioria dos marketplaces cobra uma taxa só; obrigar duas linhas
--  iguais seria burocracia sem informação.
--
--  ── Vigência ──
--
--  Marketplace reajusta tarifa. Sem data, o primeiro reajuste
--  recalcularia o preço-alvo de todo o histórico em silêncio, e a
--  comparação com o que foi praticado em julho passaria a usar a tarifa
--  de setembro.
-- ─────────────────────────────────────────────────────────────────────

begin;

create table if not exists comissoes_canal (
  id              uuid primary key default gen_random_uuid(),
  operacao_id     uuid         not null references operacoes(id) on delete cascade,
  canal_id        uuid         not null references canais(id)    on delete cascade,
  tipo            tipo_anuncio,
  comissao        numeric(7,4) not null check (comissao >= 0 and comissao < 100),
  vigencia_inicio date         not null default current_date,
  observacao      text,
  criado_em       timestamptz  not null default now(),
  atualizado_em   timestamptz  not null default now()
);

/*
 * Dois índices parciais, e não um `unique (…)` na coluna.
 *
 * `tipo` é nulo na alíquota geral, e no Postgres nulos não colidem entre
 * si: com a restrição comum, dava para cadastrar dezessete alíquotas
 * gerais do mesmo canal na mesma data e nada reclamaria — o motor então
 * escolheria uma delas por ordem de chegada.
 *
 * `coalesce(tipo::text, '')` num índice único resolveria, mas o Postgres
 * recusa: o cast de enum para texto não é imutável, porque o rótulo pode
 * ser renomeado depois. Daí a divisão em dois índices, um para cada
 * lado do nulo.
 */
create unique index if not exists idx_comissoes_canal_tipo
  on comissoes_canal (operacao_id, canal_id, tipo, vigencia_inicio)
  where tipo is not null;

create unique index if not exists idx_comissoes_canal_geral
  on comissoes_canal (operacao_id, canal_id, vigencia_inicio)
  where tipo is null;

comment on table comissoes_canal is
  'Alíquota de tabela por canal e tipo de anúncio. tipo nulo vale para todos.';

-- ── Semente: o que o catálogo já sabe ────────────────────────────────
--
-- Só o Mercado Livre tem anúncios cadastrados, então só ele tem alíquota
-- derivável. Os demais canais ficam vazios de propósito: inventar uma
-- taxa para a Casas Bahia produziria preço-alvo com aparência de
-- calculado, e ninguém teria como desconfiar.
--
-- A moda, não a média: a média de 238 anúncios clássicos dá 11,54 por
-- causa de alguns com tarifa negociada, e 11,54% não é a alíquota de
-- ninguém. A moda devolve o valor de tabela real.
insert into comissoes_canal (operacao_id, canal_id, tipo, comissao, vigencia_inicio, observacao)
select a.operacao_id, a.canal_id, a.tipo,
       mode() within group (order by a.comissao_atual),
       date '2026-01-01',
       'Derivada do catálogo importado'
  from anuncios a
 where a.comissao_atual is not null
 group by a.operacao_id, a.canal_id, a.tipo
on conflict do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────
alter table comissoes_canal enable row level security;
alter table comissoes_canal force  row level security;

drop policy if exists comissoes_canal_leitura   on comissoes_canal;
drop policy if exists comissoes_canal_insercao  on comissoes_canal;
drop policy if exists comissoes_canal_alteracao on comissoes_canal;
drop policy if exists comissoes_canal_exclusao  on comissoes_canal;

create policy comissoes_canal_leitura on comissoes_canal
  for select using (pode_ver_operacao(operacao_id));
create policy comissoes_canal_insercao on comissoes_canal
  for insert with check (pode_editar_operacao(operacao_id));
create policy comissoes_canal_alteracao on comissoes_canal
  for update using (pode_editar_operacao(operacao_id))
             with check (pode_editar_operacao(operacao_id));
create policy comissoes_canal_exclusao on comissoes_canal
  for delete using (pode_editar_operacao(operacao_id));

commit;
