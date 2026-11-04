# Imprimil — planejamento de escala no Mercado Livre

**04/11/2026.** Substitui o plano anterior, que estava errado em duas coisas
importantes. Conta `IMPRIMIL`, seller 823130598, anunciante Ads 2616899.

Varredura completa: os **82 anúncios** pela API (`/items` multiget), as **7
fichas de catálogo** (`price_to_win` uma a uma), e **quem mais vende cada
ficha** (`/products/{id}/items`). Mais o que o sistema já tinha de pedido,
visita e Ads.

---

> **Os números das seções 1 e 3 e a alavanca 5.B foram revisados na seção 0.**

---

## 0. Revisão de 04/11, à tarde — releitura do catálogo

Esta seção **substitui** os números das seções 1 e 3 e **substitui a alavanca
5.B**. Varredura nova: `/users/823130598/items/search` nos quatro status,
`/items` multiget, `price_to_win` e `/products/{id}/items` nas fichas, e
`/items/{id}/shipping_options` nos 27 ativos. Dado em
`scratchpad/imprimil-escala/catalogo2.json` e `frete.json`.

### O que mudou desde a varredura da manhã

- **74 anúncios na busca, não 82.** Os 8 `forbidden` sumiram da busca mas
  **continuam existindo e continuam bloqueados** — `/items/{id}` devolve
  `under_review` / `forbidden` nos oito. O MLB7870220878 foi mexido em 03/11;
  os outros sete pararam em 22/10. Nenhum voltou ao ar.
- **5 fichas de catálogo, não 7.** As duas que davam 404 (MLB2126335578 e
  MLB2126345274) não existem mais.
- **Nenhum concorrente de fora em nenhuma das 5 fichas.** Isso não mudou.
- 27 ativos, 47 pausados — 36 pausados por você (quase todos a família
  "Caderneta tipo Moleskine 21x14", ~35 anúncios com mil unidades cada) e 10
  sem estoque.

### 1 SKU → 3 anúncios: onde está e onde não está

53 SKUs: 38 com um anúncio, 9 com dois, 6 com três. Nas linhas que importam:

| SKU | anúncios | em ficha | o que falta |
|---|---|---|---|
| LIV_PACK10 | 3 | 3 — MLB2126331442 | nada |
| LIV_PACK15 | 3 | 3 — MLB2115626143 | nada |
| LIV_PACK50 | 3 | 3 — MLB2115626025 | nada |
| LIV_PACK100 | 2 | 2 — MLB2126334720 | **+1 anúncio** |
| LIV_PACK30 | 1 | 0 | **+2 e entrar em ficha** |
| REV_PACK10_RELI | 1 | 0 | **+2 e entrar em ficha** |
| REV_PACK15_RELI | 3 | **0** | **entrar em ficha** |
| REV_PACK30_RELI | 3 | **0** | **entrar em ficha** |
| REV_PACK50_RELI | 2 | 1 — MLB2126335044 | **+1, e levar os dois** |
| REV_PACK100_RELI | 2 | 0 | **os dois estão pausados** |

A linha infantil está montada. **A linha bíblica não tem um único anúncio em
ficha de catálogo** — e o kit de 100 bíblico, que é o formato que mais vende
na linha infantil (61 e 54 vendas), está inteiro fora do ar.

### O que decide a ficha não é o preço — é o frete

Esta é a descoberta da releitura, e ela muda a conta que você está fazendo.

Dos 12 anúncios em ficha, 9 entregam com **frete R$ 0 para o comprador** (o
Meli banca R$ 7,80) e 3 cobram **R$ 7,99 do comprador**. Os cinco vencedores
estão todos no primeiro grupo. Os três sem subsídio são justamente os que o
`price_to_win` manda baixar para R$ 1,72, R$ 1,94 e R$ 2,15 — porque o canal
compara o **total que o comprador paga**:

| anúncio | preço em vigor | frete ao comprador | total ao comprador | ficha |
|---|---|---|---|---|
| MLB5447762077 | R$ 19,67 | R$ 0,00 | **R$ 19,67** | **ganha** |
| MLB5447798023 | R$ 18,43 | R$ 7,99 | R$ 26,42 | perde |
| MLB5250064629 | R$ 15,58 | R$ 7,99 | R$ 23,57 | perde |

**O anúncio mais barato é o mais caro para o comprador.** É por isso que você
segura preço alto e continua ganhando a ficha — mas o que te segura é o
frete, não o anúncio irmão.

E o subsídio **não é faixa de preço, é configuração por anúncio**: R$ 38,23
tem, R$ 38,90 não tem; dois anúncios a R$ 47,90 e um tem e o outro não. Dos
27 ativos, **10 não têm**, entre eles **4 dos 6 bíblicos**.

### Quanto preço você está deixando na mesa agora

Em três das cinco fichas o anúncio que ganha não é o de preço mais alto com
subsídio — logo há teto de sobra:

| ficha | ganha hoje a | irmão com subsídio a | folga |
|---|---|---|---|
| MLB2115626143 | R$ 20,23 | R$ 21,58 | R$ 1,34 |
| MLB2115626025 | R$ 33,22 | R$ 39,65 | **R$ 6,42** |
| MLB2126334720 | R$ 48,00 | R$ 61,35 | **R$ 13,34** |
| MLB2126331442 | R$ 19,67 | nenhum com subsídio | sem teto seu |
| MLB2126335044 | R$ 42,31 | sozinho na ficha | sem teto seu |

Atenção: esses "em vigor" são **preço de promoção**, não preço de cadastro.
Subir isso é decisão de promoção, não edição de preço.

### A regra que falta na sua estratégia da Black

Sua leitura está certa no mecanismo e tem um furo. A ficha já é sua sem
condição — não existe concorrente em nenhuma das cinco. O que os três
anúncios te dão não é defesa da ficha: é **três decisões de promoção
independentes na mesma ficha**, porque o canal pergunta anúncio por anúncio.
Então:

1. **Aceite a promoção agressiva no anúncio sem subsídio de frete.** Ele não
   consegue tomar a ficha por preço nenhum, então o desconto é vitrine, não
   venda no osso. Não é de graça: quem cai nele por busca direta compra
   barato — mas são os que o canal marca com `visit_share: minimum`.
2. **Nunca aceite promoção no irmão que TEM subsídio** se o preço resultante
   ficar abaixo do que ganha a ficha. Ele rouba a sua própria ficha mais
   barato. Esse é o furo, e é o que vai te pegar na Black.
3. **Recuse no anúncio que ganha a ficha** o que não cabe na margem. Sem
   concorrente, recusar não custa a ficha.

A regra 2 é verificável pela API e cabe na tela de Automações: no drawer da
promoção, avisar "este anúncio divide a ficha MLB… com MLB…, que está em
vigor a R$ X — aceitar te joga abaixo dele".

### A ordem, com isto na mão

1. **Ligar frete grátis nos 10 ativos que não têm** — a maior alavanca única
   da conta, e não custa linha de código. 4 dos 6 bíblicos cobram R$ 7,99 do
   comprador enquanto os infantis equivalentes entregam de graça com o Meli
   pagando; a linha bíblica vende 0, 1 e 3 e a infantil vende 61 e 54. Antes
   de virar os dez, confira no painel quanto sobra para você: a API mostra o
   subsídio de R$ 7,80 sobre um frete de lista de R$ 6,85 a R$ 16,99, mas não
   mostra quem paga a diferença.
2. **Levar a linha bíblica para ficha.** Zero de 6 em ficha, e o catálogo do
   Meli tem ficha pronta para exatamente isso — a busca por produto devolve
   "Coleção Colorir a Bíblia", "Kit 40 Livrinhos Bíblicos", "Milagres de Jesus
   — Kit 30 Livrinhos Lembrancinha".
3. **Reativar o REV_PACK100_RELI.** O kit de 100 é o campeão da conta do lado
   infantil e o bíblico está com os dois anúncios pausados.
4. **Fechar os três anúncios onde falta** (LIV_PACK100, LIV_PACK30,
   REV_PACK10_RELI, REV_PACK50_RELI) e **usar a folga de preço** de R$ 6,42 e
   R$ 13,34 nas duas fichas acima — continuando a ganhar as duas.
5. **Os 8 bloqueados continuam bloqueados.** Segue sendo o primeiro item.
6. **35 cadernetas pausadas são ~35 mil unidades de estoque parado.** Ou
   voltam ao ar com o frete resolvido, ou o estoque no sistema é mentira.

### O que a alavanca 5.B dizia e por que está errada

5.B mandava deixar **um** anúncio por ficha. Com o mecanismo do frete na mão,
isso está errado: os anúncios irmãos sem subsídio não roubam venda (ficam em
`visit_share: minimum`) e são justamente onde cabe aceitar a promoção
agressiva sem perder a ficha. **Mantenha os três.** O que 5.B acerta é o
resto: não gaste Ads nos irmãos, porque clique neles não converte.

---

## 1. A descoberta que muda o plano: vocês estão sozinhos no catálogo

Você perguntou e a resposta é **sim**. Perguntei ficha por ficha quem são os
vendedores:

| ficha | ofertas | vendedores | da Imprimil |
|---|---|---|---|
| MLB2126335044 | 1 | **1** | 1 |
| MLB2126334720 | 2 | **1** | **2** |
| MLB2115626025 | 3 | **1** | **3** |
| MLB2115626143 | 3 | **1** | **3** |
| MLB2126331442 | 3 | **1** | **3** |
| MLB2126335578 | — | — | sem vencedor (404) |
| MLB2126345274 | — | — | sem vencedor (404) |

**Não existe um único concorrente em nenhuma ficha.** Todas as ofertas de
todas as fichas são suas.

### O que isso significa, e por que o plano anterior estava errado

Eu te disse para baixar o preço nos anúncios marcados `competing` para ganhar
a ficha. **Isso está errado e eu retiro.** Olhe o que o `price_to_win` está
mandando fazer:

| seu anúncio | preço | "para ganhar" | quem está ganhando |
|---|---|---|---|
| MLB7870223010 | R$ 61,35 | R$ 47,92 | **MLB7657552828 — seu** |
| MLB7870107024 | R$ 39,65 | R$ 32,83 | **MLB5250064627 — seu** |
| MLB5447830819 | R$ 42,31 | R$ 33,05 | **MLB5250064627 — seu** |
| MLB7870095232 | R$ 21,58 | R$ 19,55 | **MLB5447829091 — seu** |
| MLB5250064629 | R$ 15,58 | **R$ 1,94** | **MLB5447762077 — seu** |
| MLB7657522202 | R$ 17,24 | **R$ 2,15** | **MLB5447829091 — seu** |
| MLB5447798023 | R$ 18,43 | **R$ 1,72** | **MLB5447762077 — seu** |

Você está num leilão **contra você mesmo**, e o canal está te pedindo para
derrubar o preço a R$ 1,72 para vencer o seu próprio anúncio. Aqueles R$ 1,94
e R$ 2,15 são o sinal mais claro possível: não é preço de competição, é o que
o algoritmo calcula quando o rival tem histórico e você não — e o rival é você.

Quem ganha hoje: MLB7657552828 (R$ 48,00), MLB5250064627 (R$ 33,22),
MLB5447798021 (R$ 42,31), MLB5447829091 (R$ 20,23), MLB5447762077 (R$ 19,67).
Todas com `competitors_sharing_first_place: 0`.

**Nota de preço:** o anúncio MLB7657552828 está cadastrado a R$ 64,90, mas a
ficha mostra **R$ 48,00** — a diferença é promoção. O comprador vê 48.

### O estrago que a duplicata já causou

**8 anúncios estão `under_review` com `sub_status: ["forbidden"]`.** Não é
pausa, é bloqueio:

| anúncio | preço | título |
|---|---|---|
| MLB7870023624 | R$ 67,90 | 50 Revistinhas Bíblicas Colorir Lembrancinha Igreja |
| MLB7870085300 | R$ 65,90 | 30 Livrinhos Colorir Lembrancinha Festa Infantil |
| MLB7870220878 | R$ 62,80 | 30 Livrinhos Bíblicos Lembrancinha EBD |
| MLB7870098176 | R$ 55,90 | 30 Livrinhos Colorir Lembrancinha Festa |
| MLB5447911967 | R$ 57,50 | 100 Livrinhos Bíblicos Lembrancinha Atacado |
| MLB5447826905 | R$ 38,80 | 10 Livrinhos Bíblicos Lembrancinha EBD |
| MLB7870076128 | R$ 57,50 | 100 Livrinhos Colorir Lembrancinha Atacado |
| MLB5447826903 | R$ 45,90 | 10 Livrinhos Bíblicos Lembrancinha EBD |

São **exatamente os clones**, e são justamente os de melhor título — os que
têm "lembrancinha", "atacado", "EBD", "igreja". Oito portas de entrada
fechadas. Isso precisa de um chamado no Mercado Livre, e precisa ser o
primeiro item da lista.

---

## 2. O retrato completo da conta

Dos 82 anúncios:

| | |
|---|---|
| ativos | **27** |
| pausados | 47 |
| **bloqueados (`forbidden`)** | **8** |
| em ficha de catálogo | 17 · **fora: 65** |
| com variação | **0 de 82** |
| frete grátis | 5 de 82 |
| acima de R$ 79 | **5 de 82** |
| preço | min R$ 21,90 · mediana **R$ 42,31** · max R$ 299,35 |
| 6 fotos ou mais | 63 · com 1 a 2 fotos: 6 |
| título | mediana **60** caracteres · máximo **74** |

Categorias: `NOTEBOOKS_AND_WRITING_PADS` 50 · `SCHOOL_KITS` 27 ·
**`SOUVENIRS` apenas 2** · `EBOOKS` 2 · `BABY_JOURNALS` 1.

Nascimento dos anúncios: 14 em maio, 42 em setembro, 26 em outubro. **A
operação tem três meses de vida real.**

O funil, das últimas cinco semanas fechadas: **2.912 visitas, 128 vendas,
4,40% de conversão**. Dois anúncios concentram 71,6% das visitas e 88% das
vendas. A reputação é 5_green, 0% de cancelamento, 0% de atraso, 1 avaliação
em 104 vendas.

---

## 3. Catálogo: como funciona, e se serve para você

### Como funciona

Uma ficha é uma página de produto única, compartilhada por todos os vendedores
daquele produto. O canal elege **um** deles para ser a oferta principal, e essa
oferta leva a maior parte das vendas da página. Os critérios que as fontes
citam: preço total percebido (produto + frete + prazo), reputação, logística,
estoque estável e qualidade do cadastro. A posição não é fixa — o canal
rotaciona entre ofertas de condição parecida.

### Vantagens

- **Concentra o tráfego de busca.** É a razão de existir: uma página forte em
  vez de dez fracas. Anúncios em ficha tendem a vender mais pelo mesmo motivo.
- **Ficha padronizada reduz dúvida e devolução.**
- **No seu caso específico, é de graça.** Você está sozinho. Pega o tráfego da
  ficha sem disputar com ninguém.

### Desvantagens

- **A página não é sua.** Fotos, texto e ficha técnica são do catálogo, não do
  anúncio. Você depende do que foi cadastrado lá.
- **Qualquer um entra depois.** No dia em que um atacadista entrar na mesma
  ficha com preço 30% abaixo, você perde a posição — e a página continua não
  sendo sua.
- **Sequestro de ficha.** As fontes relatam concorrente vinculando produto
  similar e inferior à mesma ficha.
- **Vendedor oportunista.** Entra, derruba preço, vende três unidades, some, e
  deixa a referência de preço estragada.

### Quando NÃO vale a pena

As fontes são consistentes: para **produto autoral, artesanal, de marca
própria ou sem EAN registrado**, o anúncio próprio faz mais sentido, porque
você controla a página inteira e fica menos exposto.

### A recomendação para a Imprimil

Você é **fabricante com marca própria** — "Imprimil" está no título dos seus
anúncios. Isso puxa para o anúncio próprio. Mas você já está nas fichas e está
sozinho nelas, o que anula a principal desvantagem hoje. Então:

1. **Fique nas 7 fichas, com UM anúncio em cada.** Hoje são 17 anúncios em 7
   fichas. Remover os clones não custa venda nenhuma — eles têm 0, 1, 5 e 12
   visitas em 30 dias — e devolve o preço ao patamar certo.
2. **Registre a marca Imprimil** e entre no programa de proteção de marca. É o
   que te dá controle sobre a ficha e recurso contra quem tentar usar seu nome.
   É o item mais barato de longo prazo desta lista.
3. **Não crie ficha nova para variação de tema.** Tema é variação dentro do
   anúncio, não ficha nova (seção 5.E).
4. **Monitore mensalmente** `competitors_sharing_first_place` nas 7 fichas. Hoje
   é 0 em todas. No dia em que deixar de ser, a decisão de preço muda — e aí
   sim o `price_to_win` passa a querer dizer alguma coisa.

---

## 4. Por que tráfego pago não escala isso sozinho

Você está certo, e dá para mostrar com os seus números.

**O teto da demanda.** A campanha entregou **175.290 impressões** em 34 dias
com CTR de 0,56%. Impressão é o quanto o canal conseguiu te mostrar para quem
buscou aqueles termos. O Ads só alcança quem **já está procurando**. Ele não
cria demanda nova — ele compra posição na demanda existente.

**O custo marginal sobe.** CPC médio de R$ 0,51, conversão de 4,4%, ticket de
R$ 55,61. Cada venda via mídia custa `0,51 / 0,044 = R$ 11,59`, ou seja **21%
do ticket só em clique**, antes da comissão de 11,5% e do frete. E escalar
significa comprar os cliques que sobraram — os mais caros. O ACOS da campanha
já é 25,65% contra um alvo de 20%.

**O que escala de verdade, em ordem de alavancagem:**

1. **Mais portas de entrada** — 65 dos 82 anúncios estão fora de catálogo, e
   cada ficha é uma página que o canal indexa e distribui sozinho.
2. **Mais termos cobertos** — cauda longa. Termos específicos têm menos
   concorrência e comprador mais avançado na decisão.
3. **Ticket maior** — dilui o CPC e entra na faixa de frete grátis.
4. **B2B recorrente** — o comprador que volta não custa clique nenhum.

Ads continua, e continua importante: hoje responde por ~40% da receita com 24%
do orçamento gasto. Mas ele é o **multiplicador**, não o motor.

---

## 5. As alavancas, uma a uma

### A. Destravar os 8 bloqueados — *faça hoje*

Abrir chamado no Mercado Livre pelos 8 `forbidden`. São os melhores títulos da
conta. Enquanto estiverem assim, não recebem visita nenhuma.

Minha leitura da causa, que precisa de confirmação com o canal: são exatamente
os anúncios duplicados criados em setembro e outubro. Duplicata de catálogo é
motivo conhecido de bloqueio.

### B. Um anúncio por ficha — *esta semana*

17 anúncios em 7 fichas viram 7. Mantenha sempre **o que tem histórico** — o
canal não transfere reputação de anúncio para anúncio. Os que ficam:
MLB7657552828, MLB5250064627, MLB5447798021, MLB5447829091, MLB5447762077.

Benefício direto e verificável: para de competir contra si mesmo, para de
gastar Ads em clone que não converte (18 anúncios gastaram e venderam zero), e
o preço volta ao patamar de quem não tem rival.

### C. Levar os 65 de fora para o catálogo — *a maior alavanca orgânica*

Esta é a alavanca que não é Ads. Hoje **65 de 82** anúncios não estão em ficha
nenhuma. Cada ficha criada é uma página indexada a mais, com tráfego próprio.

Comece pelos que já vendem e pelos pausados com produto bom. Precisa de ficha
técnica completa e, quando o canal exigir, código EAN — que, para produto de
fabricação própria, você emite.

### D. Subir o ticket — *o problema mais silencioso*

Mediana de R$ 42,31 e apenas 5 anúncios acima de R$ 79. Com CPC de R$ 0,51,
cada clique come 1,2% do ticket mediano. Dois caminhos, não excludentes:

- **Kits maiores.** O produto que mais vende já é o kit de 100 — o mercado
  está comprando o pacote grande. Kit de 150, 200, 300.
- **Combos.** Livrinho + giz de cera, livrinho + sacolinha, kit de festa
  fechado. Sobe ticket sem produto novo de fábrica.

A faixa de frete grátis começa em R$ 79 segundo as fontes — **confirme a
mecânica e quem paga o quê na Central do Vendedor antes de precificar em cima
disso**, porque as fontes divergem.

### E. Usar variação — *zero de 82 hoje*

Nenhum anúncio tem variação. Isso quer dizer que cada tema, cada tamanho e
cada quantidade é um anúncio solto, começando do zero em histórico.

Variação é o mecanismo certo para tema: **um anúncio "Kit 30 Livrinhos de
Colorir" com variações de tema** (dinossauro, princesa, fazendinha, safári,
bíblico, carrinhos, unicórnio, futebol) concentra visita, venda e avaliação
numa página só, em vez de espalhar em oito páginas fracas. O canal inclusive
agrupa variações na promoção e deixa participar com todas de uma vez.

Essa é a resposta à sua pergunta sobre anúncio temático: **tema vira variação,
não anúncio novo.** Anúncio novo só quando o termo de busca é outro.

### F. Preço de atacado para CNPJ — *o encaixe óbvio e não usado*

O Mercado Livre permite cadastrar **até 5 faixas de preço por quantidade**,
visíveis **somente para compradores com CNPJ validado**. O comprador pessoa
física continua vendo o preço normal — não canibaliza o varejo.

Por que isso é feito para você:
- você é **fabricante**, então a faixa de 100, 500, 1.000 unidades é o seu
  custo marginal, não um desconto que sai da margem;
- seu comprador natural é **escola, igreja, buffet, papelaria, empresa de
  festa** — todos CNPJ, todos recorrentes;
- o próprio canal afirma que o B2B é **4x maior que o varejo** e cresce mais
  rápido;
- **as suas próprias tendências já pedem:** "giz de cera atacado", "kit com 40
  caixa de giz de cera", "agendas por atacado", "caixa c 10 cadernos brochura
  96 folhas".

Separado disso existe o **desconto por quantidade** da Central de Promoções
(desconto na 2ª unidade, ou a partir de N unidades), que dá destaque extra na
busca. Ressalva: as fontes dizem que anúncio vendido **como kit** pode não ser
elegível — confirme antes de contar com ele.

### G. Categoria — *50 anúncios no lugar errado*

50 em `NOTEBOOKS_AND_WRITING_PADS` e 27 em `SCHOOL_KITS`, mas o mercado que
seus títulos perseguem é **lembrancinha**, e só **2** anúncios estão em
`SOUVENIRS`. Categoria define com quem você é comparado e em que filtro você
aparece. Vale testar a migração dos de lembrancinha e medir visita por 14 dias.

### H. Título — *o canal corta em 60*

Mediana de 60 caracteres, máximo de 74. O que passa de 60 é cortado. A regra
das fontes: palavra-chave principal primeiro, depois os detalhes que
qualificam. Exemplo real seu — `Kit 100 Revistinhas Para Colorir Escolas
Projetos E Eventos` (57) é bom; `Caderno Floral Tipo Moleskine 14x21 Sem Pauta
Un Arara Tuc.` (62) perde "Tuc." e o "Un" não busca nada.

### I. Temas e sazonalidade — *o que suas tendências já mostram*

Você coletou as tendências do canal e elas contam uma história clara. Dois
modificadores aparecem repetidamente em todas as categorias: **"personalizado"
e "atacado"**. Os dois são exatamente o que uma gráfica faz.

O que está em alta e você não atende:

- **Agenda** — "agenda personalizada 2027", "agenda 2027 personalizada",
  "agenda personalizada com logo", "agenda personalizada empresa", "agendas
  por atacado", "planner 2026", "diario gestante". **É novembro: a estação da
  agenda é agora.** Você já faz caderno tipo Moleskine — é o mesmo processo.
- **Marcador de página** — "marca pagina personalizado biblicos", "marcador de
  paginas evangelico", "marcadores de pagina catolicos", "marcador de livros
  personalizado". **Você já vende o público bíblico** (25,5% da receita do ano
  vem do kit bíblico). É o mesmo comprador, produto mais barato de produzir.
- **Giz de cera** — "caixa de giz de cera personalizado", "giz de cera
  atacado", "mini giz de cera". Combina com livrinho de colorir no mesmo kit.
- **Caderno** — "caderno personalizado", "caixa c 10 cadernos brochura 96
  folhas". Você já tem o produto e já tem um anúncio de R$ 299,35 com kit de 10.

### J. Avaliação — *1 em 104 vendas*

É o ativo mais barato que está parado. Mensagem pós-entrega pedindo avaliação,
em toda venda. A reputação operacional já é impecável; o que falta é a prova
social que o comprador lê na página antes de decidir.

---

## 6. A meta

Você está certo que precisa de uma. Aqui está, com a conta aberta.

**A fórmula:** `receita = visitas × conversão × ticket`.

**Hoje:** ~2.500 visitas/mês × 4,40% × R$ 55,61 ≈ **R$ 6.100/mês**. Outubro
fechou R$ 4.393 e novembro vai no ritmo de R$ 509 em 3 dias, então a conta
bate com a realidade.

**Meta de 90 dias: R$ 20.000/mês.** Três vezes e meia o patamar atual.

Dois caminhos para o mesmo número:

| caminho | visitas/mês | conversão | ticket | resultado |
|---|---|---|---|---|
| só tráfego | **8.200** (3,3x) | 4,4% | R$ 55,61 | R$ 20.070 |
| **tráfego + ticket** | **6.300** (2,5x) | 4,0% | **R$ 79,00** | R$ 19.908 |

O segundo é o realista, e é por isso que o ticket está na lista. Subir o
ticket de R$ 55 para R$ 79 derruba a necessidade de tráfego em 23% — e eu
assumi de propósito que a conversão cai um pouco com o preço maior.

**De onde vêm as 3.800 visitas a mais, sem ser só Ads:**

| alavanca | o que move |
|---|---|
| 8 bloqueados de volta | 8 páginas que hoje recebem zero |
| 65 anúncios para o catálogo | a maior fonte orgânica disponível |
| variação por tema | concentra em vez de espalhar |
| atacado B2B | comprador que volta, sem custo de clique |
| Ads com ACOS destravado | hoje gasta 24% do orçamento |

**Marcos intermediários**, para você saber se está no caminho:
- **30 dias:** 8 bloqueados resolvidos, clones encerrados, 20 anúncios novos em
  ficha, atacado cadastrado nos 10 principais. Receita ≥ R$ 9.000.
- **60 dias:** variação de tema nos 4 campeões, linha de agenda 2027 no ar,
  ticket mediano ≥ R$ 65. Receita ≥ R$ 14.000.
- **90 dias:** R$ 20.000, ticket ≥ R$ 79, e pelo menos 30% da receita vindo de
  anúncio que não existia em novembro.

**O que eu NÃO prometo:** o multiplicador de tráfego é a parte incerta. As
alavancas são todas reais e verificáveis nos dados, mas quanto cada uma
entrega em visita depende da demanda do termo, e a demanda eu não consigo
medir — a API pública de busca do Meli responde 403 e a lista pública no
navegador exige verificação de conta. Então trate 3,5x como alvo de trabalho,
não como previsão.

---

## 7. A ordem de execução

**Esta semana**
1. Chamado dos 8 `forbidden`.
2. Encerrar os 10 clones, mantendo os 7 com histórico.
3. Tirar do Ads os 18 anúncios que gastaram e venderam zero.
4. Cadastrar preço de atacado por CNPJ nos 10 anúncios ativos principais.

**Até 30 dias**
5. Registrar a marca Imprimil e entrar na proteção de marca.
6. Levar 20 dos 65 anúncios fora de catálogo para ficha.
7. Reescrever os títulos que passam de 60 caracteres.
8. Testar migração de categoria para `SOUVENIRS` nos de lembrancinha e medir 14 dias.
9. Mensagem de pedido de avaliação em toda venda.

**Até 60 dias**
10. Variação de tema nos 4 campeões, em vez de anúncio novo por tema.
11. Linha de agenda personalizada 2027 — a estação é agora.
12. Kits maiores e combos para cruzar a faixa de R$ 79.
13. Marcador de página personalizado para o público bíblico que já compra.

**Até 90 dias**
14. Giz de cera personalizado e caixa combinada com livrinho.
15. Revisar o ACOS alvo da campanha com a margem real.
16. Conferir mensalmente se alguém entrou nas 7 fichas.

---

## 8. O que eu não sei

- **Margem.** Os 55 produtos estão com `custo_unitario` nulo. Nada neste
  documento depende disso — por isso ele é de estratégia e não de preço. Mas a
  decisão de ACOS e a de preço de atacado precisam do número.
- **Demanda do nicho.** API pública de busca em 403; lista pública atrás de
  verificação de conta, que eu não contornei.
- **A causa do bloqueio dos 8.** Minha leitura é duplicata; só o canal confirma.
- **Full**, por decisão sua. As fontes apontam o Full como fator forte no
  destaque de ficha — hoje isso não te custa nada, porque você está sozinho nas
  fichas. Passa a custar no dia em que não estiver.

## 9. Fontes

Dados: sistema e API do Mercado Livre, 03–04/11/2026. Scripts em
`scratchpad/imprimil-escala/` (`perfil.mjs`, `api.mjs`, `ads.mjs`,
`catalogo.mjs`). Tendências em `scratchpad/imprimil/tendencias.json`.

Oficiais do canal:
[preços de atacado para empresas](https://vendedores.mercadolivre.com.br/nota/adicione-precos-de-atacado-e-aumente-o-seu-volume-de-vendas) ·
[descontos por quantidade](https://vendedores.mercadolivre.com.br/nota/como-crear-descuentos-por-cantidad-para-liquidar-tu-stock) ·
[Central de Promoções](https://vendedores.mercadolivre.com.br/nota/conheca-sua-central-de-promocoes-e-ofereca-descontoss) ·
[campanhas de desconto por quantidade (devs)](https://developers.mercadolivre.com.br/pt_br/campanhas-de-desconto-por-quantidade)

Blogs de agência e ferramenta — não são documentação oficial, e cada
afirmação tirada deles está marcada no texto:
[Hunter HUB — explorar o catálogo](https://hunterhub.com.br/blog/explorar-catalogo-mercado-livre/) ·
[Conecta Ads — catálogo vale a pena?](https://www.conectaads.com.br/anuncio-catalogo-mercado-livre/) ·
[Vencebox — catálogo e buy box](https://vencebox.com.br/blog-catalogo-mercado-livre) ·
[Winnerbox — o que é catálogo](https://winnerbox.com.br/blog/o-que-e-catalogo-mercado-livre/) ·
[UpSeller — vendedor em destaque 2026](https://www.upseller.com/pt/blog-article-952) ·
[Arcos Scale — erros em Ads](https://blog.arcosscale.com.br/erros-mercado-livre-ads-prejudicam-vendas/) ·
[GoBots — ROAS e ACOS](https://gobots.ai/blog/roas-acos-metrica-certa-para-lucrar-no-mercado-ads/) ·
[Mamba Digital — palavras-chave no Meli](https://mambadigital.com.br/blog/palavra-chave-mercado-livre/) ·
[Central do Varejo — cauda longa](https://centraldovarejo.com.br/long-tail-o-poder-da-cauda-longa-no-varejo-e-no-e-commerce/) ·
[AnyMarket — preço de atacado](https://marketplace.anymarket.com.br/atacado-mercado-livre/)
