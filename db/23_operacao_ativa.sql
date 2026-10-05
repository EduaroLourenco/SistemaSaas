-- ═══════════════════════════════════════════════════════════════════════
--  UMA EMPRESA POR VEZ NA TELA
--
--  O que estava errado
--  ───────────────────
--  `operacoes_do_usuario()` e `pode_ver_operacao()` devolvem TODAS as
--  operações de quem está logado, e é sobre elas que as políticas de
--  leitura das tabelas de dados são escritas. Com uma empresa só isso é
--  exatamente o que se quer.
--
--  Com três, não: trinta módulos de leitura fazem cento e vinte e três
--  consultas sem filtrar por operação, porque confiam no RLS. No dia que
--  alguém for membro de duas empresas, `/vendas`, os alertas, o painel e
--  as análises passam a SOMAR as duas na mesma tela — sem erro, sem aviso,
--  com número plausível. É o pior tipo de defeito: não quebra, mente.
--
--  Filtrar nos cento e vinte e três lugares resolveria, mas deixa o
--  próximo módulo livre para esquecer de novo.
--
--  A correção
--  ──────────
--  A escolha da operação chega num cabeçalho HTTP e estreita os dois
--  conjuntos. Nenhuma política muda, nenhum módulo muda, e módulo novo já
--  nasce certo.
--
--  As duas funções precisam ser estreitadas porque as políticas se
--  dividem entre elas: a migração 08 reescreveu as tabelas grandes como
--  `operacao_id in (select operacoes_do_usuario())`, mas o que veio depois
--  — `anuncio_desempenho_diario`, `anuncio_ads`, `metas_diarias`,
--  `comissoes_canal`, `faixas_frete`, `exclusoes_analise`, `anotacoes`, o
--  financeiro, as promoções e o catálogo — ficou em
--  `pode_ver_operacao(operacao_id)`. Estreitar só uma deixaria metade do
--  sistema somando empresas.
--
--  Por que o cabeçalho pode ser confiado
--  ─────────────────────────────────────
--  Ele não é autoridade: a checagem de membro continua inteira, e o
--  cabeçalho só INTERSECTA o que já era permitido. Cabeçalho forjado com a
--  operação de outra empresa resulta em conjunto vazio — restringe, nunca
--  amplia. Cabeçalho ausente ou inválido não estreita nada, que é o
--  comportamento de hoje.
--
--  E o seletor de empresa?
--  ───────────────────────
--  Não precisa de exceção no banco. Ele lista as operações por um cliente
--  que NÃO manda o cabeçalho (`clienteServidor({ todasOperacoes: true })`),
--  e sem cabeçalho nada é estreitado. A regra fica num lugar só.
--
--  Executar depois de 08_rls_por_consulta.sql. É seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  A operação escolhida, lida do cabeçalho da requisição
--
--  `request.headers` existe nas requisições que entram pelo PostgREST.
--  Fora delas — psql, cron com chave de serviço, gatilho — não existe, e
--  o `true` em `current_setting` devolve nulo em vez de erro. Nulo aqui
--  quer dizer "não estreita", que é o comportamento seguro.
--
--  Os dois `exception` não são exagero: o primeiro cobre cabeçalho que não
--  seja JSON válido, o segundo cobre valor que não seja uuid. Sem eles, um
--  cabeçalho com lixo derrubaria TODA consulta do sistema com erro de
--  conversão, e o sintoma não apontaria para cá.
-- ─────────────────────────────────────────────────────────────────────
create or replace function operacao_ativa()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bruto text;
begin
  begin
    v_bruto := nullif(
      trim(current_setting('request.headers', true)::json ->> 'x-operacao'),
      ''
    );
  exception when others then
    return null;
  end;

  if v_bruto is null then return null; end if;

  begin
    return v_bruto::uuid;
  exception when others then
    return null;
  end;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  O conjunto CRU: tudo de que o usuário é membro
--
--  É a definição que `operacoes_do_usuario()` tinha até aqui, movida para
--  um nome próprio. Fica aqui para quem precisar da lista inteira dentro
--  do banco; no aplicativo, quem precisa dela é o seletor, e ele chega sem
--  cabeçalho.
-- ─────────────────────────────────────────────────────────────────────
create or replace function operacoes_visiveis_do_usuario()
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
    and (
      not exists (select 1 from membros_operacoes mo where mo.membro_id = m.id)
      or exists (
        select 1 from membros_operacoes mo
        where mo.membro_id = m.id and mo.operacao_id = o.id
      )
    );
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Leitura: membro E operação escolhida
--
--  O `operacao_ativa()` sai da subconsulta uma vez — ele é `stable` e não
--  depende da linha. É o mesmo cuidado que a migração 08 tomou: função
--  reavaliada por linha era o que estourava o tempo limite em
--  `formula_base_precos`.
-- ─────────────────────────────────────────────────────────────────────
create or replace function operacoes_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from operacoes_visiveis_do_usuario() as t(id)
  where operacao_ativa() is null or t.id = operacao_ativa();
$$;

-- ─────────────────────────────────────────────────────────────────────
--  O predicado por linha, para as políticas que ficaram nele
-- ─────────────────────────────────────────────────────────────────────
create or replace function pode_ver_operacao(op uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select op in (select operacoes_do_usuario());
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Escrita: mesma regra, mais o papel
--
--  Estreitar a escrita é o que impede o caso que motivou tudo isto: subir
--  a planilha do lojista novo e os pedidos caírem dentro da operação da
--  outra empresa. Com o cabeçalho na operação A, uma inserção com
--  `operacao_id` da B é recusada pelo banco em vez de gravada em silêncio.
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
    and (operacao_ativa() is null or o.id = operacao_ativa());
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Idem para a edição por linha, onde alguma política ainda a use
--
--  O corpo original é preservado: `papel_na_operacao(op) in (...)`. Trocá-lo
--  por `op in (select operacoes_editaveis_do_usuario())` pareceria
--  equivalente e não é garantido que seja — as duas resolvem o papel por
--  caminhos diferentes, e qualquer divergência apareceria como permissão
--  negada em tela, longe daqui. Só o estreitamento é somado.
-- ─────────────────────────────────────────────────────────────────────
create or replace function pode_editar_operacao(op uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select papel_na_operacao(op) in ('proprietario', 'administrador', 'editor')
     and (operacao_ativa() is null or op = operacao_ativa());
$$;

revoke all on function operacao_ativa() from public;
revoke all on function operacoes_visiveis_do_usuario() from public;
grant execute on function operacao_ativa() to authenticated;
grant execute on function operacoes_visiveis_do_usuario() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  SE ALGO QUEBRAR: O DESFAZER
--
--  Um erro aqui não aparece como erro — aparece como tela vazia, porque o
--  RLS simplesmente não devolve linha. Se depois de rodar isto as telas
--  ficarem em branco, cole o bloco abaixo e tudo volta ao estado anterior.
--  Ele é a definição original das três funções, sem estreitamento nenhum.
--
--     create or replace function operacoes_do_usuario()
--     returns setof uuid language sql stable security definer
--     set search_path = public as $x$
--       select o.id
--       from operacoes o
--       join membros m on m.organizacao_id = o.organizacao_id
--       where m.usuario_id = auth.uid()
--         and (
--           not exists (select 1 from membros_operacoes mo where mo.membro_id = m.id)
--           or exists (
--             select 1 from membros_operacoes mo
--             where mo.membro_id = m.id and mo.operacao_id = o.id
--           )
--         );
--     $x$;
--
--     create or replace function pode_ver_operacao(op uuid)
--     returns boolean language sql stable security definer
--     set search_path = public as $x$
--       select op in (select operacoes_do_usuario());
--     $x$;
--
--     create or replace function pode_editar_operacao(op uuid)
--     returns boolean language sql stable security definer
--     set search_path = public as $x$
--       select papel_na_operacao(op) in ('proprietario', 'administrador', 'editor');
--     $x$;
--
--     create or replace function operacoes_editaveis_do_usuario()
--     returns setof uuid language sql stable security definer
--     set search_path = public as $x$
--       select o.id
--       from operacoes o
--       join membros m on m.organizacao_id = o.organizacao_id
--       where m.usuario_id = auth.uid()
--         and m.papel in ('proprietario', 'administrador', 'editor')
--         and (
--           not exists (select 1 from membros_operacoes mo where mo.membro_id = m.id)
--           or exists (
--             select 1 from membros_operacoes mo
--             where mo.membro_id = m.id and mo.operacao_id = o.id
--           )
--         );
--     $x$;
--
--  O desfazer no banco basta: sem o estreitamento nas funções, o cabeçalho
--  que o aplicativo manda passa a não ter efeito nenhum.
-- ═══════════════════════════════════════════════════════════════════════
