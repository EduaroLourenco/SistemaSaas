-- ═══════════════════════════════════════════════════════════════════════
--  49. Expedição por conta de canal
--
--  Quem é Expedição vê e imprime só as contas marcadas aqui. Sem nenhuma
--  linha, não vê conta nenhuma: esquecer de marcar não abre dado.
--
--  A tabela não tem política de leitura ou escrita: tudo passa pelas funções
--  abaixo, que conferem quem está pedindo.
--
--  Executar depois de 48_perfil_expedicao.sql. Pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists membros_contas_expedicao (
  membro_id      uuid not null references membros(id) on delete cascade,
  conta_canal_id uuid not null references contas_canal(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  primary key (membro_id, conta_canal_id)
);
alter table membros_contas_expedicao enable row level security;
alter table membros_contas_expedicao force row level security;

-- As contas liberadas para quem está logado, na empresa aberta.
create or replace function contas_da_expedicao(p_operacao uuid)
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nome::text
  from membros m
  join operacoes o on o.organizacao_id = m.organizacao_id and o.id = p_operacao
  join membros_contas_expedicao l on l.membro_id = m.id
  join contas_canal c on c.id = l.conta_canal_id and c.operacao_id = o.id
  where m.usuario_id = auth.uid()
    and m.papel::text = 'expedicao'
    and p_operacao in (select operacoes_visiveis_do_usuario());
$$;

-- O que a tela Equipe mostra para proprietário e administrador.
create or replace function contas_expedicao_da_empresa(p_organizacao uuid)
returns table (membro_id uuid, conta_canal_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(papel_na_organizacao(p_organizacao)::text, '') not in ('proprietario', 'administrador') then
    raise exception 'Só proprietário ou administrador vê as contas liberadas.' using errcode = '42501';
  end if;
  return query
    select l.membro_id, l.conta_canal_id
    from membros_contas_expedicao l
    join membros m on m.id = l.membro_id
    where m.organizacao_id = p_organizacao;
end;
$$;

create or replace function definir_contas_expedicao(p_membro uuid, p_contas uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m membros;
  v_contas uuid[] := coalesce(p_contas, '{}');
begin
  select * into v_m from membros where id = p_membro;
  if v_m.id is null then raise exception 'Esse membro não existe.'; end if;
  if coalesce(papel_na_organizacao(v_m.organizacao_id)::text, '') not in ('proprietario', 'administrador') then
    raise exception 'Só proprietário ou administrador libera contas.' using errcode = '42501';
  end if;
  if v_m.papel::text <> 'expedicao' then
    raise exception 'Essa pessoa não está no perfil Expedição.';
  end if;
  if exists (
    select 1 from unnest(v_contas) as q(id)
    where not exists (
      select 1 from contas_canal c
      join operacoes o on o.id = c.operacao_id
      where c.id = q.id and o.organizacao_id = v_m.organizacao_id
    )
  ) then
    raise exception 'Essa conta não é desta empresa.';
  end if;

  delete from membros_contas_expedicao where membro_id = p_membro;
  insert into membros_contas_expedicao (membro_id, conta_canal_id)
  select p_membro, q.id from (select distinct unnest(v_contas) as id) q;
end;
$$;

revoke all on table membros_contas_expedicao from public, anon, authenticated;
revoke all on function contas_da_expedicao(uuid) from public;
revoke all on function contas_expedicao_da_empresa(uuid) from public;
revoke all on function definir_contas_expedicao(uuid, uuid[]) from public;
grant execute on function contas_da_expedicao(uuid) to authenticated;
grant execute on function contas_expedicao_da_empresa(uuid) to authenticated;
grant execute on function definir_contas_expedicao(uuid, uuid[]) to authenticated;

-- Probel: quem já é Expedição fica com a conta de São Paulo.
insert into membros_contas_expedicao (membro_id, conta_canal_id)
select m.id, c.id
from membros m
join organizacoes g on g.id = m.organizacao_id and g.nome = 'Probel'
join operacoes o on o.organizacao_id = g.id
join contas_canal c on c.operacao_id = o.id and c.nome = 'São Paulo — pronta entrega'
where m.papel::text = 'expedicao'
on conflict do nothing;
