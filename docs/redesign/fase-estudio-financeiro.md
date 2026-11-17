# Estúdio e financeiro — redesign completo das oito rotas

## Escopo implementado

| Rota | Composição nova | Paridade preservada |
|---|---|---|
| `/planejamento` | Hoje como visão inicial, cinco visões explícitas, navegação de campanhas recolhível, toolbar de trabalho, filas de atrasadas/hoje/próximos sete dias | Quadro, Calendário, Mapa, Foco, campanhas, ações avulsas, grupos, tipos, filtros, datas, drag/drop e alternativa por select, edição, exclusão com confirmação, desfazer, revisões e chamadas existentes |
| `/planejamento/resultados` | Universo acompanhado em destaque, faixa de vereditos, nomes completos e evidência diária acessível | Duas origens independentes, todos os vereditos, dados da ação, produtos, anúncios, comparativos, método, períodos, valores e detalhes |
| `/financeiro` | Resultado disponível em foco com cobertura inseparável, faixa de receita/margens, DRE hierárquica e investigação por dimensão | Receita bruta/líquida, cancelamentos, todos os custos, componentes parciais, margens, resultado nulo quando incompleto, cobertura, período/canal e seis dimensões |
| `/financeiro/custos` | Cobertura por SKU em destaque, recorte fora de cartão, lista mobile editável com modo tabela integral | Três abas, custos praticados/tabela, todos os campos, seleção/lote, importação/exportação, gravação, faixas, despesas, cadastro de produto e margem configurável condicionada |
| `/financeiro/categorias` | Lista pesquisável, ações nominais, formulário dividido em classificação e detalhes | Tipo, comportamento variável/fixo, grupo, ordem, descrição, situação e conversão de valor original |
| `/financeiro/folha` | Resumo operacional sem ícones decorativos, lista mobile integral, formulário por identificação/remuneração/datas | Salários, líquido, encargos/benefícios, categoria, periodicidade, datas, observação e avisos de migração |
| `/financeiro/fornecedores` | Listagem com nome integral, formulário por identificação/financeiro/contato | Razão social, fantasia, CNPJ e normalização original, condições, vencimento, contato, observação, situação e totais |
| `/financeiro/contas` | Fila administrativa com situação e vencimento, formulário por lançamento/pagamento/recorrência | Todos os estados, tipo, valor, competência, vínculos, boleto/NF, pagamento, recorrência, replicação e confirmação de exclusão |

## Sistema visual e interação

O estúdio deixa de redefinir a paleta do produto. Seus estilos herdam os tokens claro/escuro globais, usam 14px para controles e corpo de interface, 16px para títulos de registros e ações de 44px no mobile. Cartões do quadro não flutuam, mapas e calendário têm superfícies sóbrias e rolagem local, e a navegação dos modos não disputa com a navegação de campanhas. Os nomes de campanha e produto continuam completos.

Os editores do Planejamento conservam as chaves internas de suas seis abas e seus campos. Só os rótulos visíveis mudam para Dados, Metas e estratégia, Ações e produtos, Preparação, Resultados e aprendizados e Contexto. Diálogos preservam o mecanismo nativo e retornam ao acionador após fechar. O cabeçalho e o rodapé respeitam safe areas.

As seis rotas financeiras têm navegação contextual comum. Os quatro cadastros compartilham uma busca identificada, contagem real de registros, ação de criação, lista mobile, alternativa Tabela e formulários agrupados por seções. Nenhum campo foi substituído por texto estático. As ações de editar/apagar têm nome acessível e área ampliada.

## Dados e regras

Nenhum carregador, endpoint, função de cálculo, permissão, schema ou integração foi alterado neste escopo. Os callbacks existentes de POST/DELETE, revisão, confirmar e gravar permanecem. A lista mobile de custos alimenta o mesmo mapa de edições e o mesmo `salvarSku` da tabela; ela não introduz outro caminho de gravação nem outro cálculo.

O resumo da DRE continua usando o resultado fornecido pelo servidor: não apresenta contribuição parcial menos despesas como lucro. A cobertura permanece antes da conclusão financeira. Na comparação em índice 100 dos resultados de campanhas, sem baseline positivo a representação é substituída por estado explicativo; os valores brutos continuam disponíveis. A função de cálculo e a metodologia não foram modificadas.

## Fixtures e QA

`scripts/redesign/preview-app/rotas-estudio-financeiro.tsx` exporta `ROTAS_ESTUDIO_FINANCEIRO`, com as oito rotas renderizando clientes reais. `fixtures-estudio-financeiro.ts` contém dados sintéticos tipados para campanhas ativas/futuras/atrasadas, duas fontes de resultados, DRE completa, custos completos/incompletos, frete, despesa de canal e os quatro cadastros. Não importa carregador, autenticação, Supabase ou PostgreSQL em runtime. As importações de arquivos de dados são somente de tipos.

Verificação sintática de todos os TSX do escopo e das fixtures via `typescript.transpileModule`: aprovada. `git diff --check`: sem erro de whitespace. Build e checagem de tipos completos ficam centralizados no agente principal.

QA de navegador local concluído antes da falha de infraestrutura: **56/56 cenários aprovados**, com 32 renderizações/reflows (oito rotas em 390/1366px, claro/escuro), cinco visões do Planejamento, abertura e fechamento do editor de campanha, três abas de Custos, alteração de célula somente em estado local e abertura/fechamento dos quatro formulários administrativos por seções. Zero overflow nas amostras, zero erro de página e zero tentativa de escrita. Evidência: `output/redesign/qa-estudio-financeiro.json`; execução reproduzível: `scripts/redesign/verificar-estudio-financeiro.mjs`. Não foram feitas capturas nesta etapa. A verificação não afirma teste de sessão real nem de gravação.

Foi identificado um problema preexistente de identidade do estado local do Planejamento: `useState(iniciais)` poderia conservar o estado anterior em um refresh de empresa. O carregador fornece `dados.operacao = op.id`, e o elemento da página passou a ser identificado por `key={dados.operacao}`, sem mudar o carregador, a autenticação ou regras. O teste adicional de remonta com duas operações sintéticas em `/__qa/planejamento-operacao` ficou **pendente**: a infraestrutura de desenvolvimento atingiu erro 112 de disco cheio durante a sua abertura. O teste foi encerrado sem nenhuma escrita; esse ensaio não faz parte dos 56 cenários aprovados e a rota existe apenas no harness, fora das 61 páginas de produção.

## Limites de aceitação

- Autenticação, isolamento multiempresa e RBAC não são comprovados por fixtures, embora seus arquivos e contratos tenham sido preservados.
- Gravação real, exclusões, recorrência, sincronização e importação não foram executadas durante esta implementação.
- As matrizes cronológicas da DRE e as planilhas editáveis preservam a ordem e não recebem ordenação que possa trocar a cronologia ou o vínculo de edição.
- Custos de frete por faixa e despesas por canal mantêm a tabela integral com scroll local no mobile. O fluxo editável por item foi adicionado à aba SKU, que concentra a lista longa de produtos.
- As funcionalidades de Mapa e drag/drop dependem também da validação aprofundada de movimentação por mouse e teclado; a troca de visão e seus controles principais foram renderizados no QA. As gravações reais e a remonta extra de duas operações permanecem pendentes conforme as condições acima.
