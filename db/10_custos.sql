-- ─────────────────────────────────────────────────────────────────────
--  Estrutura de custo: o que falta para fechar margem
--
--  Até aqui o sistema sabia quanto entrou e quanto o canal reteve. Nunca
--  soube quanto custou — e por isso toda tela de análise parava em
--  receita, com um aviso de que margem não era calculável.
--
--  O desenho segue uma regra só: cada custo tem um valor de PARTIDA, que
--  vem de tabela, e um valor PRATICADO, que vem da venda. Os dois ficam
--  lado a lado em vez de um sobrescrever o outro.
--
--  A diferença entre eles é informação, não erro. Tarifa de tabela de
--  11,5% com praticada de 7,4% é campanha com redução funcionando; frete
--  de faixa em R$ 40 com praticado em R$ 88 é prejuízo silencioso na
--  logística. Guardar só um dos dois apagaria as duas descobertas.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ── Juros do parcelamento ────────────────────────────────────────────
--
-- O leitor da listagem já extraía `total_juros`, e a importação o usava
-- para derivar comissão — mas nada o gravava. Ficava sendo um número de
-- passagem, impossível de conferir depois.
--
-- É repasse, não receita: entra no `total` que o comprador pagou e sai
-- para a financeira. Sem ele separado, o juro aparece como faturamento
-- e infla a base sobre a qual toda porcentagem é calculada.
alter table pedidos
  add column if not exists juros numeric(14,2);

comment on column pedidos.juros is
  'Juro do parcelamento embutido no total. Repasse ao canal, não receita.';

-- ── Custos do produto ────────────────────────────────────────────────
--
-- `produtos` já trazia custo_unitario e peso_kg do schema original. O
-- que faltava era a embalagem e a alíquota — os dois campos que o
-- usuário preenche à mão e que nenhuma planilha informa.
alter table produtos
  add column if not exists embalagem         numeric(14,2) check (embalagem >= 0),
  add column if not exists aliquota_impostos numeric(7,4)
    check (aliquota_impostos >= 0 and aliquota_impostos <= 100),
  add column if not exists custo_atualizado_em timestamptz;

comment on column produtos.embalagem is
  'Custo de embalagem por unidade. Preenchido à mão.';
comment on column produtos.aliquota_impostos is
  'Alíquota média de impostos em pontos percentuais. 8.5 = 8,5%.';

-- ── Frete por faixa de peso ──────────────────────────────────────────
--
-- O ponto de partida do frete, antes de existir venda. O canal cobra por
-- faixa, e a faixa depende do peso do produto.
--
-- `canal_id` nulo é a faixa que vale para todos: a maioria das operações
-- começa com uma tabela só, e obrigar a cadastrar dezesseis cópias iguais
-- garantiria que ninguém cadastrasse nenhuma. Onde o canal tem tabela
-- própria, a linha específica ganha da geral.
--
-- `vigencia_inicio` porque tabela de frete muda, e margem de julho
-- calculada com o frete de setembro não é margem de julho. Sem a data, a
-- primeira reajustada reescreveria a história inteira em silêncio.
create table if not exists faixas_frete (
  id              uuid primary key default gen_random_uuid(),
  operacao_id     uuid          not null references operacoes(id) on delete cascade,
  canal_id        uuid          references canais(id) on delete cascade,
  peso_min_kg     numeric(10,3) not null check (peso_min_kg >= 0),
  peso_max_kg     numeric(10,3) not null,
  valor           numeric(14,2) not null check (valor >= 0),
  vigencia_inicio date          not null default current_date,
  observacao      text,
  criado_em       timestamptz   not null default now(),
  atualizado_em   timestamptz   not null default now(),

  check (peso_max_kg > peso_min_kg),
  -- Duas faixas idênticas vigentes no mesmo dia deixariam o frete
  -- dependendo de qual linha o banco devolvesse primeiro.
  unique (operacao_id, canal_id, peso_min_kg, vigencia_inicio)
);

create index if not exists idx_faixas_frete_busca
  on faixas_frete (operacao_id, canal_id, peso_min_kg, peso_max_kg);

comment on table faixas_frete is
  'Frete de tabela por faixa de peso. É o valor de partida; o praticado vem dos pedidos.';

-- ── Natureza das despesas de canal ───────────────────────────────────
--
-- `lancamentos_financeiros` já existia e já tinha canal_id, valor,
-- competência e o booleano `recorrente`. Faltava separar o que não se
-- separa por um booleano só:
--
--   ads                  — mídia, que já entra pelo lançamento diário
--   fixa_recorrente      — todo mês, mesmo valor (mensalidade da plataforma)
--   variavel_recorrente  — todo mês, valor diferente (frete extra, taxas)
--   variavel_avulsa      — não estava previsto (multa, reprocessamento)
--
-- A distinção não é burocrática: previsão de custo do mês que vem soma a
-- fixa inteira, projeta a variável recorrente pela média, e ignora a
-- avulsa. Um booleano `recorrente` não permite fazer nenhuma das três.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'natureza_custo') then
    create type natureza_custo as enum
      ('ads', 'fixa_recorrente', 'variavel_recorrente', 'variavel_avulsa');
  end if;
end $$;

alter table lancamentos_financeiros
  add column if not exists natureza natureza_custo;

comment on column lancamentos_financeiros.natureza is
  'Como o custo se comporta no tempo. Nulo em lançamentos que não são despesa de canal.';

-- ── Produtos a partir dos anúncios ───────────────────────────────────
--
-- A tabela `produtos` estava vazia enquanto 464 anúncios carregavam 142
-- SKUs distintos. Sem produto não há onde pendurar custo de mercadoria,
-- embalagem nem peso — e sem esses três não há margem.
--
-- O SKU do canal é a chave: é o que o vendedor usa para se referir ao
-- produto, e é o que aparece na planilha de catálogo. Vários anúncios
-- (clássico, premium, contas diferentes) apontam para o mesmo produto,
-- que é exatamente a relação que se quer.
--
-- Idempotente de propósito: roda de novo depois de cada importação nova,
-- e produto já existente não é tocado — o custo digitado à mão sobrevive.
insert into produtos (operacao_id, sku, titulo)
select distinct on (a.operacao_id, a.sku_canal)
       a.operacao_id,
       a.sku_canal,
       a.titulo
  from anuncios a
 where a.sku_canal is not null
   and a.sku_canal <> ''
 order by a.operacao_id, a.sku_canal, a.atualizado_em desc
on conflict (operacao_id, sku) do nothing;

update anuncios a
   set produto_id = p.id
  from produtos p
 where p.operacao_id = a.operacao_id
   and p.sku = a.sku_canal
   and a.produto_id is distinct from p.id;

-- ── RLS ──────────────────────────────────────────────────────────────
--
-- Mesmo desenho das demais tabelas com operacao_id: quem enxerga a
-- operação lê, quem tem permissão de edição escreve.
alter table faixas_frete enable row level security;
alter table faixas_frete force  row level security;

drop policy if exists faixas_frete_leitura   on faixas_frete;
drop policy if exists faixas_frete_insercao  on faixas_frete;
drop policy if exists faixas_frete_alteracao on faixas_frete;
drop policy if exists faixas_frete_exclusao  on faixas_frete;

create policy faixas_frete_leitura on faixas_frete
  for select using (pode_ver_operacao(operacao_id));
create policy faixas_frete_insercao on faixas_frete
  for insert with check (pode_editar_operacao(operacao_id));
create policy faixas_frete_alteracao on faixas_frete
  for update using (pode_editar_operacao(operacao_id))
             with check (pode_editar_operacao(operacao_id));
create policy faixas_frete_exclusao on faixas_frete
  for delete using (pode_editar_operacao(operacao_id));

commit;
