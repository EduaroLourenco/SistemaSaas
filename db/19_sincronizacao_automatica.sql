-- ─────────────────────────────────────────────────────────────────────
--  Sincronização automática com o Mercado Livre (13h e 01h)
--
--  Usa o que o schema já previa — `integracoes` e `sincronizacoes`, seção
--  9 do 01_schema.sql — e completa três coisas que faltavam para elas
--  funcionarem de verdade:
--
--  1. INTEGRAÇÃO POR CONTA, NÃO POR CANAL. A regra única era (operação,
--     provedor, canal), e o Mercado Livre tem duas contas no mesmo canal:
--     São Paulo e a 2ª conta. O token do Meli é por conta de vendedor —
--     uma autorização não enxerga a outra —, então a integração também
--     tem que ser.
--
--  2. O TOKEN VAI PARA O COFRE. O schema já dizia: "NUNCA guarde token em
--     texto puro — credencial_ref aponta para o cofre". Aqui estão as duas
--     funções que leem e gravam no Supabase Vault. Só a chave de serviço
--     executa; usuário logado não chega nem perto do valor.
--
--     Por que o token precisa morar em algum lugar: o refresh token do
--     Meli é de USO ÚNICO. Renovou, o anterior morre. Na memória do
--     servidor ele some no fim de cada execução, e a execução seguinte
--     tentaria o token já gasto.
--
--  3. O REGISTRO DIZ DE ONDE VEIO. `origem` (agendada ou manual), `turno`
--     (13h ou 01h) e o resumo do que foi gravado. É o que a tela usa para
--     dizer de quando é o número que ela mostra.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- O Vault (schema `vault`) já vem instalado nos projetos Supabase. Se
-- esta migração falhar dizendo que `vault.decrypted_secrets` não existe,
-- ligue-o em Database → Extensions → supabase_vault e rode de novo.

-- ── 1. Integração por conta do canal ─────────────────────────────────
alter table integracoes
  add column if not exists conta_canal_id uuid references contas_canal(id) on delete cascade;

alter table integracoes
  drop constraint if exists integracoes_operacao_id_provedor_canal_id_key;

create unique index if not exists integracoes_por_conta
  on integracoes (operacao_id, provedor, conta_canal_id);

comment on column integracoes.conta_canal_id is
  'Conta do canal autorizada. O token do Mercado Livre é por conta de vendedor.';

-- ── 2. Cofre ─────────────────────────────────────────────────────────
--
-- As funções tocam SÓ o cofre. Quem liga o segredo à integração
-- (`credencial_ref`) é o servidor, pela chave de serviço. Ler `integracoes`
-- aqui dentro dependeria de o dono da função atravessar o RLS forçado da
-- tabela — e função de cofre que às vezes não acha a linha é o tipo de
-- falha que só aparece às 01h.
--
-- SECURITY DEFINER com search_path vazio: roda com o dono (postgres), que
-- alcança o Vault, e não resolve nome nenhum pelo caminho de quem chama —
-- sem isso, um objeto homônimo em outro schema poderia ser executado no
-- lugar do verdadeiro.
--
-- Só segredos com nome `integracao_…`: mesmo com a chave de serviço, estas
-- funções não servem para ler outro segredo que o projeto guarde no cofre.

create or replace function public.integracao_segredo_ler(p_ref uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.decrypted_secret
    from vault.decrypted_secrets s
   where s.id = p_ref
     and s.name like 'integracao\_%';
$$;

/*
 * Grava o segredo e devolve a referência.
 *
 * Sem referência, cria; com referência, substitui. O nome é único no
 * Vault, e é isso que impede duas execuções simultâneas de criarem dois
 * segredos para a mesma integração: a segunda cai na atualização.
 */
create or replace function public.integracao_segredo_gravar(p_ref uuid, p_nome text, p_segredo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref uuid := p_ref;
begin
  if p_nome not like 'integracao\_%' then
    raise exception 'Nome de segredo fora do padrão: %', p_nome;
  end if;

  if ref is null then
    select id into ref from vault.secrets where name = p_nome;
  end if;

  if ref is null then
    ref := vault.create_secret(p_segredo, p_nome, 'Token OAuth — gravado pela sincronização');
  else
    perform vault.update_secret(ref, p_segredo);
  end if;
  return ref;
end;
$$;

-- O Supabase dá EXECUTE a anon e authenticated em toda função nova do
-- schema public. Aqui isso seria entregar o token a qualquer um logado.
revoke all on function public.integracao_segredo_ler(uuid)                from public, anon, authenticated;
revoke all on function public.integracao_segredo_gravar(uuid, text, text) from public, anon, authenticated;
grant execute on function public.integracao_segredo_ler(uuid)                to service_role;
grant execute on function public.integracao_segredo_gravar(uuid, text, text) to service_role;

-- ── 3. Registro de cada sincronização ────────────────────────────────
alter table sincronizacoes
  add column if not exists origem text check (origem in ('agendada', 'manual'));
alter table sincronizacoes
  add column if not exists turno text;
alter table sincronizacoes
  add column if not exists resumo jsonb;

create index if not exists idx_sincronizacoes_operacao_recentes
  on sincronizacoes (operacao_id, iniciada_em desc);

commit;
