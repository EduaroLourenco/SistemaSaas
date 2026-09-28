# O que o relatório precisa e o banco ainda não tem

Levantado em 28/09/2026, cruzando o manual de inteligência de mercado
(`docs/agents/inteligencia-de-mercado.md`) com as tabelas reais e com o
que a API do Mercado Livre devolve na sonda de hoje.

Três colunas de decisão: **já dá**, **a API dá e não guardamos**, **não
existe em lugar nenhum**.

---

## 1. Já dá para calcular hoje

| Análise | De onde sai |
|---|---|
| Receita, pedidos, ticket, cancelamento por canal e dia | `vendas_diarias`, `pedidos` |
| Curva ABC por receita | `pedido_itens` + `pedidos` |
| Preço de vitrine e preço visível | API, e `anuncios.preco_atual` |
| Melhor preço histórico e velocidade | `pedido_itens` (preço unitário e data) |
| Preço mínimo e faixa por comissão | `formula_base_precos` |
| Visitas e conversão por anúncio | `anuncio_desempenho_diario` (só Mercado Livre, desde 06/08/2026) |
| Estoque atual | API (`available_quantity`) |
| Comissão praticada por pedido | `pedidos.comissao` |
| Frete cobrado e frete do vendedor | `pedidos.frete`, `frete_vendedor` |
| Gap de meta por canal e mês | `metas` |
| Custo de mídia por anúncio | `anuncio_ads` (por importação) |

---

## 2. A API do Mercado Livre devolve e o banco não guarda

Tudo abaixo foi confirmado na sonda de 28/09/2026 com a conta de São
Paulo. É o que precisa de tabela nova ou coluna nova.

### 2.1 Catálogo — a mais importante

Rota: `GET /items/{id}/price_to_win?version=v2`

**Tabela nova sugerida: `anuncio_catalogo_diario`**

| Coluna | Origem |
|---|---|
| `anuncio_id`, `data` | chave |
| `status` | `winning` / `sharing_first_place` / `losing` / `listed` / `not_listed` |
| `preco_atual` | `current_price` |
| `preco_para_ganhar` | `price_to_win` |
| `fatia_visita` | `visit_share` |
| `dividindo_primeiro` | `competitors_sharing_first_place` |
| `motivo` | `reason[]` |
| `vencedor_externo`, `vencedor_preco` | `winner.item_id`, `winner.price` |
| `catalogo_produto_id` | `catalog_product_id` |
| `boosts` | jsonb: `fulfillment`, `free_installments`, `free_shipping`, `shipping_collect`, `same_day_shipping`, cada um `boosted` ou `opportunity` |
| `elegivel` | da tag `catalog_listing_eligible` |

Medido hoje: de 60 anúncios ativos, 5 ganhando e 55 fora do catálogo; e
12 anúncios elegíveis **sem inscrição**.

### 2.2 Reputação e qualidade da conta

Rota: `GET /users/{id}` → `seller_reputation`

**Tabela nova: `conta_reputacao_diaria`** — `nivel` (`5_green`),
`power_seller` (`silver`), `reclamacoes_taxa`, `cancelamentos_taxa`,
`atraso_envio_taxa`, `vendas_60d`, `negativas_pct`, `neutras_pct`.

Hoje: nível 5_green, silver, 0,46% de reclamação em 60 dias.

### 2.3 Frete de verdade, por pedido

Rotas: `GET /shipments/{id}` e `/shipments/{id}/costs`

**Colunas novas em `pedidos`** (ou tabela `pedido_frete`):
`logistica` (`cross_docking`, `fulfillment`, `self_service`),
`frete_lista` (`list_cost`), `frete_pago_comprador` (`cost`),
`frete_custo_vendedor` (`senders[].cost`),
`subsidio_frete` (`receiver.discounts[].promoted_amount`),
`uf_destino`.

Exemplo real de hoje: pedido de R$ 100,46 com frete de lista R$ 29,15,
comprador pagou R$ 0 e o desconto promovido foi R$ 42,80.

### 2.4 Visitas da conta inteira

Rotas: `GET /users/{id}/items_visits?date_from=&date_to=` e
`/items_visits/time_window?last=&unit=day`

**Coluna `visitas` de `vendas_diarias` já existe** — falta alimentar com
isto, que é a visita da conta, não a soma dos anúncios sincronizados. Em
setembro: 17.196 visitas na conta de São Paulo.

### 2.5 Perguntas sem resposta

Rota: `GET /questions/search?seller_id=&status=UNANSWERED`

Duas em aberto agora. Entra como indicador de atendimento no relatório.

### 2.6 Anúncios pausados

Rota: `GET /users/{id}/items/search?status=paused`

**150 anúncios pausados** em São Paulo. Hoje o banco guarda `status` do
anúncio, mas ninguém olha a série — quantos pausaram nesta semana é sinal
de ruptura ou de decisão.

### 2.7 Product Ads por API

`GET /advertising/advertisers?product_id=PADS` respondeu com anunciante
ativo (`advertiser_id 401425`). As rotas de campanha e métrica ainda
precisam do caminho certo — as tentativas de hoje devolveram erro de
parâmetro. Quando fechar, substitui a importação de planilha em
`anuncio_ads` e abre CPC, CTR e ROAS por dia.

---

## 3. Não existe em lugar nenhum

| O que | Onde deveria estar | Quem preenche |
|---|---|---|
| **Google Ads do site** | tabela nova `midia_externa` (data, canal, campanha, investimento, cliques, impressões, receita) e tela de lançamento | Eduardo, por digitação ou API do Google |
| **Visita da Loja própria (VTEX)** | `vendas_diarias.visitas` da conta VTEX | integração nova (VTEX Analytics ou GA4) |
| **Custo por SKU** | `produtos.custo_unitario`, `embalagem`, `aliquota_impostos` — as colunas existem e estão **vazias nos 142 produtos** | Eduardo |
| **Anotação do relatório** | tabela nova `relatorio_anotacoes` (organizacao, secao, periodo, texto, autor, atualizado_em) — é o que salva o texto editado no lápis | o próprio sistema |
| **Classificação XYZ** | coluna nova em `produtos` ou calculada | calculada |
| **Meta por produto** | `metas` só tem canal, ano e mês | Eduardo, se quiser gap por SKU |
| **Lead time do fornecedor** | coluna nova em `produtos` | Eduardo — sem ele, cobertura de estoque não vira data de pedido |

---

## 4. Ordem sugerida de construção

1. `relatorio_anotacoes` — sem ela o lápis não salva.
2. `anuncio_catalogo_diario` + coleta na sincronização — é o dado mais
   estratégico que hoje é jogado fora.
3. Frete por pedido — destrava margem real e a análise de frete grátis.
4. Visita da conta em `vendas_diarias`.
5. `conta_reputacao_diaria`.
6. `midia_externa` + tela para o Google Ads.
7. Product Ads por API, quando a rota estiver fechada.
8. Lead time e XYZ.

---

## 5. Pendências que dependem do Eduardo

| O quê | Efeito de não fazer |
|---|---|
| Rodar `db/18`, `db/19` e `db/20` | Promoções falham; sincronização não se sustenta sozinha; cadastro de cliente não funciona |
| Criar aplicação no Mercado Livre e pôr as variáveis na Vercel | A sincronização continua manual, feita do meu computador |
| Preencher custo, embalagem e imposto (começando pela curva A) | Margem e resultado ficam sem cobertura; o relatório não fala de lucro |
| Conectar visita da VTEX | Loja própria fica sem conversão no relatório |
| Lançar mídia do Google | Seção de tráfego pago fica parcial |
| Definir as faixas de alerta | Uso as do rascunho do manual |
