-- ═══════════════════════════════════════════════════════════════════════
--  A EMPRESA NOVA NASCE USÁVEL
--
--  O que estava errado
--  ───────────────────
--  `criar_organizacao()` cria organização, operação e o dono. Nada mais.
--  O lojista entra e encontra um sistema em que as telas principais não
--  funcionam ainda — e, pior, falham de um jeito que não explica a causa:
--
--    · Sem canal cadastrado, a importação BLOQUEIA. O importador não
--      adivinha canal de propósito (`src/lib/dados/importar.ts`): o que
--      não casa com um apelido cadastrado para a recusa inteira. Quem
--      digitar "Mercado Livre" em vez de `mercado_livre` trava e a
--      mensagem fala de apelido, não de canal faltando.
--
--    · Sem categoria financeira, o Financeiro abre sem ter onde
--      classificar lançamento nenhum.
--
--  A operação da Probel só funciona porque `04_seed.sql` encheu essas duas
--  coisas na mão, uma vez, com o id dela escrito no arquivo. Empresa nova
--  não passa por ali.
--
--  A correção
--  ──────────
--  O mesmo conteúdo do seed vira função, e `criar_organizacao()` passa a
--  chamá-la. Quem já existe não muda — a função é idempotente e o seed
--  original continua válido.
--
--  Sobre os apelidos
--  ─────────────────
--  Vão só os que foram VISTOS em arquivo real, a mesma regra de
--  `07_apelidos_canal.sql`. Apelido presumido é adivinhação com cerimônia
--  por cima, e adivinhar canal é exatamente o que o importador se recusa a
--  fazer.
--
--  Executar depois de 24_admin_plataforma.sql. É seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  Os canais que quase toda loja usa
--
--  Shopee entra na lista mesmo sem integração por API: cadastrada, ela
--  aceita planilha; ausente, a importação da Shopee é recusada por canal
--  desconhecido. O custo de ter a linha é zero e o de não ter é um
--  bloqueio sem explicação.
-- ─────────────────────────────────────────────────────────────────────
create or replace function semear_canais(p_operacao uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into canais (operacao_id, codigo, nome, tipo, cor_serie, ordem, apelidos) values
    (p_operacao, 'mercado_livre', 'Mercado Livre',       'marketplace',  1, 1, array['mercado livre','mercadolivre','meli','ml']),
    (p_operacao, 'shopee',        'Shopee',              'marketplace',  2, 2, array['shopee']),
    (p_operacao, 'amazon',        'Amazon',              'marketplace',  3, 3, array['amazon']),
    (p_operacao, 'magalu',        'Magalu',              'marketplace',  4, 4, array['magalu','magazine luiza']),
    (p_operacao, 'casas_bahia',   'Casas Bahia',         'marketplace',  5, 5, array['casas bahia marketplace','casas bahia','via varejo']),
    (p_operacao, 'madeira',       'Madeira Madeira',     'marketplace',  6, 6, array['madeira madeira','madeiramadeira']),
    (p_operacao, 'vtex',          'Loja própria (VTEX)', 'loja_propria', 7, 7, array['vtex','loja propria','vtrina']),
    (p_operacao, 'outros',        'Outros',              'outro',        9, 8, array[]::text[])
  on conflict (operacao_id, codigo) do nothing;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  As categorias financeiras de partida
--
--  São as mesmas quinze do seed, com os mesmos valores de `cor_serie` —
--  que vai de 1 a 10 e se repete de propósito: são as faixas --s1..--s10
--  do design system, e categoria de grupos diferentes pode compartilhar
--  cor sem confundir no gráfico.
--
--  O lojista renomeia e acrescenta o que for dele; o que não pode é abrir
--  a tela sem nenhuma.
-- ─────────────────────────────────────────────────────────────────────
create or replace function semear_categorias_financeiras(p_operacao uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into categorias_financeiras (operacao_id, nome, tipo, grupo, cor_serie) values
    (p_operacao, 'Venda de mercadoria',     'entrada', 'Operacional',     1),
    (p_operacao, 'Repasse de marketplace',  'entrada', 'Operacional',     2),
    (p_operacao, 'Outras receitas',         'entrada', 'Não operacional', 9),
    (p_operacao, 'Compra de mercadoria',    'saida',   'Mercadoria',      1),
    (p_operacao, 'Frete de venda',          'saida',   'Mercadoria',      2),
    (p_operacao, 'Frete de compra',         'saida',   'Mercadoria',      3),
    (p_operacao, 'Comissão de marketplace', 'saida',   'Canais',          4),
    (p_operacao, 'Investimento em mídia',   'saida',   'Canais',          5),
    (p_operacao, 'Embalagem',               'saida',   'Mercadoria',      6),
    (p_operacao, 'Folha de pagamento',      'saida',   'Pessoal',         7),
    (p_operacao, 'Encargos e benefícios',   'saida',   'Pessoal',         8),
    (p_operacao, 'Impostos',                'saida',   'Tributário',      9),
    (p_operacao, 'Aluguel e estrutura',     'saida',   'Estrutura',      10),
    (p_operacao, 'Serviços de terceiros',   'saida',   'Estrutura',       4),
    (p_operacao, 'Tarifas bancárias',       'saida',   'Financeiro',      9)
  on conflict (operacao_id, nome) do nothing;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Criar a empresa, agora com o de partida junto
--
--  O corpo é o da migração 20, com duas chamadas no fim. Mantê-lo inteiro
--  aqui, em vez de só "acrescentar", é o que torna este arquivo a
--  definição corrente — `create or replace` substitui tudo, e uma versão
--  parcial apagaria o teto de cinco empresas sem ninguém notar.
-- ─────────────────────────────────────────────────────────────────────
create or replace function criar_organizacao(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_base    citext;
  v_slug    citext;
  v_org     uuid;
  v_op      uuid;
  v_n       int := 1;
begin
  if v_usuario is null then
    raise exception 'Entre no sistema antes de criar a empresa.' using errcode = '28000';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'A empresa precisa de um nome.' using errcode = '22023';
  end if;

  /*
   * Teto de empresas por pessoa.
   *
   * O cadastro é aberto: qualquer um com e-mail confirmado chega aqui. Sem
   * teto, um script cria dez mil organizações numa tarde, e cada uma nasce
   * com operação, canais e lugar no agendador. Cinco cobre o caso real de
   * quem administra o próprio grupo de empresas.
   */
  if (select count(*) from membros
       where usuario_id = v_usuario and papel = 'proprietario') >= 5 then
    raise exception 'Você já é proprietário de cinco empresas. Fale com o suporte.'
      using errcode = '54000';
  end if;

  -- O espelho normalmente já existe (gatilho em auth.users); garante aqui
  -- porque a chave estrangeira de `membros` depende dele.
  insert into usuarios (id, email)
  select v_usuario, u.email from auth.users u where u.id = v_usuario
  on conflict (id) do nothing;

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

  insert into membros (organizacao_id, usuario_id, papel)
  values (v_org, v_usuario, 'proprietario');

  -- Sem linha em `membros_operacoes`: o dono enxerga todas as operações,
  -- inclusive as que ele criar depois.

  -- O de partida. Sem isto a empresa nasce e não dá para importar nada.
  perform semear_canais(v_op);
  perform semear_categorias_financeiras(v_op);

  return v_org;
end;
$$;

revoke all on function semear_canais(uuid) from public;
revoke all on function semear_categorias_financeiras(uuid) from public;
revoke all on function criar_organizacao(text) from public;
grant execute on function criar_organizacao(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  PARA AS OPERAÇÕES QUE JÁ EXISTEM
--
--  As funções são idempotentes, então dá para completar uma operação
--  antiga sem risco de duplicar. Troque o id e rode:
--
--     select semear_canais('00000000-0000-0000-0000-000000000103');
--     select semear_categorias_financeiras('00000000-0000-0000-0000-000000000103');
--
--  Para ver quais operações estão sem canal:
--
--     select o.id, o.nome, count(c.id) as canais
--       from operacoes o
--       left join canais c on c.operacao_id = o.id
--      group by o.id, o.nome
--      having count(c.id) = 0;
-- ═══════════════════════════════════════════════════════════════════════
