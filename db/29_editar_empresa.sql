-- ═══════════════════════════════════════════════════════════════════════
--  RENOMEAR, CRIAR E APAGAR EMPRESA E OPERAÇÃO
--
--  O que faltava
--  ─────────────
--  `organizacoes` e `operacoes` têm política de LEITURA e mais nada. Quem
--  criou uma empresa com o nome errado — ou uma de teste — não tinha como
--  corrigir nem apagar pela tela; só com acesso ao banco.
--
--  As funções abaixo são `security definer` justamente porque as políticas
--  de escrita não existem: abrir `update` e `delete` direto na tabela daria
--  o mesmo poder sem as travas que importam.
--
--  As travas
--  ─────────
--  Apagar uma empresa leva junto operações, canais, anúncios, pedidos e
--  financeiro, em cascata. Não é uma ação que mereça só um "tem certeza?":
--  empresa COM PEDIDO não é apagada de jeito nenhum, e o caminho para sair
--  dela é desativar, não excluir.
--
--  A última operação de uma empresa também não sai. Uma empresa sem
--  operação é uma empresa onde nada pode ser cadastrado — e o defeito só
--  apareceria depois, na forma de telas vazias.
--
--  Executar depois de 28_relatorio_por_empresa.sql. Seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  Quem manda nesta empresa
--
--  O admin da plataforma, ou quem é proprietário/administrador dela.
-- ─────────────────────────────────────────────────────────────────────
create or replace function pode_administrar_organizacao(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select eh_admin_plataforma()
      or exists (
           select 1 from membros m
            where m.organizacao_id = p_org
              and m.usuario_id = auth.uid()
              and m.papel in ('proprietario', 'administrador')
         );
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Renomear a empresa
--
--  O slug NÃO muda junto, de propósito: ele aparece em endereço e em
--  referência guardada, e trocá-lo por causa de um ajuste de nome
--  quebraria links que já estão por aí.
-- ─────────────────────────────────────────────────────────────────────
create or replace function renomear_organizacao(p_org uuid, p_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pode_administrar_organizacao(p_org) then
    raise exception 'Você não administra esta empresa.' using errcode = '42501';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'A empresa precisa de um nome.' using errcode = '22023';
  end if;
  update organizacoes set nome = trim(p_nome) where id = p_org;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Apagar a empresa
--
--  Só o admin da plataforma, e só enquanto não houver pedido. Pedido é a
--  prova de que a empresa operou de verdade; apagar aí seria perder
--  histórico que ninguém consegue reconstruir.
-- ─────────────────────────────────────────────────────────────────────
create or replace function excluir_organizacao(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedidos bigint;
begin
  if not eh_admin_plataforma() then
    raise exception 'Só o admin da plataforma apaga uma empresa.' using errcode = '42501';
  end if;

  select count(*) into v_pedidos
    from pedidos p
    join operacoes o on o.id = p.operacao_id
   where o.organizacao_id = p_org;

  if v_pedidos > 0 then
    raise exception
      'Esta empresa tem % pedido(s) e não pode ser apagada. Desative em vez de excluir.', v_pedidos
      using errcode = '23503';
  end if;

  delete from organizacoes where id = p_org;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Criar uma operação
--
--  Nasce semeada, como a da empresa nova: sem canal, a importação recusa
--  tudo e o Financeiro abre sem onde classificar.
-- ─────────────────────────────────────────────────────────────────────
create or replace function criar_operacao(p_org uuid, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base citext;
  v_slug citext;
  v_op   uuid;
  v_n    int := 1;
begin
  if not pode_administrar_organizacao(p_org) then
    raise exception 'Você não administra esta empresa.' using errcode = '42501';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'A operação precisa de um nome.' using errcode = '22023';
  end if;

  v_base := slug_de(p_nome);
  v_slug := v_base;
  /* O slug é único DENTRO da empresa, não no sistema inteiro. */
  while exists (select 1 from operacoes where organizacao_id = p_org and slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into operacoes (organizacao_id, nome, slug)
  values (p_org, trim(p_nome), v_slug)
  returning id into v_op;

  perform semear_canais(v_op);
  perform semear_categorias_financeiras(v_op);
  return v_op;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Renomear uma operação
-- ─────────────────────────────────────────────────────────────────────
create or replace function renomear_operacao(p_operacao uuid, p_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organizacao_id into v_org from operacoes where id = p_operacao;
  if v_org is null then
    raise exception 'Operação não encontrada.' using errcode = 'P0002';
  end if;
  if not pode_administrar_organizacao(v_org) then
    raise exception 'Você não administra esta empresa.' using errcode = '42501';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'A operação precisa de um nome.' using errcode = '22023';
  end if;
  update operacoes set nome = trim(p_nome) where id = p_operacao;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Apagar uma operação
--
--  Duas travas: pedido e última operação. A segunda existe porque empresa
--  sem operação não aceita cadastro nenhum, e o sintoma apareceria longe
--  daqui — como tela vazia, não como erro.
-- ─────────────────────────────────────────────────────────────────────
create or replace function excluir_operacao(p_operacao uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_pedidos bigint;
  v_quantas bigint;
begin
  select organizacao_id into v_org from operacoes where id = p_operacao;
  if v_org is null then
    raise exception 'Operação não encontrada.' using errcode = 'P0002';
  end if;
  if not pode_administrar_organizacao(v_org) then
    raise exception 'Você não administra esta empresa.' using errcode = '42501';
  end if;

  select count(*) into v_pedidos from pedidos where operacao_id = p_operacao;
  if v_pedidos > 0 then
    raise exception 'Esta operação tem % pedido(s) e não pode ser apagada.', v_pedidos
      using errcode = '23503';
  end if;

  select count(*) into v_quantas from operacoes where organizacao_id = v_org;
  if v_quantas <= 1 then
    raise exception 'A empresa precisa de ao menos uma operação.' using errcode = '23514';
  end if;

  delete from operacoes where id = p_operacao;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  As operações de uma empresa, com o que a tela precisa para decidir
--
--  A contagem de pedidos vem junto porque é ela que diz se o botão de
--  apagar deve aparecer. Sem isso a tela ofereceria uma ação que o banco
--  vai recusar, e o usuário descobre pelo erro.
-- ─────────────────────────────────────────────────────────────────────
create or replace function operacoes_da_organizacao(p_org uuid)
returns table (
  operacao_id uuid,
  nome        text,
  slug        text,
  contas      bigint,
  pedidos     bigint,
  conectadas  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.nome,
    o.slug::text,
    (select count(*) from contas_canal cc where cc.operacao_id = o.id),
    (select count(*) from pedidos p where p.operacao_id = o.id),
    (select count(*) from integracoes i
       join contas_canal cc on cc.id = i.conta_canal_id
      where cc.operacao_id = o.id and i.credencial_ref is not null)
  from operacoes o
  where o.organizacao_id = p_org
    and (eh_admin_plataforma() or p_org in (select organizacoes_do_usuario()))
  order by o.nome;
$$;

revoke all on function pode_administrar_organizacao(uuid) from public;
revoke all on function renomear_organizacao(uuid, text) from public;
revoke all on function excluir_organizacao(uuid) from public;
revoke all on function criar_operacao(uuid, text) from public;
revoke all on function renomear_operacao(uuid, text) from public;
revoke all on function excluir_operacao(uuid) from public;
revoke all on function operacoes_da_organizacao(uuid) from public;

grant execute on function pode_administrar_organizacao(uuid) to authenticated;
grant execute on function renomear_organizacao(uuid, text) to authenticated;
grant execute on function excluir_organizacao(uuid) to authenticated;
grant execute on function criar_operacao(uuid, text) to authenticated;
grant execute on function renomear_operacao(uuid, text) to authenticated;
grant execute on function excluir_operacao(uuid) to authenticated;
grant execute on function operacoes_da_organizacao(uuid) to authenticated;
