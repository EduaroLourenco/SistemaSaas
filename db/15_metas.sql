-- ─────────────────────────────────────────────────────────────────────
--  Metas: do valor do mês até o alvo de cada dia
--
--  A tabela `metas` existia e estava vazia, esperando colunas de uma
--  planilha que nunca vieram preenchidas. O caminho certo é outro: a meta
--  se define AQUI, e o sistema a distribui.
--
--  ── O que se digita e o que o sistema calcula ──
--
--  Digita-se um número só — a meta do mês — e escolhe-se quais canais
--  participam. O resto é derivado:
--
--    1. o peso de cada canal, pela receita recente dele
--    2. a meta de cada canal, rateando o total por esses pesos
--    3. a meta de cada dia, rateando o mês pelo padrão de dia da semana
--
--  Pedir a meta canal por canal seria pedir para a pessoa fazer à mão a
--  conta que o sistema já tem os dados para fazer — e ela faria pela
--  memória do que cada canal vende, que é justamente o que o histórico
--  sabe melhor.
--
--  ── Por que a meta diária é uma tabela, e não uma divisão na hora ──
--
--  Porque ela é editável. Ajustar um dia — feriado, Black Friday, uma
--  campanha que começa no dia 12 — precisa sobreviver ao recálculo do
--  mês. `manual` marca o dia que a pessoa fixou, e o rateio redistribui
--  só o que sobra entre os outros dias, mantendo o total do mês.
--
--  Sem a marca, recalcular apagaria o ajuste em silêncio; sem
--  redistribuir, aumentar um dia estouraria a meta do mês sem avisar.
-- ─────────────────────────────────────────────────────────────────────

begin;

/*
 * Chave de upsert para `metas`.
 *
 * Sem ela, gravar a meta do mesmo mês duas vezes criava duas linhas e a
 * leitura pegava uma por ordem de chegada. Dois índices parciais porque
 * `canal_id` é nulo na meta da operação inteira, e no Postgres nulos não
 * colidem entre si.
 */
create unique index if not exists idx_metas_canal
  on metas (operacao_id, canal_id, ano, mes) where canal_id is not null;

create unique index if not exists idx_metas_operacao
  on metas (operacao_id, ano, mes) where canal_id is null;

-- Peso com que o canal entrou no rateio, guardado junto: sem ele, ninguém
-- consegue explicar meses depois por que aquele canal recebeu aquele
-- valor — o peso de hoje já será outro.
alter table metas
  add column if not exists peso numeric(7,4) check (peso >= 0 and peso <= 100),
  add column if not exists origem origem_dado not null default 'manual';

comment on column metas.peso is
  'Participação do canal na receita recente, em %, no momento em que a meta foi distribuída.';

-- ── Meta por dia ─────────────────────────────────────────────────────

create table if not exists metas_diarias (
  id            uuid          primary key default gen_random_uuid(),
  operacao_id   uuid          not null references operacoes(id) on delete cascade,
  canal_id      uuid          not null references canais(id)    on delete cascade,
  data          date          not null,
  receita_meta  numeric(14,2) not null default 0 check (receita_meta >= 0),

  /*
   * Dia fixado à mão.
   *
   * O rateio nunca sobrescreve um dia manual: ele soma o que foi fixado,
   * subtrai do mês e divide o resto entre os demais. É o que permite
   * dizer "no dia 12 quero R$ 40 mil" sem que o próximo recálculo apague
   * a decisão nem estoure o total.
   */
  manual        boolean       not null default false,

  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now(),

  unique (operacao_id, canal_id, data)
);

create index if not exists idx_metas_diarias_periodo
  on metas_diarias (operacao_id, data);

comment on table metas_diarias is
  'Meta de receita por canal e dia. Rateada do mês; dias manuais são preservados.';

alter table metas_diarias enable row level security;
alter table metas_diarias force  row level security;

drop policy if exists metas_diarias_leitura   on metas_diarias;
drop policy if exists metas_diarias_insercao  on metas_diarias;
drop policy if exists metas_diarias_alteracao on metas_diarias;
drop policy if exists metas_diarias_exclusao  on metas_diarias;

create policy metas_diarias_leitura on metas_diarias
  for select using (pode_ver_operacao(operacao_id));
create policy metas_diarias_insercao on metas_diarias
  for insert with check (pode_editar_operacao(operacao_id));
create policy metas_diarias_alteracao on metas_diarias
  for update using (pode_editar_operacao(operacao_id))
             with check (pode_editar_operacao(operacao_id));
create policy metas_diarias_exclusao on metas_diarias
  for delete using (pode_editar_operacao(operacao_id));

commit;
