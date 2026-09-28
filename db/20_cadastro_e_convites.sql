-- ═══════════════════════════════════════════════════════════════════════
--  A PORTA DE ENTRADA: A EMPRESA SE CADASTRA SOZINHA E CONVIDA O TIME
--
--  Até aqui, entrar no sistema exigia alguém criar a linha de `membros` à
--  mão no banco. Serve para uma empresa; não serve para vender.
--
--  Duas funções, e as duas são `security definer` pelo mesmo motivo: são
--  as únicas escritas do sistema que acontecem FORA de um tenant.
--
--    - criar a organização cria o próprio tenant. Não há linha de
--      `membros` ainda, então não existe RLS que possa autorizar: a
--      política olharia para um vínculo que a função está criando.
--    - aceitar convite é escrita de quem ainda está do lado de fora. O
--      convidado não pertence à organização até o instante em que aceita.
--
--  Cada uma carrega a checagem que o RLS faria, explícita no corpo. Onde
--  não é possível delegar, é preciso escrever — e deixar claro por quê.
--
--  Executar depois de 10_espelho_de_usuarios.sql. É seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists convites (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid         not null references organizacoes(id) on delete cascade,
  email           citext       not null,
  papel           papel_membro not null default 'leitor',

  /*
   * O token é o convite. Vai na URL, e por isso tem 32 bytes de aleatório
   * de verdade (`gen_random_bytes`), não um uuid sequencial de sorte.
   */
  token           text         not null unique default encode(gen_random_bytes(32), 'hex'),

  convidado_por   uuid         references usuarios(id) on delete set null,
  criado_em       timestamptz  not null default now(),
  -- Convite sem prazo é porta destrancada esquecida: sete dias.
  expira_em       timestamptz  not null default now() + interval '7 days',
  aceito_em       timestamptz,
  aceito_por      uuid         references usuarios(id) on delete set null,

  -- Um convite em aberto por e-mail e organização. Reconvidar substitui.
  unique (organizacao_id, email)
);

create index if not exists convites_pendentes on convites (email) where aceito_em is null;

-- ─────────────────────────────────────────────────────────────────────
--  1. Cadastro: cria a empresa, a operação inicial e o dono
-- ─────────────────────────────────────────────────────────────────────

/** Slug legível e único: "Colchões Probel" → "colchoes-probel", "-2"… */
create or replace function slug_de(p_texto text)
returns citext
language plpgsql
stable
set search_path = public
as $$
declare
  base text;
begin
  base := lower(trim(p_texto));
  base := translate(base,
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn');
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from base);
  if base = '' then base := 'empresa'; end if;
  return left(base, 40);
end;
$$;

create or replace function criar_organizacao(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_base    citext;
  v_slug    citext;
  v_org     uuid;
  v_op      uuid;
  v_n       int := 1;
begin
  if v_usuario is null then
    raise exception 'Entre no sistema antes de criar a empresa.' using errcode = '28000';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'A empresa precisa de um nome.' using errcode = '22023';
  end if;

  /*
   * Teto de empresas por pessoa.
   *
   * O cadastro é aberto: qualquer um com e-mail confirmado chega aqui. Sem
   * teto, um script cria dez mil organizações numa tarde, e cada uma nasce
   * com operação, canais e lugar no agendador. Cinco cobre o caso real de
   * quem administra o próprio grupo de empresas.
   */
  if (select count(*) from membros
       where usuario_id = v_usuario and papel = 'proprietario') >= 5 then
    raise exception 'Você já é proprietário de cinco empresas. Fale com o suporte.'
      using errcode = '54000';
  end if;

  -- O espelho normalmente já existe (gatilho em auth.users); garante aqui
  -- porque a chave estrangeira de `membros` depende dele.
  insert into usuarios (id, email)
  select v_usuario, u.email from auth.users u where u.id = v_usuario
  on conflict (id) do nothing;

  v_base := slug_de(p_nome);
  v_slug := v_base;
  while exists (select 1 from organizacoes where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into organizacoes (nome, slug) values (trim(p_nome), v_slug)
  returning id into v_org;

  insert into operacoes (organizacao_id, nome, slug)
  values (v_org, 'Operação principal', 'principal')
  returning id into v_op;

  insert into membros (organizacao_id, usuario_id, papel)
  values (v_org, v_usuario, 'proprietario');

  -- Sem linha em `membros_operacoes`: o dono enxerga todas as operações,
  -- inclusive as que ele criar depois.
  return v_org;
end;
$$;

revoke all on function criar_organizacao(text) from public;
grant execute on function criar_organizacao(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
--  2. Convite: quem manda, quem aceita
-- ─────────────────────────────────────────────────────────────────────

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
  select papel into v_papel from membros
   where organizacao_id = p_organizacao and usuario_id = v_usuario;

  if v_papel is null or v_papel not in ('proprietario', 'administrador') then
    raise exception 'Só proprietário ou administrador convida.' using errcode = '42501';
  end if;
  -- Ninguém entrega mais poder do que tem: administrador não cria dono.
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

  -- Reconvidar renova prazo e token: o link antigo morre na hora.
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

revoke all on function convidar_membro(uuid, citext, papel_membro) from public;
grant execute on function convidar_membro(uuid, citext, papel_membro) to authenticated;

/**
 * O convidado aceita. Devolve o nome da empresa em que entrou.
 *
 * O e-mail da sessão tem que ser o do convite. Sem essa amarra, quem
 * recebesse o link encaminhado entraria no lugar do convidado — e o
 * histórico registraria a pessoa errada.
 */
create or replace function aceitar_convite(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_email   citext;
  v_c       convites;
  v_nome    text;
begin
  if v_usuario is null then
    raise exception 'Entre no sistema para aceitar o convite.' using errcode = '28000';
  end if;

  select email into v_email from auth.users where id = v_usuario;

  select * into v_c from convites where token = p_token;
  if v_c.id is null then
    raise exception 'Convite não encontrado.' using errcode = '22023';
  end if;
  if v_c.aceito_em is not null then
    raise exception 'Este convite já foi usado.' using errcode = '22023';
  end if;
  if v_c.expira_em < now() then
    raise exception 'Este convite venceu. Peça outro a quem administra.' using errcode = '22023';
  end if;
  if v_c.email <> v_email then
    raise exception 'Este convite foi enviado para %, e você entrou como %.', v_c.email, v_email
      using errcode = '42501';
  end if;

  insert into usuarios (id, email)
  values (v_usuario, v_email)
  on conflict (id) do nothing;

  insert into membros (organizacao_id, usuario_id, papel)
  values (v_c.organizacao_id, v_usuario, v_c.papel)
  on conflict (organizacao_id, usuario_id) do nothing;

  update convites set aceito_em = now(), aceito_por = v_usuario where id = v_c.id;

  select nome into v_nome from organizacoes where id = v_c.organizacao_id;
  return v_nome;
end;
$$;

revoke all on function aceitar_convite(text) from public;
grant execute on function aceitar_convite(text) to authenticated;

/**
 * O que um convite diz ANTES de ser aceito, para a tela se explicar.
 *
 * Só nome da empresa, e-mail convidado e papel — nunca o token de volta,
 * nunca quem mais está na empresa. Quem tem o link ainda é um estranho.
 */
create or replace function convite_por_token(p_token text)
returns table (empresa text, email citext, papel papel_membro, expira_em timestamptz, aceito boolean)
language sql
security definer
set search_path = public
as $$
  select o.nome, c.email, c.papel, c.expira_em, c.aceito_em is not null
    from convites c join organizacoes o on o.id = c.organizacao_id
   where c.token = p_token;
$$;

revoke all on function convite_por_token(text) from public;
grant execute on function convite_por_token(text) to authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────
--  3. RLS dos convites
-- ─────────────────────────────────────────────────────────────────────

alter table convites enable row level security;

-- Quem está na empresa vê os convites dela; o token fica exposto apenas a
-- quem já é membro, que é quem precisa reenviar o link.
drop policy if exists convites_leitura on convites;
create policy convites_leitura on convites
  for select using (organizacao_id in (select organizacoes_do_usuario()));

-- Criar e aceitar passam pelas funções acima. Cancelar é o único que a
-- tela faz direto, e só administração cancela.
drop policy if exists convites_exclusao on convites;
create policy convites_exclusao on convites
  for delete using (
    exists (
      select 1 from membros m
       where m.organizacao_id = convites.organizacao_id
         and m.usuario_id = auth.uid()
         and m.papel in ('proprietario', 'administrador')
    )
  );

-- Papel de membro é mexido pela administração da própria empresa; até aqui
-- só havia leitura, e trocar papel exigia ir ao banco.
drop policy if exists membros_administracao on membros;
create policy membros_administracao on membros
  for update using (
    exists (
      select 1 from membros m
       where m.organizacao_id = membros.organizacao_id
         and m.usuario_id = auth.uid()
         and m.papel in ('proprietario', 'administrador')
    )
  );

drop policy if exists membros_remocao on membros;
create policy membros_remocao on membros
  for delete using (
    -- Ninguém remove o último proprietário: a empresa ficaria sem dono.
    papel <> 'proprietario'
    and exists (
      select 1 from membros m
       where m.organizacao_id = membros.organizacao_id
         and m.usuario_id = auth.uid()
         and m.papel in ('proprietario', 'administrador')
    )
  );
