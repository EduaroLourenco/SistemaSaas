-- ═══════════════════════════════════════════════════════════════════════
--  PLATAFORMA — ESQUEMA BASE
--  PostgreSQL 15+ / Supabase
--
--  Convenções:
--    · nomes em snake_case, português, tabela no plural
--    · chave primária sempre `id uuid`
--    · dinheiro  = numeric(14,2)   · percentual = numeric(7,4)
--    · data/hora = timestamptz     · data pura  = date
--    · toda tabela de negócio carrega `operacao_id` (isolamento multi-tenant)
--    · `criado_em` / `atualizado_em` em toda tabela mutável
--
--  Ordem de execução: 01_schema → 02_rls → 03_views → 04_seed
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- e-mail sem diferenciar maiúsculas

-- ─────────────────────────────────────────────────────────────────────
--  0. INFRAESTRUTURA COMUM
-- ─────────────────────────────────────────────────────────────────────

create or replace function set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  1. TIPOS
-- ─────────────────────────────────────────────────────────────────────

create type papel_membro       as enum ('proprietario', 'administrador', 'editor', 'leitor');
create type tipo_canal         as enum ('marketplace', 'loja_propria', 'b2b', 'outro');
create type tipo_anuncio       as enum ('classico', 'premium', 'outro');
create type status_anuncio     as enum ('ativo', 'pausado', 'finalizado', 'sob_revisao');
create type origem_dado        as enum ('manual', 'planilha', 'api');
create type decisao_promocao   as enum ('pendente', 'participar', 'nao_participar');
create type status_item_promo  as enum ('aprovado', 'reprovado');
create type modalidade_frete   as enum ('full', 'coleta', 'agencia', 'flex', 'transportadora');
create type tipo_lancamento    as enum ('entrada', 'saida');
create type status_lancamento  as enum ('previsto', 'em_aberto', 'pago', 'atrasado', 'cancelado');
create type status_lote        as enum ('rascunho', 'confirmado', 'em_transito', 'recebido', 'cancelado');
create type status_integracao  as enum ('desconectada', 'conectada', 'erro', 'expirada');
create type status_execucao    as enum ('na_fila', 'executando', 'concluida', 'falhou');
create type severidade_alerta  as enum ('info', 'atencao', 'critico');
create type tipo_alerta        as enum ('preco', 'campanha', 'meta', 'estoque', 'frete', 'financeiro', 'integracao');
create type tipo_relatorio     as enum ('desempenho_anuncios', 'preco_ideal', 'promocoes', 'catalogo', 'consolidado');

-- ─────────────────────────────────────────────────────────────────────
--  2. NÚCLEO MULTI-TENANT
-- ─────────────────────────────────────────────────────────────────────

-- A empresa/dono do sistema.
create table organizacoes (
  id            uuid primary key default gen_random_uuid(),
  nome          text        not null,
  slug          citext      not null unique,
  documento     text,                                   -- CNPJ, opcional
  fuso_horario  text        not null default 'America/Sao_Paulo',
  moeda         char(3)     not null default 'BRL',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- O que o seletor do topo troca. Uma organização pode ter várias operações
-- (ex.: "Operação principal", "Operação B2B", "Loja própria") e os dados de
-- uma NUNCA se misturam com os da outra.
create table operacoes (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid        not null references organizacoes(id) on delete cascade,
  nome            text        not null,
  slug            citext      not null,
  ativa           boolean     not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (organizacao_id, slug)
);

-- Espelha auth.users do Supabase. Em Postgres puro, vire uma tabela própria.
create table usuarios (
  id            uuid primary key,                        -- = auth.users.id
  nome          text,
  email         citext      not null unique,
  avatar_url    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table membros (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid          not null references organizacoes(id) on delete cascade,
  usuario_id     uuid          not null references usuarios(id)     on delete cascade,
  papel          papel_membro  not null default 'leitor',
  criado_em      timestamptz   not null default now(),
  unique (organizacao_id, usuario_id)
);

-- Acesso opcionalmente restrito a operações específicas.
-- Sem linha aqui = o membro enxerga todas as operações da organização.
create table membros_operacoes (
  membro_id  uuid not null references membros(id)   on delete cascade,
  operacao_id uuid not null references operacoes(id) on delete cascade,
  primary key (membro_id, operacao_id)
);

create table preferencias_usuario (
  usuario_id            uuid primary key references usuarios(id) on delete cascade,
  tema                  text not null default 'sistema'      check (tema in ('claro','escuro','sistema')),
  densidade             text not null default 'compacta'     check (densidade in ('compacta','confortavel')),
  operacao_padrao_id    uuid references operacoes(id) on delete set null,
  inicio_semana         smallint not null default 1 check (inicio_semana between 0 and 6),
  notificacoes          jsonb not null default '{}'::jsonb,
  atualizado_em         timestamptz not null default now()
);

create index on membros (usuario_id);
create index on operacoes (organizacao_id);

-- ─────────────────────────────────────────────────────────────────────
--  3. CATÁLOGO — canais, produtos, anúncios
-- ─────────────────────────────────────────────────────────────────────

create table canais (
  id            uuid primary key default gen_random_uuid(),
  operacao_id   uuid        not null references operacoes(id) on delete cascade,
  codigo        citext      not null,                    -- 'mercado_livre', 'amazon', 'shopee'
  nome          text        not null,                    -- 'Mercado Livre'
  tipo          tipo_canal  not null default 'marketplace',
  cor_serie     smallint    not null default 1 check (cor_serie between 1 and 10),
  ordem         smallint    not null default 0,
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (operacao_id, codigo)
);

-- Um canal pode ter mais de uma conta de vendedor
-- (o caso real "Mercado Livre — Cotia" e "Mercado Livre — 2ª conta").
create table contas_canal (
  id            uuid primary key default gen_random_uuid(),
  operacao_id   uuid        not null references operacoes(id) on delete cascade,
  canal_id      uuid        not null references canais(id)    on delete cascade,
  nome          text        not null,
  identificador text,                                    -- seller_id no canal
  fulfillment   boolean     not null default false,      -- opera no Full?
  -- Reputação da conta no canal ("verde", "amarelo", "vermelho"…).
  -- Fica aqui, não em histórico: muda devagar e o que interessa é a atual.
  reputacao             text,
  reputacao_atualizada_em timestamptz,
  padrao        boolean     not null default false,
  ativa         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (canal_id, nome)
);

-- Só uma conta padrão por canal.
create unique index contas_canal_padrao_unica
  on contas_canal (canal_id) where padrao;

create table produtos (
  id              uuid primary key default gen_random_uuid(),
  operacao_id     uuid        not null references operacoes(id) on delete cascade,
  sku             citext      not null,
  titulo          text        not null,
  marca           text,
  categoria       text,
  curva           char(1) check (curva in ('A','B','C')),
  custo_unitario  numeric(14,2),
  peso_kg         numeric(10,3),
  altura_cm       numeric(10,2),
  largura_cm      numeric(10,2),
  comprimento_cm  numeric(10,2),
  ativo           boolean     not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (operacao_id, sku)
);

create table anuncios (
  id              uuid primary key default gen_random_uuid(),
  operacao_id     uuid          not null references operacoes(id)   on delete cascade,
  canal_id        uuid          not null references canais(id)      on delete restrict,
  conta_canal_id  uuid          not null references contas_canal(id) on delete restrict,
  produto_id      uuid          references produtos(id)             on delete set null,
  codigo_externo  citext        not null,                  -- MLB1284471029, ASIN, etc.
  titulo          text          not null,
  sku_canal       citext,                                  -- SKU como está no canal
  tipo            tipo_anuncio  not null default 'classico',
  status          status_anuncio not null default 'ativo',
  preco_atual     numeric(14,2),
  comissao_atual  numeric(7,4),                            -- 16.5 = 16,5%
  url             text,
  sincronizado_em timestamptz,
  criado_em       timestamptz   not null default now(),
  atualizado_em   timestamptz   not null default now(),
  unique (canal_id, codigo_externo)
);

create index on anuncios (operacao_id, status);
create index on anuncios (produto_id);
create index on anuncios (operacao_id, sku_canal);
create index on produtos  (operacao_id, curva);

-- ─────────────────────────────────────────────────────────────────────
--  4. VENDAS — o grão diário que alimenta todos os indicadores
-- ─────────────────────────────────────────────────────────────────────

-- Uma linha por conta de canal por dia. É a tabela mais consultada do
-- sistema: Visão geral, Canais, Anual, Semanal, Diário e Metas saem daqui.
create table vendas_diarias (
  id                  uuid primary key default gen_random_uuid(),
  operacao_id         uuid        not null references operacoes(id)    on delete cascade,
  canal_id            uuid        not null references canais(id)       on delete cascade,
  conta_canal_id      uuid        not null references contas_canal(id) on delete cascade,
  data                date        not null,

  visitas             integer       not null default 0 check (visitas            >= 0),
  pedidos             integer       not null default 0 check (pedidos            >= 0),
  receita             numeric(14,2) not null default 0 check (receita            >= 0),
  investimento_ads    numeric(14,2) not null default 0 check (investimento_ads   >= 0),
  -- receita e cliques atribuídos à mídia, para fechar ACOS e ROAS
  receita_ads         numeric(14,2) not null default 0 check (receita_ads        >= 0),
  cliques_ads         integer       not null default 0 check (cliques_ads        >= 0),
  pedidos_cancelados  integer       not null default 0 check (pedidos_cancelados >= 0),
  valor_cancelado     numeric(14,2) not null default 0 check (valor_cancelado    >= 0),

  -- derivadas, calculadas pelo banco: nunca ficam fora de sincronia
  receita_liquida numeric(14,2)
    generated always as (receita - valor_cancelado) stored,
  ticket_medio numeric(14,2)
    generated always as (round(receita / nullif(pedidos, 0), 2)) stored,
  -- ACOS: mídia sobre a receita que a própria mídia trouxe
  acos numeric(7,4)
    generated always as (round((investimento_ads * 100) / nullif(receita_ads, 0), 4)) stored,
  -- ROAS: quantos reais de receita cada real de mídia devolveu
  roas numeric(10,4)
    generated always as (round(receita_ads / nullif(investimento_ads, 0), 4)) stored,

  origem        origem_dado not null default 'manual',
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  unique (conta_canal_id, data)
);

create index on vendas_diarias (operacao_id, data);
create index on vendas_diarias (canal_id, data);

-- Visitas costumam vir do canal em grão MENSAL, não diário.
-- Guardar separado evita inventar rateio diário e perder a fidelidade.
-- ── Pedidos ──────────────────────────────────────────────────────────
--
-- O grão fino da venda. `vendas_diarias` é o consolidado por canal e dia;
-- aqui é pedido a pedido, item a item.
--
-- Sem esta tabela não dá para responder "quando vendeu e a quanto" por
-- anúncio, nem decompor uma queda entre preço, volume e mix — o
-- consolidado já perdeu essa informação. É também o que dispensa retrato
-- de preço: cada item carrega o preço pago com a data.
create table pedidos (
  id             uuid primary key default gen_random_uuid(),
  operacao_id    uuid        not null references operacoes(id)    on delete cascade,
  canal_id       uuid        not null references canais(id)       on delete restrict,
  conta_canal_id uuid        not null references contas_canal(id) on delete restrict,

  codigo_externo citext      not null,             -- id do pedido no canal
  data           date        not null,             -- competência, sem hora
  fechado_em     timestamptz,
  status         text        not null,
  cancelado      boolean     not null default false,

  total          numeric(14,2) not null default 0,
  frete          numeric(14,2) not null default 0,
  comissao       numeric(14,2),

  origem         origem_dado not null default 'api',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (canal_id, codigo_externo)
);

create index on pedidos (operacao_id, data);
create index on pedidos (conta_canal_id, data);
create index on pedidos (operacao_id, data) where cancelado;

create table pedido_itens (
  id             uuid primary key default gen_random_uuid(),
  operacao_id    uuid    not null references operacoes(id) on delete cascade,
  pedido_id      uuid    not null references pedidos(id)   on delete cascade,
  -- Pode ser nulo: o anúncio às vezes chega no pedido antes de estar no
  -- cadastro. Guardar o código externo garante que dá para casar depois.
  anuncio_id     uuid    references anuncios(id) on delete set null,
  codigo_externo citext  not null,
  sku            citext,
  titulo         text,

  quantidade     integer       not null check (quantidade > 0),
  /** O preço que o cliente pagou por unidade. É a fonte do "preço pago". */
  preco_unitario numeric(14,2) not null check (preco_unitario >= 0),
  total numeric(14,2)
    generated always as (round(quantidade * preco_unitario, 2)) stored,

  criado_em      timestamptz not null default now()
);

create index on pedido_itens (pedido_id);
create index on pedido_itens (anuncio_id);
create index on pedido_itens (operacao_id, codigo_externo);

create table visitas_mensais (
  id             uuid primary key default gen_random_uuid(),
  operacao_id    uuid     not null references operacoes(id)    on delete cascade,
  conta_canal_id uuid     not null references contas_canal(id) on delete cascade,
  ano            smallint not null check (ano between 2000 and 2100),
  mes            smallint not null check (mes between 1 and 12),
  visitas        integer  not null default 0 check (visitas >= 0),
  origem         origem_dado not null default 'planilha',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (conta_canal_id, ano, mes)
);

create table metas (
  id            uuid          primary key default gen_random_uuid(),
  operacao_id   uuid          not null references operacoes(id) on delete cascade,
  canal_id      uuid          references canais(id) on delete cascade,  -- null = meta da operação inteira
  ano           smallint      not null check (ano between 2000 and 2100),
  mes           smallint      not null check (mes between 1 and 12),
  receita_meta  numeric(14,2) not null default 0 check (receita_meta >= 0),
  pedidos_meta  integer       check (pedidos_meta >= 0),
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now()
);

-- Uma meta por canal/mês, e uma meta geral (canal_id nulo) por mês.
create unique index metas_por_canal_unica
  on metas (operacao_id, canal_id, ano, mes) where canal_id is not null;
create unique index metas_geral_unica
  on metas (operacao_id, ano, mes) where canal_id is null;

-- ─────────────────────────────────────────────────────────────────────
--  5. DESEMPENHO DE ANÚNCIOS E PREÇO IDEAL
-- ─────────────────────────────────────────────────────────────────────

-- Toda planilha que entra no sistema vira uma linha aqui. Dá rastreabilidade:
-- de qual arquivo veio cada número, quem subiu e quando.
create table importacoes (
  id              uuid            primary key default gen_random_uuid(),
  operacao_id     uuid            not null references operacoes(id) on delete cascade,
  tipo            tipo_relatorio  not null,
  nome_arquivo    text            not null,
  hash_arquivo    text,                                    -- sha256, evita subir 2x
  periodo_inicio  date,
  periodo_fim     date,
  data_base       date,                                    -- data de referência dos preços
  linhas_lidas    integer         not null default 0,
  linhas_validas  integer         not null default 0,
  status          status_execucao not null default 'concluida',
  erro            text,
  enviado_por     uuid            references usuarios(id) on delete set null,
  criado_em       timestamptz     not null default now()
);

create index on importacoes (operacao_id, tipo, criado_em desc);
create index on importacoes (operacao_id, hash_arquivo);

-- Linhas cruas da planilha, exatamente como foram lidas, ANTES de casar com
-- o cadastro. Sem isto, um MLB que ainda não existe em `anuncios` some no
-- processamento e ninguém descobre por quê. Guardando aqui dá para
-- reprocessar a importação inteira sem pedir o arquivo de novo.
create table importacao_linhas (
  id             uuid primary key default gen_random_uuid(),
  operacao_id    uuid     not null references operacoes(id)  on delete cascade,
  importacao_id  uuid     not null references importacoes(id) on delete cascade,
  linha          integer  not null,                  -- número da linha na planilha
  dados          jsonb    not null,                  -- a linha inteira, chave = cabeçalho
  codigo_externo citext,                             -- MLB extraído, quando houver
  sku            citext,
  anuncio_id     uuid     references anuncios(id) on delete set null,
  -- null = processada sem problema
  erro           text,
  criado_em      timestamptz not null default now(),
  unique (importacao_id, linha)
);

create index on importacao_linhas (importacao_id) where erro is not null;
create index on importacao_linhas (operacao_id, codigo_externo);

-- Desempenho por anúncio por semana ISO — alimenta a tela Análise de anúncios.
create table anuncio_desempenho_semanal (
  id                  uuid primary key default gen_random_uuid(),
  operacao_id         uuid     not null references operacoes(id) on delete cascade,
  anuncio_id          uuid     not null references anuncios(id)  on delete cascade,
  ano_iso             smallint not null check (ano_iso between 2000 and 2100),
  semana_iso          smallint not null check (semana_iso between 1 and 53),
  inicio              date     not null,
  fim                 date     not null,

  visitas             integer       not null default 0,
  vendas              integer       not null default 0,
  receita             numeric(14,2) not null default 0,
  /**
   * Preço PAGO: média ponderada do que o cliente desembolsou na semana,
   * calculada a partir de `pedido_itens`. Fica nulo em semana sem venda.
   */
  preco_praticado     numeric(14,2),
  /**
   * Preço da VITRINE: o que estava publicado no anúncio naquela semana.
   * Vem do retrato em `anuncio_precos_vitrine` — a API só devolve o preço
   * de agora, sem histórico. É o único preço que existe em semana sem
   * venda, e é ele que explica por que o anúncio parou de vender.
   */
  preco_anunciado     numeric(14,2),
  preco_ideal         numeric(14,2),
  comissao_negociada  numeric(7,4),

  conversao numeric(7,4)
    generated always as (round((vendas::numeric * 100) / nullif(visitas, 0), 4)) stored,
  desvio_preco numeric(7,4)
    generated always as (
      round(((preco_praticado - preco_ideal) * 100) / nullif(preco_ideal, 0), 4)
    ) stored,

  importacao_id uuid references importacoes(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  unique (anuncio_id, ano_iso, semana_iso),
  check (fim >= inicio)
);

create index on anuncio_desempenho_semanal (operacao_id, ano_iso, semana_iso);
create index on anuncio_desempenho_semanal (anuncio_id, inicio desc);

-- Série do preço ideal calculado, com a data-base do cálculo.
-- ── Anotações do anúncio ─────────────────────────────────────────────
--
-- O que a PESSOA fez: trocou a foto, subiu o preço fora do sistema,
-- acabou o estoque, mudou o título.
--
-- Parece supérfluo e não é. Boa parte da queda de um anúncio é ação
-- interna, não movimento de mercado — e sem esse registro a análise fica
-- procurando culpa do lado de fora. Desenhada junto da curva de vendas,
-- é o que transforma "caiu 20%" em "caiu 20% na semana que troquei a
-- foto principal".
create table anotacoes_anuncio (
  id          uuid    primary key default gen_random_uuid(),
  operacao_id uuid    not null references operacoes(id) on delete cascade,
  anuncio_id  uuid    not null references anuncios(id)  on delete cascade,
  data        date    not null,
  tipo        text    not null
    check (tipo in ('preco', 'campanha', 'estoque', 'ficha', 'outro')),
  texto       text    not null check (length(trim(texto)) > 0),
  criado_por  uuid    references usuarios(id) on delete set null,
  criado_em   timestamptz not null default now()
);

create index on anotacoes_anuncio (anuncio_id, data desc);
create index on anotacoes_anuncio (operacao_id, data desc);

-- ── Retrato do preço da vitrine ──────────────────────────────────────
--
-- É o que o botão "Atualizar preços" grava. Um retrato por anúncio por
-- semana: clicar de novo na mesma semana atualiza a linha, não cria outra.
--
-- Por que semanal e não diário: o preço publicado muda pouco dentro da
-- semana, e a análise é semanal. Varrer todo dia gastaria chamada sem
-- mudar a leitura.
create table anuncio_precos_vitrine (
  id             uuid     primary key default gen_random_uuid(),
  operacao_id    uuid     not null references operacoes(id) on delete cascade,
  anuncio_id     uuid     not null references anuncios(id)  on delete cascade,
  ano_iso        smallint not null check (ano_iso between 2000 and 2100),
  semana_iso     smallint not null check (semana_iso between 1 and 53),

  preco          numeric(14,2) not null,
  /** Preço cheio quando o anúncio está com desconto na vitrine. */
  preco_original numeric(14,2),
  status         status_anuncio,
  disponivel     integer,
  vendidos       integer,

  capturado_em   timestamptz not null default now(),
  unique (anuncio_id, ano_iso, semana_iso)
);

create index on anuncio_precos_vitrine (operacao_id, ano_iso, semana_iso);

create table precos_ideais (
  id                  uuid primary key default gen_random_uuid(),
  operacao_id         uuid          not null references operacoes(id) on delete cascade,
  anuncio_id          uuid          not null references anuncios(id)  on delete cascade,
  data_base           date          not null,
  preco_ideal         numeric(14,2) not null,
  preco_praticado     numeric(14,2),
  comissao_negociada  numeric(7,4),
  importacao_id       uuid          references importacoes(id) on delete set null,
  criado_em           timestamptz   not null default now(),
  unique (anuncio_id, data_base)
);

-- ─────────────────────────────────────────────────────────────────────
--  6. PROMOÇÕES
-- ─────────────────────────────────────────────────────────────────────

-- ── A "Fórmula base" ────────────────────────────────────────────────
--
-- Reproduz FIELMENTE a planilha que o motor de promoções já usa, que tem
-- duas partes e NÃO é um cadastro de custo e margem:
--
--   aba "Base MLB"  → por anúncio: tipo (Clássico/Premium) e comissão padrão
--   matriz de preço → por SKU (ou MLB) × comissão → preço de tabela pronto
--
-- O preço de tabela já vem calculado pela planilha. O motor só CONSULTA:
-- descobre a comissão a considerar e procura o preço daquela comissão.
-- Recalcular aqui a partir de custo e margem daria número diferente do que
-- a operação usa hoje — por isso a estrutura segue a planilha, não a teoria.

create table formula_base_itens (
  id              uuid          primary key default gen_random_uuid(),
  operacao_id     uuid          not null references operacoes(id) on delete cascade,
  vigente_de      date          not null,
  mlb             citext        not null,
  sku             citext,
  tipo_anuncio    tipo_anuncio  not null,
  -- comissão padrão do anúncio, em fração (0.165 = 16,5%) — é como o
  -- motor compara com a tarifa reduzida da campanha
  comissao_padrao numeric(8,5)  not null check (comissao_padrao > 0 and comissao_padrao < 1),
  importacao_id   uuid          references importacoes(id) on delete set null,
  criado_em       timestamptz   not null default now(),
  atualizado_em   timestamptz   not null default now(),
  unique (operacao_id, mlb, vigente_de)
);

create index on formula_base_itens (operacao_id, sku, vigente_de desc);

-- A matriz. Uma linha por chave e comissão. A busca é por SKU primeiro e
-- cai para MLB, exatamente na ordem que `getPrecoTabela` faz hoje.
create table formula_base_precos (
  id            uuid    primary key default gen_random_uuid(),
  operacao_id   uuid    not null references operacoes(id) on delete cascade,
  vigente_de    date    not null,
  -- 'sku' ou 'mlb': de onde veio a chave desta linha
  chave_tipo    text    not null check (chave_tipo in ('sku', 'mlb')),
  chave         citext  not null,
  -- comissão em fração, arredondada a 3 casas — é a chave de busca do motor
  comissao      numeric(8,5) not null check (comissao > 0 and comissao < 1),
  preco         numeric(14,2) not null check (preco >= 0),
  importacao_id uuid    references importacoes(id) on delete set null,
  criado_em     timestamptz not null default now(),
  unique (operacao_id, chave_tipo, chave, comissao, vigente_de)
);

create index on formula_base_precos (operacao_id, chave, comissao, vigente_de desc);

create table campanhas (
  id                    uuid primary key default gen_random_uuid(),
  operacao_id           uuid        not null references operacoes(id) on delete cascade,
  canal_id              uuid        not null references canais(id)    on delete cascade,
  nome                  text        not null,
  codigo_externo        text,                             -- id da campanha no canal
  inicio                date,
  fim                   date,
  tem_reducao_tarifa    boolean     not null default false,
  percentual_reducao    numeric(7,4),                     -- 4.5 = 4,5 p.p. de desconto na tarifa
  ativa                 boolean     not null default true,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  check (fim is null or inicio is null or fim >= inicio)
);

create index on campanhas (operacao_id, ativa, fim);

create table campanha_itens (
  id                  uuid primary key default gen_random_uuid(),
  operacao_id         uuid              not null references operacoes(id) on delete cascade,
  campanha_id         uuid              not null references campanhas(id) on delete cascade,
  anuncio_id          uuid              not null references anuncios(id)  on delete cascade,

  preco_tabela        numeric(14,2),                      -- preço cheio
  preco_oferta        numeric(14,2),                      -- preço proposto/aplicado
  preco_sugerido      numeric(14,2),                      -- o que o canal sugeriu
  comissao_aplicada   numeric(7,4),
  margem_resultante   numeric(7,4),

  desconto_percentual numeric(7,4)
    generated always as (
      round(((preco_tabela - preco_oferta) * 100) / nullif(preco_tabela, 0), 4)
    ) stored,

  decisao             decisao_promocao not null default 'pendente',
  decidido_em         timestamptz,
  decidido_por        uuid             references usuarios(id) on delete set null,
  motivo              text,

  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (campanha_id, anuncio_id)
);

create index on campanha_itens (operacao_id, decisao);

-- Cada rodada de processamento de planilha.
create table processamentos_promocao (
  id              uuid primary key default gen_random_uuid(),
  operacao_id     uuid            not null references operacoes(id) on delete cascade,
  campanha_id     uuid            references campanhas(id) on delete set null,
  importacao_id   uuid            references importacoes(id) on delete set null,
  itens_lidos     integer         not null default 0,
  itens_aprovados integer         not null default 0,
  itens_reprovados integer        not null default 0,
  arquivo_saida   text,
  status          status_execucao not null default 'concluida',
  executado_por   uuid            references usuarios(id) on delete set null,
  executado_em    timestamptz     not null default now()
);

-- Registro linha a linha do que foi decidido. Mantém o nome da tabela
-- que já existia no projeto anterior para facilitar a migração.
create table historico_promocoes (
  id                 uuid primary key default gen_random_uuid(),
  operacao_id        uuid              not null references operacoes(id) on delete cascade,
  processamento_id   uuid              references processamentos_promocao(id) on delete cascade,
  anuncio_id         uuid              references anuncios(id) on delete set null,

  mlb                citext            not null,          -- código do anúncio, como veio
  sku                citext,
  campanha           text              not null,          -- nome da campanha, como veio
  tipo_anuncio       tipo_anuncio,
  preco_tabela       numeric(14,2),
  preco_oferta       numeric(14,2),
  reducao_tarifa     text,                                -- "Não", "15%", "R$ 12,00"
  status_aprovacao   status_item_promo not null,
  motivo             text,
  data_processamento timestamptz       not null default now()
);

create index on historico_promocoes (operacao_id, data_processamento desc);
create index on historico_promocoes (mlb);
create index on historico_promocoes (operacao_id, campanha);

-- ─────────────────────────────────────────────────────────────────────
--  7. MONITORAMENTO — preços e fretes dos conectores
-- ─────────────────────────────────────────────────────────────────────

create table monitoramentos_preco (
  id                 uuid primary key default gen_random_uuid(),
  operacao_id        uuid        not null references operacoes(id) on delete cascade,
  anuncio_id         uuid        references anuncios(id) on delete cascade,
  apelido            text        not null,
  url                text        not null,
  canal_id           uuid        references canais(id) on delete set null,
  intervalo_minutos  integer     not null default 360 check (intervalo_minutos >= 15),
  alerta_percentual  numeric(7,4),                        -- avisa se concorrente ficar X% abaixo
  ativo              boolean     not null default true,
  ultima_coleta_em   timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create table concorrentes (
  id                uuid primary key default gen_random_uuid(),
  operacao_id       uuid        not null references operacoes(id) on delete cascade,
  monitoramento_id  uuid        not null references monitoramentos_preco(id) on delete cascade,
  nome_vendedor     text,
  codigo_externo    text,
  url               text        not null,
  ativo             boolean     not null default true,
  criado_em         timestamptz not null default now()
);

-- Série temporal. Cresce rápido — ver nota de particionamento no documento.
create table precos_coletados (
  id                uuid primary key default gen_random_uuid(),
  operacao_id       uuid          not null references operacoes(id) on delete cascade,
  monitoramento_id  uuid          not null references monitoramentos_preco(id) on delete cascade,
  concorrente_id    uuid          references concorrentes(id) on delete cascade, -- null = preço próprio
  preco             numeric(14,2) not null,
  preco_com_frete   numeric(14,2),
  disponivel        boolean       not null default true,
  posicao_busca     smallint,
  coletado_em       timestamptz   not null default now()
);

create index on precos_coletados (monitoramento_id, coletado_em desc);
create index on precos_coletados (concorrente_id, coletado_em desc);

create table monitoramentos_frete (
  id               uuid primary key default gen_random_uuid(),
  operacao_id      uuid              not null references operacoes(id) on delete cascade,
  anuncio_id       uuid              references anuncios(id) on delete cascade,
  canal_id         uuid              references canais(id)   on delete set null,
  modalidade       modalidade_frete  not null default 'full',
  cep_origem       char(8),
  cep_destino      char(8)           not null,
  regiao           text,                                  -- 'Sudeste', 'Nordeste', ...
  intervalo_minutos integer          not null default 720 check (intervalo_minutos >= 60),
  ativo            boolean           not null default true,
  ultima_coleta_em timestamptz,
  criado_em        timestamptz       not null default now(),
  atualizado_em    timestamptz       not null default now()
);

create table fretes_coletados (
  id                uuid primary key default gen_random_uuid(),
  operacao_id       uuid          not null references operacoes(id) on delete cascade,
  monitoramento_id  uuid          not null references monitoramentos_frete(id) on delete cascade,
  valor             numeric(14,2) not null,
  gratis            boolean       not null default false,
  prazo_dias        smallint,
  coletado_em       timestamptz   not null default now()
);

create index on fretes_coletados (monitoramento_id, coletado_em desc);

-- ─────────────────────────────────────────────────────────────────────
--  8. FINANCEIRO
-- ─────────────────────────────────────────────────────────────────────

create table categorias_financeiras (
  id            uuid primary key default gen_random_uuid(),
  operacao_id   uuid            not null references operacoes(id) on delete cascade,
  nome          text            not null,
  tipo          tipo_lancamento not null,
  grupo         text,                                    -- 'Mercadoria', 'Estrutura', 'Pessoal'
  cor_serie     smallint check (cor_serie between 1 and 10),
  ativa         boolean         not null default true,
  criado_em     timestamptz     not null default now(),
  atualizado_em timestamptz     not null default now(),
  unique (operacao_id, nome)
);

create table fornecedores (
  id                  uuid primary key default gen_random_uuid(),
  operacao_id         uuid        not null references operacoes(id) on delete cascade,
  razao_social        text        not null,
  nome_fantasia       text,
  cnpj                char(14),                          -- só dígitos
  categoria           text,
  contato_nome        text,
  contato_email       citext,
  contato_telefone    text,
  condicao_pagamento  text,                              -- '30/60/90', 'à vista'
  ativo               boolean     not null default true,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (operacao_id, cnpj)
);

create table funcionarios (
  id            uuid primary key default gen_random_uuid(),
  operacao_id   uuid          not null references operacoes(id) on delete cascade,
  nome          text          not null,
  cargo         text,
  setor         text,
  admissao      date,
  demissao      date,
  salario_base  numeric(14,2) not null default 0,
  ativo         boolean       not null default true,
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now(),
  check (demissao is null or admissao is null or demissao >= admissao)
);

create table folha_pagamento (
  id             uuid primary key default gen_random_uuid(),
  operacao_id    uuid          not null references operacoes(id)   on delete cascade,
  funcionario_id uuid          not null references funcionarios(id) on delete cascade,
  competencia    date          not null,                 -- sempre dia 1 do mês
  salario_base   numeric(14,2) not null default 0,
  beneficios     numeric(14,2) not null default 0,
  encargos       numeric(14,2) not null default 0,
  descontos      numeric(14,2) not null default 0,
  custo_total    numeric(14,2)
    generated always as (salario_base + beneficios + encargos - descontos) stored,
  criado_em      timestamptz   not null default now(),
  atualizado_em  timestamptz   not null default now(),
  unique (funcionario_id, competencia)
);

-- Compra de mercadoria em lote (o "pagamento de lotes e produtos").
create table lotes_compra (
  id                uuid primary key default gen_random_uuid(),
  operacao_id       uuid          not null references operacoes(id)    on delete cascade,
  fornecedor_id     uuid          references fornecedores(id)          on delete set null,
  numero            text          not null,
  data_pedido       date          not null,
  previsao_entrega  date,
  entrega_real      date,
  valor_total       numeric(14,2) not null default 0,
  status            status_lote   not null default 'rascunho',
  observacao        text,
  criado_em         timestamptz   not null default now(),
  atualizado_em     timestamptz   not null default now(),
  unique (operacao_id, numero)
);

create table lote_itens (
  id             uuid primary key default gen_random_uuid(),
  lote_id        uuid          not null references lotes_compra(id) on delete cascade,
  produto_id     uuid          references produtos(id) on delete set null,
  descricao      text,
  quantidade     numeric(14,3) not null check (quantidade > 0),
  custo_unitario numeric(14,2) not null check (custo_unitario >= 0),
  total          numeric(14,2)
    generated always as (round(quantidade * custo_unitario, 2)) stored
);

create index on lote_itens (lote_id);

-- Livro-caixa: entradas e saídas, previstas e realizadas.
-- Contas a pagar = filtro tipo='saida' e status in ('em_aberto','atrasado').
create table lancamentos_financeiros (
  id              uuid primary key default gen_random_uuid(),
  operacao_id     uuid              not null references operacoes(id) on delete cascade,
  tipo            tipo_lancamento   not null,
  categoria_id    uuid              references categorias_financeiras(id) on delete set null,
  fornecedor_id   uuid              references fornecedores(id)  on delete set null,
  lote_id         uuid              references lotes_compra(id)  on delete set null,
  funcionario_id  uuid              references funcionarios(id)  on delete set null,
  canal_id        uuid              references canais(id)        on delete set null,

  descricao       text              not null,
  documento       text,                                  -- NF, boleto
  valor           numeric(14,2)     not null check (valor > 0),
  competencia     date              not null,            -- mês a que se refere
  vencimento      date,
  pagamento       date,
  status          status_lancamento not null default 'em_aberto',
  forma_pagamento text,
  observacao      text,
  recorrente      boolean           not null default false,

  criado_por      uuid              references usuarios(id) on delete set null,
  criado_em       timestamptz       not null default now(),
  atualizado_em   timestamptz       not null default now(),

  check (status <> 'pago' or pagamento is not null)
);

create index on lancamentos_financeiros (operacao_id, tipo, competencia);
create index on lancamentos_financeiros (operacao_id, status, vencimento);
create index on lancamentos_financeiros (fornecedor_id);

-- ─────────────────────────────────────────────────────────────────────
--  9. INTEGRAÇÕES, ALERTAS E SISTEMA
-- ─────────────────────────────────────────────────────────────────────

create table integracoes (
  id                    uuid primary key default gen_random_uuid(),
  operacao_id           uuid              not null references operacoes(id) on delete cascade,
  provedor              citext            not null,      -- 'mercado_livre', 'ga4', 'bling'
  canal_id              uuid              references canais(id) on delete set null,
  status                status_integracao not null default 'desconectada',
  -- NUNCA guarde token em texto puro. Aqui vai só a referência ao cofre
  -- (Supabase Vault, AWS Secrets Manager). Ver seção de segurança no documento.
  credencial_ref        text,
  expira_em             timestamptz,
  config                jsonb             not null default '{}'::jsonb,
  ultima_sincronizacao  timestamptz,
  ultimo_erro           text,
  criado_em             timestamptz       not null default now(),
  atualizado_em         timestamptz       not null default now(),
  unique (operacao_id, provedor, canal_id)
);

create table sincronizacoes (
  id             uuid primary key default gen_random_uuid(),
  operacao_id    uuid            not null references operacoes(id)  on delete cascade,
  integracao_id  uuid            not null references integracoes(id) on delete cascade,
  iniciada_em    timestamptz     not null default now(),
  terminada_em   timestamptz,
  status         status_execucao not null default 'executando',
  registros      integer         not null default 0,
  erro           text
);

create index on sincronizacoes (integracao_id, iniciada_em desc);

create table alertas (
  id              uuid primary key default gen_random_uuid(),
  operacao_id     uuid              not null references operacoes(id) on delete cascade,
  tipo            tipo_alerta       not null,
  severidade      severidade_alerta not null default 'info',
  titulo          text              not null,
  detalhe         text,
  referencia_tipo text,                                  -- 'anuncio', 'campanha', 'lancamento'
  referencia_id   uuid,
  resolvido_em    timestamptz,
  lido_em         timestamptz,
  criado_em       timestamptz       not null default now()
);

create index on alertas (operacao_id, criado_em desc) where resolvido_em is null;

create table exportacoes (
  id             uuid primary key default gen_random_uuid(),
  operacao_id    uuid            not null references operacoes(id) on delete cascade,
  tipo           text            not null,               -- 'consolidado_xlsx', 'diario_csv'
  periodo_inicio date,
  periodo_fim    date,
  caminho        text,                                   -- objeto no storage
  tamanho_bytes  bigint,
  status         status_execucao not null default 'na_fila',
  criado_por     uuid            references usuarios(id) on delete set null,
  criado_em      timestamptz     not null default now()
);

create table agendamentos (
  id             uuid primary key default gen_random_uuid(),
  operacao_id    uuid        not null references operacoes(id) on delete cascade,
  tipo           text        not null,                   -- 'exportacao', 'sincronizacao', 'coleta_preco'
  descricao      text,
  cron           text        not null,                   -- '0 8 * * 1'
  ativo          boolean     not null default true,
  config         jsonb       not null default '{}'::jsonb,
  ultimo_disparo timestamptz,
  proximo_disparo timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Glossário é conteúdo do produto, igual para todo mundo — sem operacao_id.
create table glossario (
  id              uuid primary key default gen_random_uuid(),
  secao           text not null,
  termo           text not null,
  sigla           text,
  definicao       text not null,
  calculo         text,
  onde_encontrar  text,
  ordem           smallint not null default 0,
  unique (secao, termo)
);

create table auditoria (
  id           uuid primary key default gen_random_uuid(),
  operacao_id  uuid        references operacoes(id) on delete cascade,
  usuario_id   uuid        references usuarios(id)  on delete set null,
  acao         text        not null,                     -- 'criou', 'alterou', 'excluiu'
  entidade     text        not null,
  entidade_id  uuid,
  antes        jsonb,
  depois       jsonb,
  criado_em    timestamptz not null default now()
);

create index on auditoria (operacao_id, criado_em desc);
create index on auditoria (entidade, entidade_id);

-- ─────────────────────────────────────────────────────────────────────
--  10. GATILHOS DE atualizado_em
-- ─────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizacoes','operacoes','usuarios','preferencias_usuario',
    'canais','contas_canal','produtos','anuncios',
    'vendas_diarias','pedidos','visitas_mensais','metas',
    'anuncio_desempenho_semanal','formula_base_itens',
    'campanhas','campanha_itens',
    'monitoramentos_preco','monitoramentos_frete',
    'categorias_financeiras','fornecedores','funcionarios','folha_pagamento',
    'lotes_compra','lancamentos_financeiros',
    'integracoes','agendamentos'
  ]
  loop
    execute format(
      'create trigger %I_atualizado_em before update on %I
         for each row execute function set_atualizado_em()',
      t, t
    );
  end loop;
end $$;
