-- Corrige a resolução de gen_random_bytes dentro de convidar_membro.
-- A função da migração 20 usa search_path=public, mas pgcrypto pode estar
-- em extensions. Não muda permissões, membros, convites ou seus tokens.
-- Seguro executar novamente no SQL Editor do mesmo projeto Supabase.

do $$
declare
  v_schema name;
  v_funcao regprocedure;
begin
  select n.nspname into v_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';
  if v_schema is null then
    raise exception 'A extensão pgcrypto precisa estar instalada antes desta correção.';
  end if;

  select p.oid::regprocedure into v_funcao
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'convidar_membro' and p.pronargs = 3;
  if v_funcao is null then
    raise exception 'Aplique db/20_cadastro_e_convites.sql antes desta correção.';
  end if;

  execute format('alter function %s set search_path = public, %I', v_funcao, v_schema);
end;
$$;

notify pgrst, 'reload schema';
