# Conteúdo, vocabulário e métricas

Medido em 07/10/2026 por `docs/auditoria-visual-2026-10-07/medir-conteudo.mjs`
sobre os 148 arquivos de `src/`. Os números abaixo estão em
`evidencias/conteudo.json`.

---

## 1. Quanto texto existe

**2.581 frases distintas de interface.** Mediana de **25 caracteres** — a
maior parte é rótulo curto, como deve ser.

O problema está na cauda:

| | |
|---|---|
| acima de 80 caracteres | **133** |
| acima de 100 | **59** |
| acima de 140 | **19** |

As 19 maiores são parágrafos de explicação dentro da tela, e várias passam
de 190 caracteres. Exemplos literais:

> `/anuncios/catalogo` — 194 caracteres
> "o que o canal REALMENTE cobrou, apurado pedido a pedido e rateado entre os
> itens. Só entra pedido em que o canal informou a comissão — onde não
> informou…"

> `/promocoes/historico` — 194 caracteres
> "Cada rodada da Central de Promoções grava aqui a decisão de cada item, com
> o preço ofertado pelo canal, o de tabela, o piso e o com desconto extra…"

> `/monitoramento/fretes` — 192 caracteres
> "Frete por anúncio e CEP é consulta ao vivo — nenhuma planilha traz esse
> número. A rota /api/monitoramento/frete já existe e passa a responder
> quando a…"

**Esse texto não é enfeite — é a parte do sistema que impede a leitura
errada do número.** O parágrafo do catálogo existe porque "comissão" sem
ressalva faria o lojista somar maçã com laranja.

**Para o redesenho:** o texto longo precisa de um lugar de verdade. Hoje ele
é um `<p>` de 11px abaixo do título, e em celular ocupa meia tela antes do
primeiro dado. A informação fica; o tratamento precisa mudar.

Note também que `/monitoramento/fretes` **cita um caminho de rota
(`/api/monitoramento/frete`) para o usuário final.** É nota de
desenvolvedor vazando na interface.

---

## 2. Vocabulário: o mesmo conceito com nomes diferentes

Contagem de ocorrência no código inteiro:

| conceito | termos e contagem | situação |
|---|---|---|
| dinheiro que entrou | **receita 1.235** · faturamento 82 · GMV 1 | "receita" é o padrão; os outros dois são ruído |
| a transação | **pedido 1.069** · venda 685 · order 148 | **dois termos vivos.** "Vendas" é o módulo, "pedido" é a linha |
| o que está no canal | **anúncio 632** · item 1.164 · listing 3 | `item` é quase todo código (`pedido_itens`), não rótulo |
| quem usa o sistema | **operação 208** · empresa 190 · organização 4 | **três palavras para duas coisas** — ver abaixo |
| onde vende | **canal 1.814** · marketplace 44 | "canal" é o padrão, firme |
| quem olhou | **visitas 665** · cliques 86 · sessões 38 | "visitas" é o padrão; os outros são de publicidade |

### 2.1 O caso sério: empresa, operação, organização

São **dois** conceitos reais no banco:

- **organização** — a empresa cliente (`organizacoes`)
- **operação** — a unidade de dado dentro dela (`operacoes`), onde pedido,
  anúncio e custo moram

Mas a interface usa **três** palavras, e nem sempre na mesma função:

- o menu diz **"Empresas"**
- a tela que ele abre gerencia **organizações** e, dentro de cada uma, **operações**
- o seletor do topo (`SeletorEmpresa`) troca de **operação**, não de empresa
- o cookie e o cabeçalho de RLS se chamam `operacao` / `x-operacao`

**O seletor chamado "empresa" troca operação.** Com uma operação por
empresa — o caso de hoje — ninguém nota. Com duas operações na mesma
empresa, o rótulo mente.

**Para o redesenho:** escolher duas palavras e fixá-las. A sugestão que o
dado suporta: **"empresa"** para a organização (é como o Eduardo fala) e
**"operação"** para a unidade. Então o seletor do topo precisa dizer
"operação", ou mostrar os dois níveis.

---

## 3. Jargão exposto sem explicação

O glossário tem **30 verbetes** e não vive no código — vem da tabela
`glossario` (semeada em `db/04_seed.sql`), lida por
`src/lib/dados/glossario.ts`. Termo novo cadastrado no banco aparece sem
deploy.

Cruzando os 30 verbetes com o que as telas de fato escrevem:

| termo na tela | ocorrências | verbete |
|---|---|---|
| SKU | 727 | **não tem** |
| MLB | 489 | **não tem** |
| ticket | 232 | sim — "Ticket médio" |
| Full | 161 | **não tem** |
| TACoS | 87 | sim — "TACOS" |
| ROAS | 34 | sim |
| curva A | 29 | sim — "Curva A" |
| elasticidade | 20 | **não tem** |
| MTD | 16 | sim |
| CPC | 14 | **não tem** |
| ABC | 12 | **não tem** (há "Curva A", não a curva ABC) |
| MoM | 9 | sim |
| rebate | 7 | **outra palavra** — o verbete é "Redução de tarifa" |
| CTR | 4 | **não tem** |
| GMV | 2 | sim |
| YoY | 2 | **não tem** (há "YTD" e "WoW") |

**Sete termos sem verbete, e os dois mais usados estão entre eles:** `SKU`
(727 vezes) e `MLB` (489). São exatamente os que um lojista novo encontra na
primeira tabela que abrir.

**Um caso pior que a falta: `rebate` e "Redução de tarifa" são a mesma
coisa com dois nomes.** A tela diz uma palavra, o glossário responde pela
outra. Quem procurar "rebate" não acha.

Existe `/glossario` (156 linhas de interface) e ele é bom — tem definição,
cálculo e onde encontrar. Mas é uma tela separada: o usuário sai do número
para ir ler e precisa voltar.

**Para o redesenho:** o glossário quer virar ajuda no lugar — o termo
sublinhado que explica onde está, sem navegar. Mantenha a tela para quem
quer ler tudo.

---

## 4. Estado vazio: o melhor hábito do sistema

| componente | telas | o que diz |
|---|---|---|
| `EmptyState` | 10 | ícone + título + o que fazer |
| `SemFonte` | 9 | **qual fonte falta e como ligá-la** |
| `TudoCerto` | 3 | nada errado, dito como notícia boa |
| `ErroComSaida` | 2 | erro com um caminho de volta |

**Vinte e uma telas tratam o vazio de propósito** (mais as 4 do financeiro,
que herdam o `EmptyState` de dentro do componente `Cadastro`). `SemFonte` é
o achado: em vez de "sem dados", ele nomeia a planilha ou a API que falta e
manda para a tela de ligar.

Isso é raro e deve sobreviver ao redesenho sem perder uma palavra.

**O que falta:** `ComingSoon` existe no código e tem **zero uso**. Das sete
telas em pé mas escondidas do menu (§6 do documento 01), **cinco** usam
`SemFonte` e explicam o que falta; **duas não avisam nada** —
`/anuncios/preco-alvo` e `/relatorios/apresentacao`. Quem chegar nelas por
URL direta vê tela meio-feita sem explicação.

---

## 5. Métricas por tela

As métricas que cada módulo mostra, para o redesenho saber o que precisa
caber:

### Vendas
receita · pedidos · ticket médio · visitas · conversão · cancelamento (valor
e quantidade) · meta e progresso · variação contra período anterior

Seis métricas × até quatro períodos lado a lado em `/vendas/diario`.
**É o maior aperto de grade do sistema.**

### Mercado Livre
visitas · vendas · conversão · preço de vitrine · preço mínimo · preço de
tabela · desvio percentual · comissão apurada · rebate · tipo de anúncio ·
Buy Box (ganhando/perdendo) · elasticidade · curva ABC

`/anuncios/analise` carrega 13 colunas em tabela escrita à mão.

### Financeiro
receita · custo fixo · custo variável · custo avulso · comissão · frete ·
publicidade · margem por SKU, canal, conta e anúncio

Seis recortes na mesma tela (`/financeiro`), cada um com grade própria.

### Planejamento
meta mensal · realizado · estratégia por canal · foco · calendário de
campanha

---

## 6. Formatação de número

Em `src/lib/format.ts`, e aplicada pela classe `.num`. **É o padrão mais bem
seguido do sistema** — todo número do front passa pela mesma função e pela
mesma fonte monoespaçada com `tabular-nums`.

Moeda em `R$` com separador brasileiro; percentual com sinal; data em
`dd/mm`. Não encontrei divergência.

**Para o redesenho:** trocar a fonte de número é a mudança de maior raio de
alcance no sistema inteiro. Alinhamento de coluna em 19 tabelas escritas à
mão depende de `tabular-nums` estar ativo.

---

## 7. Tom

O texto do sistema tem voz própria, e ela é consistente: direta, em primeira
pessoa do plural quando precisa, e disposta a dizer o que **não** sabe.

Exemplos literais:

- "Só entra pedido em que o canal informou a comissão"
- "nenhuma planilha traz esse número"
- "só há a comparação de médias — que mistura produto"
- "O que houver de cancelamento aqui é o patamar normal de cada canal"

**Isso é o ativo editorial da plataforma.** Um sistema de análise que admite
o limite do próprio dado é o que separa relatório de adivinhação.

**Para o redesenho:** não reescrever para encurtar. O texto é longo porque
diz algo. Se precisar de menos texto na primeira tela, dobre-o — não o apague.

---

## 8. O que não deu para medir

| | motivo |
|---|---|
| texto que só aparece em erro de rede | exigiria derrubar o Supabase |
| mensagem de validação de formulário | só aparece com submissão inválida; a conta de captura é só leitura |
| texto dentro de gráfico Recharts | gerado em runtime a partir do dado |
| `/planejamento` | 5.040 linhas de outro agente, sem commit — contado no total, não auditado frase a frase |

---

*Medido em 07/10/2026. Evidência em
`docs/auditoria-visual-2026-10-07/evidencias/conteudo.json`.*
