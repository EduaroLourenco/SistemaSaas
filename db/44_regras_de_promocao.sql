-- ─────────────────────────────────────────────────────────────────────
--  Regras de promoção: SE (condição) ENTÃO (ação)
--
--  Até aqui a decisão de entrar ou não numa promoção morava em dois
--  lugares: na planilha da Central de Promoções, item a item, e na
--  cabeça de quem a preenchia. A tela de Automações já decide com piso
--  e folga, mas a folga é uma só para tudo — e na prática a régua muda
--  por tipo de campanha, por conta e por quanto o produto gira.
--
--  ── Ordenadas, e a primeira que bate decide ──
--
--  É o que torna um conjunto de regras legível: a exceção vem em cima,
--  o geral embaixo. Sem ordem, duas regras que batem no mesmo item
--  deixam o resultado dependendo de qual o banco devolveu primeiro.
--
--  ── Por que `conta_canal_id` pode ser nulo ──
--
--  A Probel tem duas contas no Mercado Livre com estratégia diferente:
--  a de São Paulo vende pronta entrega, a segunda vende a prazo. Mas a
--  maioria das regras vale para as duas, e obrigar a duplicar cada uma
--  seria convidar as duas cópias a divergirem. Nulo = todas as contas
--  do canal naquela operação.
--
--  ── `quando_nao_sei` não é detalhe ──
--
--  Toda condição tem três respostas, não duas: sim, não, e não deu para
--  saber. Numa operação sem custo cadastrado, "margem acima de 20%"
--  responderia "não" para o catálogo inteiro e pareceria uma decisão.
--  O terceiro caminho é explícito, e a tela mostra a cobertura de cada
--  campo antes de a pessoa salvar.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.regras_promocao (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id) on delete cascade,
  -- nulo = vale para todas as contas do canal nesta operação
  conta_canal_id uuid references public.contas_canal(id) on delete cascade,
  nome text not null,
  ativa boolean not null default true,
  ordem integer not null default 0,
  -- [{ campo, operador, valor }] — todas precisam bater
  condicoes jsonb not null default '[]'::jsonb,
  -- { tipo: aceitar|reescrever|nao_entrar|conferir, folga_pct?, faixa_minima? }
  acao jsonb not null,
  -- pular | nao_entrar | conferir
  quando_nao_sei text not null default 'conferir',
  criada_por uuid references auth.users(id),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  constraint regras_promocao_quando_nao_sei_check
    check (quando_nao_sei in ('pular', 'nao_entrar', 'conferir'))
);

create index if not exists regras_promocao_ordem_idx
  on public.regras_promocao (operacao_id, ordem);

/*
 * A regra que decidiu fica junto do que foi enviado.
 *
 * Sem isto, em dezembro ninguém explica por que uma linha entrou em
 * novembro: a Fórmula base muda de vigência e a regra pode ter sido
 * editada no meio. Guardar o piso e a folga DO MOMENTO é o que torna a
 * decisão auditável depois.
 */
create table if not exists public.decisoes_promocao (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id) on delete cascade,
  conta_canal_id uuid not null references public.contas_canal(id) on delete cascade,
  promocao text not null,
  tipo_promocao text not null,
  mlb text not null,
  regra_id uuid references public.regras_promocao(id) on delete set null,
  regra_nome text,
  decisao text not null,
  preco_proposto numeric(12,2),
  piso_na_hora numeric(12,2),
  folga_usada numeric(6,2),
  faixa_resultante numeric(6,4),
  motivo text,
  enviado_em timestamptz,
  resposta_canal text,
  criada_em timestamptz not null default now()
);

create index if not exists decisoes_promocao_busca_idx
  on public.decisoes_promocao (operacao_id, promocao, mlb);

-- ─────────────────────────────────────────────────────────────────────
--  RLS no padrão das outras tabelas de dado
-- ─────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['regras_promocao', 'decisoes_promocao']
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
