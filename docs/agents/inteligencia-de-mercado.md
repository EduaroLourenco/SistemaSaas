# Inteligência de mercado — o manual do relatório

Este documento existe para o Eduardo não ter que repetir o pedido. Quando
ele disser "faz o relatório", é isto que vale: o que medir, com que janela
comparar, o que é crítico, como escrever e como desenhar.

Escrito em 28/09/2026, a partir de pesquisa em fontes brasileiras e
estrangeiras (lista no fim) e de sondagem direta na API do Mercado Livre —
o que a API **realmente** devolve, não o que a documentação promete.

---

## 1. As três regras que não se negociam

**Primeira: dado velho não vira relatório.** Antes de gerar, conferir a
última sincronização de cada fonte. Se algo estiver parado, avisar e
parar. Um relatório com número de cinco dias atrás apresentado como "hoje"
é pior que relatório nenhum, porque alguém decide em cima dele.

**Segunda: o que não existe não se inventa.** Visita existe no Mercado
Livre, nas duas contas. Não existe na Loja própria (VTEX) nem nos outros
canais. Então conversão é uma métrica do Mercado Livre, e onde ela não
existe o campo diz "sem medição", nunca zero. Mesma coisa para custo por
SKU, mídia do Google e qualquer campo vazio.

**Terceira: o relatório diz o que aconteceu, não o que fazer.** Ele mostra
que a conversão do PA85352 caiu de 2,1% para 0,4% e que o preço subiu 11%
no meio do período. Não afirma que um causou o outro. A seção de
planejamento estratégico pode propor caminho, e aí fica explícito que é
proposta — separada do raio-X.

---

## 2. A árvore da receita

Toda análise desce desta conta. É o que a literatura chama de *metric
tree*, e é o que transforma "a receita caiu" em "a receita caiu por isto".

```
Receita = Visitas × Conversão × Ticket médio
```

Quando a receita cai, só existem três culpados possíveis, e eles se
excluem:

| Caiu | Diagnóstico | Onde olhar |
|---|---|---|
| Visitas | Visibilidade | posição no catálogo, pausa de anúncio, fim de campanha, queda de Ads |
| Conversão | Oferta | preço contra concorrente, frete, estoque zerado, reputação |
| Ticket médio | Mix | mix migrou para produto barato, desconto maior, kit desfeito |

Num marketplace a conta precisa de um quarto termo, que é o que o vendedor
não controla: **a fatia de visitas do catálogo**. Dois anúncios idênticos
na mesma página de produto não recebem a mesma visita — quem ganha a página
recebe quase tudo. É por isso que a seção de catálogo vem antes da de
preço no relatório.

### O desdobramento por dimensão

A mesma árvore roda em cada corte, e o relatório precisa dos quatro:

1. **Operação inteira** — a soma de todos os canais.
2. **Canal** — Mercado Livre São Paulo, Mercado Livre a prazo, Loja
   própria, e os de planilha.
3. **Produto (SKU)** — e dentro dele, cada anúncio, porque o mesmo SKU tem
   Clássico e Premium com preço e tarifa diferentes.
4. **Categoria** — para ver se o problema é do produto ou da linha.

---

## 3. Janelas de comparação

O relatório é semanal, mas a leitura nunca é de uma semana só. Quatro
comparações, sempre as mesmas:

| Comparação | Para que serve |
|---|---|
| Semana atual × semana anterior | o que mudou agora |
| Semana atual × média das 4 semanas anteriores | separa mudança de ruído |
| Semana atual × mesma semana do ano passado | sazonalidade |
| Semana atual × **melhor semana dos últimos 12 meses** | o teto conhecido |

A quarta é a que o Eduardo pediu e é a mais útil: ela responde "o quanto
este produto já provou que consegue fazer". Média é o que costuma
acontecer; melhor cenário é o que é possível. A meta sai do segundo, não
do primeiro.

**Cuidados que a pesquisa em analytics de varejo aponta e que valem aqui:**

- **Dia da semana importa.** Segunda não se compara com sábado. Quando o
  período é parcial, comparar com o mesmo pedaço da semana anterior, e
  dizer na tela que é parcial.
- **Feriado anda de data.** Comparar evento com evento (Black Friday com
  Black Friday), não dia 27 com dia 27.
- **Dia incompleto nunca entra em média.** Ele aparece à parte, marcado.

---

## 4. O catálogo do Mercado Livre — o dado mais estratégico que não guardamos

Sondado na API em 28/09/2026 e funcionando: `GET /items/{id}/price_to_win?version=v2`.

O que ele devolve, com nome de campo:

| Campo | O que diz |
|---|---|
| `status` | `winning`, `sharing_first_place`, `losing`, `listed`, `not_listed` |
| `price_to_win` | o preço que faria o anúncio ganhar a página |
| `current_price` | o preço atual do anúncio |
| `visit_share` | a fatia de visita que a posição atual dá (`maximum` quando ganha) |
| `competitors_sharing_first_place` | quantos dividem a primeira posição |
| `boosts` | lista de alavancas: `fulfillment`, `free_installments`, `free_shipping`, `shipping_collect`, `same_day_shipping`, cada uma como `boosted` ou `opportunity` |
| `reason` | por que não está competindo (ex.: `item_not_opted_in`) |
| `winner` | o anúncio que está ganhando, com preço |

Medido numa amostra de 60 anúncios ativos de São Paulo: **5 ganhando, 0
perdendo, 55 fora do catálogo**. E `GET /users/{id}/items/search?tags=catalog_listing_eligible`
devolveu **12 anúncios elegíveis que não foram inscritos** — visita
disponível que ninguém está pegando.

Isto vira três medidas no relatório: **quantos ganham, quanto custa ganhar
(a diferença entre `current_price` e `price_to_win`), e quais alavancas
não-preço estão em aberto** — porque `boosts` mostra que às vezes o
caminho é Full ou frete no mesmo dia, não desconto.

---

## 5. Multicanal: a pergunta da canibalização

O Eduardo já observou o fenômeno: um canal cresce, o outro cai, e a soma
fica igual. A literatura de canal chama de efeito canibalização contra
efeito complementar, e o teste é sempre o mesmo — **a soma cresceu?**

Como medir, com o que temos:

1. **Por SKU, semana a semana, unidades por canal.** Se o canal A sobe
   X unidades e o B cai algo perto de X, a venda migrou.
2. **Cruzar com o preço visível de cada canal no mesmo dia.** Quando o
   canal que cresceu é o de preço menor, a migração tem explicação de
   preço. Sem esse cruzamento, é palpite.
3. **Olhar a soma e o mix de margem.** Migrar venda para o canal de tarifa
   maior reduz resultado mesmo com receita igual — é o cálculo de
   canibalização que a literatura de DTC recomenda: sobreposição × ticket
   × diferença de margem.

Três indicadores de multicanal que o relatório precisa mostrar:

- **Share por canal** (receita e unidades), semana a semana.
- **Receita incremental contra transferida**: quanto do crescimento de um
  canal veio de fora e quanto veio do outro canal.
- **Dispersão de preço do mesmo SKU entre canais**, com o desvio em reais e
  em porcentagem. É o gatilho da canibalização.

---

## 6. Estoque: cobertura é a métrica que salva receita

As fórmulas, na forma que a pesquisa de gestão de estoque consolida:

```
Cobertura em dias   = estoque atual ÷ venda média diária
Sell-through        = unidades vendidas ÷ unidades disponibilizadas × 100
Giro                = unidades vendidas no período ÷ estoque médio
```

**A armadilha que quase todo mundo cai:** calcular venda média incluindo os
dias em que o produto estava esgotado. O produto não vendeu porque não
tinha, e a média cai, e a cobertura parece maior do que é. A venda média
sai **só dos dias com estoque**.

Faixas de referência, a serem calibradas com o Eduardo:

| Cobertura | Leitura |
|---|---|
| 0 dias | ruptura — receita perdida agora |
| até 14 dias | crítico, repor imediato |
| 15 a 45 dias | saudável |
| 46 a 120 dias | lento |
| acima de 120 dias | parado, candidato a promoção ou kit |

A classificação cruzada **ABC × XYZ** é o padrão para operação com
sazonalidade: ABC por peso na receita, XYZ por previsibilidade da demanda.
Um item AZ — muita receita, demanda irregular — precisa de estoque de
segurança maior que um AX, e hoje os dois recebem o mesmo tratamento.

Prioridade absoluta do relatório: **item de curva A com cobertura abaixo de
14 dias, ou zerado.** Medido em 24/09/2026, São Paulo tinha 11 dos 38
anúncios de curva A com estoque zero, somando R$ 170 mil de receita em 90
dias. É o tipo de achado que precisa abrir o relatório.

---

## 7. Preço: melhor preço histórico e elasticidade

**Melhor preço** não é o menor nem o mais vendido em volume: é o preço com
maior **velocidade** de venda, unidades por dia no período em que aquele
preço vigorou. Comparar volume total favorece o preço que ficou mais tempo
no ar.

Regras de medição que já corrigimos na prática:

- Preço com **uma venda só** não mede velocidade. Só entra faixa com duas
  ou mais unidades; quando não houver, a tela avisa que a amostra é fraca.
- **Conversão no melhor preço** exige visita medida naquele período. O
  banco só tem visita por anúncio desde **06/08/2026**; antes disso, "sem
  medição". E abaixo de 30 visitas no período a conta não se sustenta (uma
  venda em duas visitas daria 50%).
- O **preço que interessa é o visível**, com campanha aplicada, não o de
  vitrine. Comparar vitrine antes e depois de campanha mostra zero
  variação e leva à conclusão errada — já aconteceu aqui.

Elasticidade fica como leitura simples, não como modelo: variação
percentual de unidades dividida pela variação percentual de preço, entre
dois períodos com preço diferente e estoque disponível nos dois. Acima de
1, o produto responde a preço; abaixo, não responde e o problema é outro.

---

## 8. Frete

Dados disponíveis por pedido, confirmados na sonda: `/shipments/{id}` traz
`logistic_type` (`cross_docking`, `fulfillment`, `self_service`),
`shipping_option.list_cost` e `cost`; `/shipments/{id}/costs` traz o que o
vendedor paga (`senders[].cost`) e o desconto dado ao comprador
(`receiver.discounts[].promoted_amount`).

Com isso dá para medir o que hoje ninguém mede:

- **Custo de frete por pedido e por canal**, e quanto o frete grátis
  consome da margem.
- **Frete grátis contra frete pago**: conversão e ticket de cada grupo.
- **Concentração geográfica**: `receiver_address.state`, que explica custo
  médio e prazo.

A pesquisa sobre limiar de frete grátis dá o parâmetro de leitura: subir o
limiar aumenta ticket e reduz conversão, e o ponto costuma ficar 20% a 30%
acima do ticket médio atual. Serve para decidir com número, não com
intuição.

---

## 9. Tráfego pago

**O que existe no banco hoje:**

- `anuncio_ads`: gasto, cliques, impressões, receita atribuída, por anúncio
  e por campanha — entra por **importação de planilha** do Meli.
- `vendas_diarias.investimento_ads`: um total por dia e por canal,
  **digitado** na tela de Lançamentos.

**O que a sonda mostrou:** a conta de São Paulo **tem anunciante ativo**
(`/advertising/advertisers?product_id=PADS` devolveu `advertiser_id
401425`). Ou seja, existe caminho de API — falta acertar a rota de
campanhas e métricas, que respondeu erro de parâmetro nas tentativas. A
documentação indica janela de 90 dias para trás e atualização às 10h.

**O que não existe em lugar nenhum:** Google Ads do site próprio. Sem
tabela, sem tela, sem campo.

Métricas a mostrar quando houver dado: investimento, CPC, CTR, ROAS,
participação da mídia na receita e **margem depois da mídia por anúncio** —
que é a única que responde se o Ads se paga. Nos dados já medidos aqui,
quatro anúncios gastavam mais mídia do que a margem que produziam.

---

## 10. Meta e GAP de meta

O relatório precisa responder onde está a receita que falta, e de que
alavanca ela pode vir. A decomposição é a árvore da receita aplicada ao
gap:

```
Gap = Meta − Realizado

Gap por visita      = (visitas necessárias − visitas atuais) × conversão × ticket
Gap por conversão   = visitas × (conversão alvo − conversão atual) × ticket
Gap por ticket      = visitas × conversão × (ticket alvo − ticket atual)
```

O valor de **conversão alvo** não é chute: é a **melhor conversão daquele
produto nos últimos 12 meses**. Se o PA69847 já converteu 2,6% e hoje faz
0,34%, o alvo existe e já foi atingido antes — a receita que falta tem
endereço.

As alavancas, na ordem em que costumam ser mais baratas de acionar:

1. **Recuperar posição de catálogo** — visita sem gastar mídia.
2. **Repor curva A esgotada** — a venda já existe, falta produto.
3. **Voltar ao melhor preço** onde a fórmula permite.
4. **Kit e combo** para subir ticket — a literatura de AOV aponta ganho de
   9% a 10% com limiar de frete e itens complementares, sem tocar em
   conversão. Aqui cabe colchão mais travesseiro, colchão mais protetor,
   conjunto box.
5. **Mídia** — a mais caro por real de receita, e a última da fila.

---

## 11. Parâmetros de alerta

Rascunho a calibrar com o Eduardo. O relatório precisa de faixa fixa, ou
cada semana muda de régua.

| Métrica | Atenção | Crítico |
|---|---|---|
| Cobertura de estoque (curva A) | até 21 dias | até 14 dias ou zerado |
| Queda de conversão contra 4 semanas | −20% | −40% |
| Queda de visitas contra 4 semanas | −20% | −40% |
| Preço acima do melhor preço histórico | +10% | +25% |
| Preço abaixo do mínimo da Fórmula base | qualquer | qualquer, com venda |
| Cancelamento por canal | acima de 5% | acima de 10% |
| Catálogo | compartilhando primeiro lugar | perdendo, com elegibilidade |
| Margem depois da mídia | abaixo de 5% | negativa |
| Dias sem venda (curva A) | 7 dias | 14 dias |

Referência externa para conversão, que serve de contexto e não de meta: a
média do e-commerce brasileiro fica em torno de 1,65%, com mediana por
setor variando muito, e casa e decoração entre as mais baixas. Comparar
com a mediana do setor, nunca com a média geral.

---

## 12. Como escrever

O relatório vai para diretoria. Se o texto tiver cara de IA, o conteúdo
perde autoridade. Os vícios que a pesquisa sobre escrita de IA aponta, e
que ficam proibidos aqui:

**Proibido:**

- Abertura de rodeio: "é importante notar", "vale mencionar", "no cenário
  atual", "em um mundo cada vez mais".
- Hesitação: "pode ser que", "tende a", "geralmente", "em muitos casos" —
  quando o dado é claro, afirme o dado.
- Três adjetivos em fila e paralelismo decorativo.
- Título com dois-pontos explicando o título.
- Conclusão que repete a introdução.
- Entusiasmo genérico: "excelente oportunidade", "resultados robustos".
- Travessão no meio da frase como muleta de ritmo.

**Obrigatório:**

- Número na frente: "11 anúncios de curva A sem estoque" e não "há
  anúncios sem estoque".
- Frase curta, verbo direto, sujeito concreto.
- Comparação explícita: contra o quê e em que período.
- Quando falta dado, dizer que falta e o que falta.
- Tamanho de frase irregular. Texto de IA tem ritmo métrico; gente não.

**Teste antes de publicar:** ler em voz alta. Se soar como apresentação de
consultoria genérica, reescrever.

---

## 13. Como desenhar

A pesquisa de dashboard executivo e o padrão IBCS convergem em poucas
regras, e elas resolvem a reclamação do Eduardo sobre cor escura e
contraste agressivo.

**Cor**

- Fundo claro, texto escuro. Cinza de base com viés levíssimo da cor de
  acento, não cinza puro.
- **Uma** cor de destaque. Cor é sinal, não decoração.
- Semântica separada do acento: verde para bom, âmbar para atenção,
  vermelho para crítico — e nunca verde contra vermelho como única
  distinção, por causa de daltonismo. Par azul e laranja é o seguro.
- Contraste mínimo de 4,5:1 para texto corrido, 3:1 para texto grande.
- No máximo oito a doze cores categóricas em toda a página.

**Gráfico**

| Pergunta | Gráfico |
|---|---|
| comparar categorias | barra horizontal, ordenada |
| evolução no tempo | linha |
| composição no tempo | área empilhada |
| parte do todo, poucas fatias | barra 100% empilhada, não pizza |
| duas variáveis | dispersão |
| valor contra meta | barra com marcador de meta (bullet) |
| variação entre dois períodos | cascata |

Pizza só com duas ou três fatias, e mesmo aí a barra costuma ser melhor:
o olho compara comprimento bem e ângulo mal.

**Layout**

- A pergunta antes do gráfico. Título que afirma o achado, não que nomeia
  o eixo: "Conversão caiu 40% em 6 dos 12 SKUs de curva A" e não
  "Conversão por SKU".
- Número grande só para o que decide. Painel de dez números grandes não
  tem hierarquia.
- Tabela densa é boa: diretoria lê tabela. O que não pode é tabela sem
  ordenação e sem destaque do que importa.
- Cada bloco abre detalhe em clique. A página começa fechada, resumida, e
  se abre por escolha de quem lê.

---

## 14. Estrutura da página

Ordem fixa, sempre a mesma, para virar hábito de leitura:

1. **Estado dos dados** — até quando cada fonte vai, quando sincronizou.
   Fica no topo porque muda a confiança em tudo abaixo.
2. **Prioridades da semana** — duas abas: *resolve nesta semana* e
   *prioridade que leva tempo*. Cada item com o número que o justifica.
3. **Operação** — receita, pedidos, ticket, cancelamento, share por canal,
   com as quatro comparações.
4. **Por loja** — entrada em cada canal, com a mesma estrutura por dentro.
5. **Produtos** — curva A e B, catálogo, preço contra melhor preço e
   contra mínimo, cobertura de estoque, conversão.
6. **Multicanal** — dispersão de preço do mesmo SKU, migração de venda
   entre canais.
7. **Tráfego** — pago e orgânico, quando houver dado.
8. **Planejamento estratégico** — gap de meta decomposto e as alavancas,
   marcado como proposta.
9. **Pendências** — card fechado, com tudo que falta para a análise ficar
   completa.

Cada interpretação tem **ícone de lápis**: o Eduardo edita o texto, salva,
e passa a ser a versão dele. Gravado na tabela `anotacoes`, que já existe,
com `entidade = 'relatorio'` e `entidade_id = '<seção>:<período>'`.

Na seção de planejamento estratégico entra também um **bloco de notas
livre**, grande, no centro: campo em branco com botão de editar, onde o
Eduardo escreve o que quiser — leitura dele, recado para a equipe,
decisão tomada na reunião. Sem formato imposto, sem texto sugerido por
mim. É o espaço dele na página, e sobrevive de uma semana para a outra
porque fica no banco como as outras anotações.

---

## 15. Fontes

**Métrica de marketplace e e-commerce**

1. ChannelEngine — Top marketplace KPIs to track in 2026
2. Origami — Marketplace KPIs: the essential guide
3. Saras Analytics — Amazon KPI guide
4. Novadata — Amazon seller KPI benchmarks: 30 metrics by category
5. DigitalApplied — eCommerce analytics: KPIs and dashboard guide
6. KPITree — Metric trees for e-commerce: decompose revenue into levers
7. Niblin — Why did my revenue drop: diagnostic framework
8. Mida — AOV, CR, RPV and GMV explained

**Brasil**

9. Mercado Livre — Central de vendedores, seção de métricas de negócio
10. Nubimetrics Academia — análise de dados e reputação no Mercado Livre
11. JoomPulse — KPIs do Mercado Livre e performance no marketplace
12. Nuvemshop — taxa de conversão e NuvemCommerce
13. OnClick — conversão e checkout no e-commerce brasileiro
14. Babi Tonhela — taxa de conversão média do e-commerce brasileiro
15. Sankhya, TOTVS, DomTec — curva ABC e ABC×XYZ de estoque

**Multicanal e preço**

16. Endless Commerce — when your channels start cannibalizing each other
17. ScienceDirect — does the online direct channel cannibalize or
    synergize the retail network
18. Bollinger (Duke) — demand expansion and cannibalization effects
19. Mimbi — overcoming channel cannibalization
20. 42Signals e Practical Ecommerce — price elasticity em e-commerce
21. arXiv 2106.08274 — elasticity based demand forecasting and price
    optimization for online retail

**Estoque e frete**

22. Inventory Planner, Toolio, Uphance — weeks of supply e days of cover
23. EasySel — days of stock cover: formula, interpretation and traps
24. Intelligems — is your free shipping threshold hurting conversion
25. DigitalApplied — free shipping threshold strategy

**Comparação de período**

26. AtScale — retail week 53 calendar challenge
27. Toolio — retail calendar 4-5-4
28. Adobe Commerce — yearly, monthly and weekly reports
29. Kissmetrics — seasonal analytics for retail

**Desenho e escrita**

30. Zebra BI — IBCS standards
31. Carbon Design System — color palettes and accessibility for data viz
32. UXPin e DataCamp — dashboard design principles
33. Excel Campus e Eval Academy — quando usar e quando evitar pizza
34. Hunting the Muse — how to spot when writing is AI
35. Sean Kernan e Robert Hiett — sinais de texto escrito por ChatGPT

**API do Mercado Livre** (sondada em 28/09/2026, não só lida)

36. `/items/{id}/price_to_win?version=v2` — catálogo, boosts, visit_share
37. `/users/{id}` — reputação, reclamações, cancelamento em 60 dias
38. `/users/{id}/items_visits` e `/items_visits/time_window` — visita da conta
39. `/shipments/{id}` e `/shipments/{id}/costs` — custo real de frete
40. `/advertising/advertisers?product_id=PADS` — anunciante de Product Ads
41. `/questions/search?status=UNANSWERED` — perguntas sem resposta
42. `/users/{id}/items/search?tags=catalog_listing_eligible` — elegíveis fora do catálogo
