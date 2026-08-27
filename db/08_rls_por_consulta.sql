-- ═══════════════════════════════════════════════════════════════════════
--  A CHECAGEM DE PERMISSÃO PASSA A RODAR UMA VEZ POR CONSULTA
--
--  O que estava errado
--  ───────────────────
--  As políticas diziam `using (pode_ver_operacao(operacao_id))`. Como o
--  argumento vem da linha, o Postgres é obrigado a chamar a função PARA
--  CADA LINHA — e cada chamada faz um join entre operacoes, membros e
--  membros_operacoes.
--
--  Em tabela pequena ninguém nota. Em `formula_base_precos`, com 24.648
--  linhas, são 24.648 joins numa consulta só. Pior: com `offset`, o banco
--  avalia a política também nas linhas que vai DESCARTAR — então a página
--  1 passava e a partir da 1000 estourava o tempo limite:
--
--      canceling statement due to statement timeout (código 57014)
--
--  O sintoma engana porque parece problema de volume de dados, e leva a
--  mexer em paginação. Não era: era a permissão sendo recalculada.
--
--  A correção
--  ──────────
--  `operacao_id in (select operacoes_do_usuario())` faz a mesma checagem,
--  mas a subconsulta não depende da linha. O Postgres a executa UMA vez,
--  guarda o resultado e daí em diante só compara uuid — de join por linha
--  para busca em memória.
--
--  Vale para o sistema inteiro, não só para a Fórmula base: toda tela que
--  lê muitas linhas fica mais rápida pelo mesmo motivo.
--
--  Executar depois de 02_rls.sql. É seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  Operações que o usuário pode ESCREVER, como conjunto
--
--  `pode_editar_operacao(op)` recebe a linha e por isso tem o mesmo
--  problema. Esta devolve o conjunto de uma vez, para as políticas de
--  escrita poderem usar `in (select ...)` igual às de leitura.
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
    );
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Recria as quatro políticas de cada tabela com operacao_id
--
--  A lista é a mesma de 02_rls.sql. Se uma tabela nova aparecer lá e não
--  aqui, ela continua funcionando — só continua lenta.
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'canais','contas_canal','produtos','anuncios',
    'vendas_diarias','pedidos','pedido_itens','visitas_mensais','metas',
    'importacoes','importacao_linhas','anuncio_desempenho_semanal',
    'precos_ideais','anuncio_precos_vitrine','anotacoes_anuncio',
    'formula_base_itens','formula_base_precos',
    'campanhas','campanha_itens','processamentos_promocao','historico_promocoes',
    'monitoramentos_preco','concorrentes','precos_coletados',
    'monitoramentos_frete','fretes_coletados',
    'categorias_financeiras','fornecedores','funcionarios','folha_pagamento',
    'lotes_compra','lancamentos_financeiros',
    'integracoes','sincronizacoes','alertas','exportacoes','agendamentos','auditoria'
  ]
  loop
    execute format('drop policy if exists %I_leitura on %I', t, t);
    execute format('drop policy if exists %I_insercao on %I', t, t);
    execute format('drop policy if exists %I_alteracao on %I', t, t);
    execute format('drop policy if exists %I_exclusao on %I', t, t);

    execute format($f$
      create policy %I_leitura on %I
        for select using (operacao_id in (select operacoes_do_usuario()))
    $f$, t, t);

    execute format($f$
      create policy %I_insercao on %I
        for insert with check (operacao_id in (select operacoes_editaveis_do_usuario()))
    $f$, t, t);

    execute format($f$
      create policy %I_alteracao on %I
        for update using (operacao_id in (select operacoes_editaveis_do_usuario()))
                   with check (operacao_id in (select operacoes_editaveis_do_usuario()))
    $f$, t, t);

    execute format($f$
      create policy %I_exclusao on %I
        for delete using (operacao_id in (select operacoes_editaveis_do_usuario()))
    $f$, t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────
--  Índice que faltava
--
--  A Fórmula base é sempre lida por versão vigente. Sem este índice o
--  banco varre as 24.648 linhas para achar as de uma data só.
-- ─────────────────────────────────────────────────────────────────────
create index if not exists formula_base_precos_vigencia
  on formula_base_precos (operacao_id, vigente_de, chave_tipo);

create index if not exists formula_base_itens_vigencia
  on formula_base_itens (operacao_id, vigente_de);
