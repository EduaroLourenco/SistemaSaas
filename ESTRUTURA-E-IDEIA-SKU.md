# Como o sistema funciona, e como encaixar a ideia nova

Documento de estrutura. Nada aqui foi executado — é para você ler, discordar
e decidir antes de qualquer código.

---

# PARTE 1 — O QUE EXISTE HOJE

## 1.1 As três camadas

O sistema tem três camadas, e vale entender a do meio porque é ela que
torna a migração para o banco barata:

```
  TELAS (26)              src/app/**/page.tsx
       |
  CAMADA DE DADOS         src/lib/dados/*.ts      <-- a costura
       |
  FONTE                   src/mock/  (hoje)  ->  Supabase (destino)
```

Nenhuma tela lê a fonte direto. Todas passam por `src/lib/dados/`, que
hoje devolve dado estático e amanhã devolve consulta. É por isso que
trocar mock por banco é substituição, não reescrita.

Duas dessas funções **já falam com o Supabase de verdade**:
`precos-praticados.ts` e `formula-base.ts`. As demais ainda leem mock.

## 1.2 As fontes de dados de hoje

Você lembrou de três. São essas mesmas, com um detalhe a mais em cada.

### Fonte A — Planilha de desempenho de anúncios (Mercado Livre)

Exportação do Mercado Livre, por anúncio e por semana.

- **Traz:** MLB, título, visitas, vendas, receita, preço, comissão
- **Granularidade:** anúncio × semana
- **Lê em:** `src/lib/planilhas/desempenho.ts`
- **Cobre:** só Mercado Livre

### Fonte B — Planilha de vendas / pedidos (todos os canais)

É a mais rica das três, e a que a ideia nova vai usar como espinha.

- **Traz:** nº da venda, data, SKU, MLB, título, unidades, **preço
  unitário de venda**, receita, tarifa, tipo de anúncio, status
- **Granularidade:** linha por item de pedido
- **Lê em:** `src/lib/planilhas/vendas-meli.ts` e `pedidos.ts`
- **Cobre:** hoje o parser entende o formato do Mercado Livre. Os outros
  canais exportam colunas diferentes — **isso é trabalho ainda não feito**,
  e está detalhado na Parte 3.

O que a torna especial: ela tem **SKU e preço unitário na mesma linha**.
É a única fonte que responde "quanto esse produto foi vendido, a que
preço, em que dia". Toda a ideia nova depende disso.

### Fonte C — Lançamentos manuais (KPIs)

O que você preenche na tela `/vendas/lancamentos`.

- **Traz:** visitas, pedidos, receita, investimento em ads, receita de
  ads, cliques, cancelamentos — por canal e por dia
- **Granularidade:** conta de canal × dia
- **Guarda em:** tabela `vendas_diarias`
- **Cobre:** todos os canais, porque é digitado

O banco calcula sozinho ticket médio, ACOS, ROAS e receita líquida — são
colunas geradas, então nunca ficam fora de sincronia com o que você
digitou.

### Fonte D — Fórmula base (que você não citou, mas é fonte)

Sua planilha de preço ideal e piso. Não é volume de venda, é **regra de
negócio**: qual preço deveria ser praticado.

- **Guarda em:** `formula_base_itens` e `formula_base_precos`
- **Alimenta:** preço ideal, desvio, e todo o motor de promoções

### Fonte E — API do Mercado Livre (construída, ainda não ligada)

Sete rotas prontas, esperando você criar o aplicativo. Traz pedidos,
visitas, catálogo, preço da vitrine, frete e concorrente. **Somente
leitura, com freio de 4 chamadas/s** para não consumir a cota dos seus
outros agentes.

## 1.3 Qual fonte abastece qual tela

| Tela | Fonte hoje | Fonte destino |
|---|---|---|
| `/` painel | mock | `vendas_diarias` + `alertas` |
| `/vendas/diario` | mock | `vendas_diarias` |
| `/vendas/semanal` | mock | `vendas_diarias` agregada |
| `/vendas/anual` | mock | `vendas_diarias` agregada |
| `/vendas/canais` | mock | `vendas_diarias` por canal |
| `/vendas/comparativos` | mock | `vendas_diarias` |
| `/vendas/metas` | mock | `metas` vs `vendas_diarias` |
| `/vendas/lancamentos` | mock | **escreve** em `vendas_diarias` |
| `/anuncios/analise` | mock | `anuncio_desempenho_semanal` (Fonte A) |
| `/anuncios/catalogo` | mock | `anuncios` |
| `/anuncios/preco-ideal` | mock | `precos_ideais` + `formula_base_*` |
| `/promocoes/processar` | memória | `processamentos_promocao` |
| `/promocoes/historico` | mock | `historico_promocoes` |
| `/promocoes/campanhas` | mock | `campanhas` + `campanha_itens` |
| `/monitoramento/*` | mock | API do Meli + `precos_coletados` |
| `/financeiro/*` | mock | `lancamentos_financeiros` e afins |
| `/relatorios/*` | mock | agregações |

**O que ninguém abastece hoje:** a tabela `produtos`. Ela existe no banco,
está vazia, e nenhuma tela escreve nela. Guarde esse detalhe — é o centro
da Parte 2.

---

# PARTE 2 — A IDEIA NOVA

## 2.1 O que ela é, numa frase

Hoje o sistema pensa em **anúncio**. A ideia nova o faz pensar em
**produto**, e o anúncio vira só um dos lugares onde aquele produto é
vendido.

Parece pequeno. Não é. É a diferença entre "o MLB1284 caiu de venda" e "o
sofá retrátil bege está vendendo mais barato na Magalu do que eu ofereci
no Meli, e é por isso que caiu".

## 2.2 O problema real que ela resolve

Você tem o mesmo produto anunciado em Magalu, Amazon, Casas Bahia,
Madeira Madeira, Mercado Livre São Paulo e Mercado Livre 2ª conta. Cada
canal tem código próprio, preço próprio e comissão própria.

Hoje, para decidir se entra numa promoção do Meli, você olha o Meli. A
ideia nova é olhar **onde aquele produto é prioritário**, e decidir com
isso na mão.

## 2.3 O ponto onde esse tipo de projeto morre

Vou ser direto, porque é a decisão mais importante do documento.

**O sistema só funciona se o mesmo produto tiver o mesmo SKU em todos os
canais.** Se a Magalu chama de `SOF-RET-BEG-3L` e o Meli de `sofa3lug-bg`,
nada disso funciona — o sistema vai achar que são dois produtos
diferentes, e toda a comparação entre canais vira ruído.

Três saídas possíveis:

1. **Você já padroniza.** Se o SKU é o mesmo em todo canal, ótimo, é só
   importar.
2. **Você padroniza agora.** Trabalho seu, uma vez, e o problema some.
3. **O sistema guarda um "de-para".** Uma tabela ligando o código de cada
   canal ao produto. Funciona, mas alguém tem que preencher e manter —
   e é onde a coisa apodrece com o tempo, porque produto novo entra e
   ninguém lembra de mapear.

**Essa é a primeira pergunta que preciso que você responda.** A resposta
muda o desenho, não só o esforço.

Enquanto isso, o desenho abaixo assume a saída 3, que é a mais tolerante
— e que funciona igual nas outras duas, só com a tabela quase vazia.

## 2.4 Tabelas necessárias

### Já existem e servem

| Tabela | Papel na ideia nova |
|---|---|
| `produtos` | O SKU. Hoje vazia — vira o eixo de tudo |
| `pedidos` / `pedido_itens` | Onde o desempenho por SKU nasce |
| `anuncios` | Já tem `produto_id` e `sku_canal`, prontos para ligar |
| `canais` / `contas_canal` | As 9 lojas e 10 contas, já semeadas |
| `importacoes` / `importacao_linhas` | O rastro de cada planilha subida |

Que `anuncios` já tenha `produto_id` não é sorte — o banco foi desenhado
prevendo isso. Metade da fundação já está no lugar.

### Precisam ser criadas

**1. `produto_codigos` — o de-para entre canal e produto**

```
  id, operacao_id
  produto_id        -> produtos
  canal_id          -> canais
  conta_canal_id    -> contas_canal   (nulo = vale para o canal todo)
  codigo_externo                       (MLB, ASIN, código Magalu…)
  sku_canal                            (o SKU como aquele canal escreve)
  origem            (manual | planilha | api)
  unique (canal_id, codigo_externo)
```

É essa tabela que responde "o MLB1284 e o produto 7781 da Magalu são a
mesma coisa". Sem ela, nada da ideia funciona.

**2. `produto_prioridade_canal` — sua decisão de onde priorizar**

```
  id, operacao_id
  produto_id        -> produtos
  canal_id          -> canais
  conta_canal_id    -> contas_canal   (nulo = canal inteiro)
  prioridade        (1 = principal, 2 = secundário…)
  motivo            texto livre
  definido_por      -> usuarios
  definido_em       timestamptz
  unique (produto_id, canal_id, conta_canal_id)
```

Note `motivo` e `definido_por`. Daqui a seis meses alguém vai olhar uma
prioridade e perguntar por que ela está assim. Sem esses dois campos, a
resposta é "ninguém sabe", e a prioridade vira lei que ninguém ousa mudar.

**3. `grupos_produto` e `grupo_itens` — o mix por canal**

```
  grupos_produto: id, operacao_id, nome, descricao, cor_serie
  grupo_itens:    grupo_id, produto_id, unique (grupo_id, produto_id)
```

É o "grupo de produtos" que você citou. Um produto pode estar em vários
grupos — linha, fornecedor, campanha sazonal.

**4. `desempenho_sku_periodo` — o resumo, se a consulta ficar lenta**

Não crie de início. `pedido_itens` responde tudo por consulta direta, e
tabela de resumo que ninguém precisava é dívida que dá manutenção. Só
crie se a tela demorar, e aí com número na mão.

### Precisa de uma coluna nova

`importacoes.tipo` é um enum. Falta o valor `pedidos`, para distinguir a
planilha de pedidos das outras que já existem.

## 2.5 As telas

### Aba 1 — SKUs (`/produtos/skus`)

Sobe a planilha de todos os SKUs e alimenta `produtos`.

Colunas mínimas: SKU, título, categoria, custo unitário. Peso e dimensões
se tiver — servem para o frete depois.

**A tela precisa mostrar o que NÃO casou.** Toda importação vai ter linha
com SKU que não bate com nada. Se isso ficar escondido, você acha que
importou tudo e está trabalhando com metade. É a mesma lição do
processador de promoções: as 58 pendências valem mais que os 944 aprovados.

### Aba 2 — Desempenho (`/produtos/desempenho`)

Sobe as planilhas de pedidos, de qualquer canal. Alimenta `pedidos` e
`pedido_itens`.

Aqui aparece o trabalho escondido: **cada canal exporta um formato
diferente**. Hoje só o do Mercado Livre é entendido. Cada canal novo é um
parser novo — não é difícil, mas é um por canal, e precisa de uma
exportação real de cada um para escrever.

**Antes de subir, a tela mostra o que vai acontecer:** quantas linhas,
quantos SKUs reconhecidos, quantos órfãos, qual período. Importação que
só avisa depois é importação que você desfaz na mão.

### Aba 3 — Análise de desempenho de produto (`/produtos/analise`)

O coração. Por SKU, num período:

- Unidades e receita, **por canal**, lado a lado
- **Preço praticado** por canal — média ponderada pela quantidade
- Evolução no tempo, com os canais sobrepostos
- Onde esse SKU é prioritário

A média ponderada não é detalhe: duas vendas a R$ 1.000 e uma a R$ 500
dão R$ 833, não R$ 750. A média simples deixaria uma liquidação isolada
envenenar o mês inteiro. `precos-praticados.ts` já faz assim.

**A leitura que a tela tem que entregar** é uma frase, não uma tabela:
"este SKU vende 3× mais na Magalu, a um preço 8% maior — o desconto que o
Meli está pedindo não se justifica".

### Aba 4 — Prioridade por canal (`/produtos/prioridade`)

A grade que você descreveu: SKUs nas linhas, canais nas colunas, e você
marca onde cada um é prioritário.

Duas coisas que ela precisa ter, e que não são óbvias:

- **Sugestão automática, decisão sua.** O sistema mostra qual canal
  lidera hoje em receita e em volume, mas quem marca é você. Automatizar
  a decisão faz a tela parar de ser consultada — e aí ninguém percebe
  quando a sugestão ficou velha.
- **Data da última revisão.** Prioridade de oito meses atrás não é
  decisão, é entulho.

### Aba 5 — Grupos (`/produtos/grupos`)

Montagem dos grupos e visão do mix por canal.

## 2.6 Como isso entra no que já existe

### Na análise de anúncio

Hoje a tela mostra o MLB e os dados do Meli. Passa a mostrar, no
cabeçalho:

> **Prioritário na Magalu.** Lá vendeu 47 un a R$ 1.890 nos últimos 30
> dias; aqui, 12 un a R$ 1.740.

Sem sair da tela do Meli, você sabe que está vendendo mais barato onde é
menos relevante.

**Depende de:** `produto_codigos` (para saber o produto do MLB) e
`pedido_itens` dos outros canais (para ter com o que comparar). Se a
planilha de pedidos da Magalu nunca foi subida, essa caixa fica vazia — e
tem que dizer isso, não sumir.

### No processador de promoções

Na etapa de conferência, cada item ganha duas informações:

- **É prioritário em outro canal?**
- **O preço proposto fica abaixo do praticado lá?**

E um filtro novo, junto dos que já existem: *"prioritários em outro canal
com preço abaixo"*. Essa é a lista que merece seu olho — não as 944 que
passaram batido.

Isso conversa com as quatro etiquetas que já existem (`tabela_acima_ml`,
`tabela_acima_original`, `quase`, `folga`). Vira uma quinta, do mesmo
tipo: um motivo textual, não um número solto.

## 2.7 Ordem de construção

Cada etapa entrega algo usável sozinha. Se você parar na 3, o que existe
já vale.

| # | Etapa | Entrega |
|---|---|---|
| 1 | `produtos` + aba SKU | Cadastro existe |
| 2 | `produto_codigos` + casamento | Sistema sabe que MLB e Magalu são o mesmo |
| 3 | Aba Desempenho + parsers | Pedidos de verdade no banco |
| 4 | Aba Análise | **Aqui a ideia vira valor** |
| 5 | `produto_prioridade_canal` + grade | Sua decisão registrada |
| 6 | Prioridade na análise de anúncio | Contexto onde você já olha |
| 7 | Prioridade nas promoções | Decisão na hora certa |
| 8 | Grupos e mix | Visão de carteira |

A etapa 3 é a mais longa e a menos visível — é onde moram os parsers de
cada canal. Vale saber disso antes, para não parecer que travou.

---

# PARTE 3 — PENDÊNCIAS E PERGUNTAS

## 3.1 Os dois ajustes que você pediu

**`/vendas/diario` — filtro por canal.** Hoje a tela tem seletor de
período e de base de comparação, mas não de canal: mostra o consolidado.
Ajuste pequeno, isolado.

**`/vendas/comparativos` — testar filtros.** A tela tem cinco controles
(métrica, escopo, mês comparado, modo mês/dia, largura). Não testei
nenhum interagindo de verdade. Vou clicar em cada combinação e conferir
que o gráfico e a tabela respondem — é o tipo de coisa que passa no build
e falha na tela, como o gráfico de elasticidade que não desenhava.

## 3.2 O que falta para os canais além do Meli

Para a ideia funcionar de verdade, o sistema precisa dos pedidos de todos
os canais. Hoje entende só o formato do Mercado Livre.

**O que preciso de você:** uma exportação de pedidos de cada canal —
Magalu, Amazon, Casas Bahia, Madeira Madeira, Zema, VTEX. Pode ser
pequena, um mês basta. Sem ver o arquivo real, qualquer parser que eu
escreva é chute sobre nomes de coluna.

## 3.3 As perguntas que só você responde

1. **O SKU é o mesmo em todos os canais?** É a pergunta que muda o
   desenho. (Seção 2.4)
2. **Prioridade é por canal ou por conta?** As duas contas do Meli podem
   ter prioridades diferentes — São Paulo é pronta entrega, a outra vende
   a prazo. O desenho acima suporta as duas; quero saber qual você usa.
3. **Um SKU pode ser prioritário em mais de um canal?** O desenho permite,
   com ordem (1, 2, 3). Se na sua cabeça é um só, simplifica.
4. **O que fazer com pedido de SKU desconhecido?** Sugiro guardar e
   marcar como órfão, nunca descartar. Descartar silenciosamente é como
   relatório fica errado sem ninguém perceber.

## 3.4 O que não recomendo fazer

**Não crie tabela de resumo antes de precisar.** `pedido_itens` responde
tudo por consulta. Resumo que ninguém pediu é dívida.

**Não automatize a escolha de prioridade.** O sistema sugere, você
decide. Automatizado, ninguém revisa — e aí a sugestão fica velha sem
que ninguém perceba.

**Não migre as 26 telas antes de ter dado no banco.** O banco está vazio.
Migrar agora deixa tudo em branco e você perde o que dá para validar.
Semear o banco com o conteúdo de mock primeiro, migrar depois.

---

*Escrito a partir do código real: 46 tabelas, 26 telas, 13 leitores de
planilha e a camada `src/lib/dados/`.*
