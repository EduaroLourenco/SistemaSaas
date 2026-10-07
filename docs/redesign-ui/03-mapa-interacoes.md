# Mapa de interações

Medido em 07/10/2026 por `docs/auditoria-visual-2026-10-07/medir-interacao.mjs`.
Evidência em `evidencias/interacao.json`.

**Como ler estes números.** A contagem é do que está **declarado no JSX**,
não do que aparece em runtime. Uma tabela que gera um botão por linha conta
**1** aqui e cem na tela. E controle que mora em componente compartilhado
(`Cadastro`, `PainelExclusoes`, `BarraFiltros`) não é contado na rota que o
usa — por isso `/financeiro/categorias` aparece com zero controle e tem
formulário completo.

É piso, não teto.

---

## 1. Totais

| controle | declarações |
|---|---|
| Botão (`<button>` / `<Button>`) | **239** |
| Campo (`input` / `textarea`) | **112** |
| Select | **45** |
| Aba (`Segmented`) | **38** |
| Folha lateral (`Sheet` / `FilterSheet`) | **11** |
| Toggle / Checkbox | 5 |
| Gráfico Recharts | 15 |
| Tabela escrita à mão (`<table>`) | **29** em 19 telas |
| `SelectRecorte` | 8 |
| `SeletorCanal` | 4 |

**Não existe modal centralizado em nenhuma tela.** A sobreposição do sistema
é folha lateral (`Sheet`) e menu em portal (`SeletorCanal`, que precisa de
portal porque a faixa de filtros tem `overflow-x`).

---

## 2. Quem lê e quem escreve

| | rotas |
|---|---|
| Só leem | **30** |
| Escrevem no banco | **18** |

As 18 que escrevem, e o que gravam:

| rota | o que grava |
|---|---|
| `/planejamento` | plano, meta, estratégia, foco |
| `/financeiro/custos` | custo por SKU e por canal |
| `/financeiro/categorias` · `/folha` · `/fornecedores` · `/contas` | cadastro |
| `/empresas` | cria, renomeia e apaga empresa e operação |
| `/vendas/lancamentos` | visitas, pedidos, receita e ads por canal/mês |
| `/vendas/metas` | meta por canal |
| `/equipe` | convite, papel, remoção |
| `/integracoes/canais` | conta de canal, credencial |
| `/importar` | planilha de pedido, anúncio, catálogo, publicidade |
| `/promocoes/processar` | decisão por anúncio da rodada |
| `/anuncios/analise` · `/catalogo` | preço (via API do canal) |
| `/anuncios/preco-alvo` | preço-alvo (tela escondida) |
| `/alertas` | exclusão de alerta |
| `/relatorio/[chave]` | **anotação — ver §6** |
| `/configuracoes` | preferência de tema |

---

## 3. As telas mais densas

| rota | botão | campo | select | total |
|---|---|---|---|---|
| **`/planejamento`** | **88** | **53** | **16** | **157** |
| `/financeiro/custos` | 11 | 11 | 4 | 26 |
| `/empresas` | 12 | 6 | 0 | 18 |
| `/relatorio/[chave]` | 13 | 2 | 1 | 16 |
| `/anuncios/catalogo` | 9 | 1 | 4 | 14 |
| `/anuncios/preco-ideal` | 8 | 1 | 4 | 13 |
| `/anuncios/analise` | 9 | 1 | 2 | 12 |
| `/vendas/metas` | 6 | 3 | 2 | 11 |

**`/planejamento` tem mais controle declarado que as outras 47 rotas
somadas em botão** (88 contra 151 no resto). Com 5.040 linhas, 66 estados e
1.382 linhas de CSS próprio, é um aplicativo dentro do aplicativo e não
compartilha vocabulário visual com nada.

**Para o redesenho:** tratar `/planejamento` como projeto separado. Encaixá-la
no mesmo sistema das outras é trabalho de outra ordem de grandeza, e ela
ainda está sem commit (funcionalidade de outro agente).

---

## 4. Telas com zero controle declarado na própria rota

| rota | por quê |
|---|---|
| `/financeiro/categorias` · `/folha` · `/fornecedores` | os controles estão no componente `Cadastro` |
| `/alertas` | estão em `CartaoAlerta` e `PainelExclusoes` |
| `/vendas/cancelamentos` | estão em `BarraFiltros` e `Segmented` compartilhados |
| `/integracoes` | é vitrine: só `<Link>` |
| `/monitoramento/fretes` | **22 linhas, só o `SemFonte` — esta é de verdade sem controle** |

Só duas telas são de fato inertes: `/monitoramento/fretes` e
`/configuracoes` (que tem apenas o seletor de tema).

---

## 5. Padrões de interação do sistema

### 5.1 Filtro

`BarraFiltros` + `Filtro` em 15 telas. Faixa horizontal abaixo do
`PageHeader`, com `overflow-x` em celular.

Dentro dela: `SeletorCanal` (4 telas, menu em portal), `SelectRecorte`
(8 telas, períodos), e selects de recorte.

**Em celular a faixa rola na horizontal.** O filtro escolhido pode ficar
fora de vista — ver documento 02.

### 5.2 Troca de recorte

`Segmented` — 38 declarações. É o controle que multiplica tela: 23 rotas
trocam conteúdo por aba, e as abas de `/vendas/cancelamentos` se multiplicam
entre si (4 recortes × 2 métricas = 8 layouts).

### 5.3 Formulário

Dois padrões, e eles divergem:

- **Folha lateral** (`Sheet`) — o padrão do financeiro, via `Cadastro`.
  Tabela à esquerda, formulário desliza da direita.
- **Em linha** — `/empresas` edita o nome no lugar, e confirma exclusão
  pedindo que o usuário **digite o nome**.

**A confirmação por digitação em `/empresas` é a única proteção forte de
ação destrutiva do sistema**, e existe porque apagar empresa apaga o
trabalho de um cliente. Deve ser preservada.

### 5.4 Subida de arquivo

`FileDrop` em `/importar` e `/promocoes/processar`. Fluxo de três telas:
vazio → prévia → resultado. **A prévia antes de gravar é o padrão certo** e
aparece nas duas.

### 5.5 Ação destrutiva

| onde | proteção |
|---|---|
| `/empresas` — apagar empresa/operação | digitar o nome, e bloqueio se houver pedido |
| `/alertas` — excluir alerta | `PainelExclusoes`, reversível |
| `/equipe` — remover pessoa | confirmação simples |
| cadastros do financeiro | confirmação simples |

**Não há padrão único.** Três níveis de proteção para quatro tipos de
exclusão.

---

## 6. Um achado: o relatório público aceita escrita

`/relatorio/[chave]` abre **sem login**, por chave de 32 bytes, e vai para
gestor e diretoria. E tem um campo de anotação que grava:

```js
await fetch("/api/relatorio/anotacao", { method: "POST", … })
```
`src/app/relatorio/[chave]/relatorio-cliente.tsx:98`

Quem tem o link pode escrever a interpretação de cada seção. Pode ser
exatamente o desejado — é a diretoria comentando o próprio relatório. Mas o
redesenho precisa saber que **esta tela não é só leitura**, e que a anotação
não tem autor nem data na interface.

**Fica registrado como pergunta para o Eduardo, não como defeito.**

---

## 7. Estados que não deu para capturar

A conta usada na captura é **`leitor`** (só leitura) de propósito: um
roteiro automatizado não deve clicar em "apagar empresa".

Em consequência, estes estados estão fora do pacote:

| estado | motivo |
|---|---|
| formulário com erro de validação | exige submissão inválida, e a conta não grava |
| confirmação de exclusão | ação destrutiva, deliberadamente não exercida |
| `/importar` com prévia carregada | exige subir arquivo real |
| `/promocoes/processar` com resultado | exige planilha de campanha |
| folha lateral aberta nos cadastros | o botão que abre pertence a papel de escrita |
| erro de rede | exigiria derrubar o Supabase |
| `/convite/[token]` válido | exigiria criar e consumir convite real |

**As capturas cobrem o estado de repouso de cada tela, em desktop e
celular.** Os estados acima estão descritos aqui porque não foram
fotografados — não porque não existam.

---

*Medido em 07/10/2026. Evidência em
`docs/auditoria-visual-2026-10-07/evidencias/interacao.json`.*
