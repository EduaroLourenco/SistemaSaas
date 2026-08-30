-- ════════════════════════════════════════════════════════════════
--  07 — Apelidos de canal e conta
--  Rode depois do 06.
-- ════════════════════════════════════════════════════════════════

/* ── O problema ───────────────────────────────────────────────────

   O hub não escreve os nomes como o sistema os guarda. O export do
   Vtrina traz:

     marketplace = "Vtex"                conta = ""
     marketplace = "Mercado Livre"       conta = "COLCHOES_PROBEL_SP"
     marketplace = "Mercado Livre"       conta = "COLCHÕES PROBEL"

   "COLCHOES_PROBEL_SP" não se parece com "São Paulo — pronta entrega"
   por nenhuma regra automática, e as duas contas do Mercado Livre
   vendem coisas diferentes: uma é pronta entrega, a outra é a prazo.

   Adivinhar aqui significa venda registrada na conta errada — erro que
   não aparece no total e só se descobre quando alguém compara o
   faturamento por conta com o painel do canal.

   Apelido resolve, e explicitamente: o que não casar com nenhum apelido
   é RECUSADO e mostrado na tela, nunca jogado em "Outros".               */

alter table canais
  add column if not exists apelidos text[] not null default '{}';
alter table contas_canal
  add column if not exists apelidos text[] not null default '{}';

comment on column canais.apelidos is
  'Como este canal aparece nos arquivos importados. Comparação sem acento e sem caixa.';
comment on column contas_canal.apelidos is
  'Como esta conta aparece nos arquivos importados.';

/* ── Busca sem acento e sem caixa ─────────────────────────────────

   "COLCHÕES PROBEL" e "COLCHOES PROBEL" são a mesma conta, e o hub já
   escreveu das duas formas. Normalizar na comparação evita ter de
   cadastrar cada variação de acentuação à mão.                           */

create or replace function normalizar_apelido(t text)
returns text
language sql
immutable
as $$
  select lower(trim(translate(
    coalesce(t, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
  )));
$$;

create index if not exists canais_apelidos_idx on canais using gin (apelidos);
create index if not exists contas_canal_apelidos_idx on contas_canal using gin (apelidos);

/* ── Apelidos conhecidos ──────────────────────────────────────────

   Só os que foram VISTOS num arquivo real. Cadastrar apelido presumido
   é o mesmo que adivinhar, com uma camada de cerimônia por cima.         */

update canais set apelidos = array['mercado livre', 'mercadolivre', 'meli', 'ml']
 where codigo = 'mercado_livre';

update canais set apelidos = array['vtex', 'loja propria', 'vtrina']
 where codigo = 'vtex';

update contas_canal cc set apelidos = array['colchoes_probel_sp', 'colchoes probel sp']
  from canais ca
 where ca.id = cc.canal_id
   and ca.codigo = 'mercado_livre'
   and cc.nome like 'São Paulo%';

update contas_canal cc set apelidos = array['colchoes probel', 'colchoes_probel']
  from canais ca
 where ca.id = cc.canal_id
   and ca.codigo = 'mercado_livre'
   and cc.nome like '2ª conta%';

/* ── Apelidos vistos no export do Vtrina ──────────────────────── */

update canais set apelidos = array['casas bahia marketplace','casas bahia','via varejo'] where codigo = 'casas_bahia';
update canais set apelidos = array['zema']                                              where codigo = 'zema';
update canais set apelidos = array['magalu','magazine luiza']                           where codigo = 'magalu';
update canais set apelidos = array['amazon']                                            where codigo = 'amazon';
update canais set apelidos = array['madeira madeira','madeiramadeira']                  where codigo = 'madeira';
update canais set apelidos = array['shopee']                                            where codigo = 'shopee';
update canais set apelidos = array['carrefour']                                         where codigo = 'carrefour';
update canais set apelidos = array['webcontinental','web continental']                  where codigo = 'webcontinental';
