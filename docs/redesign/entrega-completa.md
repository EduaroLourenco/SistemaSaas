# Gerizo — redesign das 61 rotas

17/11/2026 · branch `codex/redesign-gerizo-completo` · base `56f69bd`.

O pedido posterior do usuário ampliou o escopo do piloto para **todas as rotas**, autorizou melhorias de composição e solicitou commit. O blueprint permaneceu como referência de design e paridade; seu comando de partida limitado ao piloto deixou de delimitar a entrega. Não foram produzidas novas capturas para apresentação nesta expansão, conforme a preferência do usuário.

## Implementação

As 61 rotas receberam tratamento específico ou componentes de área redesenhados. As páginas de análise, operação, estúdio, formulários, gestão, relatórios e acesso usam composições adequadas ao trabalho. O índice de revisão local `output/redesign/index.html` e a prévia `http://127.0.0.1:3017` agora permitem abrir todas as rotas com componentes reais e fixtures sintéticas.

| Área | Rotas | Transformação |
|---|---:|---|
| Piloto | 3 | Visão geral com pulso, prioridades e investigação; Alertas em fila; Envios por prazo e conta |
| Decisão | 16 | Heróis e comparações, mensal/acumulado separados, diagnóstico por unidade, calendário/detalhe, MTD, anúncios e produtos |
| Operação | 16 | Catálogo e anúncios, automações e revisão, regras, campanhas, histórico, importação, chat e monitoramento |
| Estúdio e financeiro | 8 | Cinco modos de planejamento, editores, resultado/cobertura da DRE, custos editáveis mobile e cadastros por seção |
| Gestão, relatórios e acesso | 18 | Administração contextual, listas e formulários, glossário, guia, estoque, exportações, relatório editorial e entrada |

Paridade e decisões de cada área: [Decisão](fase-decisao.md), [Operação](fase-operacao.md), [Estúdio e Financeiro](fase-estudio-financeiro.md), [Home](paridade-home.md), [Filas](paridade-filas.md), [cobertura por rota](cobertura-rotas.md).

## Mudanças transversais

- Navegação agrupada pela rotina, rail, busca global, contexto de empresa e barra mobile com Alertas e Mais. URLs e visibilidade deliberada das rotas permanecem.
- Superfícies neutras, marca roxa discreta, tipografia legível, números tabulares, hierarquia focal e menos caixas redundantes. Estúdio e operação herdam os tokens do produto.
- Tabelas com leitura mobile, alternativa integral, scroll local, primeira coluna fixa quando apropriado, ordenação de dados e nulos por último. Matrizes e planilhas preservam a cronologia.
- Filtros destinados à gaveta mobile ficam fora da composição desktop desde o HTML inicial, evitando overflow antes da hidratação. Busca e folhas usam foco contido, Escape e retorno ao acionador.
- Relatório público com resumo executivo, índice, tabelas locais, ajuda por toque/foco e impressão. A ajuda cabe em 320px. Apresentação usa diálogo nativo, ciclo de foco, Escape, setas e espaço; o cabeçalho mostra o período selecionado. Não foi adicionada navegação interna ao relatório público.
- Texto legal e manual foram preservados integralmente: comparação dos nós JSXText com HEAD confirmou as sequências originais em Privacidade (38), Termos (16) e Manual (50).

## Preservação e revisão

Os arquivos de regras, banco, autenticação, integrações e cálculos não foram reescritos pelo redesign. A extração de `FontesConteudo` separou apresentação da consulta existente, mantendo os contratos e o componente de mapa real no servidor. Uma comparação automatizada encontrou 63 funções sem JSX preservadas; a única remoção desse conjunto foi `useAbertura`, o atraso artificial da abertura da shell.

Seleção, edição, validação, revisão, exportação e confirmação permanecem ligadas aos controladores existentes. Os testes de prévia de importação e revisão de automações usam respostas sintéticas interceptadas no navegador; não chegam ao servidor e não enviam ofertas nem gravam dados.

As alterações locais anteriores de frete/precificação foram preservadas no diretório de trabalho e separadas do commit do redesign. Arquivos pessoais não rastreados e configurações alteradas por outros trabalhos não fazem parte do commit. Não houve push, deploy ou alteração de schema.

## Verificação

Os resultados finais estão na matriz de cobertura e nos logs locais em `output/redesign/qa-*.json`. A verificação de navegador usa DOM, estilos calculados, reflow, teclado e interações, sem novas capturas.

- Build de produção e TypeScript foram executados; o fechamento abaixo registra o último resultado.
- A matriz geral cobre 61 rotas × 320/390/1366px × claro/escuro, totalizando 366 combinações. Resultados afetados por infraestrutura ou medição antes da hidratação são rechecados e mantêm histórico.
- Verificações de área exercitam filtros, tabelas, cinco modos do estúdio, editores, revisão sem envio, importação sem gravação, navegação, preferências e diálogos.
- As regressões offline existentes passaram em 9/10. `testar-atualizacao.mjs` usa um stub anterior à fila atual e depende de service role; não foi usada credencial real para contornar a falha.
- O script legado de lint ainda usa `next lint`, removido nesta versão instalada. A ausência de um linter configurado não foi mascarada por um comando sem relação com lint.

Durante o QA, o disco local ficou sem espaço e o cache de desenvolvimento falhou (`os error 112`). O ambiente foi reiniciado com Webpack e persistência de cache desligada no harness; os resultados atingidos foram separados e rechecados. Isso não alterou a configuração de produção.

## Limites práticos

Fixture não comprova autenticação, RLS, papéis, troca real de empresa, integrações, exportação real ou gravações em banco. Nenhuma dessas operações foi executada em contas reais. Não se declara conformidade WCAG integral, teste humano com leitor de tela, iPhone físico, zoom nativo de 200% ou melhoria de web vitals de campo.

Esses limites de validação não são rotas sem implementação. A cobertura distingue a interface redesenhada e exercitada em fixture dos cenários que exigem ambiente autenticado de teste.

## Fechamento

Build de produção final aprovado em 17/11/2026, com TypeScript e geração de páginas concluídos. Typecheck isolado também passou. Matriz geral: **366/366**; gestão: **50/50**; decisão: **21/21 + 2/2**; operação: **46/46**; estúdio/financeiro: **56/56**; piloto histórico: **108/108**; contraste: **36/36**. Regressões offline: **9/10**, com a limitação da fixture de atualização descrita acima. Resumo reproduzível: [validacao-resumo.json](validacao-resumo.json).

Os testes finais confirmaram busca/limpeza do glossário, preferências persistentes, rótulo de permissão da equipe, formulários sem gravação, índice e impressão do relatório, ajuda por toque em 320px, ciclo de foco e atalhos da apresentação. O commit registra os arquivos da repaginação e suas verificações, preservando os trabalhos locais alheios ao redesign.
