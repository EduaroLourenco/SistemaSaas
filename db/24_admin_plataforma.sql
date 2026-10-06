-- ═══════════════════════════════════════════════════════════════════════
--  O ADMIN DA PLATAFORMA
--
--  O que faltava
--  ─────────────
--  Cada lojista entra na empresa dele e o RLS já o isola — isso sempre
--  funcionou. O que não existia era o outro lado: quem opera a plataforma
--  precisa entrar em QUALQUER empresa para dar suporte, e a única forma
--  era virar membro de cada uma. Isso o faz aparecer na lista de equipe do
--  cliente, depende de alguém o convidar, e esbarra no teto de cinco
--  organizações por pessoa.
--
--  A correção
--  ──────────
--  Uma marca em `usuarios`. Quem a tem enxerga todas as empresas — mas de
--  um jeito específico, explicado abaixo, porque "enxergar todas" feito
--  errado recria o defeito que a migração 23 acabou de fechar.
--
--  Por que o acesso do admin é SÓ com escolha explícita
--  ────────────────────────────────────────────────────
--  Se o admin simplesmente visse tudo, ao abrir o sistema sem escolher
--  empresa ele veria as três SOMADAS — exatamente o número plausível e
--  errado que a 23 veio impedir. Então a regra é:
--
--    sem empresa escolhida   ->  o admin vê só onde ele é membro
--    com empresa escolhida   ->  o admin entra naquela, mesmo sem ser membro
--
--  O menu de troca é outra coisa: ali ele precisa ver a lista inteira para
--  poder escolher. Por isso há duas perguntas separadas, e não uma:
--
--    `operacoes_listaveis()`   o que aparece no seletor
--    `operacoes_do_usuario()`  de onde se lê dado AGORA
--
--  Quem pode marcar alguém como admin
--  ──────────────────────────────────
--  Ninguém, pelo aplicativo. A coluna não tem política de escrita, então
--  só a chave de serviço ou o SQL Editor mudam. É de propósito: uma tela
--  que concede acesso a todas as empresas é uma tela que um dia concede
--  por engano.
--
--  Executar depois de 23_operacao_ativa.sql. É seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

alter table usuarios
  add column if not exists admin_plataforma boolean not null default false;

comment on column usuarios.admin_plataforma is
  'Entra em qualquer empresa para dar suporte. Só muda por chave de serviço.';

-- ─────────────────────────────────────────────────────────────────────
--  Quem está logado opera a plataforma?
-- ─────────────────────────────────────────────────────────────────────
create or replace function eh_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.admin_plataforma from usuarios u where u.id = auth.uid()),
    false
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
--  O que aparece no seletor de empresa
--
--  Para o lojista, as operações de que ele é membro. Para o admin, todas —
--  é a lista de onde ele escolhe em qual entrar.
-- ─────────────────────────────────────────────────────────────────────
create or replace function operacoes_listaveis()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id from operacoes o where eh_admin_plataforma()
  union
  select id from operacoes_visiveis_do_usuario() as t(id);
$$;

-- ─────────────────────────────────────────────────────────────────────
--  De onde se LÊ dado agora
--
--  O `or` do meio é o acesso de suporte, e ele exige `operacao_ativa()`
--  preenchido: sem escolha explícita o admin não entra em empresa de
--  cliente, e portanto não há como somar duas sem querer.
-- ─────────────────────────────────────────────────────────────────────
create or replace function operacoes_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from operacoes o
  where (
          o.id in (select operacoes_visiveis_do_usuario())
          or (eh_admin_plataforma() and operacao_ativa() is not null and o.id = operacao_ativa())
        )
    and (operacao_ativa() is null or o.id = operacao_ativa());
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Escrita: mesma regra, mais o papel
--
--  O admin escreve na empresa em que entrou. É o que permite consertar o
--  cadastro de um cliente sem pedir a senha dele.
-- ─────────────────────────────────────────────────────────────────────
create or replace function operacoes_editaveis_do_usuario()
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
    and m.papel in ('proprietario', 'administrador', 'editor')
    and (
      not exists (select 1 from membros_operacoes mo where mo.membro_id = m.id)
      or exists (
        select 1 from membros_operacoes mo
        where mo.membro_id = m.id and mo.operacao_id = o.id
      )
    )
    and (operacao_ativa() is null or o.id = operacao_ativa())

  union

  select o.id
  from operacoes o
  where eh_admin_plataforma()
    and operacao_ativa() is not null
    and o.id = operacao_ativa();
$$;

-- ─────────────────────────────────────────────────────────────────────
--  `operacoes` e `organizacoes`: a lista do seletor
--
--  Precisam da pergunta "o que dá para listar", não "de onde leio dado" —
--  senão o seletor mostraria só a empresa já escolhida e não haveria como
--  trocar.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists operacoes_leitura on operacoes;
create policy operacoes_leitura on operacoes
  for select using (id in (select operacoes_listaveis()));

create or replace function organizacoes_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id from organizacoes o where eh_admin_plataforma()
  union
  select m.organizacao_id from membros m where m.usuario_id = auth.uid();
$$;

revoke all on function eh_admin_plataforma() from public;
revoke all on function operacoes_listaveis() from public;
grant execute on function eh_admin_plataforma() to authenticated;
grant execute on function operacoes_listaveis() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  MARQUE A SI MESMO COMO ADMIN
--
--  Troque o e-mail e rode. Sem isto, nada nesta migração muda nada: a
--  coluna nasce falsa para todo mundo.
--
--     update usuarios set admin_plataforma = true
--      where email = 'dudu43.elo@gmail.com';
--
--  Para conferir depois:
--
--     select email, admin_plataforma from usuarios where admin_plataforma;
--
--  Para tirar de alguém:
--
--     update usuarios set admin_plataforma = false where email = '...';
-- ═══════════════════════════════════════════════════════════════════════
