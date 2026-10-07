# O front hoje — levantamento

Documento 1 de 3. Este descreve **o que existe**, medido no código em
07/10/2026. O que mudar vem no documento 2; as imagens de referência, no 3.

Base: `evidencias/inventario-codigo.json` — 48 telas, 148 arquivos — mais
as medições deste levantamento.

---

## 1. O resumo em números

| | |
|---|---|
| Telas | **48** (40 no menu, 8 fora: login, cadastro, convite, relatório) |
| Componentes de UI criados | **40** |
| Componentes usados em 3 telas ou mais | **4** |
| Tamanhos de fonte diferentes | **14** |
| Telas que escrevem `<table>` na mão | **19** |
| Telas que usam o componente de tabela | **0** |
| Frases de interface com mais de 80 caracteres | **78** |
| Telas com gráfico | 13 |
| Telas com barra de filtros | 15 |

As três linhas em negrito são o diagnóstico inteiro: existe um sistema de
design, quase nada o usa, e cada tela resolveu sozinha.

---

## 2. O sistema visual

### 2.1 Cor

Tokens em `src/app/globals.css`, com tema claro e escuro completos.

**Superfícies e texto**

| token | claro | escuro | papel |
|---|---|---|---|
| `--ground` | `#f5f6f8` | `#0b0d12` | fundo da página |
| `--panel` | `#ffffff` | `#14171f` | cartão |
| `--panel-2` | `#fafafc` | `#1b1f29` | campo, linha alternada |
| `--panel-3` | `#eff1f4` | `#232834` | hover, chip |
| `--line` | `#e3e6eb` | — | divisória |
| `--line-2` | `#c9cfd8` | — | borda de controle |
| `--ink` | `#101828` | `#e8ecf1` | texto principal |
| `--ink-2` | `#4a5568` | — | texto secundário |
| `--ink-3` | `#8a94a6` | — | rótulo, legenda |

**Marca e semântica**

| token | valor | papel |
|---|---|---|
| `--brand` | `#0f5c57` | verde-petróleo, única cor de ação |
| `--up` | `#0f7b54` | positivo |
| `--warn` | `#a66a12` | atenção |
| `--down` | `#b23a2b` | negativo |
| `--info` | `#1f6fb2` | informação |

**Séries de gráfico:** `--s1` a `--s10`, começando no próprio verde da
marca.

**O que está bom:** a paleta é sóbria, os neutros têm viés frio coerente,
e os dois temas existem de verdade — não é inversão automática.

**O que incomoda:** `--brand` e `--up` são ambos verdes escuros
(`#0f5c57` e `#0f7b54`). Num gráfico ou num botão ao lado de um delta
positivo, os dois se confundem. A cor de ação e a cor de "subiu" deveriam
ser distinguíveis de relance.

### 2.2 Tipografia

**Inter** para interface, **JetBrains Mono** para número.

Inter é a escolha padrão de praticamente toda interface gerada por IA nos
últimos dois anos. Não é uma fonte ruim — é uma fonte sem opinião, e é
parte do que dá a "cara de IA" que você descreveu.

**A escala, por frequência de uso:**

```
276×  12px        23×  14px
237×  11px        19×  19px
193×  13px        12×  22px
160×  12.5px      11×  20px
127×  11.5px      11×  15px
 29×  10.5px      10×  13.5px
 25×  10px         8×  17px
```

**Catorze tamanhos. Seis deles entre 10,5 e 13,5 — meio pixel de
diferença entre vizinhos.** Ninguém percebe 12 contra 12,5 como
hierarquia; percebe como desalinho. Isso não é escala tipográfica, é uma
sequência de decisões pontuais.

E o maior texto do sistema tem **22px**. Num painel de 1920px de largura,
nada passa de 22px. A tela inteira fala no mesmo tom de voz.

### 2.3 Espaçamento, raio e sombra

```
--r1: 6px    --r2: 10px    --r3: 14px
--row: 32px (desktop) / 42px (toque)
--rail: 236px    --topbar: 52px
--sh-1 / --sh-2 / --sh-3
```

Os tokens existem e são razoáveis. O problema é que as telas usam
`px-3 py-2 gap-2` direto do Tailwind em vez deles — 115 ocorrências de
`px-3`, 91 de `py-2`. O token de espaçamento virou decoração.

### 2.4 Gráficos

**Recharts**, com um módulo `chart.tsx` que exporta `SERIES`, `AXIS`,
`GRID`, `ChartTooltip` e `Legend` — justamente para manter coerência.

13 telas têm gráfico. Vale conferir uma a uma se todas passam por esses
exports ou se alguma estiliza o eixo por conta própria.

---

## 3. A estrutura de navegação

### 3.1 A moldura

```
┌─────────────────────────────────────────────────────────┐
│ ▟ Plataforma │ [Empresa ▾]        🔍  🔔  ☀  (EL)      │ 52px
├──────────────┬──────────────────────────────────────────┤
│              │  migalha                                 │
│   rail       │  Título da tela            [filtros]     │
│   236px      │  descrição                               │
│              ├──────────────────────────────────────────┤
│   menu       │                                          │
│   agrupado   │  corpo                                   │
│              │                                          │
└──────────────┴──────────────────────────────────────────┘
```

**Barra superior:** marca, seletor de empresa, busca global, alertas,
tema, avatar.

**Rail lateral (236px):** grupos que abrem e fecham. Some no celular, onde
entram 4 abas no rodapé.

**`PageHeader`:** migalha, título, descrição, ações, filtros. É o único
componente que toda tela usa igual — e é o que dá a pouca unidade que o
sistema tem.

### 3.2 O menu

| grupo | telas |
|---|---|
| Visão geral | — |
| Planejamento | — |
| Conversar | — |
| Alertas | — |
| Importar | — |
| **Vendas** | Por canal · Anual · Dia · Mês até aqui · Semanal · Comparar período · Comparativos · Análise de SKU · Cancelamentos · Metas · Lançamentos |
| **Mercado Livre** | Análise de anúncios · Catálogo · Clássico vs Premium · Lógica de promoção · Campanhas · Processar planilha · Histórico |
| **Financeiro** | Painel · Custos · Categorias · Folha · Fornecedores · Contas a pagar |
| **Relatórios** | Exportações |
| rodapé | Empresas · Canais e contas · Equipe · Glossário · Configurações |

**Vendas tem 11 itens.** É o maior grupo e não tem subdivisão. "Dia",
"Semanal", "Mês até aqui", "Anual", "Comparar período" e "Comparativos"
são seis recortes de tempo listados como se fossem assuntos diferentes.

---

## 4. A biblioteca de componentes

40 exports em `src/components/`. O uso real:

| componente | telas que usam |
|---|---|
| `Panel` | **36** |
| `BarraFiltros` | **15** |
| `Leitura` | 3 |
| `StatTile` · `Metrica` · `Segmented` | 2 |
| `CartaoAlerta` · `EmptyState` · `Sparkline` · `SeletorCanal` | 1 |
| **`DataTable`** | **0** |
| **`Tabela`** | **0** |
| **`Tabs`** | **0** |
| **`Matriz`** | **0** |
| **`SemFonte`** | **0** |
| **`CompararPeriodo`** | **0** |
| **`Skeleton`** | **0** |

Sete componentes com zero uso. E **19 telas escrevem `<table>` na mão** —
cada uma com seu próprio cabeçalho, seu próprio alinhamento, sua própria
borda.

É a causa direta da inconsistência: não é que as telas foram desenhadas
diferente. É que cada uma foi desenhada de novo.

### Inventário completo

**Primitivos** — `Button` (4 variantes, 2 tamanhos) · `Panel` ·
`PanelHeader` · `Badge` (6 tons) · `Delta` · `EmptyState` · `Skeleton`

**Controles** — `Segmented` · `Tabs` · `Input` · `Field` · `Select` ·
`Toggle` · `Checkbox` · `Progress` · `FileDrop` · `Sheet` ·
`FilterSheet` · `KeyValue` · `SectionTitle` · `HeatCell`

**Dados** — `DataTable` · `Tabela` · `Matriz` · `Metrica` · `Celula` ·
`StatTile` · `Sparkline` · `chart` (Recharts)

**Estado** — `Leitura` · `TudoCerto` · `ErroComSaida` · `SemFonte` ·
`Carregando` · `CartaoAlerta`

**Específicos** — `SeletorCanal` · `SelectRecorte` · `CompararPeriodo` ·
`PainelExclusoes` · `BarraFiltros` (+ `Filtro`, `FiltroAcoes`,
`FiltroDivisor`)

**Moldura** — `AppShell` · `PageHeader` · `PageBody` · `BuscaGlobal` ·
`SeletorEmpresa` · `ComingSoon`

---

## 5. Tela a tela

Linhas = código próprio da tela, sem contar componentes compartilhados.
Estados = `useState` declarados, um indicador grosseiro de interatividade.

### 5.1 Visão geral e operação

| tela | linhas | estados | o que tem |
|---|---|---|---|
| `/` Visão geral | 513 | 2 | filtros, seletor de canal, fontes de dados, cards de receita, produtos com maior receita, recomendações |
| `/alertas` | 92 | 1 | filtro por severidade (Todos/Críticos/Atenção), cartões de alerta, painel de exclusões, estado "tudo certo" |
| `/conversa` | 359 | 6 | chat com a IA, bolhas, botão de recomeçar |
| `/importar` | 648 | 10 | área de arrastar arquivo, prévia antes de gravar, resultado |
| `/planejamento` | **5.040** | **66** | calendário, quadro, mapa, editor de estratégia, foco — tela própria com CSS próprio (1.382 linhas) |

`/planejamento` é dez vezes maior que a média e traz o próprio
`planejamento.css`. É um aplicativo dentro do aplicativo.

### 5.2 Vendas — 11 telas

| tela | linhas | estados | recorte |
|---|---|---|---|
| `/vendas/lancamentos` | 943 | 9 | entrada manual por canal e mês |
| `/vendas/anual` | 836 | 4 | ano, com metas e progresso |
| `/vendas/diario` | 830 | 4 | comparar períodos lado a lado |
| `/vendas/semanal` | 767 | 5 | semana, participação por canal |
| `/vendas/comparativos` | 755 | 6 | até 4 períodos, métrica a métrica |
| `/vendas/cancelamentos` | 734 | 2 | cancelamento por canal e motivo |
| `/vendas/metas` | 670 | 9 | planejar meta por canal |
| `/vendas/skus` | 660 | 7 | análise por SKU |
| `/vendas/mtd` | 622 | 6 | mês até aqui |
| `/vendas/canais` | 603 | 4 | por canal, com sparkline e delta |
| `/vendas/dia` | 451 | 0 | um dia |

**7.871 linhas** para onze recortes do mesmo dado. Dia, semana, mês, ano e
duas telas de comparação resolvem a mesma pergunta — "como foi o período"
— com cinco layouts diferentes.

### 5.3 Mercado Livre — 7 telas

| tela | linhas | estados | o que tem |
|---|---|---|---|
| `/anuncios/analise` | 1.100 | 10 | tabela de anúncios, lentes, elasticidade, sparkline, indicador de preço |
| `/promocoes/processar` | 1.089 | 10 | subir planilha, decisão por anúncio, baixar resultado |
| `/anuncios/catalogo` | 1.082 | 12 | catálogo, ganhando/perdendo Buy Box |
| `/anuncios/preco-ideal` | 868 | 10 | lógica de promoção, filtros, tabela de preço |
| `/promocoes/comparar` | 571 | 6 | comparar ofertas |
| `/anuncios/tipo` | 477 | 0 | clássico vs premium |
| `/promocoes/campanhas` | 411 | 7 | campanhas ativas |
| `/promocoes/historico` | 382 | 9 | histórico de processamento |

As três maiores do sistema estão aqui. `/anuncios/analise` tem 10 estados
e constrói a própria tabela.

### 5.4 Financeiro — 6 telas

| tela | linhas | estados |
|---|---|---|
| `/financeiro/custos` | 1.102 | 14 |
| `/financeiro` Painel | 557 | 2 |
| `/financeiro/contas` | 349 | 0 |
| `/financeiro/folha` | 272 | 0 |
| `/financeiro/fornecedores` | 227 | 0 |
| `/financeiro/categorias` | 182 | 0 |

Quatro delas usam um componente `Cadastro` compartilhado — **é o único
lugar do sistema onde telas parecidas de fato compartilham layout.** É o
padrão que deveria valer em todo o resto.

### 5.5 Gestão e acesso

| tela | linhas | estados |
|---|---|---|
| `/empresas` | 469 | 16 |
| `/integracoes/canais` | 381 | 1 |
| `/equipe` | 340 | 5 |
| `/configuracoes` | 253 | 2 |
| `/glossario` | 167 | 2 |
| `/integracoes` | 179 | 0 |

### 5.6 Fora da moldura

| tela | linhas | nota |
|---|---|---|
| `/relatorio/[chave]` | **1.675** | abre sem login, componentes próprios (`Kpi`, `Secao`, `GradeKpi`, `Colunas`, `Interpretacao`) |
| `/cadastro` · `/entrar` · `/comecar` · `/convite` | 708 | fluxo de entrada |

O relatório tem **seu próprio vocabulário visual**, que não existe em
nenhuma outra tela. É a tela que vai para a diretoria, e é a única que foi
desenhada como peça.

### 5.7 Em standby (fora do menu, rota viva)

`/anuncios/preco-performance` · `/anuncios/preco-alvo` ·
`/anuncios/trafego-pago` · `/promocoes/comparar` ·
`/monitoramento/precos` · `/monitoramento/fretes` ·
`/relatorios/apresentacao`

---

## 6. A escrita

**78 frases de interface passam de 80 caracteres.** Exemplos reais:

> "Cancelamento, receita e conversão estão dentro do padrão do período.
> Este estado também é uma resposta — não precisa procurar."

> "A comparação justa exige o mesmo produto anunciado como Clássico e como
> Premium, com visita nos dois. Sem isso, só há a comparação de médias —
> que mistura tipo e mix."

> "Exporte o relatório de anúncios patrocinados no Mercado Livre e suba na
> tela de Importar. Ele traz investimento, cliques e receita atribuída por
> anúncio e por campanha."

Cada uma está **correta e é útil**. O problema é o acúmulo: a tela explica
antes de mostrar, e em `text-[11.5px]` cinza. Você lê um parágrafo para
chegar ao número.

Três vícios aparecem em quase todas:

1. **Travessão de aparte** — "é uma resposta — não precisa procurar"
2. **"Não X, mas Y"** — "não é sugestão de causa — é o que os dados mostram"
3. **Explicar a metodologia na tela** em vez de no glossário

---

## 7. O que levar para o documento 2

Em ordem de impacto:

**1. A escala tipográfica.** 14 tamanhos, seis deles colados. É a causa
mais visível da sensação de "feito por IA".

**2. Sete componentes com zero uso e 19 tabelas na mão.** Não falta
sistema de design — falta usar o que existe.

**3. Inter.** Trocar por uma dupla com opinião muda a percepção mais do
que qualquer outra decisão isolada.

**4. Vendas com 11 itens e 7.871 linhas** para recortes do mesmo dado.

**5. Texto antes do número.** 78 frases longas competindo com o conteúdo.

**6. `--brand` e `--up` quase idênticos.** Ação e "subiu" não podem ser a
mesma cor.

**7. `/relatorio` já é bonito e não contamina o resto.** Ele prova que dá
para fazer melhor dentro desta base — e é o lugar mais óbvio de onde tirar
o vocabulário visual do resto.

---

*Levantado do código em 07/10/2026. Nada aqui é opinião sobre o que fazer
— isso é o documento 2.*
