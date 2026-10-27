# Anúncios: painel de inteligência (raio-x por SKU)

Status: proposta, antes de codar
Depende de: `.scratch/automacoes/` — a aba de Automações é a fonte das
promoções ao vivo que o drawer mostra.

## O que já existe e não vai ser reescrito

A varredura das rotas, que o briefing pede como passo 1. Quase todo o dado
do raio-x já tem carregador:

| O que o briefing pede | Onde já está |
|---|---|
| Vendas, visitas, receita por semana | `lib/dados/analise.ts`, `anuncio_desempenho_semanal` |
| Evolução semana a semana de UM anúncio | `lib/dados/evolucao-anuncio.ts` |
| Preço praticado dia a dia | `anuncio_estoque_diario`, `lib/dados/precos-praticados.ts` |
| Catálogo: quem ganha, preço para ganhar, fatia | `lib/dados/disputa-catalogo.ts`, `anuncio_catalogo_diario` |
| Ads por anúncio (PADS) | `lib/dados/trafego-pago.ts`, `anuncio_ads` |
| Comissão negociada / tarifa cobrada | `lib/dados/tarifa-cobrada.ts` |
| Preço de tabela por faixa | `lib/dados/formula-base.ts` |
| Promoções ao vivo e programadas | `lib/meli/promocoes-canal.ts` (`GET /seller-promotions/items/{MLB}`) |
| Vendas por SKU com recorte de canal | `lib/dados/analise-sku.ts` |

O que **não** existe ainda:

- **Recorde histórico do SKU e o preço no pico.** Derivável de
  `pedido_itens` + `anuncio_estoque_diario`, mas não há função. Entra como
  `lib/dados/recorde-sku.ts`.
- **Estoque Full vs Local.** `anuncios.logistica` separa `fulfillment` (45
  anúncios) do resto, e `anuncios.estoque` é o saldo do anúncio. O que
  falta é a quantidade POR depósito — `estoque_saldos` só tem Bling, e
  nenhuma linha da Probel. Enquanto não houver, o card mostra o saldo do
  anúncio e diz a logística; não inventa uma divisão que o dado não tem.
- **Alerta de ruptura pelo giro.** Conta simples (saldo ÷ média diária das
  últimas 4 semanas), mas precisa ser escrita.

## Estrutura de componentes

Rota `/anuncios/analise` reconstruída. Servidor carrega só a listagem; o
drawer busca o SKU sob demanda.

```
app/anuncios/analise/
  page.tsx                     server: lista + filtros, nada do drawer
  analise-cliente.tsx          casca: header fixo, troca de visão, estado dos filtros
  visao-cards.tsx              Visão A — grade de cards
  visao-tabela.tsx             Visão B — tabela BI
  drawer/
    drawer-sku.tsx             a casca do painel (side no desktop, bottom sheet no telefone)
    bloco-metricas.tsx         A — preço atual, atual vs anterior, vs recorde
    bloco-graficos.tsx         B — preço × volume, visitas × conversão
    bloco-promocoes.tsx        C — promoção ativa + timeline das programadas
    bloco-estoque.tsx          D — saldo, logística, ruptura pelo giro
    bloco-catalogo.tsx         E — vencedor do catálogo e os anúncios irmãos

components/anuncios/
  sparkline.tsx                mini-série para o card; sem biblioteca
  variacao.tsx                 o ± percentual, com a cor e o sinal
  cartao-sku.tsx
  tabela-bi.tsx                ordenação, busca, paginação, primeira coluna fixa

app/api/anuncios/sku/[sku]/route.ts
                               o fetch do drawer: tudo de um SKU numa resposta
lib/dados/raio-x-sku.ts        monta essa resposta
lib/dados/recorde-sku.ts       recorde histórico e preço no pico
```

### Por que o drawer tem rota própria

A listagem são ~1.000 anúncios; o raio-x são sete consultas por SKU, uma
delas na API do canal. Carregar tudo junto trava a página e gasta cota do
Meli em anúncio que ninguém vai abrir. A rota por SKU resolve os dois: o
drawer abre com esqueleto e preenche quando a resposta chega.

### O que o drawer NÃO busca na hora

A promoção ao vivo é a única chamada externa, e ela tem cota. Vai com
cache curto (60s) por MLB, e com estado vazio honesto quando falhar — a
tela diz "não consegui ler as promoções agora", não "sem promoções".

## Ordem

1. **Terminar Automações** (`.scratch/automacoes/`), porque é dela que sai
   a leitura de promoções que o bloco C usa. Publicar com a escrita
   desligada — a primeira chamada de verdade é com o Eduardo junto.
2. `lib/dados/raio-x-sku.ts` + a rota por SKU, com teste.
3. O drawer e seus cinco blocos.
4. As duas visões (cards e tabela BI) e o header fixo.
5. Sparklines e variação.

## Decisões que seguem as regras de `docs/agents/telas.md`

- Telefone não é adaptação: o drawer é bottom sheet, a tabela rola dentro
  do próprio quadro com a primeira coluna fixa.
- Nenhuma frase explica o que o número já diz. A procedência é sufixo
  curto: `leitura de 27/10`, `últimas 4 semanas`.
- Zero, nulo e parcial são três coisas. SKU sem leitura de catálogo mostra
  o motivo na própria célula, não um quadro de aviso.
- Nada de dois eixos no mesmo gráfico: preço × volume e visitas ×
  conversão são dois gráficos, ou as duas séries indexadas a 100.
