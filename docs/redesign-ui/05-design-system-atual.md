# Sistema de design — especificação técnica atual

Medido no código em 07/10/2026. Descreve o que existe, não o que deveria
existir.

---

## 1. Pilha técnica

| | versão | papel |
|---|---|---|
| **Next.js** | 16.3.2 | App Router, Server Components, `force-dynamic` na maioria das telas |
| **React** | 19.1.0 | |
| **Tailwind CSS** | v4 | via `@import "tailwindcss"` — sem `tailwind.config`, tudo em CSS |
| **Recharts** | 3.10.1 | único gráfico |
| **lucide-react** | 0.469 | único ícone |
| **Supabase JS** | 2.112 | dado, sob RLS |
| **ExcelJS** | 4.4 | planilha, no servidor |

**Não há biblioteca de componentes** (Radix, shadcn, MUI, Headless). Todo
controle é escrito à mão em `src/components/`.

Tailwind v4 **sem arquivo de configuração**: o tema vive em
`src/app/globals.css`, num bloco `@theme inline` que espelha as variáveis
CSS para utilitários (`--color-ink` → `text-ink`).

---

## 2. Tokens

Arquivo único: **`src/app/globals.css`**.

### 2.1 Cor — tema claro (`:root`)

```css
--ground:  #f5f6f8   /* fundo da página */
--panel:   #ffffff   /* cartão */
--panel-2: #fafafc   /* campo, linha alternada */
--panel-3: #eff1f4   /* hover, chip */

--line:    #e3e6eb   /* divisória */
--line-2:  #c9cfd8   /* borda de controle */

--ink:     #101828   /* texto principal */
--ink-2:   #4a5568   /* secundário */
--ink-3:   #8a94a6   /* rótulo, legenda */

--brand:      #0f5c57   --brand-2:    #0a4340
--brand-ink:  #ffffff   --brand-wash: #e4f0ee   --brand-edge: #b6d6d1

--up:   #0f7b54   --up-wash:   #e2f1ea
--warn: #a66a12   --warn-wash: #f8eedb
--down: #b23a2b   --down-wash: #f9e3df
--info: #1f6fb2   --info-wash: #e2eef8
```

### 2.2 Cor — tema escuro

Redefinição completa sob `@media (prefers-color-scheme: dark)` e sob
`[data-theme="dark"]`. Não é inversão: os valores foram escolhidos.

```css
--ground:  #0b0d12
--panel:   #14171f
--panel-2: #1b1f29
--panel-3: #232834
--ink:     #e8ecf1
```

### 2.3 Séries de gráfico

```css
--s1:  #0f5c57   --s2:  #1f6fb2   --s3:  #a66a12   --s4:  #8a4a9c
--s5:  #2a7d96   --s6:  #b23a2b   --s7:  #5f7a2e   --s8:  #9c5a3c
--s9:  #4d5a75   --s10: #7a6ba8
```

Dez séries. A primeira é a própria cor da marca.

### 2.4 Forma, sombra e medida

```css
--r1: 6px    --r2: 10px    --r3: 14px

--sh-1: 0 1px 2px rgba(16,24,40,.05)
--sh-2: 0 1px 3px rgba(16,24,40,.08), 0 8px 24px -12px rgba(16,24,40,.18)
--sh-3: 0 16px 48px -16px rgba(16,24,40,.28)

--veil: rgba(16,24,40,.42)    /* fundo de modal */
--grid: rgba(16,24,40,.08)    /* grade de gráfico */

--row:    32px   /* 42px quando o ponteiro é grosso */
--rail:   236px  /* menu lateral */
--topbar: 52px
```

`--row` troca por `@media (pointer: coarse)` — a linha engorda no toque.

### 2.5 Tipografia

```css
--f-ui:  Inter        (next/font/google, variável --font-inter)
--f-num: JetBrains Mono (variável --font-mono)
```

**Não há tokens de tamanho.** Cada tela escreve `text-[12px]`,
`text-[11.5px]` e assim por diante. **Dezenove tamanhos distintos** em uso,
por frequência:

```
12px×276  11px×237  13px×193  12.5px×160  11.5px×127  10.5px×29
10px×25   14px×23   19px×19   22px×12     15px×11     20px×11
13.5px×10 17px×8    18px×6    16px×4      24px×3      9px×2    26px×1
```

**Quatrocentos e vinte ocorrências estão abaixo de 12px** — 11px (237),
11.5px (127), 10.5px (29), 10px (25) e 9px (2). Ver documento 02.

### 2.6 Espaçamento

**Não há tokens de espaçamento.** As telas usam a escala do Tailwind
direto: `px-3` (115×), `py-2` (91×), `gap-2`, `gap-3`, `mt-1.5`.

---

## 3. Classes próprias

Quatro, em `globals.css`:

| classe | o que faz |
|---|---|
| `.num` | JetBrains Mono, `tabular-nums`, `"zero" 1`, `letter-spacing: -0.01em` — **a assinatura do sistema**; todo número passa por ela |
| `.panel` | fundo, borda e raio de cartão (`+ .panel-1` / `.panel-2` para sombra) |
| `.label` | 11px, 600, maiúscula, `letter-spacing .04em`, cor `--ink-3` |
| `.hairline` | borda inferior de 1px |

Além disso:

- **Foco visível global**: `:focus-visible` recebe anel duplo de 2px + 2px
  na cor da marca. Está certo e é consistente.
- **Barra de rolagem** estilizada, 10px, polegar `--line-2`.
- **`prefers-reduced-motion`** respeitado globalmente — animação e
  transição caem para 0,01ms.
- `* { border-color: var(--line) }` — borda padrão do sistema inteiro.

---

## 4. Breakpoints

Os do Tailwind, sem customização:

| prefixo | largura | uso medido |
|---|---|---|
| `sm:` | 640px | **117×** |
| `md:` | 768px | **93×** |
| `lg:` | 1024px | 37× |
| `xl:` | 1280px | 10× |

O corte estrutural é **`md:`**: abaixo dele o rail lateral some e entram as
abas de rodapé (`MOBILE_TABS`).

Não há tratamento para telas largas — nada usa `2xl:`, e nenhum contêiner
tem largura máxima. Em 1920px o conteúdo estica.

---

## 5. Componentes compartilhados

### 5.1 Moldura — `src/components/layout/`

| componente | papel |
|---|---|
| `AppShell` | barra superior + rail + abas de celular; pula a moldura em rotas de `SEM_MOLDURA` |
| `PageHeader` | migalha, título, descrição, `actions`, `filters` — **o único componente que toda tela usa igual** |
| `PageBody` | contêiner do conteúdo |
| `BuscaGlobal` | busca por anúncio, tela e termo |
| `SeletorEmpresa` | troca de operação; some com menos de 2 |
| `BarraFiltros` + `Filtro`, `FiltroAcoes`, `FiltroDivisor` | faixa de filtros, 15 telas |
| `ComingSoon` | placeholder de tela não construída |

### 5.2 Primitivos — `primitives.tsx`

| componente | variações |
|---|---|
| `Button` | `primary` · `default` · `ghost` · `danger` × `sm` · `md` |
| `Panel` / `PanelHeader` | cartão |
| `Badge` | `neutral` · `brand` · `up` · `warn` · `down` · `info` |
| `Delta` | variação com sinal e cor |
| `EmptyState` | ícone + título + descrição |
| `Skeleton` | **uso zero** |

### 5.3 Controles — `controls.tsx`

`Segmented` · `Tabs` · `Input` · `Field` · `Select` · `Toggle` ·
`Checkbox` · `Progress` · `FileDrop` · `Sheet` · `FilterSheet` ·
`KeyValue` · `SectionTitle` · `HeatCell`

### 5.4 Dados

| componente | uso |
|---|---|
| `chart.tsx` | `SERIES`, `AXIS`, `GRID`, `ChartTooltip`, `Legend` — exports de coerência para Recharts |
| `StatTile` + `Sparkline` | 2 telas |
| `Metrica` + `Celula` + `REGRAS` | 2 telas |
| `DataTable` | **uso zero** |
| `Tabela` | **uso zero** |
| `Matriz` | **uso zero** |

### 5.5 Estado

`Leitura` · `TudoCerto` · `ErroComSaida` · `SemFonte` · `Carregando` ·
`CartaoAlerta`

### 5.6 Específicos

`SeletorCanal` (menu em portal, por causa do `overflow-x` da faixa de
filtros) · `SelectRecorte` · `CompararPeriodo` (**uso zero**) ·
`PainelExclusoes` · `Cadastro` (financeiro — 4 telas, o único caso de
layout realmente compartilhado entre telas irmãs)

---

## 6. Padrões de implementação

### 6.1 Renderização

Quase toda tela é **Server Component** com `export const dynamic =
"force-dynamic"`, que lê o dado no servidor sob RLS e passa pronto para um
componente cliente irmão (`*-cliente.tsx`).

Consequência para o redesenho: **a estrutura de dados chega pronta na
camada visual.** Mudar o visual não exige tocar na consulta.

### 6.2 Tema

Três estados: escolha explícita (`[data-theme]` no `<html>`), e o padrão do
sistema (nenhum atributo, só `prefers-color-scheme`). O componente
`Aparencia` em `/configuracoes` grava a escolha.

### 6.3 Ícone

`lucide-react`, importado por nome em cada tela. Tamanho quase sempre
`w-3.5 h-3.5` ou `w-4 h-4`.

### 6.4 Número

Formatação em `src/lib/format.ts`, e visual pela classe `.num`. É o padrão
mais bem seguido do sistema.

---

## 7. O que isto significa para o redesenho

**Pode mudar sem tocar em lógica:**

- Todos os tokens de cor, sombra, raio e medida
- A tipografia inteira — fonte e escala
- `PageHeader`, `AppShell`, o rail e as abas de celular
- Todo componente em `src/components/ui/`
- O layout interno de qualquer `*-cliente.tsx`

**Precisa de cuidado:**

- `.num` é usada em centenas de lugares; trocar a fonte de número muda
  alinhamento de coluna em todas as tabelas
- `--row` alimenta altura de linha em tabelas feitas à mão
- `SERIES` é lida por 13 telas de gráfico
- O bloco `@theme inline` traduz variável CSS em utilitário Tailwind:
  renomear um token quebra o `className` de quem o usa

**Não se mexe:**

- A camada de dados (`src/lib/dados/`) — nada visual mora lá
- O cliente Supabase e o cabeçalho de operação
- A detecção de formato de planilha

---

*Medido em 07/10/2026 a partir de `src/app/globals.css`,
`src/components/` e `package.json`.*
