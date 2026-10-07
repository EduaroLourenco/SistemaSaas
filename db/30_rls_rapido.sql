-- ═══════════════════════════════════════════════════════════════════════
--  30 — RLS rápido nas tabelas que ficaram de fora da 08
-- ═══════════════════════════════════════════════════════════════════════
--
--  O sintoma
--  ─────────
--  A Visão geral levava 18 a 20 segundos em produção, e às vezes caía.
--  Cronometrado consulta a consulta como usuário comum: buscar a data mais
--  recente em `anuncio_desempenho_diario` — 11.628 linhas, nada grande —
--  levava 8,3s, e contar as linhas estourava o tempo do banco.
--
--  A causa
--  ───────
--  A migração 08 reescreveu as políticas das tabelas grandes na forma
--
--      operacao_id in (select operacoes_do_usuario())
--
--  em que o Postgres calcula o conjunto de operações permitidas UMA vez
--  por consulta (initplan). As tabelas criadas depois ficaram com
--
--      pode_ver_operacao(operacao_id)
--
--  que é uma função chamada para CADA linha — e, desde a 23, cada chamada
--  ainda lê e interpreta o cabeçalho HTTP da operação. Em 11 mil linhas,
--  8 segundos.
--
--  A correção
--  ──────────
--  Troca, em toda política que ainda usa a forma por linha:
--
--    pode_ver_operacao(operacao_id)
--      → operacao_id in (select operacoes_do_usuario())
--    pode_editar_operacao(operacao_id)
--      → operacao_id in (select operacoes_editaveis_do_usuario())
--
--  A leitura é idêntica: pode_ver_operacao(op) é, por definição,
--  `op in (select operacoes_do_usuario())`. A escrita passa a seguir a
--  mesma regra das tabelas grandes desde a 08 e a 24 — é um pouco mais
--  rígida para membro restrito a operações específicas (membros_operacoes)
--  e aceita o admin da plataforma quando ele escolheu a empresa no
--  seletor. O sistema inteiro fica com uma regra só.
--
--  Só troca o texto EXATO acima. Política com outro formato (outra
--  coluna, junção) não é tocada e aparece listada em NOTICE no fim, para
--  ser vista à mão.
--
--  Idempotente: rodar de novo não acha mais nada para trocar.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  p record;
  novo_using text;
  novo_check text;
  trocadas int := 0;
  feitas text := '';
  sobrou text := '';
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'pode_(ver|editar)_operacao'
        or coalesce(with_check, '') ~ 'pode_(ver|editar)_operacao')
  loop
    novo_using := replace(replace(p.qual,
      'pode_ver_operacao(operacao_id)', 'operacao_id in (select operacoes_do_usuario())'),
      'pode_editar_operacao(operacao_id)', 'operacao_id in (select operacoes_editaveis_do_usuario())');
    novo_check := replace(replace(p.with_check,
      'pode_ver_operacao(operacao_id)', 'operacao_id in (select operacoes_do_usuario())'),
      'pode_editar_operacao(operacao_id)', 'operacao_id in (select operacoes_editaveis_do_usuario())');

    -- Sobrou chamada por linha depois da troca? Formato diferente: não mexe.
    if coalesce(novo_using, '') ~ 'pode_(ver|editar)_operacao'
       or coalesce(novo_check, '') ~ 'pode_(ver|editar)_operacao' then
      sobrou := sobrou || format(E'\n  %s.%s (%s)', p.tablename, p.policyname, p.cmd);
      continue;
    end if;

    -- ALTER POLICY aceita USING e WITH CHECK conforme o comando da política.
    if p.qual is not null and p.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, novo_using, novo_check);
    elsif p.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)',
        p.policyname, p.schemaname, p.tablename, novo_using);
    else
      execute format('alter policy %I on %I.%I with check (%s)',
        p.policyname, p.schemaname, p.tablename, novo_check);
    end if;
    trocadas := trocadas + 1;
    feitas := feitas || format(E'\n  %s.%s (%s)', p.tablename, p.policyname, p.cmd);
  end loop;

  -- No RAISE, cada % é um valor: o número e depois a lista.
  raise notice 'Políticas reescritas na forma rápida: % %', trocadas, feitas;
  if sobrou <> '' then
    raise notice 'Com formato diferente, NÃO tocadas (ver à mão):%', sobrou;
  end if;
end $$;

-- Conferência: deve voltar zero linhas.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') ~ 'pode_(ver|editar)_operacao'
    or coalesce(with_check, '') ~ 'pode_(ver|editar)_operacao');

-- ═══════════════════════════════════════════════════════════════════════
--  Desfazer (só se algo der errado)
--
--  Volta para a forma por linha todas as políticas na forma rápida que NÃO
--  são das tabelas da 08 (essas sempre foram rápidas e ficam como estão).
--  Descomente e rode.
--
--  do $x$
--  declare p record; u text; c text;
--    da08 text[] := array['canais','contas_canal','produtos','anuncios',
--      'vendas_diarias','pedidos','pedido_itens','visitas_mensais','metas',
--      'importacoes','importacao_linhas','anuncio_desempenho_semanal',
--      'precos_ideais','anuncio_precos_vitrine','anotacoes_anuncio',
--      'formula_base_itens','formula_base_precos',
--      'campanhas','campanha_itens','processamentos_promocao','historico_promocoes',
--      'monitoramentos_preco','concorrentes','precos_coletados',
--      'monitoramentos_frete','fretes_coletados',
--      'categorias_financeiras','fornecedores','funcionarios','folha_pagamento',
--      'lotes_compra','lancamentos_financeiros',
--      'integracoes','sincronizacoes','alertas','exportacoes','agendamentos','auditoria'];
--  begin
--    for p in select schemaname, tablename, policyname, qual, with_check from pg_policies
--             where schemaname = 'public' and not (tablename = any(da08))
--               and (coalesce(qual,'') ~ 'operacoes_(do_usuario|editaveis_do_usuario)'
--                 or coalesce(with_check,'') ~ 'operacoes_(do_usuario|editaveis_do_usuario)')
--    loop
--      u := regexp_replace(regexp_replace(p.qual,
--             '(?operacao_id IN ( SELECT operacoes_editaveis_do_usuario()[^)]*))?', 'pode_editar_operacao(operacao_id)', 'gi'),
--             '(?operacao_id IN ( SELECT operacoes_do_usuario()[^)]*))?', 'pode_ver_operacao(operacao_id)', 'gi');
--      c := regexp_replace(regexp_replace(p.with_check,
--             '(?operacao_id IN ( SELECT operacoes_editaveis_do_usuario()[^)]*))?', 'pode_editar_operacao(operacao_id)', 'gi'),
--             '(?operacao_id IN ( SELECT operacoes_do_usuario()[^)]*))?', 'pode_ver_operacao(operacao_id)', 'gi');
--      if p.qual is not null and p.with_check is not null then
--        execute format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, u, c);
--      elsif p.qual is not null then
--        execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, u);
--      else
--        execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, c);
--      end if;
--    end loop;
--  end $x$;
-- ═══════════════════════════════════════════════════════════════════════
