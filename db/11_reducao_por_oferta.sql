-- ═══════════════════════════════════════════════════════════════════════
--  A REDUÇÃO DE TARIFA PASSA A FICAR NA OFERTA
--
--  Ela existia só em `historico_promocoes.reducao_tarifa`, como TEXTO —
--  a coluna aceita "Não", "15%" e "R$ 12,00" indistintamente, porque
--  guardava o que viesse da planilha sem interpretar.
--
--  A tela de comparação lê `campanha_itens`, então não tinha como mostrar
--  a redução ao lado do preço. E é ela que explica por que duas ofertas
--  do mesmo anúncio têm preços de tabela diferentes: cada faixa reduz uma
--  fatia diferente da comissão, e a Fórmula base devolve outro preço para
--  cada comissão resultante.
--
--  Aqui vira NÚMERO, em reais, porque é isso que o canal informa — o
--  percentual é essa fatia sobre o preço proposto, e sai de uma divisão
--  na hora de mostrar. Guardar o percentual calculado congelaria uma
--  conta que depende de um preço que pode ser corrigido depois.
--
--  Executar depois de 09_campanha_varias_ofertas.sql. Seguro rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════

alter table campanha_itens
  add column if not exists reducao_tarifa numeric(14,2);

comment on column campanha_itens.reducao_tarifa is
  'Quanto o canal abate da tarifa nesta oferta, em reais. Nulo nas '
  'campanhas sem redução. O percentual é este valor sobre o preço proposto.';

-- ─────────────────────────────────────────────────────────────────────
--  Preenche as ofertas que já existem
--
--  O par é feito por campanha + anúncio + preço proposto + preço de
--  tabela. Só o preço não bastava: o mesmo anúncio aparece várias vezes
--  na mesma campanha com o mesmo preço e faixas diferentes, e a tabela é
--  o que as separa.
--
--  `variantes = 1` deixa de fora o caso em que o par ainda assim casa com
--  reduções diferentes. Preencher com uma delas seria inventar qual — o
--  campo fica nulo e a tela mostra travessão, que é honesto. Reprocessar
--  a planilha preenche todas.
-- ─────────────────────────────────────────────────────────────────────
with fonte as (
  select
    h.operacao_id,
    h.campanha,
    h.mlb,
    h.preco_oferta,
    h.preco_tabela,
    min(h.reducao_tarifa::numeric)          as reducao,
    count(distinct h.reducao_tarifa)        as variantes
  from historico_promocoes h
  where h.reducao_tarifa is not null
    -- Só as linhas onde a coluna guarda um número. "Não" é o rótulo das
    -- campanhas sem redução, e o cast estouraria nele.
    and h.reducao_tarifa ~ '^[0-9]+(\.[0-9]+)?$'
  group by 1, 2, 3, 4, 5
)
update campanha_itens ci
set reducao_tarifa = f.reducao
from fonte f
join campanhas c
  on c.nome = f.campanha
 and c.operacao_id = f.operacao_id
join anuncios a
  on a.codigo_externo = f.mlb
 and a.operacao_id = f.operacao_id
where ci.campanha_id = c.id
  and ci.anuncio_id = a.id
  and ci.preco_oferta is not distinct from f.preco_oferta
  and ci.preco_tabela is not distinct from f.preco_tabela
  and f.variantes = 1
  and ci.reducao_tarifa is null;
