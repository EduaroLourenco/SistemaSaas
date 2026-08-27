-- ═══════════════════════════════════════════════════════════════════════
--  QUEM SE CADASTRA NO AUTH APARECE EM `usuarios` SOZINHO
--
--  `usuarios` espelha `auth.users`, mas nada preenchia esse espelho. Criar
--  o usuário no painel do Supabase não bastava: sem linha em `usuarios` e
--  em `membros`, o RLS filtra tudo e a pessoa entra num sistema vazio —
--  sem erro, sem aviso, só telas em branco. Parece bug do sistema.
--
--  O gatilho cuida do espelho. `membros` continua MANUAL de propósito:
--  criar a associação automaticamente daria acesso aos dados da operação
--  a qualquer um que conseguisse se cadastrar. O espelho é inofensivo
--  sozinho — sem `membros`, ele não abre nada.
--
--  Então o passo que sobra para liberar alguém é um só, e está no fim
--  deste arquivo.
--
--  Executar depois de 02_rls.sql. É seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function espelhar_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into usuarios (id, email, nome, avatar_url)
  values (
    new.id,
    new.email,
    -- O nome vem do que o provedor mandar; nulo quando não veio nada.
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function espelhar_usuario();

-- Também no update: trocar o e-mail no auth tem que refletir aqui, senão
-- o espelho passa a mentir.
drop trigger if exists ao_atualizar_usuario on auth.users;
create trigger ao_atualizar_usuario
  after update of email on auth.users
  for each row execute function espelhar_usuario();

-- ─────────────────────────────────────────────────────────────────────
--  Recupera quem já existe no auth e ficou de fora
-- ─────────────────────────────────────────────────────────────────────
insert into usuarios (id, email, nome)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────
--  Liberar acesso a alguém: o único passo manual
--
--  Descomente, troque o e-mail e o papel, e rode.
--
--    proprietario / administrador / editor  — leem e escrevem
--    leitor                                 — só leem
--
--  Editor é o mínimo para processar planilha, importar e lançar. Leitor
--  abre todas as telas e não consegue gravar nada.
-- ─────────────────────────────────────────────────────────────────────

-- insert into membros (organizacao_id, usuario_id, papel)
-- select
--   '00000000-0000-0000-0000-000000000001',
--   u.id,
--   'leitor'
-- from usuarios u
-- where u.email = 'pessoa@empresa.com.br'
-- on conflict (organizacao_id, usuario_id) do update
--   set papel = excluded.papel;
