-- ─────────────────────────────────────────────────────────────────────
--  52. Promoções sugeridas: a tabela de preço mínimo e o ajuste do robô
--
--  Ver .scratch/promocoes-sugeridas/spec.md.
--
--  ── preco_minimo ──
--
--  A Fórmula base guarda o preço POR FAIXA DE COMISSÃO (4,5% a 20,5%),
--  que é como a Probel negocia. A Bom de Compras trabalha com outra
--  tabela: um mínimo para Clássico e outro para Premium, por SKU, que
--  ela revisa todo mês ("Tabela de preço Minimo_nov_26", aba Preço
--  Mínimo). As duas não cabem uma na outra: os mesmos 43 SKUs estão na
--  Fórmula base de 10/10 com o Clássico a 73,90 e na tabela de novembro
--  a 59,90. Forçar a de novembro dentro da Fórmula base apagaria as
--  faixas que as outras telas usam.
--
--  Uma linha por SKU, tipo de anúncio e vigência. A vigência mais recente
--  até hoje é a que vale; as antigas ficam para explicar uma decisão de
--  ontem.
--
--  ── robo_promocoes ──
--
--  Os parâmetros das regras do sistema (tolerância, dias parado,
--  cobertura de estoque, margem mínima) e quais regras a empresa
--  desligou. Uma linha por empresa. Sem a linha, valem os padrões do
--  código — a tela funciona antes desta migração, só não guarda o ajuste.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.preco_minimo (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id) on delete cascade,
  sku text not null,
  tipo_anuncio text not null check (tipo_anuncio in ('classico', 'premium')),
  preco numeric(14,2) not null check (preco > 0),
  vigente_de date not null,
  origem text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (operacao_id, sku, tipo_anuncio, vigente_de)
);

create index if not exists preco_minimo_busca
  on public.preco_minimo (operacao_id, vigente_de desc);

create table if not exists public.robo_promocoes (
  operacao_id uuid primary key references public.operacoes(id) on delete cascade,
  parametros jsonb not null default '{}'::jsonb,
  regras_desligadas text[] not null default '{}',
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);

-- RLS no padrão rápido (ver a lição de 24/11 em db/30): a função roda uma
-- vez por consulta, não uma vez por linha.
do $$
declare t text;
begin
  foreach t in array array['preco_minimo', 'robo_promocoes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists %I_leitura on %I', t, t);
    execute format('create policy %I_leitura on %I for select using (operacao_id in (select operacoes_do_usuario()))', t, t);
    execute format('drop policy if exists %I_escrita on %I', t, t);
    execute format(
      'create policy %I_escrita on %I for all using (operacao_id in (select operacoes_editaveis_do_usuario())) with check (operacao_id in (select operacoes_editaveis_do_usuario()))', t, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

comment on table public.preco_minimo is
  'Preço mínimo por SKU e tipo de anúncio (Clássico/Premium), por vigência. '
  'É a fonte nº 1 das Promoções sugeridas; sem ela o sistema usa a Fórmula base '
  'e depois o custo. Ver db/52.';

-- ═══════════════════════════════════════════════════════════════════════
--  CONFERIR
--    select count(*) from preco_minimo;      -- 0 logo após rodar
--    select * from robo_promocoes;           -- vazio: valem os padrões
--
--  DESFAZER
--    drop table if exists public.robo_promocoes;
--    drop table if exists public.preco_minimo;
-- ═══════════════════════════════════════════════════════════════════════
