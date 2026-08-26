-- ═══════════════════════════════════════════════════════════════════════
--  PLATAFORMA — VISÕES DE LEITURA
--
--  Regra: a tela NUNCA recalcula indicador em JavaScript. Ela lê de uma
--  visão. Assim o número é o mesmo no painel, no relatório e na exportação.
--
--  Executar depois de 02_rls.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
--  1. VENDAS — grão diário com todas as métricas derivadas
-- ─────────────────────────────────────────────────────────────────────

create or replace view vw_vendas_dia as
select
  v.operacao_id,
  v.canal_id,
  c.nome                                as canal,
  c.cor_serie,
  v.conta_canal_id,
  cc.nome                               as conta,
  v.data,
  extract(isoyear from v.data)::smallint as ano_iso,
  extract(week    from v.data)::smallint as semana_iso,
  extract(year    from v.data)::smallint as ano,
  extract(month   from v.data)::smallint as mes,
  extract(isodow  from v.data)::smallint as dia_semana,   -- 1 = segunda
  v.visitas,
  v.pedidos,
  v.receita,
  v.receita_liquida,
  v.investimento_ads,
  v.pedidos_cancelados,
  v.valor_cancelado,
  v.ticket_medio,
  -- conversão em %, nula quando não houve visita (evita 0% enganoso)
  round((v.pedidos::numeric * 100) / nullif(v.visitas, 0), 4)          as conversao,
  -- TACOS: quanto da receita foi consumido por mídia
  round((v.investimento_ads * 100) / nullif(v.receita, 0), 4)          as tacos,
  round((v.valor_cancelado  * 100) / nullif(v.receita, 0), 4)          as taxa_cancelamento,
  round(v.receita / nullif(v.investimento_ads, 0), 4)                  as roas
from vendas_diarias v
join canais       c  on c.id  = v.canal_id
join contas_canal cc on cc.id = v.conta_canal_id;

-- ─────────────────────────────────────────────────────────────────────
--  2. VENDAS — consolidado mensal por canal, já comparado com a meta
-- ─────────────────────────────────────────────────────────────────────

create or replace view vw_vendas_mes_canal as
with base as (
  select
    v.operacao_id,
    v.canal_id,
    date_trunc('month', v.data)::date as competencia,
    sum(v.visitas)            as visitas,
    sum(v.pedidos)            as pedidos,
    sum(v.receita)            as receita,
    sum(v.receita_liquida)    as receita_liquida,
    sum(v.investimento_ads)   as investimento_ads,
    sum(v.pedidos_cancelados) as pedidos_cancelados,
    sum(v.valor_cancelado)    as valor_cancelado
  from vendas_diarias v
  group by 1, 2, 3
)
select
  b.*,
  c.nome as canal,
  round(b.receita / nullif(b.pedidos, 0), 2)                  as ticket_medio,
  round((b.pedidos::numeric * 100) / nullif(b.visitas, 0), 4) as conversao,
  round((b.investimento_ads * 100) / nullif(b.receita, 0), 4) as tacos,
  m.receita_meta,
  round((b.receita * 100) / nullif(m.receita_meta, 0), 2)     as atingimento
from base b
join canais c on c.id = b.canal_id
left join metas m
  on  m.operacao_id = b.operacao_id
  and m.canal_id    = b.canal_id
  and m.ano         = extract(year  from b.competencia)::smallint
  and m.mes         = extract(month from b.competencia)::smallint;

-- ─────────────────────────────────────────────────────────────────────
--  3. VENDAS — semanas ISO (a tela Semanal)
-- ─────────────────────────────────────────────────────────────────────

create or replace view vw_vendas_semana as
select
  operacao_id,
  extract(isoyear from data)::smallint as ano_iso,
  extract(week    from data)::smallint as semana_iso,
  min(data)                            as inicio,
  max(data)                            as fim,
  sum(visitas)                         as visitas,
  sum(pedidos)                         as pedidos,
  sum(receita)                         as receita,
  sum(receita_liquida)                 as receita_liquida,
  sum(investimento_ads)                as investimento_ads,
  sum(valor_cancelado)                 as valor_cancelado,
  round(sum(receita) / nullif(sum(pedidos), 0), 2)                     as ticket_medio,
  round((sum(pedidos)::numeric * 100) / nullif(sum(visitas), 0), 4)    as conversao
from vendas_diarias
group by 1, 2, 3;

-- ─────────────────────────────────────────────────────────────────────
--  4. ANÚNCIOS — desempenho acumulado + curvas de Pareto
--
--  Reproduz no banco a mesma regra que a tela Análise de anúncios usa:
--  curva A = os itens que somam os primeiros 80% do total.
-- ─────────────────────────────────────────────────────────────────────

create or replace view vw_anuncio_acumulado as
with periodo as (
  select
    d.operacao_id,
    d.anuncio_id,
    sum(d.visitas) as visitas,
    sum(d.vendas)  as vendas,
    sum(d.receita) as receita,
    max(d.fim)     as ultima_semana,
    -- subsídio: soma de (ideal − praticado) × vendas nas semanas abaixo do ideal
    sum(
      case
        when d.preco_ideal is not null
         and d.vendas > 0
         and (d.receita / d.vendas) < d.preco_ideal
        then (d.preco_ideal - (d.receita / d.vendas)) * d.vendas
        else 0
      end
    ) as subsidio
  from anuncio_desempenho_semanal d
  group by 1, 2
),
ranqueado as (
  select
    p.*,
    sum(p.receita) over (partition by p.operacao_id
                         order by p.receita desc
                         rows between unbounded preceding and current row)
      / nullif(sum(p.receita) over (partition by p.operacao_id), 0) as acum_receita,
    sum(p.visitas) over (partition by p.operacao_id
                         order by p.visitas desc
                         rows between unbounded preceding and current row)
      / nullif(sum(p.visitas) over (partition by p.operacao_id), 0)::numeric as acum_visitas
  from periodo p
)
select
  r.operacao_id,
  r.anuncio_id,
  a.codigo_externo,
  a.titulo,
  a.sku_canal,
  a.tipo,
  a.status,
  a.canal_id,
  r.visitas,
  r.vendas,
  r.receita,
  r.subsidio,
  round((r.subsidio * 100) / nullif(r.receita, 0), 4)              as subsidio_pct,
  round((r.vendas::numeric * 100) / nullif(r.visitas, 0), 4)       as conversao,
  (r.acum_receita <= 0.8) as curva_a_receita,
  (r.acum_visitas <= 0.8) as curva_a_trafego,
  r.ultima_semana
from ranqueado r
join anuncios a on a.id = r.anuncio_id;

-- ─────────────────────────────────────────────────────────────────────
--  4b. ANÚNCIO POR DIA — o "quando vendeu e a quanto"
--
--  Sai de `pedido_itens`, não do consolidado: é o único lugar que ainda
--  tem o preço de cada venda com a data. É o que alimenta a quebra por
--  dia dentro da semana no raio-X do anúncio.
-- ─────────────────────────────────────────────────────────────────────

create or replace view vw_anuncio_dia as
select
  i.operacao_id,
  i.anuncio_id,
  i.codigo_externo,
  p.canal_id,
  p.conta_canal_id,
  p.data,
  extract(isodow from p.data)::smallint as dia_semana,
  extract(isoyear from p.data)::smallint as ano_iso,
  extract(week    from p.data)::smallint as semana_iso,
  sum(i.quantidade)                     as unidades,
  count(distinct p.id)                  as pedidos,
  sum(i.total)                          as receita,
  -- preço PAGO: média ponderada pelas unidades daquele dia
  round(sum(i.total) / nullif(sum(i.quantidade), 0), 2) as preco_pago
from pedido_itens i
join pedidos p on p.id = i.pedido_id
where not p.cancelado
group by i.operacao_id, i.anuncio_id, i.codigo_externo,
         p.canal_id, p.conta_canal_id, p.data;

-- ─────────────────────────────────────────────────────────────────────
--  4c. ANÚNCIO POR SEMANA — junta venda, vitrine e preço ideal
--
--  Aqui os DOIS preços aparecem lado a lado. O pago vem dos pedidos e só
--  existe se vendeu; o da vitrine vem do retrato e existe sempre. É a
--  comparação entre eles que separa "subi o preço" de "o mercado parou".
-- ─────────────────────────────────────────────────────────────────────

create or replace view vw_anuncio_semana as
with venda as (
  select
    operacao_id, anuncio_id, ano_iso, semana_iso,
    sum(unidades) as unidades,
    sum(receita)  as receita,
    min(data)     as primeira_venda,
    max(data)     as ultima_venda,
    count(*)      as dias_com_venda
  from vw_anuncio_dia
  group by 1, 2, 3, 4
)
select
  coalesce(v.operacao_id, s.operacao_id)   as operacao_id,
  coalesce(v.anuncio_id,  s.anuncio_id)    as anuncio_id,
  coalesce(v.ano_iso,     s.ano_iso)       as ano_iso,
  coalesce(v.semana_iso,  s.semana_iso)    as semana_iso,
  coalesce(v.unidades, 0)                  as unidades,
  coalesce(v.receita, 0)                   as receita,
  v.dias_com_venda,
  v.primeira_venda,
  v.ultima_venda,
  round(v.receita / nullif(v.unidades, 0), 2) as preco_pago,
  s.preco                                  as preco_vitrine,
  d.visitas,
  d.preco_ideal,
  round((coalesce(v.unidades, 0)::numeric * 100) / nullif(d.visitas, 0), 4) as conversao,
  -- distância do que foi pago para o preço alvo
  round(
    ((round(v.receita / nullif(v.unidades, 0), 2) - d.preco_ideal) * 100)
      / nullif(d.preco_ideal, 0), 4
  ) as desvio_preco
from venda v
full join anuncio_precos_vitrine s
  on  s.anuncio_id = v.anuncio_id
  and s.ano_iso    = v.ano_iso
  and s.semana_iso = v.semana_iso
left join anuncio_desempenho_semanal d
  on  d.anuncio_id = coalesce(v.anuncio_id, s.anuncio_id)
  and d.ano_iso    = coalesce(v.ano_iso, s.ano_iso)
  and d.semana_iso = coalesce(v.semana_iso, s.semana_iso);

-- ─────────────────────────────────────────────────────────────────────
--  5. PROMOÇÕES — situação das campanhas
-- ─────────────────────────────────────────────────────────────────────

create or replace view vw_campanhas_resumo as
select
  c.operacao_id,
  c.id                 as campanha_id,
  c.nome,
  c.canal_id,
  c.inicio,
  c.fim,
  c.tem_reducao_tarifa,
  c.ativa,
  (c.fim - current_date)                                              as dias_restantes,
  -- count(i.id), não count(i.*): no LEFT JOIN sem item, a linha toda vem
  -- nula e count(i.*) não é confiável entre versões.
  count(i.id)                                                         as itens,
  count(*) filter (where i.decisao = 'participar')                    as participando,
  count(*) filter (where i.decisao = 'nao_participar')                as fora,
  count(*) filter (where i.decisao = 'pendente')                      as sem_decisao,
  sum(
    case when i.decisao = 'participar'
    then (i.preco_tabela - i.preco_oferta) else 0 end
  )                                                                   as desconto_total
from campanhas c
left join campanha_itens i on i.campanha_id = c.id
group by c.id;

-- ─────────────────────────────────────────────────────────────────────
--  6. MONITORAMENTO — último preço coletado por monitoramento
-- ─────────────────────────────────────────────────────────────────────

create or replace view vw_preco_atual as
select distinct on (p.monitoramento_id, p.concorrente_id)
  p.operacao_id,
  p.monitoramento_id,
  p.concorrente_id,
  p.preco,
  p.disponivel,
  p.coletado_em
from precos_coletados p
order by p.monitoramento_id, p.concorrente_id, p.coletado_em desc;

create or replace view vw_monitoramento_precos as
select
  m.operacao_id,
  m.id                as monitoramento_id,
  m.apelido,
  m.canal_id,
  m.ativo,
  m.ultima_coleta_em,
  meu.preco           as meu_preco,
  menor.preco         as menor_concorrente,
  menor.vendedor      as vendedor_concorrente,
  round(((meu.preco - menor.preco) * 100) / nullif(menor.preco, 0), 4) as diferenca_pct
from monitoramentos_preco m
left join vw_preco_atual meu
  on meu.monitoramento_id = m.id and meu.concorrente_id is null
left join lateral (
  select p.preco, c.nome_vendedor as vendedor
  from vw_preco_atual p
  join concorrentes c on c.id = p.concorrente_id
  where p.monitoramento_id = m.id
    and p.concorrente_id is not null
    and p.disponivel
  order by p.preco asc
  limit 1
) menor on true;

-- ─────────────────────────────────────────────────────────────────────
--  7. FINANCEIRO — fluxo mensal e contas a pagar
-- ─────────────────────────────────────────────────────────────────────

create or replace view vw_fluxo_mensal as
select
  l.operacao_id,
  date_trunc('month', l.competencia)::date              as competencia,
  -- coalesce nos dois lados: um mês só de saídas deixaria `resultado` nulo
  -- e o painel mostraria vazio em vez do prejuízo.
  coalesce(sum(l.valor) filter (where l.tipo = 'entrada'), 0) as entradas,
  coalesce(sum(l.valor) filter (where l.tipo = 'saida'),   0) as saidas,
  coalesce(sum(l.valor) filter (where l.tipo = 'entrada'), 0)
    - coalesce(sum(l.valor) filter (where l.tipo = 'saida'), 0) as resultado
from lancamentos_financeiros l
where l.status <> 'cancelado'
group by 1, 2;

create or replace view vw_contas_a_pagar as
select
  l.operacao_id,
  l.id,
  l.descricao,
  l.documento,
  l.valor,
  l.vencimento,
  l.status,
  f.razao_social as fornecedor,
  cf.nome        as categoria,
  case
    when l.status = 'pago'                       then 'pago'
    when l.vencimento <  current_date            then 'vencida'
    when l.vencimento =  current_date            then 'vence_hoje'
    when l.vencimento <= current_date + 7        then 'proximos_7_dias'
    else 'futura'
  end as faixa
from lancamentos_financeiros l
left join fornecedores          f  on f.id  = l.fornecedor_id
left join categorias_financeiras cf on cf.id = l.categoria_id
where l.tipo = 'saida'
  and l.status <> 'cancelado';

create or replace view vw_custo_folha as
select
  fp.operacao_id,
  fp.competencia,
  fu.setor,
  count(*)              as colaboradores,
  sum(fp.salario_base)  as salario_base,
  sum(fp.beneficios)    as beneficios,
  sum(fp.encargos)      as encargos,
  sum(fp.custo_total)   as custo_total
from folha_pagamento fp
join funcionarios fu on fu.id = fp.funcionario_id
group by 1, 2, 3;

-- ─────────────────────────────────────────────────────────────────────
--  Nota de desempenho
--
--  vw_vendas_dia e vw_vendas_semana são leves (a tabela base é pequena:
--  ~10 canais × 365 dias por ano). vw_anuncio_acumulado usa janelas sobre
--  toda a carteira — se passar de ~50 mil anúncios, troque por uma
--  materialized view atualizada após cada importação:
--
--    create materialized view mv_anuncio_acumulado as select * from vw_anuncio_acumulado;
--    create unique index on mv_anuncio_acumulado (anuncio_id);
--    refresh materialized view concurrently mv_anuncio_acumulado;
-- ─────────────────────────────────────────────────────────────────────
