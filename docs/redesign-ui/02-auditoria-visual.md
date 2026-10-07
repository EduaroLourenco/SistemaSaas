# Auditoria visual

Medido em 07/10/2026. Contraste é WCAG 2.1 calculado do hexadecimal, não
estimado a olho; altura de página sai do cabeçalho dos PNGs capturados.
Script: `docs/auditoria-visual-2026-10-07/medir-visual.mjs`. Evidência:
`evidencias/visual.json`.

As capturas que sustentam cada item estão em `screenshots/` — página
inteira na pasta do módulo, e a **dobra** (só o que cabe na janela, sem
rolar) em `screenshots/dobra/`.

---

## 1. O que está certo e deve sobreviver

Começo por aqui porque o redesenho vai ser tentado a jogar fora junto.

**A disciplina do número.** Todo número passa pela classe `.num` —
JetBrains Mono com `tabular-nums` e `"zero" 1`. Coluna de tabela alinha,
dígito não dança entre linhas. É o padrão mais bem seguido do sistema.

**O foco visível.** `:focus-visible` com anel duplo de 2px + 2px na cor da
marca, global. É o item de acessibilidade mais bem resolvido hoje.

**`prefers-reduced-motion`** respeitado globalmente: animação e transição
caem para 0,01ms.

**O tema escuro foi desenhado, não invertido.** Os valores do bloco escuro
são escolhas próprias, e **contrastam melhor que o tema claro em 11 dos 17
pares medidos**.

**`--row` engorda no toque** (`@media (pointer: coarse)`: 32px → 42px). É o
único ajuste real de acessibilidade motora do sistema.

**O painel de frescura de fonte** na Visão geral — cada fonte de dado com a
data em que foi abastecida, e atraso marcado em cor. Resolve a pergunta
"esse número é de quando?" antes que ela seja feita.

**O vazio é tratado.** 21 telas dizem o que falta e como resolver, não
"sem dados". Ver documento 04, §4.

---

## 2. Contraste — seis reprovações medidas

WCAG 2.1 AA: texto normal precisa de **4,5:1**; elemento de interface e
divisória, **3:1**.

| par | claro | escuro | alvo | |
|---|---|---|---|---|
| texto principal sobre cartão | 17,75 | 15,26 | 4,5 | ✅ |
| texto principal sobre fundo | 16,41 | 16,55 | 4,5 | ✅ |
| texto secundário sobre cartão | 7,53 | 7,92 | 4,5 | ✅ |
| **rótulo/legenda sobre cartão** | **3,06** | **3,92** | 4,5 | ❌ |
| **rótulo sobre campo** | **2,93** | **3,60** | 4,5 | ❌ |
| texto do botão primário | 7,81 | 5,56 | 4,5 | ✅ |
| link/marca sobre cartão | 7,81 | 5,85 | 4,5 | ✅ |
| número positivo | 5,27 | 6,63 | 4,5 | ✅ |
| número negativo | 5,94 | 5,67 | 4,5 | ✅ |
| **número de atenção** | **4,48** | 6,75 | 4,5 | ❌ |
| número informativo | 5,28 | 6,53 | 4,5 | ✅ |
| selo positivo | 4,52 | 5,66 | 4,5 | ✅ |
| selo negativo | 4,83 | 5,19 | 4,5 | ✅ |
| **selo de atenção** | **3,89** | 5,81 | 4,5 | ❌ |
| selo da marca | 6,69 | 4,57 | 4,5 | ✅ |
| **divisória sobre cartão** | **1,25** | **1,26** | 3 | ❌ |
| **borda de controle** | **1,57** | **1,74** | 3 | ❌ |

### 2.1 O pior caso: `--ink-3`, a cor de rótulo

```css
--ink-3: #8a94a6   /* 3,06:1 sobre --panel */
```

É a cor de **todo rótulo de coluna, legenda de gráfico e texto de apoio** do
sistema — e é a classe `.label`, que escreve em **11px, maiúscula**. Texto
pequeno, em caixa alta, a 3,06:1.

**É a correção de maior alcance e menor custo do pacote inteiro.** Escurecer
`--ink-3` de `#8a94a6` para algo em torno de `#6b7488` leva o par a ~4,5:1
sem tocar em mais nada.

### 2.2 `--warn` raspa e o selo reprova

```css
--warn: #a66a12      /* 4,48:1 sobre --panel — falta 0,02 */
--warn-wash: #f8eedb /* 3,89:1 — o selo de atenção reprova */
```

O número de atenção perde por dois centésimos. O selo, que usa o mesmo tom
sobre fundo claro, perde de verdade.

### 2.3 Divisórias a 1,25:1

`--line` (`#e3e6eb`) e `--line-2` (`#c9cfd8`) estão muito abaixo de 3:1. Em
19 telas que desenham tabela à mão, a divisória **é** a estrutura da grade.

**Ressalva honesta:** 3:1 vale para elemento que carrega informação. Uma
divisória puramente decorativa não é regulada. Mas numa tabela de 13
colunas, a linha não é decorativa — é o que separa um número do outro.

---

## 3. Cor semântica que colide

| par | hex | distância | razão |
|---|---|---|---|
| **`--brand` vs `--up`** | `#0f5c57` vs `#0f7b54` | **31** | 1,48 |
| `--warn` vs `--down` | `#a66a12` vs `#b23a2b` | 55 | 1,33 |

**`--brand` e `--up` são praticamente a mesma cor.** O verde da marca e o
verde de "subiu" só se distinguem lado a lado, e numa tabela nunca estão
lado a lado. O lojista não consegue dizer se o verde significa "positivo" ou
"é do sistema".

Isso aparece em toda tela que mistura selo de marca com variação — a Visão
geral, por exemplo, tem os dois no mesmo cartão.

**Para o redesenho:** separar a cor da marca da paleta semântica é a decisão
de cor mais importante a tomar. Verde de marca e verde de alta não podem ser
vizinhos.

---

## 4. Séries de gráfico: treze pares próximos demais

São 10 séries (`--s1` a `--s10`), e **13 dos 45 pares possíveis** têm
distância RGB abaixo de 80:

| |
|---|
| `--s2 #1f6fb2` vs `--s5 #2a7d96` — **distância 33** |
| `--s4 #8a4a9c` vs `--s10 #7a6ba8` — **distância 39** |
| `--s6 #b23a2b` vs `--s8 #9c5a3c` — distância 42 |
| `--s3 #a66a12` vs `--s8 #9c5a3c` — distância 46 |
| `--s3 #a66a12` vs `--s6 #b23a2b` — distância 55 |

A Visão geral desenha **7 canais** no gráfico de participação. Com sete
séries em jogo, os pares acima entram juntos e ficam indistinguíveis na
legenda.

**Agravante:** `--s1` é a própria cor da marca (`#0f5c57`), que já colide
com `--up`. A primeira série do gráfico tem o mesmo verde do indicador de
alta.

**Para o redesenho:** 10 séries categóricas distinguíveis é um problema
conhecido e resolvido — há paletas prontas que garantem separação perceptual
e segurança para daltonismo. Nenhuma verificação de daltonismo foi feita
aqui; fica como pendência (§8).

---

## 5. Tipografia: 19 tamanhos, 420 ocorrências abaixo de 12px

Não há escala tipográfica. Cada tela escreve o valor em pixel direto
(`text-[11.5px]`), e saíram **19 tamanhos distintos**:

```
12px×276  11px×237  13px×193  12.5px×160  11.5px×127  10.5px×29
10px×25   14px×23   19px×19   22px×12     15px×11     20px×11
13.5px×10 17px×8    18px×6    16px×4      24px×3      9px×2    26px×1
```

**420 das 1.154 ocorrências estão abaixo de 12px**, e 56 abaixo de 11px.
Há `text-[9px]` em uso.

Dois problemas distintos:

1. **Legibilidade.** 11px é o segundo tamanho mais usado do sistema, e a
   classe `.label` combina 11px + maiúscula + `--ink-3` a 3,06:1. Os três
   piores fatores no mesmo elemento.
2. **Ausência de escala.** 12 / 12,5 / 13 / 13,5 não são decisões — são
   ajustes locais de quem queria caber mais uma coluna. Catorze dos 19
   tamanhos aparecem menos de 30 vezes.

**Para o redesenho:** uma escala de 6 a 7 degraus com piso em 12px cobre o
sistema inteiro. Os tamanhos raros vão se acomodar nos degraus vizinhos.

---

## 6. Densidade: as páginas não têm fim

Altura real das capturas de página inteira, em "telas" de rolagem:

| captura | altura | telas |
|---|---|---|
| `mercado-livre/catalogo--mobile` | **204.227px** | **242** |
| `mercado-livre/logica-de-promocao--mobile` | 147.012px | 174 |
| `mercado-livre/analise-de-anuncios--mobile` | 112.374px | 133 |
| `mercado-livre/catalogo--desktop` | 46.137px | 51 |
| `mercado-livre/logica-de-promocao--desktop` | 43.983px | 49 |
| `fora-do-menu/comparar-ofertas--desktop` | 37.048px | 41 |
| `mercado-livre/analise-de-anuncios--desktop` | 36.890px | 41 |
| `sem-moldura/relatorio-publico--mobile` | 28.069px | 33 |
| `financeiro/custos--desktop` | 17.088px | 19 |

**O catálogo em celular tem 242 telas de rolagem.** O PNG tem 18MB e não
abre na maioria dos visualizadores — é por isso que existe a pasta `dobra/`,
com o enquadramento de janela de cada tela.

### 6.1 Por que isso acontece

Nenhuma tela pagina. A tabela imprime todas as linhas que a consulta trouxe
e a página cresce. Em celular, a mesma tabela empilha célula sobre célula,
e a altura multiplica por quatro.

### 6.2 O que isso custa

- Rolagem infinita sem orientação: não há cabeçalho fixo, não há contador de
  posição, não há "voltar ao topo"
- O rodapé de uma tabela de 51 telas é inalcançável na prática
- A impressão e o PDF do relatório ficam impraticáveis

**Para o redesenho:** paginação, virtualização ou cabeçalho fixo — alguma
das três, nas sete telas acima. É o achado de maior impacto no uso diário.

---

## 7. Largura: nada acima de 1280px

Uso medido de breakpoint:

| | |
|---|---|
| `sm:` (640) | 117× |
| `md:` (768) | 93× |
| `lg:` (1024) | 37× |
| `xl:` (1280) | 10× |
| `2xl:` (1536) | **0×** |

**Nada usa `2xl:`, e nenhum contêiner tem largura máxima.** Em 1920px o
conteúdo estica sem limite: uma tabela de 4 colunas ocupa 1.700px e o olho
perde a linha entre a primeira coluna e a última.

Na outra ponta, o corte estrutural é `md:` (768px): abaixo dele o rail de
236px some e entram quatro abas de rodapé — para 48 rotas (ver documento 06,
§5).

---

## 8. Observações das capturas

Duas telas foram inspecionadas em detalhe; o resto está no pacote para o
redesenho olhar.

### 8.1 Visão geral — o número principal não cabe

No cartão **FATURAMENTO**, o valor sai truncado com reticências:

```
R$ 1.738.530…
```

E a legenda abaixo também: `vs. 30 dias anterio…`

**O número mais importante da tela inicial não cabe na caixa que foi feita
para ele.** Acontece porque o cartão tem largura fixa em grade de 4 colunas
e o valor em JetBrains Mono a 19px passa do espaço quando chega a 7 dígitos.

Ver `screenshots/geral/visao-geral--desktop.png`.

### 8.2 Relatório público — a faixa de canal corta

Na faixa de canais do relatório, o último item aparece cortado pela borda
direita (`Magalu` sai como `Magal`). A faixa tem `overflow-x` e não há
indicação de que haja mais conteúdo à direita — nem sombra de borda, nem
seta.

O mesmo padrão (`BarraFiltros` com `overflow-x`) está em 15 telas, e em
celular é onde mais dói: o filtro ativo pode ficar fora de vista.

Ver `screenshots/dobra/sem-moldura/relatorio-publico--desktop.png`.

### 8.3 Relatório público — links para dentro do sistema

Os cartões de prioridade terminam em `ver em Estoque`, `ver em Preço`. Essa
tela **abre sem login** e vai para gestor e diretoria, que não têm conta.

Vale confirmar com o Eduardo se esses links levam a algum lugar útil para
quem só tem o link do relatório. **Registrado como pergunta, não como
defeito** — pode ser proposital, para quem é da casa.

### 8.4 A marca é um espaço em branco

A tela de entrada e a barra superior dizem **"Plataforma"**, com um quadrado
genérico como símbolo. Não há nome de produto, nem identidade.

**Para o redesenho:** é oportunidade, não defeito. O sistema vai para
clientes terceiros a partir de agora — o nome e a marca precisam ser uma
decisão, e hoje são um reservado de código.

---

## 9. Inconsistências estruturais

### 9.1 Dezenove telas escrevem `<table>` à mão

Existem `DataTable`, `Tabela` e `Matriz` no código. **Nenhum dos três é
chamado em lugar nenhum.** Enquanto isso, 19 telas escrevem 29 `<table>`
diretamente.

Consequência: cada tabela resolve sozinha altura de linha, alinhamento,
cabeçalho, ordenação e estado vazio. Não há garantia de que duas tabelas do
sistema se pareçam.

**Para o redesenho:** antes de recriar a tabela genérica, olhe por que a
anterior não foi adotada. Três tentativas abandonadas é sinal de que o
problema é mais específico do que parecia.

### 9.2 `Panel` é o único componente de fato compartilhado

`Panel` aparece em 36 das 48 telas (139 usos). `PageHeader`, em todas.
Depois desses dois, a reutilização cai muito: `StatTile` em 2 telas,
`Metrica` em 2, `Cadastro` em 4.

### 9.3 Três níveis de proteção para quatro tipos de exclusão

Ver documento 03, §5.5. `/empresas` pede que o usuário digite o nome;
`/equipe` pergunta uma vez; os cadastros do financeiro, idem. Não há padrão.

### 9.4 Não existe modal centralizado

A sobreposição do sistema é folha lateral (`Sheet`, 11 declarações) e menu em
portal. É uma decisão coerente e vale mantê-la — só precisa ser dita, porque
hoje é acidente de implementação, não regra escrita.

---

## 10. Prioridade sugerida

Ordenado por impacto sobre custo, não por gosto:

| # | o quê | custo |
|---|---|---|
| 1 | Escurecer `--ink-3` para ≥4,5:1 | **uma linha de CSS** |
| 2 | Separar `--brand` de `--up` | uma linha, mais conferência visual |
| 3 | Ajustar `--warn` e `--warn-wash` | duas linhas |
| 4 | Escurecer `--line` e `--line-2` | duas linhas |
| 5 | Largura máxima de contêiner | uma regra |
| 6 | Escala tipográfica com piso em 12px | varredura de 1.154 ocorrências |
| 7 | Paginar ou virtualizar as 7 telas gigantes | trabalho real, maior ganho de uso |
| 8 | Nova paleta de 10 séries | precisa de verificação de daltonismo |
| 9 | Navegação de celular além de 4 abas | precisa de decisão de produto |

Os quatro primeiros são **seis linhas de CSS** e resolvem todas as
reprovações de contraste medidas.

---

## 11. O que não foi possível auditar

| | motivo |
|---|---|
| **daltonismo** | não simulado; as 10 séries precisam de verificação com deuteranopia e protanopia antes de qualquer paleta nova |
| **leitor de tela** | nenhum teste com NVDA ou VoiceOver; a árvore de acessibilidade não foi inspecionada |
| **navegação só por teclado** | o anel de foco existe, mas a ordem de tabulação não foi percorrida tela a tela |
| contraste em pixel renderizado | medido no token; antialiasing e sobreposição podem alterar o valor efetivo |
| estados de erro, validação e carregamento | a conta de captura é só leitura — ver documento 03, §7 |
| `/planejamento` | 5.040 linhas e 1.382 de CSS próprio, de outro agente e sem commit; capturada, não auditada regra a regra |
| `/convite/[token]` válido | capturado só com token inválido; um válido exigiria gravar convite em produção, e visitá-lo o consome |
| desempenho de renderização | fora do escopo desta auditoria |

**Os três primeiros são lacunas de acessibilidade reais.** Esta auditoria
mediu contraste e tamanho, que são o que dá para medir sem ferramenta de
assistência. Leitor de tela e daltonismo precisam de uma passada própria.

---

*Medido em 07/10/2026. Evidência em
`docs/auditoria-visual-2026-10-07/evidencias/visual.json`.*
