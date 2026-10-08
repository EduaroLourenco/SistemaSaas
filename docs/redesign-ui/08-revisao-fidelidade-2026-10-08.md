# Revisão de fidelidade e mobile — 08/10/2026

Revisão feita sobre `9a7d106`, depois de reler as alterações que entraram durante a noite. As alterações visuais anteriores já estavam incorporadas em `97a1ea3`; esta revisão complementa o estado atual, sem reaplicar versões antigas dos componentes.

## Decisões preservadas

- **Fontes de dados continua em `/integracoes`**, por decisão do usuário. Saúde dos dados permanece no topo dessa tela. O painel inicial mantém somente seu aviso de dados desatualizados.
- Permanecem as definições novas de faturamento/cancelamentos, a conversão restrita aos canais com visitas e os comparativos calculados conforme o período.
- Permanecem a cobertura da margem, o resultado indisponível quando falta custo por SKU e a distinção entre faturamento e receita apurada na DRE.
- Permanecem a paginação dos dados, a organização atual dos relatórios, os cadastros de canais/contas/ERP e os links de conexão OAuth sem prefetch.
- Esta revisão não altera consultas, regras de cálculo, permissões, banco ou migrações.

## Referências confrontadas com o sistema atual

Origem: `gerizo-redesign-handoff.zip`, pasta `referencias/aprovadas`. A referência orienta hierarquia, cores, tipografia e proporções; o conteúdo continua sendo o que existe no sistema.

| Referência | Tela atual | Resultado e diferenças intencionais |
| --- | --- | --- |
| 01 · Visão geral | `/` | Mantidos cabeçalho com filtros, indicadores maiores e recomendações compactas. As explicações novas dos indicadores agora abrem por toque e teclado. Fontes de dados não volta ao painel. |
| 02 · Planejamento | `/planejamento` | Mantidos estúdio, campanhas, ações e calendário atuais. Melhorados campos da folha de campanha e barra de busca no celular. Não é exibido um grande estado vazio quando já existem campanhas. |
| 03 · Vendas anual | `/vendas/anual` | Cabeçalho, gráfico e tabela mais compactos no computador; receita verde-petróleo, meta cinza-azulada, acumulados laranja/azul. No celular permanecem cartões mensais e valores completos. |
| 04 · Conversar | `/conversa` | Mantidas a conversa e as sugestões atuais, com rolagem móvel. Não foram inventados histórico de conversas ou filtros que o produto ainda não oferece. |
| 05 · Alertas | `/alertas` | Lista compacta; os números quebram linha no celular. A explicação, a evolução e o caminho de investigação permanecem disponíveis ao expandir. |
| 06 · Importar | `/importar` | Mantidos guia curto, conexões e importador reais. Corrigida a base dos painéis para respeitar o fundo suave do guia. |
| 07 · Mercado Livre | `/anuncios/analise` e componentes comuns | Conferidos indicadores, tabelas, filtros e comparativos dinâmicos da versão atual. Não foram reintroduzidas variações fixas das imagens. |
| 08 · Financeiro | `/financeiro` | Resumo com quatro cartões, ícones e números adaptáveis. DRE com primeira coluna menor no celular. Preservados cobertura, avisos e estados sem custo; não foram adicionados dados bancários fictícios. |
| 09 · Relatórios | `/relatorios/exportacoes` | Mantidos quatro tipos reais de exportação, ícones semânticos e a ordem atual com o pacote completo. |
| 10 · Canais e contas | `/integracoes/canais` | Tabela preservada no computador; cartões com os mesmos campos, conexões e ações no celular. Formulários usam uma coluna nas telas estreitas. |

Também foram conferidos Semanal e os componentes de Saúde/Fontes de dados. Os títulos, nomes de contas, mensagens e detalhes de saúde podem quebrar linha quando necessário.

## Ajustes compartilhados

- `StatTile`: explicação do indicador em diálogo nativo, com foco, Escape e fechamento por botão. O texto vem das definições existentes.
- `PageHeader`: opção compacta utilizada somente no acompanhamento anual; as demais telas mantêm suas proporções atuais.
- `Cadastro`: cartões no celular são opcionais e foram ativados em Canais e Contas; busca, edição, confirmação de exclusão e renderização dos campos usam as funções existentes.
- `.panel`: base colocada na camada de componentes para que variações explícitas de fundo e borda funcionem. Isso recupera o destaque suave dos guias e dos avisos de cobertura.
- Planejamento: corrigida a especificidade dos campos da folha, garantindo fonte de 16px nas larguras de celular verificadas.

## Verificação

- Compilação de produção e TypeScript aprovados com `npm run build` (64 páginas estáticas geradas; rotas dinâmicas compiladas).
- `git diff --check` sem erros de whitespace.
- 39 registros de geometria da interface nas larguras 320, 390, 768, 1024 e 1440px, sem transbordamento horizontal da página, corte dos indicadores marcados ou erro de aplicação nos cenários registrados. Tabelas extensas e calendários preservam sua rolagem interna.
- Interações conferidas: explicação de indicador por toque e fechamento por Escape com retorno de foco; criação de campanha sem gravar; abertura do calendário; filtros de Financeiro e Análise de anúncios; mudança de período com variações recalculadas; busca e edição de conta sem gravar; troca da aba Canais; expansão de alerta; abertura do detalhe mensal pelo teclado.
- Revisão dos componentes React: componentes auxiliares fora do render, identificadores acessíveis únicos, propriedades opcionais com comportamento anterior como padrão, nenhuma alteração de efeitos de gravação ou carregamento de dados.

As capturas e `verificacao.json` estão em `output/fidelity-review-20261008/`. A prévia em `output/fidelity-preview/` importa os componentes reais do projeto e usa dados fictícios identificados na tela. As APIs de escrita estão indisponíveis nessa prévia.

**Limite da verificação:** o navegador da aplicação com dados reais estava sem login. Não foram validados sincronização externa, gravação de cadastros, exportações autenticadas ou alterações no banco. A tela de Fontes de dados foi verificada por seus componentes, sem executar sua página de servidor autenticada. A compilação não substitui essa conferência posterior com a conta do usuário.

Entrega local, sem publicação nesta revisão.
