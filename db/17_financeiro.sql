-- ─────────────────────────────────────────────────────────────────────
--  Financeiro operacional: folha, fornecedores e contas a pagar
--
--  As tabelas já existiam desde o schema original — `funcionarios`,
--  `folha_pagamento`, `fornecedores`, `lancamentos_financeiros`,
--  `categorias_financeiras`. O que faltava não era estrutura, era o que
--  transforma um cadastro numa CONTA QUE VENCE:
--
--    · recorrência — a conta de luz não é lançada doze vezes à mão;
--    · dia de pagamento — a folha vence no 5, o fornecedor no 10;
--    · salário líquido — hoje só existia o custo do empregador.
--
--  Sem isso, cada mês exigiria relançar tudo, e a DRE só teria passado:
--  nunca conseguiria dizer "este mês ainda vai sair R$ 40 mil de folha".
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ── Periodicidade ────────────────────────────────────────────────────
--
-- `lancamentos_financeiros.recorrente` já existia como booleano, o que
-- responde "se repete?" mas não "de quanto em quanto tempo?". Um aluguel
-- mensal e um seguro anual eram indistinguíveis, e projetar o mês exigia
-- adivinhar.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'periodicidade') then
    create type periodicidade as enum
      ('unica', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual');
  end if;
end $$;

alter table lancamentos_financeiros
  add column if not exists periodicidade periodicidade not null default 'unica',
  -- Até quando repetir. Nulo = sem fim previsto, que é o caso do aluguel.
  add column if not exists recorrencia_fim date,
  -- A conta que originou esta. A recorrência gera linhas reais, uma por
  -- competência, em vez de uma linha "virtual" calculada na leitura:
  -- conta projetada precisa poder ser editada e paga individualmente, e
  -- um valor que muda (a luz) não pode reescrever os meses já pagos.
  add column if not exists origem_recorrencia_id uuid
    references lancamentos_financeiros(id) on delete set null;

comment on column lancamentos_financeiros.periodicidade is
  'De quanto em quanto tempo a conta se repete. ''unica'' = não repete.';
comment on column lancamentos_financeiros.origem_recorrencia_id is
  'A conta-mãe que gerou esta ocorrência. Nulo na própria mãe.';

create index if not exists idx_lanc_recorrencia
  on lancamentos_financeiros (origem_recorrencia_id)
  where origem_recorrencia_id is not null;

-- `recorrente` vira derivado de `periodicidade`, para não haver duas
-- fontes discordando. Mantido porque telas antigas ainda o leem.
update lancamentos_financeiros
   set recorrente = (periodicidade <> 'unica')
 where recorrente <> (periodicidade <> 'unica');

-- ── Funcionários: o que a folha precisa saber ────────────────────────
--
-- `salario_base` sozinho é o custo do empregador antes dos encargos. Quem
-- fecha o mês precisa dos dois lados: o que sai da empresa e o que cai na
-- conta da pessoa.
alter table funcionarios
  add column if not exists salario_liquido numeric(14,2)
    check (salario_liquido is null or salario_liquido >= 0),
  -- Dia do mês em que o salário é pago. 5 = todo dia 5.
  add column if not exists dia_pagamento smallint
    check (dia_pagamento is null or dia_pagamento between 1 and 31),
  add column if not exists periodicidade periodicidade not null default 'mensal',
  -- Benefícios e encargos fixos, para a folha do mês nascer preenchida em
  -- vez de exigir redigitação. A competência pode sobrescrever.
  add column if not exists beneficios_padrao numeric(14,2) not null default 0
    check (beneficios_padrao >= 0),
  add column if not exists encargos_padrao numeric(14,2) not null default 0
    check (encargos_padrao >= 0),
  add column if not exists categoria_id uuid
    references categorias_financeiras(id) on delete set null,
  add column if not exists observacao text;

comment on column funcionarios.salario_liquido is
  'O que cai na conta da pessoa. salario_base é o custo antes dos encargos.';
comment on column funcionarios.dia_pagamento is
  'Dia do mês do pagamento. Alimenta o vencimento na folha e na DRE.';

-- ── Folha: quando de fato foi paga ───────────────────────────────────
--
-- A tabela tinha competência (o mês a que se refere) e o custo, mas não
-- a data em que o dinheiro saiu. Sem ela não dá para separar folha
-- provisionada de folha paga — que é exatamente a linha que a DRE
-- precisa quando o mês ainda está aberto.
alter table folha_pagamento
  add column if not exists salario_liquido numeric(14,2)
    check (salario_liquido is null or salario_liquido >= 0),
  add column if not exists vencimento date,
  add column if not exists pagamento  date,
  add column if not exists status status_lancamento not null default 'em_aberto',
  add column if not exists observacao text;

comment on column folha_pagamento.status is
  'Reaproveita o enum dos lançamentos para folha e contas lerem igual.';

-- Mesma trava que já existe em lancamentos_financeiros: não dá para
-- marcar como pago sem dizer quando.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'folha_pago_tem_data'
  ) then
    alter table folha_pagamento
      add constraint folha_pago_tem_data
      check (status <> 'pago' or pagamento is not null);
  end if;
end $$;

-- ── Fornecedores: o que faltava para virar conta ─────────────────────
alter table fornecedores
  add column if not exists categoria_id uuid
    references categorias_financeiras(id) on delete set null,
  add column if not exists dia_vencimento smallint
    check (dia_vencimento is null or dia_vencimento between 1 and 31),
  add column if not exists observacao text;

-- `categoria` era texto livre e agora convive com a chave. O texto fica
-- para não perder o que já foi digitado; a chave é o que a DRE agrupa.
comment on column fornecedores.categoria is
  'Legado, texto livre. Para agrupar na DRE use categoria_id.';

-- ── Categorias: ordem e uso na DRE ───────────────────────────────────
--
-- A DRE não lista categorias em ordem alfabética — ela tem uma sequência
-- própria (mercadoria antes de estrutura, estrutura antes de pessoal). E
-- algumas categorias são custo VARIÁVEL, que desce na margem de
-- contribuição, enquanto outras são fixas e só entram no resultado.
alter table categorias_financeiras
  add column if not exists ordem smallint not null default 100,
  add column if not exists variavel boolean not null default false,
  add column if not exists descricao text;

comment on column categorias_financeiras.variavel is
  'true = custo que só existe porque houve venda. Desce na margem de '
  'contribuição. false = fixo, entra apenas no resultado.';

-- ── RLS ──────────────────────────────────────────────────────────────
--
-- `funcionarios` é a única que nasceu sem operacao_id no filtro de
-- leitura porque não tinha política. As demais já herdam do bloco geral
-- em 02_rls.sql; conferir e criar o que faltar é idempotente.
alter table funcionarios          enable row level security;
alter table folha_pagamento       enable row level security;
alter table fornecedores          enable row level security;
alter table categorias_financeiras enable row level security;
alter table lancamentos_financeiros enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'funcionarios','folha_pagamento','fornecedores',
    'categorias_financeiras','lancamentos_financeiros'
  ] loop
    execute format('drop policy if exists %I_leitura on %I', t, t);
    execute format(
      'create policy %I_leitura on %I for select using (pode_ver_operacao(operacao_id))',
      t, t);
    execute format('drop policy if exists %I_escrita on %I', t, t);
    execute format(
      'create policy %I_escrita on %I for all
         using (pode_editar_operacao(operacao_id))
         with check (pode_editar_operacao(operacao_id))',
      t, t);
  end loop;
end $$;

-- ── Categorias de partida ────────────────────────────────────────────
--
-- Marca as que já existem como variável ou fixa e dá ordem de DRE. Sem
-- isso a primeira DRE sairia com tudo em "fixo", que é o mesmo que não
-- ter margem de contribuição.
update categorias_financeiras set variavel = true, ordem = 10
 where lower(nome) similar to '%(mercadoria|produto|cmv|compra)%';
update categorias_financeiras set variavel = true, ordem = 20
 where lower(nome) similar to '%(comiss|tarifa|marketplace)%';
update categorias_financeiras set variavel = true, ordem = 30
 where lower(nome) similar to '%(frete|log[ií]stic|envio)%';
update categorias_financeiras set variavel = true, ordem = 40
 where lower(nome) similar to '%(imposto|tribut)%';
update categorias_financeiras set variavel = true, ordem = 50
 where lower(nome) similar to '%(ads|m[ií]dia|public|marketing|tr[aá]fego)%';
update categorias_financeiras set variavel = false, ordem = 60
 where lower(nome) similar to '%(sal[aá]rio|folha|pessoal|pr[oó]-labore|prolabore)%';
update categorias_financeiras set variavel = false, ordem = 70
 where lower(nome) similar to '%(aluguel|estrutura|energia|[aá]gua|internet|telefone)%';

commit;
