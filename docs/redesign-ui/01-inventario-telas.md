# Inventário de telas

Levantado do código em 07/10/2026, a partir de
`docs/auditoria-visual-2026-10-07/evidencias/inventario-codigo.json`
(48 rotas, 148 arquivos) e das capturas em `screenshots/`.

**Leia junto com `07-indice-screenshots.md`**, que liga cada linha daqui à
imagem correspondente.

---

## 0. Um aviso sobre a contagem

**48 rotas não são 48 telas.** Vinte e três delas trocam de conteúdo por
aba interna, e cada aba é um layout diferente.

Exemplo: `/vendas/cancelamentos` tem quatro recortes (Por canal · Canal ×
mês · Por SKU · Ao longo do ano) multiplicados por duas métricas (Valor ·
Quantidade) — **oito layouts numa rota só**.

Contando só as abas que deu para enumerar no código, **15 rotas carregam
57 estados visuais**. O total real do sistema passa de **100 telas**.

E `useState` não mede isso: `/vendas/dia` tem **zero** `useState` e é uma
tela cheia; `/planejamento` tem 66 e é um aplicativo inteiro.

---

## 1. Visão geral e operação

### `/` — Visão geral
- **Objetivo:** o estado do negócio em uma tela, ao abrir o sistema.
- **Mostra:** frescura de cada fonte de dado, receita e pedidos do período, produtos com maior receita, recomendações do dia.
- **Componentes:** `PageHeader` · `BarraFiltros` + `Filtro` · `SeletorCanal` · `FontesDados` · `Panel`
- **Ações:** trocar período · trocar canal
- **Navegação:** cartões levam a Estoque, Preço e às telas de Vendas
- **Código:** `src/app/page.tsx` · `painel-cliente.tsx` (513 linhas)

### `/alertas`
- **Objetivo:** o que exige atenção, com a prova junto.
- **Mostra:** cartões por severidade, em 5 tipos — cancelamento, conversão, estoque, preço, receita.
- **Abas:** Todos · Críticos · Atenção → **3 estados**
- **Ações:** filtrar por severidade · excluir um alerta (painel de exclusões)
- **Estado vazio:** `TudoCerto`, com dois textos diferentes conforme haja ou não alerta filtrado
- **Código:** `alertas-cliente.tsx` (82 linhas)

### `/conversa`
- **Objetivo:** perguntar sobre os dados em linguagem natural.
- **Mostra:** bolhas de conversa, ferramentas que a IA chamou
- **Ações:** enviar pergunta · recomeçar
- **Código:** 359 linhas, 6 estados

### `/importar`
- **Objetivo:** subir planilha de pedidos, anúncios, catálogo ou publicidade.
- **Mostra:** área de arrastar · prévia antes de gravar · resultado
- **Fluxo em 3 telas:** vazio → prévia → resultado
- **Ações:** escolher arquivo · confirmar · cancelar
- **Código:** 648 linhas, 10 estados

### `/glossario`
- **Objetivo:** o que cada termo significa.
- **Ações:** buscar · filtrar por seção
- **Código:** 167 linhas

### `/planejamento`
- **Objetivo:** planejamento comercial do ano.
- **Mostra:** calendário, quadro, mapa, editor de estratégia, foco
- **Tamanho:** **5.040 linhas, 66 estados, 1.382 linhas de CSS próprio**
- **Nota:** é um aplicativo dentro do aplicativo, com vocabulário visual
  próprio (`EstudioShell`, `Quadro`, `Mapa`, `Calendario`). Não
  compartilha layout com nada.
- **Pendente:** funcionalidade de outro agente, sem commit no momento do levantamento.

---

## 2. Vendas — 11 rotas

Todas respondem variações de "como foi o período". **7.871 linhas** no
total.

| rota | objetivo | abas internas | linhas |
|---|---|---|---|
| `/vendas/canais` | receita por canal, com sparkline e variação | — | 603 |
| `/vendas/anual` | o ano, com meta e progresso | por canal | 836 |
| `/vendas/dia` | um dia | — | 451 |
| `/vendas/mtd` | mês até aqui | 2 modos de recuperação | 622 |
| `/vendas/semanal` | semana a semana | Receita · Pedidos · Ticket | 767 |
| `/vendas/diario` | até 4 períodos lado a lado | 6 blocos de métrica | 830 |
| `/vendas/comparativos` | métrica a métrica | Receita · Pedidos · Ticket · Visitas · Conversão | 755 |
| `/vendas/skus` | por SKU | 7×7 · 30×30 · 90×90 | 660 |
| `/vendas/cancelamentos` | cancelamento | Por canal · Canal×mês · Por SKU · Ao longo do ano **×** Valor · Quantidade = **8** | 734 |
| `/vendas/metas` | planejar meta por canal | — | 670 |
| `/vendas/lancamentos` | **entrada manual**: canal + mês → visitas, pedidos, receita, ads | — | 943 |

**`/vendas/lancamentos` é a única tela de escrita do módulo.** As outras
dez só leem.

**Componentes comuns:** `PageHeader` · `BarraFiltros` · `SelectRecorte` ·
`Segmented` · `Delta` · `Panel` · Recharts

---

## 3. Mercado Livre — 7 rotas

Nenhuma existe sem a API do canal.

| rota | objetivo | o que tem | linhas |
|---|---|---|---|
| `/anuncios/analise` | desempenho anúncio a anúncio | tabela própria, lentes, elasticidade, sparkline, indicador de preço | **1.100** |
| `/anuncios/catalogo` | catálogo e Buy Box | tabela com 6+ colunas, ganhando/perdendo, **2 sheets** | **1.082** |
| `/anuncios/preco-ideal` | lógica de promoção | faixas de desvio (≤−6% a ≥6%), tabela, **1 sheet** | 868 |
| `/anuncios/tipo` | clássico vs premium | 30d · 90d · 180d · 1 ano · Tudo = **5** | 477 |
| `/promocoes/processar` | subir planilha de campanha e decidir | motivos de recusa, resultado por anúncio | **1.089** |
| `/promocoes/campanhas` | campanhas ativas | Todas · Com redução · Sem redução = **3** | 411 |
| `/promocoes/historico` | histórico de processamento | Todas · Participaram · Fora **×** ABC = **3+** | 382 |

As três maiores telas do sistema estão aqui.

---

## 4. Financeiro — 6 rotas

| rota | objetivo | abas | linhas |
|---|---|---|---|
| `/financeiro` | painel | Mês · Semana · Canal · Conta · SKU · Anúncio = **6** | 557 |
| `/financeiro/custos` | custo por SKU e por canal | Por SKU · (fixa/variável/avulsa) | **1.102** |
| `/financeiro/categorias` | cadastro | — | 182 |
| `/financeiro/folha` | cadastro | — | 272 |
| `/financeiro/fornecedores` | cadastro | — | 227 |
| `/financeiro/contas` | contas a pagar | — | 349 |

**As quatro de cadastro usam o componente `Cadastro`** — tabela + formulário
em folha lateral, idênticos. É o único lugar do sistema onde telas irmãs de
fato compartilham layout.

---

## 5. Gestão e acesso — 6 rotas

| rota | objetivo | o que tem | linhas |
|---|---|---|---|
| `/empresas` | criar empresa do cliente, renomear, apagar; gerir operações | formulário + lista expansível + confirmação por digitação | 469 |
| `/integracoes/canais` | canais e contas, conectar API | 2 abas (Contas · Canais), `Cadastro` | 381 |
| `/integracoes` | vitrine de integrações | links e selos | 179 |
| `/equipe` | convidar, mudar papel, remover | lista + link copiável | 340 |
| `/configuracoes` | tema | **zero interação além do tema** | 253 |
| `/relatorios/exportacoes` | baixar pacotes | botões de download | 275 |

---

## 6. Fora do menu (rota viva, escondida)

Decisão de 06/10: as rotas continuam de pé, só não são anunciadas.

| rota | motivo |
|---|---|
| `/anuncios/preco-performance` | não pronta |
| `/anuncios/preco-alvo` | não pronta |
| `/anuncios/trafego-pago` | não pronta |
| `/promocoes/comparar` | não pronta |
| `/monitoramento/precos` | em desenvolvimento |
| `/monitoramento/fretes` | **22 linhas — só o `SemFonte`** |
| `/relatorios/apresentacao` | vitrine sem entrega |

---

## 7. Fora da moldura

| rota | nota | linhas |
|---|---|---|
| `/relatorio/[chave]` | **abre sem login**, por chave de empresa. Componentes próprios: `Kpi`, `Secao`, `GradeKpi`, `Colunas`, `Interpretacao`, `Dica` | **1.675** |
| `/entrar` | e-mail + senha | 134 |
| `/cadastro` | criar conta, com confirmação por e-mail | 208 |
| `/comecar` | primeiro acesso: criar a empresa | 131 |
| `/convite/[token]` | aceitar convite | 235 |

**`/relatorio` tem vocabulário visual que não existe em nenhuma outra
tela.** É a peça que vai para a diretoria, e a única desenhada como peça.

---

## 8. Totais de interação

Contado nos controles declarados no código (`evidencias/interacao.json`):

| | |
|---|---|
| Botões | **239** |
| Campos de entrada | **112** |
| Selects | **45** |
| Abas (`Segmented`) | **38** |
| Folhas laterais (`Sheet` / `FilterSheet`) | **11** |
| Tabelas escritas à mão | **29** em 19 telas |
| Gráficos Recharts | 15 |

**É piso, não teto.** A contagem é do JSX declarado: uma tabela que gera um
botão por linha conta 1 aqui e cem na tela.

**Não há modal centralizado em lugar nenhum.** O padrão de sobreposição do
sistema é folha lateral (`Sheet`) e menu em portal (`SeletorCanal`).

Detalhamento por tela no documento 03.

---

## 9. Telas sem interação nenhuma

- `/configuracoes` — só o seletor de tema
- `/monitoramento/fretes` — 22 linhas, só o aviso de fonte ausente

Outras cinco rotas aparecem com zero controle na medição porque os controles
moram em componente compartilhado — ver documento 03, §4.

---

## 10. O que não foi possível inspecionar

| | motivo |
|---|---|
| `/convite/[token]` com token válido | exigiria criar e consumir um convite real |
| Estados de erro de rede | exigiria derrubar o Supabase |
| `/planejamento` | funcionalidade de outro agente, sem commit — capturada como está |
| Fluxo de OAuth do Mercado Livre | sai do sistema para o canal |

---

*Ver `07-indice-screenshots.md` para a imagem de cada item.*
