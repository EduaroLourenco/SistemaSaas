# Gerizo — operação, anúncios, campanhas e importação

Atualização: 17/11/2026. Escopo de implementação: **16 rotas**, preservando controladores, contratos e regras de negócio existentes. Este relatório complementa a cobertura consolidada do redesign.

## Composição por rota

| Rota | Transformação implementada | Paridade preservada |
|---|---|---|
| `/anuncios/analise` | Lista contextual de 280–340px e área de investigação ampla; receita focal, comparação e tipografia dos dados; mobile continua lista → detalhe com retorno | Datas e comparação na URL, busca, filas, ordenação, seleção até quatro anúncios, CSV, abas, preço e histórico, SKU e atualização |
| `/anuncios/catalogo` | Disputa primeiro, indicadores em uma faixa, catálogo com nomes completos, composição da carteira recolhível; valores das 12 semanas acessíveis sem hover | Contas/tipo/status/categoria, busca, origem, cargas, sincronização, ficha, comissão, estoque e histórico |
| `/anuncios/tipo` | Comparação emparelhada de Clássico e Premium por indicador, em uma superfície comum; receita e custos integrais | Seis indicadores originais, todos os detalhes, período anterior, comparação por SKU e limitações metodológicas |
| `/anuncios/preco-ideal` | Desvio médio focal, contexto em faixa e relatório; distribuição com contagem acessível e tabela de investigação | Relatórios/data-base, upload, categorias/tipo/conta/faixa/busca, comissão, praticado/ideal, detalhes de preço |
| `/anuncios/preco-alvo` | Área de parâmetros sem caixa decorativa; margem por tipo e canal; planilha principal com hierarquia de leitura | Aviso de desenvolvimento, custos, taxas e vigências, adicionar/remover/gravar comissões, custo/frete/hoje/margem/alvo e fórmula |
| `/anuncios/preco-performance` | Resumo de evidência e SKUs focal; gráfico do produto com tabela completa por faixa de preço | Recortes/ABC/busca, Excel, comissões, pisos de evidência, custos e todas as colunas, causalidade não presumida |
| `/automacoes` | Navegação Promoções/Fila/Tráfego no corpo; agenda em uma superfície, prazo/pendentes e dados legíveis; revisão apresenta oferta, piso, estoque e preço do canal antes do detalhe técnico | Contas, tipos, agenda, folga por tipo persistida, regras, seleção, janelas, revisão e confirmação explícita, filas e mídia |
| `/automacoes/regras` | Lista ordenada de decisão e editor dividido por etapas semânticas; cobertura e avisos continuam próximos das condições | Ordem, subir/descer, duplicar, editar, excluir, contas, condição/operador/ação, quando faltar dado e validações |
| `/promocoes/campanhas` | Adesão focal e contexto na mesma faixa; tabela principal e detalhes de produto; exclusão em diálogo nativo com foco e retorno | Filtros, última rodada, totais, SKU, histórico, fora por pouco, ação destrutiva com números e confirmação |
| `/promocoes/comparar` | Anúncios a comparar como decisão focal; propostas, aprovadas e sem proposta em faixa; evidência por anúncio | Campanhas/filtros/busca, propostas completas, piso efetivo, redução e comissão, exportação de recusadas |
| `/promocoes/historico` | Alternância Por produto/Processamentos em vez de duas superfícies extensas concorrendo; faixa de volume/contexto | Todos os filtros, agrupamento Clássico/Premium, expansões, preços, decisões e motivos, paginação e todas as rodadas |
| `/promocoes/processar` | Navegação de etapas com estado atual sem caixa aninhada; contexto de fase; resumo de conferência em faixa | Arquivos, fórmulas, regra/piso/tolerância, prévia, edição manual, bloqueios, revisão, Excel e confirmação existentes |
| `/importar` | Fluxo Fonte/Arquivo/Conferência/Resultado vinculado ao estado real; upload dominante e conexões em divulgação progressiva | Detecção, envio de arquivo grande, preview, validação, duplicidades, conta obrigatória, gravar explícito e histórico |
| `/conversa` | Área de leitura única até 840px; sugestões no vazio, respostas mais legíveis e composer no fluxo; fontes/metodologia acessíveis | Streaming, histórico da conversa atual, consultas e parâmetros, respostas completas, erros e reenviar, nova conversa |
| `/monitoramento/precos` | Preço médio e unidades em gráficos separados, mesma linha temporal; mês selecionável pelo teclado e tabela dos pontos | Agregação original ponderada, todos os períodos, canais/ABC/busca, mínimos/máximos, SKU e datas |
| `/monitoramento/fretes` | Estado de indisponibilidade com linguagem de tarefa e contexto da consulta | Ausência real de fonte preservada; nenhum prazo, valor, botão de consulta ou funcionalidade foi inventado |

## Alterações compartilhadas restritas à área

`src/components/analise/operation-layout.tsx` e `operation-pages.css` oferecem resumo sem cálculo, etapas e método expansível para estas superfícies. O CSS usa os tokens de tema do produto. As tabelas mantêm rolagem local e a primeira coluna fixa quando apropriado. Textos de interface de 12,5/13px nas páginas da área foram uniformizados em 14px; metadados podem permanecer em 12px.

O CSS exclusivo de Central de Anúncios e Automações foi ajustado sem mudar contratos. O contador de pendentes de Automações deixa de animar valores intermediários; exibe diretamente o número retornado. A metodologia e os dados continuam acessíveis por toque/teclado.

## Fixtures e navegação de prévia

`scripts/redesign/preview-app/rotas-operacao.tsx` exporta as 16 rotas reais; `fixtures-operacao.ts` fornece dados sintéticos determinísticos e tipados. Não importa nenhum carregador de dados, autenticação ou cliente de servidor. A prévia usa os componentes reais do produto, incluindo o formulário de processamento e o chat.

Catálogo, disputa, anúncios, tipos, lógica/performance de preço, promoções, ofertas e monitoramento recebem dados preenchidos. Automações recebe agenda e itens sintéticos com escrita desligada; fila e mídia incluem seus estados vazios reais. Os endpoints de leitura do harness têm contratos específicos; endpoints não modelados retornam 501 e acionam o estado de indisponibilidade, em vez de responder 200 com formato inválido.

## Verificação e limites

- Todos os TSX alterados e os módulos de fixtures passaram pela verificação sintática de `typescript.transpileModule`; build/typecheck consolidados são executados pelo agente principal.
- `scripts/redesign/verificar-operacao.mjs` cobre renderização das 16 rotas e interações em notebook/celular, sem capturas de tela. Resultado: `output/redesign/qa-operacao.json`.
- A prévia de importação e a revisão de envio são respondidas por fixtures interceptadas no navegador. Nenhuma requisição desses dois POSTs chega ao servidor. Gravação de importação e envio real continuam bloqueados e não são acionados nos testes.
- Foram preservados o estado de desenvolvimento das rotas de preço e a invisibilidade deliberada de Monitoramento/Preço-alvo/Performance na navegação principal.
- O preview não comprova login, RLS, papéis, empresas reais, integrações, escrita, exportação real ou desempenho de campo. Essas verificações não foram declaradas como concluídas.
- Matrizes e planilhas mantêm rolagem interna no celular; não foram convertidas para cartões que perderiam alinhamento entre propostas ou edição de células. A tabela de Clássico/Premium mantém o par de valores por métrica.

O resultado e eventuais correções de QA ficam no relatório consolidado. Não foi feito commit isolado por este agente; o commit é coordenado pelo agente principal.
