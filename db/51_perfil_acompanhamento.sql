-- ═══════════════════════════════════════════════════════════════════════
--  51. Perfil Acompanhamento: entra só em Pedidos
--
--  Mesmo desenho da Expedição (48): é um papel como os outros, e quem o tem
--  sai de `operacoes_do_usuario()`, então não lê vendas, custos nem preços.
--  Pedidos lê a foto salva pelo servidor e grava o status manual depois de
--  `pode_acompanhar_operacao` confirmar quem está pedindo.
--
--  Acompanhamento NÃO imprime etiqueta: fica fora de `pode_expedir_operacao`.
--
--  Executar depois de 49_contas_da_expedicao.sql. Pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

alter type papel_membro add value if not exists 'acompanhamento';

create or replace function eh_acompanhamento_na_operacao(op uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from operacoes o
    join membros m on m.organizacao_id = o.organizacao_id
    where o.id = op
      and m.usuario_id = auth.uid()
      and m.papel::text = 'acompanhamento'
  );
$$;

-- A da 48, menos também as empresas em que a pessoa é Acompanhamento.
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
          (o.id in (select operacoes_visiveis_do_usuario())
            and not eh_expedicao_na_operacao(o.id)
            and not eh_acompanhamento_na_operacao(o.id))
          or (eh_admin_plataforma() and operacao_ativa() is not null and o.id = operacao_ativa())
        )
    and (operacao_ativa() is null or o.id = operacao_ativa());
$$;

-- Quem pode marcar status e atualizar a leitura de Pedidos.
create or replace function pode_acompanhar_operacao(op uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select pode_editar_operacao(op)
      or (
        eh_acompanhamento_na_operacao(op)
        and op in (select operacoes_visiveis_do_usuario())
        and (operacao_ativa() is null or op = operacao_ativa())
      );
$$;

-- A pergunta do `proxy`: qual tela única a pessoa vê, ou null para o sistema todo.
create or replace function perfil_restrito(p_operacao uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when eh_admin_plataforma() then null
    when p_operacao in (select operacoes_visiveis_do_usuario()) then
      case
        when eh_expedicao_na_operacao(p_operacao) then 'expedicao'
        when eh_acompanhamento_na_operacao(p_operacao) then 'acompanhamento'
      end
    else (
      select m.papel::text from membros m
      where m.usuario_id = auth.uid() and m.papel::text in ('expedicao', 'acompanhamento')
      order by m.papel::text desc
      limit 1
    )
  end;
$$;

revoke all on function eh_acompanhamento_na_operacao(uuid) from public;
revoke all on function pode_acompanhar_operacao(uuid) from public;
revoke all on function perfil_restrito(uuid) from public;
grant execute on function eh_acompanhamento_na_operacao(uuid) to authenticated;
grant execute on function pode_acompanhar_operacao(uuid) to authenticated;
grant execute on function perfil_restrito(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  CONFERIR, logado como uma pessoa de Acompanhamento:
--     select perfil_restrito(null);              -- 'acompanhamento'
--     select count(*) from pedidos;              -- 0
-- ═══════════════════════════════════════════════════════════════════════
