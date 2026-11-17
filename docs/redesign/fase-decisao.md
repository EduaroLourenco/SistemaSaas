# Redesign das áreas de decisão

Escopo implementado em 17/11/2026: 16 rotas. O blueprint foi relido, com prioridade às composições A/B/D/F e às especificações 08.09–08.24. A autorização posterior do usuário amplia o piloto para todas as rotas e permite commit. Não há alteração de banco, API, integração ou regra de cálculo nesta fatia.

## Composição e paridade por rota

| Rota | Mudança estrutural | Campos, ações e regras preservados |
|---|---|---|
| `/vendas/anual` | Receita do ano focal, meta e faixa de indicadores; evidência mensal e acumulada em **dois gráficos independentes** | Ano/canal, receita, meta, acumulados, pedidos, visitas, conversão, mídia, cancelamento, tabela completa, detalhe do mês e comparação com ano anterior |
| `/vendas/canais` | Resultado do recorte em destaque; evolução antecede ranking; ranking em superfície contínua | Filtros de período/canal, cores por canal, 12 semanas, receita, participação, delta, pedidos, ticket, margem, ordenação e detalhe |
| `/vendas/comparativos` | Melhor dia focal, matriz mês×dia e faixa contínua de sete dias | Todas as métricas, escopo, trimestre, ordenação cronológica da matriz, rankings, seleção de mês e comparação |
| `/vendas/cancelamentos` | Valor cancelado focal, taxa e abrangência na mesma área de leitura | Valor/quantidade, bruto, taxa, período, quatro vistas, canais/SKU/mês, pedidos em detalhe, exclusões e metodologia |
| `/vendas/dia` | Calendário e detalhe lado a lado no notebook; receita e contexto primeiro no mobile | Navegação por mês, gesto e botões, seleção de dia, meta, status parcial/em andamento, falha de atualização, todas as métricas, comparações, canais, produtos e extremos do mês |
| `/vendas/mtd` | Realizado focal, meta visual e faixa de gap/necessidade diária; canais em toolbar | Corte até última data real, seleção de contas, meta incompleta, dívida/adiantamento, dias, projeção, alavancas, estratégias e confirmação de redistribuição |
| `/vendas/semanal` | Semana atual focal; extremos e média em faixa; **alternância Matriz/Lista** | Mesmo universo em ambas as vistas, filtros, comparação, média móvel, parcial, WoW, participação e ordenação |
| `/vendas/diario` | Seleção de até quatro períodos em faixa e resultados líquidos lado a lado | Rascunho/aplicar/desfazer, datas livres, período base, média/dia vs total, todas as linhas da comparação, série temporal e leitura factual |
| `/vendas/skus` | Workspace de investigação com contagem e resumo em faixa única | Períodos, canais, busca, ABC, todas as abas, células de mês/canal/período, comissão/cobertura, conversão, concentração, detalhe e exportação |
| `/vendas/queda` | Diferença de receita focal, antes/agora, evidências por sinal; detalhe temporal em **receita, preços e visitas separados** | Períodos A/B e tamanhos distintos, todos os 13+ indicadores, filtros, ordenação, exportação, fatores existentes, nulos, estoque e anúncios do produto |
| `/vendas/lancamentos` | Etapas de trabalho e resumo em faixa; planilha como superfície principal | Conta/mês, readonly de origem API, todos os campos editáveis, dias, cálculo, validação, salvar e estados existentes |
| `/vendas/metas` | Etapas Definir/Distribuir/Ajustar e meta focal antes do formulário | Janela histórica, pesos, canais selecionados, dias manuais, distribuição, revisões, edição e gravação existentes |
| `/mercado-livre` | Prioridades antes do resultado; Hoje/Último dia focal, ritmo semanal como contexto; indicadores em faixa | Corte justo contra mesmo dia/semana, parcial, filtros de conta/semana, reputação, catálogo, campanhas, acontecimentos, ranking e todos os detalhes |
| `/anuncios/trafego-pago` | Investimento e faturamento em dois gráficos; margem após mídia focal, recorte do relatório explícito e faixa de eficiência | Dois recortes independentes, atribuição direta/indireta, cobertura de custos, ACoS/TACoS/ROAS, conferência, quatro abas, filtros, situações, oportunidades e exportação |
| `/produtos` | Workspace de catálogo, contexto do recorte, nomes integrais; preços por canal abertos no resumo mobile | Datas, canais, ABC, sem venda, busca, CSV/Excel, histórico e todas as colunas de vendido/vitrine/unidades/receita |
| `/produtos/precificacao` | Contribuição focal; vendido/recebido em faixa; cotação em formulário lateral e resultados por canal; cabeçalhos ordenáveis por teclado | Fórmulas, custos, imposto, frete salvo/cotado, três modos, simulação vs realizado, quantidades, cotação e todas as alterações locais anteriores do usuário |

## Implementação

Os componentes existentes continuam responsáveis pelos cálculos e pelo estado. `HeroMetric`, `MetricStrip` e `WorkflowSteps` recebem resultados já calculados. O módulo `src/components/analise/decision-workspace.module.css` contém apenas layout das 16 rotas; os tokens e o comportamento global continuam na fundação compartilhada.

Nos gráficos anual e de Queda, as séries e fórmulas originais permanecem. Foram separados apenas os eixos/apresentação. As tabelas de valores exatos permanecem disponíveis; Queda e mídia ganharam leitura de valores sem hover. Não foram atribuídas novas causas à queda. O agrupamento por sinal utiliza a mesma soma existente, sem nova decomposição.

## Preview isolado e QA

`scripts/redesign/preview-app/rotas-decisao.tsx` exporta as 16 rotas do preview com os componentes cliente reais. `fixtures-decisao.ts` usa dados sintéticos e mocks locais já existentes, importando somente **tipos** dos carregadores; nenhuma função de banco/autenticação é executada. As rotas de produção continuam SSR e mantêm suas permissões.

`scripts/redesign/verificar-decisao.mjs` executa smoke de render e interações locais sem gerar screenshots. Bloqueia todas as origens externas e métodos de escrita, e exige o marcador `fixture-demo`. Resultado em `output/redesign/qa-decisao.json`. A validação consolidada de tipos, build e reflow é coordenada pelo agente principal.

O smoke das 16 rotas preenchidas passou, sem erros de JavaScript. Também passaram as cinco interações amostrais de mensal/acumulado anual, alternância Matriz/Lista semanal, troca de unidade do Termômetro, tabela acessível de mídia e abas Cotação/Contribuição da precificação: **21/21 verificações**. A evidência adicional de Queda (`--somente-queda`) também passou: render, três gráficos por unidade e tabela completa de 14 dias, em `output/redesign/qa-decisao-queda.json`. Esses números são verificações técnicas em fixture, não aprovação de sessão real ou avaliação com usuários.

## Limites e exceções

- Não se declarou validação de sessão real, RLS, integrações, gravação de metas, cotação externa ou exportação real a partir do preview.
- Matrizes cronológicas e planilha de lançamentos mantêm sua ordem temporal. Não foi adicionada ordenação que alteraria o eixo ou a edição.
- O calendário mantém seleção por dia e rolagem local quando os sete alvos de toque não cabem em 320px.
- Os resumos de quatro períodos podem usar mais de uma linha/coluna conforme a largura; os valores integrais permanecem acessíveis.
- Nenhum teste de escrita foi disparado. Ações de gravação/conexão continuam bloqueadas no harness.
- Alterações de UI no arquivo de precificação convivem com mudanças locais anteriores do usuário. Helpers de regra de frete/preço e chamadas existentes não foram reescritos nesta fatia; o commit deve preservar a separação de autoria definida pelo agente principal.
