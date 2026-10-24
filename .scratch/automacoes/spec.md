# Automações — o que o sistema pode mudar no Mercado Livre

Status: em construção
Operações: todas as que conectarem a aplicação de escrita. Hoje: Probel (duas
contas), Bom de Compras, Imprimil.

A aplicação de escrita (`mercado_livre_escrita`) pede **duas** permissões ao
canal: promoções e publicidade. "Publicação e sincronização" ficou de fora de
propósito — não dá para mudar preço de cadastro nem pausar anúncio por aqui, e
isso não vai mudar sem conversa.

O portão em `src/lib/meli/limite.ts` é o que decide o que sai. Nada chega ao
canal sem estar nessa lista.

## 1. O que dá para fazer — promoções

Tudo em `/seller-promotions`. Leitura já existe (`promocoes-canal.ts`); a
escrita é `POST`/`PUT`/`DELETE` em `/seller-promotions/items/{MLB}`.

### Leitura (já liberada)

| O quê | Chamada |
|---|---|
| Promoções vivas da conta | `GET /seller-promotions/users/{vendedor}?app_version=v2` |
| Itens de uma promoção | `GET /seller-promotions/promotions/{id}/items?promotion_type=…&app_version=v2` |
| Promoções de UM anúncio | `GET /seller-promotions/items/{MLB}?app_version=v2` |
| Detalhe da promoção | `GET /seller-promotions/promotions/{id}?promotion_type=…` |

Filtros dos itens: `status` (candidate / started / pending) e `status_item`
(active / paused). Paginação por `search_after`, limite 50, TTL de 5 minutos —
não dá para guardar o cursor e voltar depois.

### Escrita, por tipo de campanha

O corpo muda conforme quem define o preço. Três famílias:

**a) Nós definimos o preço** — o canal dá piso, teto e sugestão, e recusa com
`ERROR_CREDIBILITY_DISCOUNTED_PRICE` o que estiver fora.

| Tipo | Corpo do POST |
|---|---|
| `DEAL` (campanha tradicional) | `promotion_id`, `promotion_type`, `deal_price`, `top_deal_price` (opcional) |
| `SELLER_CAMPAIGN` | idem, `promotion_id` começa com `C-` |
| `PRICE_DISCOUNT` (desconto avulso) | `deal_price`, `start_date`, `finish_date`, `promotion_type` — sem `promotion_id` |

`top_deal_price` é o preço só para comprador Mercado Puntos nível 3 a 6.

**b) O canal define, a gente aceita** — não se manda preço, manda-se o
`offer_id` do candidato.

| Tipo | Corpo do POST |
|---|---|
| `MARKETPLACE_CAMPAIGN` (cofinanciada) | `promotion_id`, `promotion_type` |
| `SMART` / `PRICE_MATCHING` | `promotion_id`, `promotion_type`, `offer_id` |
| `PRE_NEGOTIATED` / `UNHEALTHY_STOCK` | `promotion_id`, `promotion_type`, `offer_id` |

`PRICE_MATCHING_MELI_ALL` não precisa de ação: é 100% do canal e entra sozinha.

**c) Aceitar com quantidade**

| Tipo | Corpo do POST |
|---|---|
| `SMART_LIGHTNING` | `promotion_id`, `promotion_type`, `offer_id`, `stock` (inteiro entre `stock.min` e `stock.max`) |
| `LIGHTNING` / `DOD` | `deal_price` + estoque; não aceitam PUT — para mudar, apaga e refaz |

**Sair**

- de uma campanha: `DELETE /seller-promotions/items/{MLB}?promotion_type=…&promotion_id=…[&offer_id=…]`
- de todas de uma vez: `DELETE /seller-promotions/items/{MLB}?app_version=v2` — devolve 200 com
  `successful_ids` e `errors`; DOD e LIGHTNING não saem por aqui.

**Mudar preço de item já dentro**: `PUT` com o mesmo corpo, em DEAL,
SELLER_CAMPAIGN (só `FLEXIBLE_PERCENTAGE`) e cofinanciada. Em
SELLER_CAMPAIGN já começada o preço **só pode melhorar**. Em cofinanciada não
dá: sai, muda o preço normal, entra de novo.

### O que o canal devolve por item, e que a tela precisa mostrar

```
status                     candidate | pending | started | finished
price                      o preço dentro da promoção
original_price             preço cheio
min_discounted_price       o mais barato que ele aceita  (= desconto máximo)
max_discounted_price       o mais caro que ele considera crível
suggested_discounted_price a sugestão dele, pode vir nula
meli_percentage            quanto o canal põe
seller_percentage          quanto nós pomos
offer_id / ref_id          o que identifica o candidato na hora de aceitar
stock {min,max}            só em relâmpago e oferta do dia
sub_type                   FLEXIBLE_PERCENTAGE, FIXED_AMOUNT, FIXED_PERCENTAGE
fixed_percentage           em cupom
boosted_offer + discount_meli_boosted_percentage   desconto extra do canal
```

### Leitura ao vivo de 23/10/2026 — o tamanho real do problema

36 promoções abertas nas quatro contas, 7.128 linhas de item somadas:

| Tipo | Quantas |
|---|---|
| SMART | 18 |
| DEAL | 4 |
| SELLER_COUPON_CAMPAIGN | 4 |
| LIGHTNING | 3 |
| UNHEALTHY_STOCK | 2 |
| PRE_NEGOTIATED | 2 |
| SELLER_CAMPAIGN | 2 |
| SMART_LIGHTNING | 1 |

Por conta: São Paulo 17, a prazo 10, Bom de Compras 8, Imprimil 2 (uma de 4
itens e uma de 27). Promoção com mais itens: 748 (SELLER_CAMPAIGN da conta a
prazo). Com menos: zero.

## 2. O que dá para fazer — publicidade

Já liberado no portão, com `api-version: 2`:

- `PUT /marketplace/advertising/{site}/advertisers/{id}/product_ads/campaigns/{campanha}`
  — orçamento diário, estratégia (`PROFITABILITY` / `INCREASE` / `VISIBILITY`),
  alvo e status.
- `PUT /marketplace/advertising/{site}/advertisers/{id}/product_ads/ads/{MLB}`
  — ligar e desligar o anúncio dentro da campanha.

`acos_target` virou `roas_target` em dezembro de 2025. **O corpo exato dos dois
PUT ainda precisa de uma conferência antes da primeira chamada de verdade** —
a documentação pública do lado de escrita está atrás de login.

A leitura já existe inteira em `src/lib/meli/ads.ts`: anunciante, campanhas,
anúncios e métricas (cliques, impressões, custo, CPC, ACOS, CVR, ROAS,
unidades diretas / indiretas / orgânicas), janela de 90 dias, número do dia só
fecha às 10h.

## 3. O que NÃO dá

- Mudar preço de cadastro ou pausar anúncio (`PUT /items/{id}`) — a aplicação
  não pede a permissão, morre dos dois lados.
- Criar campanha de Ads nova, criar cupom, criar campanha própria.
- Editar DOD e LIGHTNING: só apagar e refazer.
- Subir preço dentro de uma campanha já começada (SELLER_CAMPAIGN).
- Saber quantas vezes um cupom foi usado pela API de promoção — isso só sai do
  pedido (`pedidos.cupom`).

## 4. A tela

Rota `/automacoes`, grupo próprio no menu, duas abas: **Promoções** e **Ads**.

### Promoções

1. **Carrossel de cartões**, um por promoção, com a data em destaque e o prazo
   de aceite. No cartão: conta, tipo, janela, quantos itens aceitos de quantos
   candidatos, e um botão de aceitar tudo. Dá para ordenar e filtrar por data,
   conta, tipo e situação; dá para selecionar vários cartões e aceitar em lote.
2. **Ao abrir um cartão**, a tabela de produtos: o que o canal pede (preço,
   piso, sugestão, quanto cada lado põe), o nosso piso da Fórmula base, e a
   situação — aceito, candidato, agendado. Com opção de mudar antes de enviar.
3. **Aba "não aceitos"** dentro da promoção: só o que ficou de fora, com o
   motivo. Ali: aceitar na mão, arrastar valor para baixo como no Excel, e um
   campo de tolerância a mais — digita a folga, ele refaz a conta e aceita o
   que passar a caber.
4. **Publicar e sincronizar**, botão fixo no topo. Mostra o que vai ser
   enviado antes de enviar, e o resultado item a item depois.

### Ads

Mesma tela de Tráfego pago, recortada no Mercado Livre: gráfico por campanha e
por produto, filtro por situação, seleção em lote, aceitar a recomendação dos
selecionados ou de todos, e sincronizar.

### Regras da tela

Valem as de `docs/agents/telas.md`. As que mais pegam aqui:

- Telefone é o alvo, não a adaptação: o carrossel tem de funcionar com o dedo.
- Nada de parágrafo explicando o que o número diz.
- Zero, nulo e parcial são três coisas: `suggested_discounted_price` nula é
  "o canal não sugeriu", não "sugeriu zero".
- O motivo de um item não entrar cabe na própria célula.

## 5. Ordem de construção

Em `issues/`.
