-- ═══════════════════════════════════════════════════════════════════════
--  PLATAFORMA — SEGURANÇA EM NÍVEL DE LINHA (RLS)
--
--  Regra única do sistema: ninguém enxerga dado de uma operação da qual
--  não é membro. Isso é aplicado NO BANCO, não na aplicação — assim vale
--  também para a chave anônima do Supabase usada pelo navegador.
--
--  Executar depois de 01_schema.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  Funções auxiliares
-- ─────────────────────────────────────────────────────────────────────

-- Operações que o usuário autenticado pode enxergar.
-- Sem linha em membros_operacoes = acesso a todas as operações da organização.
create or replace function operacoes_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from operacoes o
  join membros m on m.organizacao_id = o.organizacao_id
  where m.usuario_id = auth.uid()
    and (
      not exists (select 1 from membros_operacoes mo where mo.membro_id = m.id)
      or exists (
        select 1 from membros_operacoes mo
        where mo.membro_id = m.id and mo.operacao_id = o.id
      )
    );
$$;

create or replace function pode_ver_operacao(op uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select op in (select operacoes_do_usuario());
$$;

-- Papel do usuário na organização dona da operação.
create or replace function papel_na_operacao(op uuid)
returns papel_membro
language sql
stable
security definer
set search_path = public
as $$
  select m.papel
  from operacoes o
  join membros m on m.organizacao_id = o.organizacao_id
  where o.id = op and m.usuario_id = auth.uid()
  limit 1;
$$;

-- Leitor só lê. Editor em diante escreve.
create or replace function pode_editar_operacao(op uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select papel_na_operacao(op) in ('proprietario', 'administrador', 'editor');
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Ativação + políticas padrão para toda tabela com operacao_id
-- ─────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'canais','contas_canal','produtos','anuncios',
    'vendas_diarias','pedidos','pedido_itens','visitas_mensais','metas',
    'importacoes','importacao_linhas','anuncio_desempenho_semanal',
    'precos_ideais','anuncio_precos_vitrine','anotacoes_anuncio',
    'formula_base_itens','formula_base_precos',
    'campanhas','campanha_itens','processamentos_promocao','historico_promocoes',
    'monitoramentos_preco','concorrentes','precos_coletados',
    'monitoramentos_frete','fretes_coletados',
    'categorias_financeiras','fornecedores','funcionarios','folha_pagamento',
    'lotes_compra','lancamentos_financeiros',
    'integracoes','sincronizacoes','alertas','exportacoes','agendamentos','auditoria'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    execute format($f$
      create policy %I_leitura on %I
        for select using (pode_ver_operacao(operacao_id))
    $f$, t, t);

    execute format($f$
      create policy %I_insercao on %I
        for insert with check (pode_editar_operacao(operacao_id))
    $f$, t, t);

    execute format($f$
      create policy %I_alteracao on %I
        for update using (pode_editar_operacao(operacao_id))
                   with check (pode_editar_operacao(operacao_id))
    $f$, t, t);

    execute format($f$
      create policy %I_exclusao on %I
        for delete using (pode_editar_operacao(operacao_id))
    $f$, t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────
--  Tabelas sem operacao_id — regras próprias
-- ─────────────────────────────────────────────────────────────────────

-- lote_itens herda a permissão do lote pai.
alter table lote_itens enable row level security;
alter table lote_itens force row level security;

create policy lote_itens_leitura on lote_itens
  for select using (
    exists (select 1 from lotes_compra l
            where l.id = lote_id and pode_ver_operacao(l.operacao_id))
  );

create policy lote_itens_escrita on lote_itens
  for all using (
    exists (select 1 from lotes_compra l
            where l.id = lote_id and pode_editar_operacao(l.operacao_id))
  ) with check (
    exists (select 1 from lotes_compra l
            where l.id = lote_id and pode_editar_operacao(l.operacao_id))
  );

/* ── Identidade: por que estas três funções existem ───────────────

   Uma política em `membros` cujo `using` consulta `membros` dispara a si
   mesma, e o Postgres aborta com 42P17 (recursão infinita). O mesmo vale
   para quem consulta `membros` inline a partir de outra tabela protegida:
   a política de `membros` é reavaliada e o ciclo nasce igual.

   `security definer` quebra o ciclo — dentro da função o RLS não é
   reavaliado. É o mesmo motivo pelo qual `operacoes_do_usuario()` acima
   já era definer; estas quatro políticas tinham ficado de fora.

   O sintoma, quando falta: as telas de time e de perfil devolvem 500 e o
   resto do sistema parece bem. Fácil de culpar o front.                */

create or replace function organizacoes_do_usuario()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select m.organizacao_id from membros m where m.usuario_id = auth.uid();
$$;

create or replace function membros_visiveis()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select m.id from membros m
   where m.organizacao_id in (
     select m2.organizacao_id from membros m2 where m2.usuario_id = auth.uid()
   );
$$;

create or replace function usuarios_visiveis()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select m.usuario_id from membros m
   where m.organizacao_id in (
     select m2.organizacao_id from membros m2 where m2.usuario_id = auth.uid()
   );
$$;

-- Organizações e operações: o membro vê as suas.
alter table organizacoes enable row level security;
create policy organizacoes_leitura on organizacoes
  for select using (id in (select organizacoes_do_usuario()));

alter table operacoes enable row level security;
create policy operacoes_leitura on operacoes
  for select using (pode_ver_operacao(id));

-- Membros: cada um enxerga os colegas da mesma organização.
alter table membros enable row level security;
create policy membros_leitura on membros
  for select using (organizacao_id in (select organizacoes_do_usuario()));

alter table membros_operacoes enable row level security;
create policy membros_operacoes_leitura on membros_operacoes
  for select using (membro_id in (select membros_visiveis()));

-- Usuários: o próprio registro e o de quem divide organização.
alter table usuarios enable row level security;
create policy usuarios_leitura on usuarios
  for select using (
    id = auth.uid() or id in (select usuarios_visiveis())
  );
create policy usuarios_propria_alteracao on usuarios
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Preferências: só o dono.
alter table preferencias_usuario enable row level security;
create policy preferencias_proprias on preferencias_usuario
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Glossário: leitura livre para autenticados, escrita só pelo serviço.
alter table glossario enable row level security;
create policy glossario_leitura on glossario
  for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────
--  Nota sobre o papel de serviço
--
--  Rotinas de coleta (busca-preço, busca-frete), sincronização de canais
--  e processamento de planilha rodam no servidor com a service_role key,
--  que ignora RLS por definição. Essa chave NUNCA pode chegar ao
--  navegador — só em rota de API / worker.
-- ─────────────────────────────────────────────────────────────────────
