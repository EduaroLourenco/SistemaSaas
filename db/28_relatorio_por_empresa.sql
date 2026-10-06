-- ═══════════════════════════════════════════════════════════════════════
--  O LINK DO RELATÓRIO É DE UMA EMPRESA SÓ
--
--  O que estava errado
--  ───────────────────
--  A chave do relatório vive em `RELATORIO_CHAVE`, uma variável de
--  ambiente, e é UMA para a instalação inteira. O relatório também é
--  montado com a chave de serviço, que passa por fora do RLS de propósito —
--  é o que permite abrir sem login.
--
--  Com uma empresa isso funciona. Com três, o mesmo endereço mostra o
--  faturamento das três somado, para qualquer pessoa que tenha o link. Não
--  é vazamento de senha: é a página fazendo exatamente o que foi escrita
--  para fazer, com um pressuposto que deixou de valer.
--
--  A correção
--  ──────────
--  A chave sai do ambiente e vira coluna em `operacoes`, uma por operação.
--  O endereço deixa de ser "a chave" e passa a ser "a chave daquela loja":
--  quem a tem abre o relatório de uma empresa, e de nenhuma outra.
--
--  Sobre revogar
--  ─────────────
--  Trocar a chave invalida o link antigo na hora, e é o que se faz quando
--  alguém que não devia recebe o endereço. `girar_chave_relatorio()` existe
--  para isso, e só quem edita a operação pode chamá-la.
--
--  Executar depois de 27_admin_cria_empresa.sql. Seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

alter table operacoes
  add column if not exists relatorio_chave text;

/*
 * 32 bytes em hexadecimal: 64 caracteres, o mesmo tamanho do token de
 * convite. Adivinhar por tentativa não é caminho, e o endereço continua
 * curto o bastante para caber numa mensagem.
 */
update operacoes
   set relatorio_chave = encode(gen_random_bytes(32), 'hex')
 where relatorio_chave is null;

alter table operacoes
  alter column relatorio_chave set default encode(gen_random_bytes(32), 'hex'),
  alter column relatorio_chave set not null;

/*
 * Duas operações com a mesma chave quebrariam a resolução: o endereço
 * deixaria de identificar uma loja. O índice único garante que não
 * aconteça nem por engano nem por colisão.
 */
create unique index if not exists operacoes_relatorio_chave_idx
  on operacoes (relatorio_chave);

comment on column operacoes.relatorio_chave is
  'Abre /relatorio/<chave> sem login, só desta operação. Trocar revoga o link.';

-- ─────────────────────────────────────────────────────────────────────
--  Resolver a chave sem sessão
--
--  Quem abre o relatório não está logado, então o RLS de `operacoes` não
--  devolveria nada. Esta função é `security definer` e devolve APENAS o id
--  e o nome — nada de dado de venda, e nada que sirva para descobrir outra
--  chave. Chave errada devolve vazio, sem dizer se existe.
-- ─────────────────────────────────────────────────────────────────────
create or replace function operacao_por_chave_relatorio(p_chave text)
returns table (operacao_id uuid, nome text, empresa text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.nome, org.nome
  from operacoes o
  join organizacoes org on org.id = o.organizacao_id
  where o.relatorio_chave = p_chave
    and length(coalesce(p_chave, '')) >= 32;
$$;

revoke all on function operacao_por_chave_relatorio(text) from public;
grant execute on function operacao_por_chave_relatorio(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
--  Trocar a chave, revogando o link antigo
-- ─────────────────────────────────────────────────────────────────────
create or replace function girar_chave_relatorio(p_operacao uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nova text;
begin
  if not pode_editar_operacao(p_operacao) then
    raise exception 'Você não edita esta operação.' using errcode = '42501';
  end if;

  update operacoes
     set relatorio_chave = encode(gen_random_bytes(32), 'hex')
   where id = p_operacao
  returning relatorio_chave into v_nova;

  if v_nova is null then
    raise exception 'Operação não encontrada.' using errcode = 'P0002';
  end if;
  return v_nova;
end;
$$;

revoke all on function girar_chave_relatorio(uuid) from public;
grant execute on function girar_chave_relatorio(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  OS ENDEREÇOS DE AGORA
--
--  Rode para ver o link de cada empresa:
--
--     select org.nome as empresa, o.nome as operacao,
--            '/relatorio/' || o.relatorio_chave as endereco
--       from operacoes o
--       join organizacoes org on org.id = o.organizacao_id
--      order by org.nome, o.nome;
--
--  `RELATORIO_CHAVE` fica obsoleta e pode sair do ambiente depois que os
--  links novos estiverem distribuídos.
-- ═══════════════════════════════════════════════════════════════════════
