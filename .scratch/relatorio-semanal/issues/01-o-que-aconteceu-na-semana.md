# 01 — O que aconteceu na semana, ao lado do número

Status: stand-by — pedido em 19/10/2026, a implementar depois

No painel semanal, trazer os ACONTECIMENTOS da semana junto com o dado, para
que o número venha explicado em vez de ser interpretado de cabeça. Hoje a tela
mostra que a receita caiu e deixa a causa para quem está lendo.

## O que já existe (não refazer)

- **Campanhas do Planejamento**: `carregarTermometro` já lê `planejamento_itens`
  que cobrem as duas semanas e marca `onde: "esta semana" | "semana anterior" |
  "as duas"`, e já dispara o ponto de atenção "a campanha que estava no ar
  terminou".
- **Catálogo semana contra semana**: `src/lib/dados/catalogo-semana.ts`, no
  termômetro desde 19/10/2026 — ganhando/disputando no último dia medido de cada
  fatia, com a lista nominal de quem saiu e de quem entrou na vitrine.
- **Reputação com o lado de lá**: cada taxa mostra o valor da semana anterior, e
  piora de envios vira ponto de atenção.

## O que falta

Os acontecimentos que ainda não têm origem no sistema:

1. **Mudança de preço** — a vitrine é medida todo dia em `anuncio_estoque_diario`.
   Uma variação relevante entre as duas semanas é um acontecimento, e hoje não
   aparece em lugar nenhum da leitura semanal.
2. **Anúncio pausado, reativado ou publicado** — `anuncios.status` não tem
   histórico. Precisa de uma coluna de data ou de uma tabela de mudanças antes de
   virar linha do tempo.
3. **Ruptura de estoque** — o canal devolve número alto para "sob encomenda", então
   a regra precisa separar zero real de sem controle.
4. **Anotação à mão** — o acontecimento que o sistema não tem como medir (greve da
   transportadora, problema na fábrica, ação do concorrente). Uma nota por data,
   por conta, que aparece na semana a que pertence.

A forma sugerida é uma **linha do tempo da semana**: uma lista por data, com as
campanhas, as viradas de catálogo, a reputação e as anotações no mesmo eixo do
gráfico de dia a dia, para a queda de uma quarta-feira encostar no que aconteceu
naquela quarta.

## Verificação

Semana sem nenhum acontecimento mostra a linha do tempo vazia com o motivo, nunca
inventa evento. Acontecimento de uma conta não vaza para a outra no filtro por
conta. Semana sem coleta continua aparecendo vazia, não como zero.

## Comments

- 19/10/2026: pedido do Eduardo junto da entrega do catálogo semana a semana —
  "no painel semanal, tem q trazer as coisas que aconteceram na semana, além do
  dado, para poder explicar, mas isso é uma melhoria a parte, deixe guardada em
  stand-by".
- 19/10/2026: fica pendente também levar a coluna Catálogo de Produtos e preços
  para os demais relatórios exportados; hoje ela sai na tela, no CSV e no Excel
  de Produtos e preços.
