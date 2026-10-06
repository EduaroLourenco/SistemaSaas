-- ═══════════════════════════════════════════════════════════════════════
--  O ADMIN CRIA A EMPRESA DO CLIENTE
--
--  O que faltava
--  ─────────────
--  `criar_organizacao()` faz de QUEM CHAMA o proprietário, e serve para o
--  lojista que se cadastra sozinho. Não serve para o admin da plataforma
--  abrir a empresa de um cliente: ele viraria dono da loja alheia, contaria
--  no teto de cinco empresas por pessoa, e apareceria na lista de equipe do
--  cliente sem precisar.
--
--  `convidar_membro()` também não resolve sozinho: ela exige que quem
--  convida já seja membro daquela organização, e o admin não é — o acesso
--  dele vem da marca `admin_plataforma`, não de `membros`.
--
--  A correção
--  ──────────
--  Uma função só para esse caminho: cria a empresa, semeia canais e
--  categorias, e deixa um convite de PROPRIETÁRIO para o e-mail do cliente.
--  O admin não entra como membro.
--
--  Por que convite, e não criar o usuário direto
--  ─────────────────────────────────────────────
--  Criar a conta pelo banco exigiria inventar uma senha e transmiti-la. O
--  convite usa o caminho que já existe: o cliente abre o link, define a
--  própria senha, e `aceitar_convite()` confere que o e-mail da sessão é o
--  mesmo do convite — então link encaminhado não vira acesso de outra
--  pessoa.
--
--  Como o link chega
--  ─────────────────
--  A função devolve o token e a tela monta o endereço, igual à tela de
--  Equipe. Não há envio de e-mail: quem convida copia e manda pelo canal
--  que já usa.
--
--  Executar depois de 26_planejamento.sql. Seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function criar_empresa_para(
  p_nome  text,
  p_email citext,
  p_papel papel_membro default 'proprietario'
)
returns table (organizacao_id uuid, operacao_id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base  citext;
  v_slug  citext;
  v_org   uuid;
  v_op    uuid;
  v_token text;
  v_n     int := 1;
begin
  if not eh_admin_plataforma() then
    raise exception 'Só o admin da plataforma cria empresa para outra pessoa.'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'A empresa precisa de um nome.' using errcode = '22023';
  end if;
  if p_email is null or position('@' in p_email::text) = 0 then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;

  v_base := slug_de(p_nome);
  v_slug := v_base;
  while exists (select 1 from organizacoes where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into organizacoes (nome, slug) values (trim(p_nome), v_slug)
  returning id into v_org;

  insert into operacoes (organizacao_id, nome, slug)
  values (v_org, 'Operação principal', 'principal')
  returning id into v_op;

  /* Sem isto a empresa nasce sem canal, e a importação recusa tudo. */
  perform semear_canais(v_op);
  perform semear_categorias_financeiras(v_op);

  /*
   * O convite nasce sem `convidado_por`: a coluna aponta para `usuarios`, e
   * o admin pode não ter linha lá — além de não ser membro desta empresa.
   * Quem criou fica no registro de auditoria, não aqui.
   */
  insert into convites (organizacao_id, email, papel)
  values (v_org, p_email, p_papel)
  returning convites.token into v_token;

  return query select v_org, v_op, v_token;
end;
$$;

revoke all on function criar_empresa_para(text, citext, papel_membro) from public;
grant execute on function criar_empresa_para(text, citext, papel_membro) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
--  A lista de empresas do admin
--
--  `organizacoes` já é legível pelo admin (migração 24), mas a tela
--  precisa de mais: quantas operações, quantos membros, quantos convites
--  abertos, se há canal conectado. Reunir aqui evita a tela fazer cinco
--  consultas e somar na mão.
-- ─────────────────────────────────────────────────────────────────────
create or replace function empresas_da_plataforma()
returns table (
  organizacao_id uuid,
  nome           text,
  slug           text,
  criado_em      timestamptz,
  operacoes      bigint,
  membros        bigint,
  convites       bigint,
  canais         bigint,
  contas         bigint,
  conectadas     bigint
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
    o.criado_em,
    (select count(*) from operacoes op where op.organizacao_id = o.id),
    (select count(*) from membros m where m.organizacao_id = o.id),
    (select count(*) from convites cv where cv.organizacao_id = o.id and cv.aceito_em is null),
    (select count(*) from canais c join operacoes op on op.id = c.operacao_id where op.organizacao_id = o.id),
    (select count(*) from contas_canal cc join operacoes op on op.id = cc.operacao_id where op.organizacao_id = o.id),
    (select count(*) from integracoes i
       join contas_canal cc on cc.id = i.conta_canal_id
       join operacoes op on op.id = cc.operacao_id
      where op.organizacao_id = o.id and i.credencial_ref is not null)
  from organizacoes o
  where eh_admin_plataforma() or o.id in (select organizacoes_do_usuario())
  order by o.criado_em;
$$;

revoke all on function empresas_da_plataforma() from public;
grant execute on function empresas_da_plataforma() to authenticated;
