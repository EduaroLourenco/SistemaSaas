-- ═══════════════════════════════════════════════════════════════════════
--  34. O admin da plataforma consegue escrever no Storage da empresa
--      em que entrou
--
--  ── O sintoma ──
--
--  Processar planilha de promoção da Bom de Compras terminava em
--  "Não consegui guardar o pacote processado: new row violates row-level
--  security policy". A mesma coisa aconteceria ao subir planilha em
--  Importar. Na Probel funcionava.
--
--  ── A causa ──
--
--  `operacao_ativa()` (migração 23) lê a operação escolhida de
--  `current_setting('request.headers')`. Esse GUC é posto pelo PostgREST a
--  cada requisição — e o Storage NÃO é PostgREST. É outro serviço, com a
--  sua própria conexão: ele define as claims do JWT (por isso `auth.uid()`
--  funciona lá) e não repassa cabeçalho HTTP nenhum.
--
--  Então, dentro de uma política do Storage, `operacao_ativa()` é SEMPRE
--  nulo. E aí as duas metades de `operacoes_editaveis_do_usuario()`
--  (migração 24) se comportam de forma oposta:
--
--    · membro da organização — a condição é
--      `(operacao_ativa() is null or o.id = operacao_ativa())`, que com
--      nulo passa. Escreve normalmente. É por isso que a Probel, onde o
--      usuário é proprietário, nunca deu erro.
--
--    · admin da plataforma em empresa de cliente — a condição é
--      `operacao_ativa() is not null and o.id = operacao_ativa()`, que com
--      nulo é falsa. Nunca escreve, em nenhuma empresa.
--
--  Não é defeito da migração 24: o estreitamento por operação ativa existe
--  justamente para o admin não mexer em duas empresas sem querer. O que
--  não dá é exigi-lo onde ele é impossível de ler.
--
--  ── A decisão ──
--
--  No Storage, o admin da plataforma pode escrever na pasta de qualquer
--  operação. É mais largo do que nas tabelas, e de propósito: ali não há
--  como saber em qual empresa ele entrou, e a alternativa seria o suporte
--  não conseguir processar nem importar arquivo de cliente nenhum.
--
--  O que isso NÃO afrouxa:
--    · a pasta continua sendo o uuid da operação, então cada arquivo
--      segue preso a uma empresa só — nada de pasta comum;
--    · quem não é admin nem membro continua de fora, igual;
--    · a leitura não muda: `pode_ver_operacao` já tolera nulo pela mesma
--      razão, e a migração 24 dá ao admin a visão de todas as operações.
--
--  Alternativa, se um dia esta largura incomodar: pôr o admin como
--  `membros` da organização do cliente. Resolve pela primeira metade da
--  função, sem política especial — ao custo de ele aparecer na Equipe da
--  empresa do cliente e de precisar de uma linha por cliente novo.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  A permissão de escrita no Storage, com o caso do admin somado
--
--  Função separada, e não um `or` solto dentro de cada política: são
--  quatro políticas, e a regra precisa ser a mesma nas quatro. Com o `or`
--  repetido, consertar uma e esquecer as outras passaria em silêncio.
-- ─────────────────────────────────────────────────────────────────────
create or replace function pode_editar_operacao_storage(op uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select op is not null
     and (pode_editar_operacao(op) or eh_admin_plataforma());
$$;

comment on function pode_editar_operacao_storage(uuid) is
  'Escrita no Storage. Igual a pode_editar_operacao, mais o admin da '
  'plataforma em qualquer operação: no Storage não existe o cabeçalho '
  'x-operacao, então operacao_ativa() é sempre nulo e a metade de '
  'operacoes_editaveis_do_usuario() que atende o admin nunca é verdadeira. '
  'Ver db/34.';

revoke all on function pode_editar_operacao_storage(uuid) from public;
grant execute on function pode_editar_operacao_storage(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
--  As três políticas de escrita passam a usá-la
--
--  `drop` antes de `create`: política não tem `create or replace`, e
--  rodar este arquivo duas vezes tem de ser inofensivo.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists arquivos_envio on storage.objects;
create policy arquivos_envio on storage.objects
  for insert
  with check (
    bucket_id in ('importacoes', 'exportacoes', 'anexos')
    and pode_editar_operacao_storage(operacao_do_caminho(name))
  );

drop policy if exists arquivos_alteracao on storage.objects;
create policy arquivos_alteracao on storage.objects
  for update
  using (
    bucket_id in ('importacoes', 'exportacoes', 'anexos')
    and pode_editar_operacao_storage(operacao_do_caminho(name))
  );

drop policy if exists arquivos_exclusao on storage.objects;
create policy arquivos_exclusao on storage.objects
  for delete
  using (
    bucket_id in ('importacoes', 'exportacoes', 'anexos')
    and pode_editar_operacao_storage(operacao_do_caminho(name))
  );

-- A leitura fica como está: `pode_ver_operacao` já tolera o nulo, e a
-- migração 24 põe toda operação na visão do admin.

-- ═══════════════════════════════════════════════════════════════════════
--  CONFERIR
--
--    select pode_editar_operacao_storage('01b057f3-4541-4423-ada4-288cfbbc6dd7');
--
--  Logado como o admin, tem de voltar `true`. Depois, processe uma
--  planilha de promoção com a Bom de Compras escolhida: o pacote precisa
--  baixar, não dar erro de política.
--
--  SE ALGO QUEBRAR: O DESFAZER
--
--  Voltar as três políticas para `pode_editar_operacao` (como estão em
--  db/05_storage.sql) e remover a função:
--
--    drop policy if exists arquivos_envio on storage.objects;
--    create policy arquivos_envio on storage.objects
--      for insert with check (
--        bucket_id in ('importacoes','exportacoes','anexos')
--        and pode_editar_operacao(operacao_do_caminho(name)));
--    -- idem arquivos_alteracao (update) e arquivos_exclusao (delete)
--    drop function if exists pode_editar_operacao_storage(uuid);
-- ═══════════════════════════════════════════════════════════════════════
