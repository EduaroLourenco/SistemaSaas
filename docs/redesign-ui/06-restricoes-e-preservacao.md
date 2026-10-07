# Restrições técnicas e o que não se mexe

Para quem vai redesenhar: isto é a lista do que o redesenho pode tocar, do
que precisa de cuidado, e do que quebra o sistema se mudar.

Levantado do código em 07/10/2026.

---

## 1. O que o redesenho pode mudar livremente

**Todos os tokens.** Cor, sombra, raio, medida, tipografia — tudo está em
`src/app/globals.css`, num só arquivo. Tailwind v4 **sem arquivo de
configuração**: o tema vive num bloco `@theme inline` que espelha variável
CSS em utilitário (`--color-ink` → `text-ink`).

**Toda a moldura.** `AppShell`, `PageHeader`, `PageBody`, o rail de 236px, as
abas de celular, a barra superior de 52px.

**Todo componente de `src/components/ui/`.** Nenhum vem de biblioteca — não
há Radix, shadcn, MUI nem Headless UI. Botão, aba, folha lateral, tabela:
tudo escrito à mão aqui dentro.

**O layout interno de qualquer `*-cliente.tsx`.** Veja §3.

---

## 2. A arquitetura que facilita o redesenho

Quase toda tela é **Server Component** com `export const dynamic =
"force-dynamic"`: lê o dado no servidor, sob RLS, e entrega pronto para um
componente cliente irmão.

```
src/app/vendas/canais/page.tsx          ← lê o dado (servidor)
src/app/vendas/canais/canais-cliente.tsx ← desenha (cliente)
```

**Consequência prática: o redesenho mexe só nos `*-cliente.tsx`.** A
estrutura de dados chega pronta na camada visual; mudar o visual não exige
tocar em consulta, RLS ou cabeçalho de operação.

São **48 pares** desses. O trabalho é paralelizável tela a tela.

---

## 3. O que precisa de cuidado

### 3.1 A classe `.num`

```css
.num { font-family: var(--f-num); font-variant-numeric: tabular-nums;
       font-feature-settings: "zero" 1; letter-spacing: -0.01em; }
```

Usada em centenas de lugares. **Trocar a fonte de número desalinha coluna em
19 tabelas escritas à mão** — elas dependem de `tabular-nums` para que o
dígito tenha largura fixa.

Se o redesenho quiser outra fonte monoespaçada, pode; só precisa ter
`tabular-nums` e ser testada numa tabela larga (`/anuncios/analise`, 13
colunas).

### 3.2 O bloco `@theme inline`

Traduz variável CSS em classe do Tailwind. **Renomear um token quebra o
`className` de todo mundo que o usa.** Para trocar o valor, troque o valor;
para trocar o nome, troque também cada `text-ink`, `bg-panel` e afim.

### 3.3 `--row`

```css
--row: 32px;
@media (pointer: coarse) { --row: 42px }
```

Altura de linha de tabela, e **engorda no toque** — é o único ajuste real de
acessibilidade motora do sistema. Não remover.

### 3.4 `SERIES` em `src/components/data/chart.tsx`

As dez cores de série, lidas por 13 telas de gráfico. Mudar o array é fácil;
mudar a quantidade exige conferir quem usa índice fixo.

### 3.5 `prefers-reduced-motion`

Respeitado globalmente — animação e transição caem para 0,01ms. **Qualquer
animação nova do redesenho precisa entrar debaixo dessa guarda**, ou o
sistema regride em acessibilidade.

### 3.6 Foco visível

`:focus-visible` tem anel duplo de 2px + 2px na cor da marca, global e
consistente. É o item de acessibilidade mais bem resolvido hoje. Pode mudar
de desenho; não pode desaparecer.

---

## 4. O que não se mexe

### 4.1 A camada de dados

`src/lib/dados/` — nada visual mora lá. São 40+ módulos de consulta sob RLS.

### 4.2 O cabeçalho de operação

`src/lib/supabase/servidor.ts` manda `x-operacao` em cada requisição, e o
RLS do banco **estreita** o acesso por ele:

```sql
operacoes_do_usuario() = membresia_real ∩ cabeçalho
```

A interseção nunca alarga. Isso é o isolamento entre empresas clientes.
**Nenhuma mudança visual deve tocar nisto**, e nenhuma tela deve passar a
somar duas operações sem o cabeçalho.

### 4.3 As duas listas de rota do middleware

**`PUBLICAS`** em `src/proxy.ts` — abre sem sessão:

```
/entrar  /cadastro  /auth  /convite/  /api/cron/  /relatorio/  /api/relatorio/
```

**`SEM_MOLDURA`** em `src/components/layout/app-shell.tsx` — renderiza sem
menu nenhum:

```
/entrar  /auth  /cadastro  /comecar  /relatorio/  /convite/
```

Note que as listas **não são iguais**: `/comecar` exige sessão mas não tem
moldura; `/api/cron/` é pública e não tem interface.

**Se o redesenho mover uma tela de rota, as duas listas precisam acompanhar.**
Esquecer `SEM_MOLDURA` faz o relatório de diretoria aparecer com menu que o
leitor não pode usar — foi exatamente o caso que o comentário no código
documenta.

### 4.4 `/relatorio/[chave]` abre sem login

1.675 linhas, componentes próprios (`Kpi`, `Secao`, `GradeKpi`, `Colunas`,
`Interpretacao`, `Dica`), e **uma chave de 32 bytes por empresa** resolvida
pelo middleware contra o banco.

**Esta tela vai para gestor e diretoria, gente que não tem conta.** Duas
consequências para o redesenho:

- não pode depender de nada da moldura (não existe ali)
- não pode depender de sessão, cookie de operação ou preferência de tema
  salva

### 4.5 A detecção de formato de planilha

`/importar` reconhece quatro formatos pelo cabeçalho do arquivo. É lógica,
não visual. A área de arrastar pode mudar; o reconhecimento não.

---

## 5. Celular

O corte estrutural é **`md:` (768px)**. Abaixo dele o rail some e entram
quatro abas de rodapé:

```
Visão (/)  ·  Vendas (/vendas/canais)  ·  Meli (/anuncios/analise)  ·  Importar (/importar)
```

Quatro abas para **48 rotas**. O resto só se alcança pelo menu "mais".

**Para o redesenho:** é a decisão de navegação mais apertada do sistema e
merece ser revista. Mas repare no que as quatro escolhidas revelam: entrar,
ver venda, ver Meli, subir planilha. É o dia de trabalho real.

Uso medido de breakpoint: `sm:` 117× · `md:` 93× · `lg:` 37× · `xl:` 10×.
**Nada usa `2xl:`, e nenhum contêiner tem largura máxima** — em 1920px o
conteúdo estica sem limite. É um buraco do estado atual, não uma restrição.

---

## 6. Multiempresa: o que o visual precisa respeitar

O sistema virou multiempresa em 06/10. Três coisas aparecem na tela e têm
regra por trás:

**`SeletorEmpresa`** — some quando há menos de duas operações. Troca de
**operação**, não de empresa (ver documento 04, §2.1).

**Admin de plataforma** (`eh_admin_plataforma()`) vê todas as empresas, mas
**só com cabeçalho explícito** — para não somar duas empresas por acidente.
O seletor é o que manda esse cabeçalho.

**`/empresas`** é tela de admin. Um lojista comum não a vê no menu.

Qualquer redesenho de navegação precisa manter o seletor visível e óbvio
quando há mais de uma operação, porque ele é o que diz **de quem é o número
na tela**.

---

## 7. Dependências visuais instaladas

| | versão | papel |
|---|---|---|
| Recharts | 3.10.1 | **único** gráfico |
| lucide-react | 0.469 | **único** ícone |
| next/font | — | Inter e JetBrains Mono, auto-hospedadas |

Trocar Recharts é projeto à parte: 13 telas, e os exports de coerência
(`SERIES`, `AXIS`, `GRID`, `ChartTooltip`, `Legend`) existem justamente para
que o gráfico não divergisse tela a tela. Se trocar, recrie essa camada
antes.

---

## 8. Componentes prontos e sem uso

Existem no código e nunca foram chamados:

`DataTable` · `Tabela` · `Matriz` · `Tabs` · `Skeleton` ·
`CompararPeriodo` · `ComingSoon`

(Confirmado por `grep -rl` em `src/app`: zero chamadas de cada um.)

**Enquanto isso, 19 telas escrevem `<table>` à mão.** Alguém construiu a
tabela compartilhada e ninguém adotou.

**Para o redesenho:** não é dívida a pagar — é sinal de que os componentes
não serviam ao caso real. Antes de recriar uma tabela genérica, olhe as 19
telas e veja o que elas precisam que a genérica não dava.

---

## 9. O que não foi possível verificar

| | motivo |
|---|---|
| comportamento em erro de rede | exigiria derrubar o Supabase |
| `/convite/[token]` com token válido | exigiria criar e consumir um convite real |
| `/planejamento` | 5.040 linhas de outro agente, sem commit; tem CSS próprio (1.382 linhas) que não foi auditado regra a regra |
| contraste medido em pixel | ver documento 02 — medido no token, não na captura |

---

*Levantado em 07/10/2026 de `src/proxy.ts`, `src/components/layout/`,
`src/app/globals.css` e `package.json`.*
