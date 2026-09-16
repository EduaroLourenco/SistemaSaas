# Contexto do domínio

O vocabulário desta plataforma. Só termos e o que eles significam — decisão
técnica vai para `docs/adr/`, e trabalho a fazer vai para `.scratch/`.

Regra de ouro: se um termo aqui e um nome no código discordarem, um dos dois
está errado. Resolver a discordância vem antes de escrever a próxima linha.

---

## Quem contrata e quem usa

### Organização

A empresa que contrata a plataforma. É a fronteira de cobrança e de
identidade: CNPJ, fuso, moeda.

É também a fronteira de PRIVACIDADE. Nenhum dado atravessa de uma
organização para outra, e isso é imposto pelo banco, não pela tela.

> Eduardo diz "empresa" no dia a dia. No código é sempre `organizacao`.
> "Empresa" é ambíguo aqui: o Grupo Probel tem mais de um CNPJ, e nem todo
> CNPJ vira uma organização separada — isso é escolha comercial, não fato
> jurídico.

### Operação

Uma unidade de negócio dentro da organização, e a fronteira de TODO dado
operacional: pedido, anúncio, meta, custo. Toda tabela de dado carrega
`operacao_id`.

Uma organização pode ter várias — "Operação principal", "B2B", "Loja
própria". Os números de uma nunca entram nos da outra, nem somados.

> Não confundir com **Conta de canal**. Operação é interna e organiza o
> negócio; conta de canal é externa e representa um login num marketplace.

### Membro

Uma pessoa dentro de uma organização, com um papel: `proprietario`,
`administrador`, `editor` ou `leitor`.

Membro é do par pessoa × organização, não da pessoa. A mesma pessoa pode
ser proprietária de uma organização e leitora de outra.

### Contratante

O membro `proprietario` que assinou. Quem paga e quem responde pela conta.

Termo de negócio, não de banco: no schema ele é apenas o membro com papel
`proprietario`. Vira termo próprio quando existir cobrança, porque aí
"quem paga" e "quem manda" podem deixar de ser a mesma pessoa.

---

## Onde se vende

### Canal

Um marketplace ou loja onde a operação vende: Mercado Livre, Magalu,
Shopee, a loja própria. É o nome comercial.

### Conta de canal

Um login específico dentro de um canal. **Esta é a unidade real de tudo.**

O Mercado Livre opera com duas: São Paulo (pronta entrega) e a segunda
(venda a prazo). Elas têm preço, tarifa e prazo diferentes — somá-las
esconde a comparação que interessa. Pedido, anúncio e meta são gravados por
CONTA, nunca por canal.

O canal existe para quando se quer o total: "quanto o Mercado Livre fez
hoje" soma as contas dele.

### Recorte

O filtro único das telas: ou um canal inteiro, ou uma conta. Viaja na URL
como `?canal=<uuid>` ou `?canal=conta:<uuid>`.

---

## O que se vende

### Produto

O item físico, identificado pelo SKU interno (`PA65751`). Existe uma vez na
operação, independente de onde é anunciado.

### Anúncio

A publicação de um produto numa conta de canal, identificada pelo código do
canal (`MLB4616482958`). **Um produto vira vários anúncios**: o mesmo
colchão tem um Clássico e um Premium na mesma conta, com preços diferentes.

### Tipo de anúncio

No Mercado Livre, `Clássico` ou `Premium` — e a diferença não é de
exposição só, é de tarifa: 11,5% contra 16,5% de tabela.

---

## Preço — cinco coisas diferentes

Confundir dois destes é o erro mais caro que esta plataforma pode cometer.
Cada um responde a uma pergunta distinta.

### Preço de vitrine

O preço cheio publicado no anúncio. É o que a API do canal devolve em
`price`. **Não muda quando entra campanha.**

### Preço visível

O que o comprador vê, já com o desconto da campanha. No Mercado Livre é o
`sale_price` no contexto do marketplace.

> Este par já causou um erro real: comparar `price` antes e depois de uma
> campanha mostra zero variação, e a leitura óbvia — "o desconto não foi
> aplicado" — é falsa.

### Preço vendido

O que o cliente efetivamente pagou, do item do pedido. É o único que é
fato consumado; os outros são oferta.

### Preço de tabela

O preço que a **Fórmula base** diz que preserva a margem numa dada faixa de
comissão. É cálculo nosso, não do canal.

### Preço mínimo

O menor preço de tabela — o da menor comissão negociável (4,5% no Meli).
É o piso de qualquer campanha.

---

## Comissão — duas, sempre

### Comissão de tabela

A alíquota que o canal publica para o tipo de anúncio. 11,5% Clássico,
16,5% Premium.

### Comissão praticada

O que o canal **realmente cobrou**, apurado dos pedidos. Quase sempre menor,
porque quase todo anúncio tem redução negociada.

> Medido em 15/09: pela tabela o Premium custa 4,99 p.p. a mais que o
> Clássico; pela praticada, 0,83 p.p. Uma tela que compara custo pela
> tabela compara um custo que ninguém pagou.

---

## Fórmula base

A tabela que diz, para cada SKU ou anúncio e cada faixa de comissão, qual
preço preserva a margem. Versionada por data de vigência.

É a única fonte de "quanto pode descer" em toda a plataforma. Promoção,
preço-alvo e negociação de tarifa consultam esta mesma tabela — duas
respostas diferentes para a mesma pergunta seria o pior defeito possível
aqui.

---

## Margem

### Margem de contribuição

O que a venda deixa depois dos custos que só existem **porque ela
aconteceu**: comissão, frete, imposto, embalagem, mercadoria. Responde
"vender mais desta unidade melhora o resultado?".

### Resultado

Desconta também o que a operação gasta **exista venda ou não** — mídia,
mensalidade, taxas. Responde "a operação fechou no azul?".

> Ficam separados de propósito. Ratear custo fixo dentro do preço de um SKU
> faz produto de giro alto e margem apertada parecer prejuízo — ele é
> despriorizado, e o custo fixo que ele ajudava a pagar não some junto.

### Cobertura

Quanto da receita entrou na conta de margem, em %.

Enquanto um SKU não tiver custo cadastrado, as vendas dele ficam **fora** —
não entram como zero, ficam fora. A cobertura diz o tamanho do que ficou
de fora, e vem antes de qualquer número de margem na tela.

---

## Promoção

### Campanha

Uma oferta do canal com prazo, com ou sem redução de tarifa.

### Oferta em aberto

Linha da campanha que ainda aceita decisão — a célula de ação oferece
"Participar" ou "Aplicar proposta". **É a única que o sistema altera.**

### Oferta fechada

Linha já aceita, negociada ou participando. O sistema analisa e mostra,
mas **não escreve**.

> Reescrever uma oferta fechada troca um acordo que está no ar, no preço em
> que foi aprovado, por outro que ainda precisaria passar pelo canal. O
> anúncio sai da campanha enquanto isso.

---

## Sincronização

### Fonte automática

Dado que chega por API do canal, sem ninguém digitar.

### Fonte manual

Dado que veio de planilha importada ou digitação.

> A tela tem obrigação de dizer qual é qual e **até quando cada uma vai**.
> Um número de ontem com cara de hoje é pior que um campo vazio.
