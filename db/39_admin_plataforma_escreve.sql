-- ═══════════════════════════════════════════════════════════════════════
--  39. O admin da plataforma ESCREVE na empresa em que entrou
--
--  O sintoma
--  ─────────
--  "Seu acesso não permite editar custos." na Bom de Compras, com um
--  usuário marcado como `admin_plataforma`. E não era só custos: as
--  políticas de INSERT, UPDATE e DELETE de TODA tabela com `operacao_id`
--  usam `pode_editar_operacao` (ver o laço em `02_rls.sql`), então o admin
--  não escrevia nada em empresa de cliente — nem produto, nem cadastro,
--  nem promoção.
--
--  A causa
--  ───────
--  A migração 24 deu o acesso de suporte ao admin, mas em dois lugares e
--  meio. Ficou assim:
--
--    pode_ver_operacao(op)              → operacoes_do_usuario()
--                                          TEM o ramo do admin  ✓
--    operacoes_editaveis_do_usuario()    TEM o ramo do admin  ✓
--    pode_editar_operacao(op)           → papel_na_operacao(op)
--                                          NÃO tem             ✗
--
--  `papel_na_operacao` lê `membros`. O admin da plataforma não é membro da
--  organização do cliente — é essa a ideia —, então o papel volta nulo e a
--  escrita é negada. Como a leitura passava pelo outro caminho, o sintoma
--  ficou confuso: a empresa abre, os dados aparecem, e só o botão de
--  salvar recusa.
--
--  A migração 34 já tropeçou nisto e remendou só um canto, criando
--  `pode_editar_operacao_storage` para o upload de arquivo funcionar. O
--  conserto agora é na origem, e o remendo continua necessário por outro
--  motivo — explicado no fim.
--
--  A correção
--  ──────────
--  O mesmo ramo que `operacoes_editaveis_do_usuario()` já usa, com a mesma
--  guarda: o admin escreve SÓ na empresa que escolheu explicitamente no
--  seletor. Sem `operacao_ativa()` preenchido não há escrita nenhuma, o
--  que impede uma consulta sem recorte de alcançar duas empresas.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function pode_editar_operacao(op uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
           papel_na_operacao(op) in ('proprietario', 'administrador', 'editor')
           or (eh_admin_plataforma() and operacao_ativa() is not null and op = operacao_ativa())
         )
     and (operacao_ativa() is null or op = operacao_ativa());
$$;

comment on function pode_editar_operacao(uuid) is
  'Escrita na operação: membro com papel de editor em diante, OU o admin '
  'da plataforma na empresa que ele escolheu no seletor. O admin nunca '
  'escreve sem operacao_ativa() preenchido, para uma consulta sem recorte '
  'não alcançar duas empresas. Ver db/39.';

-- ─────────────────────────────────────────────────────────────────────
--  Por que `pode_editar_operacao_storage` (migração 34) continua
--
--  Dentro das políticas do Storage, `operacao_ativa()` é SEMPRE nulo: ela
--  lê `current_setting('request.headers')`, uma variável que o PostgREST
--  preenche e o Storage — que é outro serviço — não. Então o ramo do admin
--  acima nunca seria verdadeiro lá, e o `or eh_admin_plataforma()` da 34
--  segue sendo o que faz o upload funcionar. Mantida de propósito.
-- ─────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════
--  CONFERIR
--
--  Como o admin, com a Bom de Compras escolhida no seletor, o botão de
--  salvar custo passa a funcionar. Pelo SQL, trocando o id:
--
--    select pode_ver_operacao('01b057f3-4541-4423-ada4-288cfbbc6dd7');     -- já era true
--    select pode_editar_operacao('01b057f3-4541-4423-ada4-288cfbbc6dd7');  -- era false
--
--  No editor do Supabase as duas voltam conforme o usuário da sessão e sem
--  cabeçalho de operação, então o teste que vale é pela tela.
--
--  Quem é admin hoje:
--
--    select email, admin_plataforma from usuarios where admin_plataforma;
--
--  SE ALGO QUEBRAR: O DESFAZER
--
--    create or replace function pode_editar_operacao(op uuid)
--    returns boolean language sql stable security definer
--    set search_path = public as $x$
--      select papel_na_operacao(op) in ('proprietario', 'administrador', 'editor')
--         and (operacao_ativa() is null or op = operacao_ativa());
--    $x$;
--
--  Volta ao que estava em `23_operacao_ativa.sql`, e o admin perde a
--  escrita em empresa de cliente.
-- ═══════════════════════════════════════════════════════════════════════
