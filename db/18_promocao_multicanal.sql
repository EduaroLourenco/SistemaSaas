-- ─────────────────────────────────────────────────────────────────────
--  Promoção em qualquer canal, sem mexer em código
--
--  A lógica de promoção nasceu para o Mercado Livre e trouxe o Meli
--  dentro dela: as alíquotas de 11,5% e 16,5% escritas no código, o piso
--  de 5% que é regra do Meli, e o leitor de planilha reconhecendo
--  "item_id" e "o que você quer fazer com este anúncio?".
--
--  Nada disso é lógica de promoção. É configuração do Meli.
--
--  A MATRIZ DE PREÇO continua a mesma para todos os canais: mercadoria,
--  embalagem e imposto não mudam porque a venda saiu na Shopee. O que
--  muda é em que faixa de comissão o canal cai, e como a planilha dele
--  chama as colunas. As duas coisas viram cadastro aqui.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ── Parâmetros de promoção por canal ─────────────────────────────────
create table if not exists canais_promocao (
  id            uuid primary key default gen_random_uuid(),
  operacao_id   uuid not null references operacoes(id) on delete cascade,
  canal_id      uuid not null references canais(id)    on delete cascade,

  /*
   * Desconto mínimo que o canal aceita numa oferta.
   *
   * O Meli recusa abaixo de 5%, e é por isso que o preço de tabela
   * sozinho nunca é ofertável — o piso real é a tabela menos esses 5%.
   * Outro canal pode aceitar 0, e aí a tabela vale como está.
   */
  desconto_minimo numeric(6,4) not null default 0.05
    check (desconto_minimo >= 0 and desconto_minimo < 1),

  /*
   * Menor faixa de comissão negociável.
   *
   * Serve de piso ao derivar a comissão a partir de uma redução de
   * tarifa: abaixo disso a conta devolveria uma faixa que não existe na
   * matriz de preço.
   */
  comissao_minima numeric(6,4) not null default 0.045
    check (comissao_minima > 0 and comissao_minima < 1),

  /*
   * O canal cobra diferente por tipo de anúncio?
   *
   * O Meli sim — clássico e premium separam cinco pontos. A maioria não,
   * e para essas a alíquota de `comissoes_canal` com tipo nulo basta.
   */
  usa_tipo_anuncio boolean not null default false,

  -- O que a planilha do canal espera na coluna de decisão.
  rotulo_participar     text not null default 'Participar',
  rotulo_nao_participar text not null default 'Não participar',

  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (operacao_id, canal_id)
);

comment on table canais_promocao is
  'O que muda de canal para canal na lógica de promoção. A matriz de preço não muda.';

-- ── Como ler a planilha de cada canal ────────────────────────────────
--
-- O leitor procurava rótulos fixos. Aqui os rótulos viram dado: ensinar
-- um canal novo passa a ser cadastrar os nomes das colunas dele, e não
-- editar `processar.ts` e fazer deploy.
create table if not exists mapeamentos_planilha (
  id          uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references operacoes(id) on delete cascade,
  canal_id    uuid not null references canais(id)    on delete cascade,

  /*
   * O papel da coluna, não o nome dela. São os seis que o motor precisa:
   *
   *   sku            identificação do produto
   *   anuncio        código do anúncio no canal
   *   preco_final    o preço que o canal propõe
   *   acao           onde escrever participar / não participar
   *   reducao        a tarifa reduzida que o canal oferece (opcional)
   *   preco_original o preço publicado hoje (opcional)
   */
  campo text not null check (campo in
    ('sku','anuncio','preco_final','acao','reducao','preco_original')),

  /*
   * Rótulos aceitos, em ordem de preferência.
   *
   * Lista e não texto único porque o mesmo canal muda o nome entre
   * exportações — o Meli manda "Preço final" e "Precio final" na mesma
   * conta, dependendo do dia.
   */
  rotulos text[] not null check (array_length(rotulos, 1) > 0),

  /*
   * Casa por conter, e não por igualdade.
   *
   * "o que você quer fazer com este anúncio?" muda de pontuação entre
   * versões; "o que você quer fazer" sobrevive. Onde o rótulo é curto e
   * genérico — "sku" — a igualdade evita casar com "sku do fornecedor".
   */
  por_conter boolean not null default false,
  obrigatorio boolean not null default true,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (operacao_id, canal_id, campo)
);

comment on table mapeamentos_planilha is
  'Nomes das colunas da planilha de promoção de cada canal. Ensinar um canal novo é cadastrar aqui.';

create index if not exists idx_mapeamento_canal
  on mapeamentos_planilha (operacao_id, canal_id);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table canais_promocao       enable row level security;
alter table mapeamentos_planilha  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['canais_promocao','mapeamentos_planilha'] loop
    execute format('drop policy if exists %I_leitura on %I', t, t);
    execute format(
      'create policy %I_leitura on %I for select using (pode_ver_operacao(operacao_id))', t, t);
    execute format('drop policy if exists %I_escrita on %I', t, t);
    execute format(
      'create policy %I_escrita on %I for all
         using (pode_editar_operacao(operacao_id))
         with check (pode_editar_operacao(operacao_id))', t, t);
  end loop;
end $$;

-- ── O Meli como primeiro cadastro ────────────────────────────────────
--
-- Os mesmos valores que estavam no código. Migrar sem mudar
-- comportamento é o que permite conferir depois que nada quebrou: se o
-- resultado de uma planilha do Meli mudar, o erro é da migração, não da
-- planilha.
insert into canais_promocao
  (operacao_id, canal_id, desconto_minimo, comissao_minima, usa_tipo_anuncio, observacao)
select c.operacao_id, c.id, 0.05, 0.045, true,
       'Migrado do que estava no código do motor.'
  from canais c
 where lower(c.nome) like '%mercado%livre%'
    or lower(c.nome) like '%meli%'
on conflict (operacao_id, canal_id) do nothing;

insert into mapeamentos_planilha (operacao_id, canal_id, campo, rotulos, por_conter, obrigatorio)
select c.operacao_id, c.id, m.campo, m.rotulos, m.por_conter, m.obrigatorio
  from canais c
 cross join (values
    ('sku',            array['sku'],                                                         false, true),
    ('anuncio',        array['item_id','mlb','número do anúncio','código do anúncio'],       true,  true),
    ('preco_final',    array['final_price','preço final','precio final'],                    true,  true),
    ('acao',           array['action','o que você quer fazer com este anúncio?','ação'],     true,  true),
    ('reducao',        array['sale_fee','redução de tarifa','rebate','descuento de tarifa'], true,  false),
    ('preco_original', array['original_price','preço original','precio original'],           true,  false)
 ) as m(campo, rotulos, por_conter, obrigatorio)
 where lower(c.nome) like '%mercado%livre%'
    or lower(c.nome) like '%meli%'
on conflict (operacao_id, canal_id, campo) do nothing;

commit;
