-- ═══════════════════════════════════════════════════════════════════════
--  50. Tabela por faixa no Fluxo
--
--  A Probel manda duas tabelas por faixa: Antecipado (a do Mercado Livre,
--  que fica em formula_base_precos e alimenta o motor) e Fluxo (preço com
--  recebimento no fluxo do canal). O Fluxo fica aqui, separado, para nenhum
--  leitor da Fórmula base misturar as duas sem querer.
--
--  Empresa sem diferenciação simplesmente não tem linha aqui.
--
--  Política na forma rápida (ver 30_rls_rapido.sql): nunca por linha.
--  Pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists formula_base_fluxo (
  id            uuid    primary key default gen_random_uuid(),
  operacao_id   uuid    not null references operacoes(id) on delete cascade,
  vigente_de    date    not null,
  chave         citext  not null,
  comissao      numeric(8,5) not null check (comissao > 0 and comissao < 1),
  preco         numeric(14,2) not null check (preco >= 0),
  criado_em     timestamptz not null default now(),
  unique (operacao_id, chave, comissao, vigente_de)
);
create index if not exists formula_base_fluxo_vigencia on formula_base_fluxo (operacao_id, vigente_de);

alter table formula_base_fluxo enable row level security;
alter table formula_base_fluxo force row level security;

drop policy if exists formula_base_fluxo_leitura on formula_base_fluxo;
drop policy if exists formula_base_fluxo_insercao on formula_base_fluxo;
drop policy if exists formula_base_fluxo_alteracao on formula_base_fluxo;
drop policy if exists formula_base_fluxo_exclusao on formula_base_fluxo;

create policy formula_base_fluxo_leitura on formula_base_fluxo
  for select using (operacao_id in (select operacoes_do_usuario()));
create policy formula_base_fluxo_insercao on formula_base_fluxo
  for insert with check (operacao_id in (select operacoes_editaveis_do_usuario()));
create policy formula_base_fluxo_alteracao on formula_base_fluxo
  for update using (operacao_id in (select operacoes_editaveis_do_usuario()))
             with check (operacao_id in (select operacoes_editaveis_do_usuario()));
create policy formula_base_fluxo_exclusao on formula_base_fluxo
  for delete using (operacao_id in (select operacoes_editaveis_do_usuario()));
