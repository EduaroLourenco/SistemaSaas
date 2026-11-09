# Precificação por canal, cotação e margem de contribuição

Pedido do Eduardo em 09/11/2026. Empresas que puxam do ERP (Bling): Imprimil,
Bom de Compras e Chopeiras Memo.

## O que ele quer, em uma linha cada

1. **Produto vem do ERP**: custo, peso e medidas sem digitar.
2. **Custo do canal vem pronto**: comissão, taxa fixa, frete e programas de
   cada canal pré-configurados. Onde existe API (Mercado Livre), a API dá o
   número. O usuário só digita o que é dele: custo, imposto médio e embalagem.
3. **Cotação de produto novo**: digita custo e medidas e já vê o frete e o
   preço certo em cada canal.
4. **Preço para a margem desejada**, por canal.
5. **Valor a receber correto, sempre.** Nunca derivar do preço de venda vezes
   alíquota quando o canal informa o valor. Exemplo dele: promoção da Imprimil
   aceita até 5% abaixo do mínimo, mas o desconto é bancado em parte pelo
   canal. O preço de vitrine cai e o recebido não cai junto.
6. **Calculadora de contribuição**: escolhe produtos e quantidades e vê
   receita, lucro e margem de contribuição, estimado e realizado (histórico).
   Inclui o percentual de marketing (TACoS).

## O que já existe e será reaproveitado

| Peça | Onde | Serve para |
|---|---|---|
| Custo, embalagem, alíquota, peso e medidas por produto | `produtos` (colunas já existem: `altura_cm`, `largura_cm`, `comprimento_cm`) | a parte que o usuário digita |
| Preço que fecha a margem | `src/lib/dados/formula-preco.ts` (com teste) | P = custos ÷ (1 − comissão − imposto − margem) |
| Margem real por pedido | `src/lib/dados/margem.ts` | o "realizado" da calculadora |
| Comissão por canal e tipo, com vigência | `comissoes_canal` + `/api/comissoes-canal` | regra do canal |
| Frete por faixa de peso, com vigência | `faixas_frete` | regra de frete sem API |
| Tela de custos e de preço-alvo | `/financeiro/custos`, `/anuncios/preco-alvo` | base visual e de dados |
| Cliente Bling (leitura) | `src/lib/bling/` | hoje só puxa pedido |

## O que falta (medido no banco em 09/11)

- **Valor a receber não existe nos pedidos de API.** `liquido_recebido` está
  preenchido em 0 de 104 pedidos da Imprimil, 0 de 366 da Bom de Compras e
  0 de 562 da Memo (outubro em diante). Só vem da planilha da Vtrina.
- **Regra de canal não está cadastrada.** `comissoes_canal` tem 2 linhas;
  `faixas_frete` tem 0.
- **Medidas zeradas.** Nenhum produto das 4 empresas tem altura, largura ou
  comprimento. Peso existe em parte.
- **Custo:** Memo 0 de 203, BdC 77 de 201, Imprimil 10 de 55. Imposto: Imprimil
  e Memo sem alíquota.
- **Memo vende R$ 1,26 mi no Meli via Bling**, sem comissão nem frete no pedido:
  a conta do Meli dela não está conectada por API.
- Já corrigido em 09/11: a comissão de pedido com mais de uma unidade gravava
  só uma unidade (`sale_fee` é por unidade).

## Como cada número vai ser obtido

### Mercado Livre (API)

| Número | Fonte | Observação |
|---|---|---|
| Comissão + taxa fixa para um preço | `GET /sites/MLB/listing_prices?price&listing_type_id&category_id` | devolve o valor em reais e o detalhe percentual/fixo |
| Frete do vendedor para um anúncio | `GET /users/{id}/shipping_options/free?item_id=` | custo do frete grátis que o vendedor banca |
| Frete de produto novo (cotação) | `GET /users/{id}/shipping_options/free?dimensions=AxLxC,peso&item_price&listing_type_id&mode=me2&logistic_type&free_shipping=true` | só com `dimensions` vem `list_cost=0`; precisa de preço e tipo junto |
| Valor a receber de um pedido | pedido: `unit_price × qtd − sale_fee × qtd − custo de envio do vendedor`; conferir contra `details` (cupons e descontos com `funding_mode`) e contra o relatório de faturamento | fórmula da página "Provisões" do Meli |
| Frete aplicado de fato | `GET /shipments/{id}/costs` | o que foi cobrado do vendedor |

Regra de 2026 (blogs, conferir): desde 02/03/2026, abaixo de R$ 79 em
Coleta, Agência e Full **não há mais taxa fixa**, e sim custo de envio por
peso e preço (R$ 5,65 a R$ 8,75 até 2 kg). No Flex e no envio próprio
continua a taxa fixa. Os pedidos da Imprimil batem com isso: comissão de
11,5% exatos e frete do vendedor de R$ 6,85.

### Canais sem API (tabela pré-configurada, editável, com vigência)

Valores de partida para conferir no painel de cada canal. Fontes divergem.

| Canal | Comissão | Taxa fixa | Frete / programa |
|---|---|---|---|
| Shopee | 20% até R$ 79,99; 14% acima | R$ 4,50 até R$ 79,99; R$ 16 a R$ 26 acima | Frete Grátis obrigatório desde 03/2026 |
| TikTok Shop | 10% até R$ 49,99; 6% acima | R$ 4 até R$ 49,99; R$ 6 acima | programa de envio +6%, teto R$ 50 |
| Magalu | ~18% (10% a 19% por categoria) | R$ 5,00 (R$ 5,50 em algumas) | vendedor paga parte do frete acima de R$ 79 |
| Amazon | 10% a 15% por categoria | mínimo R$ 1 a R$ 2 | DBA à parte |
| Casas Bahia | 18,5% a 21% | — | — |

Frete sem API: peso cobrado = maior entre o peso real e o cúbico
(A × L × C ÷ 6.000), aplicado na faixa do canal.

### Valor a receber: a regra que não se negocia

- **Realizado:** vem do canal (pedido, faturamento ou relatório). Se o canal
  não informar, a linha diz "sem valor do canal". Não reconstrói.
- **Estimado (cotação e preço-alvo):** preço − comissão − taxa fixa − frete
  do vendedor − parte do vendedor no desconto. Em campanha co-participada,
  entra a parte do vendedor (`seller_percentage`), não o desconto inteiro.
- As duas aparecem lado a lado. A diferença é o achado, como já é a regra de
  tabela × praticado em `custos.ts`.

## Telas

1. **Precificação** (produto × canal): custo total, preço atual, valor a
   receber, margem; preço sugerido para a margem desejada. Filtro de empresa e
   canal no topo. Detalhe da decomposição atrás de um clique.
2. **Cotação de produto novo**: custo, embalagem, peso e medidas → frete,
   valor a receber e preço para a margem em cada canal, numa olhada.
3. **Contribuição**: escolhe produtos e quantidades (ou parte do mix dos
   últimos 30 dias) e um TACoS; mostra receita, margem de contribuição em R$
   e %, estimado contra realizado.
4. **Regras dos canais**: a tabela acima, editável, com vigência. Mercado Livre
   aparece como "da API".

## Fases

1. Valor a receber nos pedidos do Meli (API) + taxa e frete do Meli por API.
2. Regras dos canais pré-configuradas (semente com a tabela acima).
3. Tela de precificação e de cotação.
4. Calculadora de contribuição.
5. Produto do Bling: custo, peso e medidas.

## Em aberto (decisão do Eduardo)

- Margem desejada: uma por empresa, por produto ou por canal?
- TACoS de partida por canal (hoje só o Meli tem Ads medido).
- Conta do Meli da Memo: conectar por API? Sem isso, o valor a receber dela
  fica sem fonte.
