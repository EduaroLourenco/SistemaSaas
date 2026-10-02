/* ═══════════════════════════════════════════════════════════════════
   22. Equipe: mudar papel e remover membro
   ═══════════════════════════════════════════════════════════════════

   A migração 20 trouxe convidar e aceitar. Faltava o outro lado: quem
   saiu da empresa continua entrando, porque `membros` só tem política de
   leitura e nenhuma tela consegue apagar a linha.

   Isso não é falta de comodidade, é acesso de ex-funcionário. E não se
   resolve com política de UPDATE/DELETE solta: a tela mandaria o id e o
   banco obedeceria, inclusive para rebaixar o último proprietário e
   deixar a empresa sem ninguém que possa administrar.

   Por isso as duas operações são função, com as travas dentro:

     · só proprietário ou administrador mexe em membro;
     · ninguém rebaixa nem remove o ÚLTIMO proprietário;
     · administrador não promove alguém a proprietário — quem dá o próprio
       nível é só quem já o tem.

   Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
   ═══════════════════════════════════════════════════════════════════ */

-- ─────────────────────────────────────────────────────────────────────
--  Quem manda na organização de um membro
-- ─────────────────────────────────────────────────────────────────────

create or replace function papel_na_organizacao(p_organizacao uuid)
returns papel_membro
language sql
stable
security definer
set search_path = public
as $$
  select papel from membros
   where organizacao_id = p_organizacao and usuario_id = auth.uid()
   limit 1;
$$;

revoke all on function papel_na_organizacao(uuid) from public;
grant execute on function papel_na_organizacao(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
--  Mudar o papel de um membro
-- ─────────────────────────────────────────────────────────────────────

create or replace function alterar_papel_membro(
  p_membro uuid,
  p_papel  papel_membro
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m           membros;
  v_meu_papel   papel_membro;
  v_proprietarios int;
begin
  select * into v_m from membros where id = p_membro;
  if v_m.id is null then
    raise exception 'Esse membro não existe.';
  end if;

  v_meu_papel := papel_na_organizacao(v_m.organizacao_id);
  if v_meu_papel is null or v_meu_papel not in ('proprietario', 'administrador') then
    raise exception 'Só proprietário ou administrador muda o papel de alguém.';
  end if;

  /*
   * Administrador não cria proprietário. Dar o próprio nível a outro é
   * decisão de quem já o tem — senão o primeiro administrador convidado
   * se promove e o dono perde o controle da empresa.
   */
  if p_papel = 'proprietario' and v_meu_papel <> 'proprietario' then
    raise exception 'Só um proprietário promove alguém a proprietário.';
  end if;

  if v_m.papel = p_papel then
    return;
  end if;

  /*
   * Rebaixar o último proprietário deixaria a empresa sem ninguém que
   * possa convidar, remover ou promover — e sem como voltar atrás pela
   * tela.
   */
  if v_m.papel = 'proprietario' and p_papel <> 'proprietario' then
    select count(*) into v_proprietarios from membros
     where organizacao_id = v_m.organizacao_id and papel = 'proprietario';
    if v_proprietarios <= 1 then
      raise exception 'A empresa ficaria sem proprietário. Promova outra pessoa primeiro.';
    end if;
  end if;

  update membros set papel = p_papel where id = p_membro;
end;
$$;

revoke all on function alterar_papel_membro(uuid, papel_membro) from public;
grant execute on function alterar_papel_membro(uuid, papel_membro) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
--  Remover um membro
-- ─────────────────────────────────────────────────────────────────────

create or replace function remover_membro(p_membro uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m             membros;
  v_meu_papel     papel_membro;
  v_proprietarios int;
begin
  select * into v_m from membros where id = p_membro;
  if v_m.id is null then
    raise exception 'Esse membro não existe.';
  end if;

  v_meu_papel := papel_na_organizacao(v_m.organizacao_id);
  if v_meu_papel is null or v_meu_papel not in ('proprietario', 'administrador') then
    raise exception 'Só proprietário ou administrador remove alguém.';
  end if;

  -- Administrador não derruba proprietário.
  if v_m.papel = 'proprietario' and v_meu_papel <> 'proprietario' then
    raise exception 'Só um proprietário remove outro proprietário.';
  end if;

  if v_m.papel = 'proprietario' then
    select count(*) into v_proprietarios from membros
     where organizacao_id = v_m.organizacao_id and papel = 'proprietario';
    if v_proprietarios <= 1 then
      raise exception 'A empresa ficaria sem proprietário. Promova outra pessoa primeiro.';
    end if;
  end if;

  /*
   * `membros_operacoes` cai por cascade. O que a pessoa já lançou fica:
   * apagar lançamento junto reescreveria o histórico financeiro de quem
   * só saiu da empresa.
   */
  delete from membros where id = p_membro;
end;
$$;

revoke all on function remover_membro(uuid) from public;
grant execute on function remover_membro(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
--  Reconvidar: o convite de um e-mail já convidado é substituído
-- ─────────────────────────────────────────────────────────────────────

/*
 * `convites` tem `unique (organizacao_id, email)`, e `convidar_membro`
 * falharia na segunda tentativa para o mesmo e-mail — que é exatamente o
 * que alguém faz quando o prazo de sete dias venceu.
 *
 * Apagar o pendente antes de inserir é o que a tela espera: reconvidar
 * emite um token novo e invalida o antigo, que é o comportamento seguro.
 */
create or replace function reconvidar_membro(
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
  v_papel papel_membro;
begin
  v_papel := papel_na_organizacao(p_organizacao);
  if v_papel is null or v_papel not in ('proprietario', 'administrador') then
    raise exception 'Só proprietário ou administrador convida.';
  end if;

  delete from convites
   where organizacao_id = p_organizacao
     and email = p_email
     and aceito_em is null;

  return convidar_membro(p_organizacao, p_email, p_papel);
end;
$$;

revoke all on function reconvidar_membro(uuid, citext, papel_membro) from public;
grant execute on function reconvidar_membro(uuid, citext, papel_membro) to authenticated;

comment on function alterar_papel_membro(uuid, papel_membro) is
  'Muda o papel de um membro. Nunca deixa a organização sem proprietário.';
comment on function remover_membro(uuid) is
  'Remove um membro. Mantém o que ele lançou; nunca remove o último proprietário.';
comment on function reconvidar_membro(uuid, citext, papel_membro) is
  'Substitui o convite pendente do e-mail por um token novo.';
