-- ═══════════════════════════════════════════════════════════════════════
--  38. O canal se chama "Loja própria", sem o VTEX
--
--  Por quê
--  ───────
--  VTEX é por onde o pedido chega, não onde a venda acontece. Quem lê o
--  relatório é o lojista e o gerente dele: para eles o canal é a loja
--  própria, e o fornecedor da plataforma não diz nada. Pior, prende o nome
--  a um fornecedor — o mesmo canal pode passar a vir de outra plataforma, ou
--  do ERP, sem deixar de ser a loja própria.
--
--  O nome do fornecedor continua onde é útil: na tela de Integrações, que é
--  onde se escolhe qual API conectar.
--
--  O cuidado
--  ─────────
--  O canal de uma planilha importada é resolvido pelo NOME ou por um
--  APELIDO (`src/lib/dados/resolver-canal.ts`). Renomear sem mais nada
--  faria toda planilha com a coluna "Loja própria (VTEX)" parar de casar —
--  e a recusa fala de apelido, não de nome que mudou.
--
--  Então o nome antigo entra como apelido. Planilha velha continua
--  entrando, que é a mesma regra que já valia para "Cotia" virar
--  "São Paulo".
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  Quem já existe
--
--  O apelido entra com `distinct` porque a migração pode rodar duas vezes,
--  e apelido repetido não quebra a resolução mas suja a lista que a tela de
--  canais mostra.
-- ─────────────────────────────────────────────────────────────────────
update canais
   set nome = 'Loja própria',
       apelidos = (
         select array_agg(distinct a order by a)
           from unnest(coalesce(apelidos, array[]::text[]) || array['loja propria (vtex)']) a
       )
 where codigo = 'vtex'
   and nome <> 'Loja própria';

-- ─────────────────────────────────────────────────────────────────────
--  Quem nascer daqui para frente
--
--  Mesma função de `25_empresa_nova_nasce_usavel.sql`, só com o nome e o
--  apelido novos. Continua idempotente pelo `on conflict do nothing`.
-- ─────────────────────────────────────────────────────────────────────
create or replace function semear_canais(p_operacao uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into canais (operacao_id, codigo, nome, tipo, cor_serie, ordem, apelidos) values
    (p_operacao, 'mercado_livre', 'Mercado Livre',   'marketplace',  1, 1, array['mercado livre','mercadolivre','meli','ml']),
    (p_operacao, 'shopee',        'Shopee',          'marketplace',  2, 2, array['shopee']),
    (p_operacao, 'amazon',        'Amazon',          'marketplace',  3, 3, array['amazon']),
    (p_operacao, 'magalu',        'Magalu',          'marketplace',  4, 4, array['magalu','magazine luiza']),
    (p_operacao, 'casas_bahia',   'Casas Bahia',     'marketplace',  5, 5, array['casas bahia marketplace','casas bahia','via varejo']),
    (p_operacao, 'madeira',       'Madeira Madeira', 'marketplace',  6, 6, array['madeira madeira','madeiramadeira']),
    (p_operacao, 'vtex',          'Loja própria',    'loja_propria', 7, 7, array['vtex','loja propria','loja propria (vtex)','vtrina']),
    (p_operacao, 'outros',        'Outros',          'outro',        9, 8, array[]::text[])
  on conflict (operacao_id, codigo) do nothing;
$$;

-- ─────────────────────────────────────────────────────────────────────
--  Conferência
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  faltando int;
begin
  select count(*) into faltando
    from canais
   where codigo = 'vtex'
     and (nome <> 'Loja própria' or not ('loja propria (vtex)' = any(apelidos)));
  if faltando > 0 then
    raise exception 'Canais vtex sem o nome novo ou sem o apelido antigo: %', faltando;
  end if;
  raise notice 'Canal da loja própria renomeado em todas as empresas.';
end $$;
