-- ═══════════════════════════════════════════════════════════════════════
--  32 · Equipe da empresa ativa, também para o admin da plataforma
--
--  O defeito: a tela de Equipe lia a PRIMEIRA empresa do vínculo de quem
--  olhava. O admin da plataforma é membro só da Probel; ao entrar na Bom
--  de Compras pelo seletor, via a equipe da Probel, e o convite feito ali
--  ia para a Probel. A tela agora segue a empresa ativa (código), e o banco
--  passa a reconhecer o admin como quem administra a empresa em que entrou
--  — sem isso a tela certa recusaria o convite.
--
--  O admin age como proprietário: é o acesso de suporte que a migração 24
--  já dá para ler e editar. Quem é membro de verdade continua com o papel
--  que tem (o vínculo vem antes do admin).
--
--  Executar depois de 31_convites_pgcrypto.sql. Seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function papel_na_organizacao(p_organizacao uuid)
returns papel_membro
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select papel from membros
      where organizacao_id = p_organizacao and usuario_id = auth.uid()
      limit 1),
    case when eh_admin_plataforma() then 'proprietario'::papel_membro end
  );
$$;

-- Mesmo corpo da migração 20; só a leitura do papel passa pela função acima.
create or replace function convidar_membro(
  p_organizacao uuid,
  p_email       citext,
  p_papel       papel_membro default 'leitor'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_papel   papel_membro;
  v_token   text;
begin
  v_papel := papel_na_organizacao(p_organizacao);

  if v_papel is null or v_papel not in ('proprietario', 'administrador') then
    raise exception 'Só proprietário ou administrador convida.' using errcode = '42501';
  end if;
  if p_papel = 'proprietario' and v_papel <> 'proprietario' then
    raise exception 'Só o proprietário nomeia outro proprietário.' using errcode = '42501';
  end if;
  if p_email is null or position('@' in p_email::text) = 0 then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;

  if exists (
    select 1 from membros m join usuarios u on u.id = m.usuario_id
     where m.organizacao_id = p_organizacao and u.email = p_email
  ) then
    raise exception 'Essa pessoa já está na empresa.' using errcode = '23505';
  end if;

  insert into convites (organizacao_id, email, papel, convidado_por)
  values (p_organizacao, p_email, p_papel, v_usuario)
  on conflict (organizacao_id, email) do update
    set papel = excluded.papel,
        convidado_por = excluded.convidado_por,
        token = encode(gen_random_bytes(32), 'hex'),
        criado_em = now(),
        expira_em = now() + interval '7 days',
        aceito_em = null,
        aceito_por = null
  returning token into v_token;

  return v_token;
end;
$$;

-- O `create or replace` acima volta o search_path para só `public`;
-- reaplica a correção da 31 (pgcrypto pode morar em `extensions`).
do $$
declare
  v_schema name;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';
  if v_schema is null then
    raise exception 'A extensão pgcrypto precisa estar instalada.';
  end if;
  execute format(
    'alter function convidar_membro(uuid, citext, papel_membro) set search_path = public, %I',
    v_schema
  );
end;
$$;

-- Nome e e-mail dos membros: o admin vê os da empresa em que entrou.
create or replace function usuarios_visiveis()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select m.usuario_id from membros m
   where m.organizacao_id in (select organizacoes_do_usuario());
$$;

-- Cancelar convite é o único caminho direto da tela.
drop policy if exists convites_exclusao on convites;
create policy convites_exclusao on convites
  for delete using (pode_administrar_organizacao(organizacao_id));

notify pgrst, 'reload schema';
