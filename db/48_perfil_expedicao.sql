-- ═══════════════════════════════════════════════════════════════════════
--  48. Perfil Expedição: entra só em Envios
--
--  `expedicao` é um papel como os outros, então convite, troca de papel e
--  remoção continuam nas mesmas funções e com as mesmas travas.
--
--  O bloqueio de verdade fica aqui: quem é Expedição continua listado no
--  seletor de empresa, mas sai de `operacoes_do_usuario()`, e é essa função
--  que libera a leitura das tabelas de dados. Pedir vendas, custos ou preços
--  direto à API do Supabase não devolve nenhuma linha.
--
--  Envios lê a foto salva pelo servidor, depois de `acesso_so_expedicao` e
--  `pode_expedir_operacao` confirmarem quem está pedindo.
--
--  O valor novo é sempre comparado como texto: o PostgreSQL não deixa usar
--  um valor de enum na mesma transação em que ele foi criado.
--
--  Executar depois de 39_admin_plataforma_escreve.sql. Pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

alter type papel_membro add value if not exists 'expedicao';

create or replace function eh_expedicao_na_operacao(op uuid)
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
      and m.papel::text = 'expedicao'
  );
$$;

-- De onde se LÊ dado: igual à migração 24, menos as empresas em que a pessoa
-- é Expedição.
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
            and not eh_expedicao_na_operacao(o.id))
          or (eh_admin_plataforma() and operacao_ativa() is not null and o.id = operacao_ativa())
        )
    and (operacao_ativa() is null or o.id = operacao_ativa());
$$;

-- Quem pode imprimir etiqueta e atualizar Envios.
create or replace function pode_expedir_operacao(op uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select pode_editar_operacao(op)
      or (
        eh_expedicao_na_operacao(op)
        and op in (select operacoes_visiveis_do_usuario())
        and (operacao_ativa() is null or op = operacao_ativa())
      );
$$;

-- A pergunta do `proxy`. Empresa ausente ou que não é da pessoa não abre nada:
-- nesse caso basta ser Expedição em alguma empresa para ficar restrito.
create or replace function acesso_so_expedicao(p_operacao uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not eh_admin_plataforma()
     and case
       when p_operacao in (select operacoes_visiveis_do_usuario())
         then eh_expedicao_na_operacao(p_operacao)
       else exists (
         select 1 from membros m
         where m.usuario_id = auth.uid() and m.papel::text = 'expedicao'
       )
     end;
$$;

revoke all on function eh_expedicao_na_operacao(uuid) from public;
revoke all on function pode_expedir_operacao(uuid) from public;
revoke all on function acesso_so_expedicao(uuid) from public;
grant execute on function eh_expedicao_na_operacao(uuid) to authenticated;
grant execute on function pode_expedir_operacao(uuid) to authenticated;
grant execute on function acesso_so_expedicao(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  CONFERIR, logado como uma pessoa de Expedição:
--     select acesso_so_expedicao(null);          -- true
--     select count(*) from pedidos;              -- 0
--
--  DESFAZER: troque essas pessoas para outro papel e rode de novo a definição
--  de `operacoes_do_usuario()` de 24_admin_plataforma.sql.
-- ═══════════════════════════════════════════════════════════════════════
