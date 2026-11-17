# Visão geral — paridade do piloto

Data de referência: 16/11/2026. Escopo: `/`, confrontado com o blueprint completo, o inventário `INTERFACE-ATUAL-GERIZO.txt` e o código atual. Esta matriz registra implementação; aprovação visual e jornadas autenticadas não são presumidas.

## O que mudou

- O seletor Faturamento/Pedidos antecede a superfície de leitura. O valor integral usa 48px no mobile e 56px no desktop amplo, com `R$` separado do montante para preservar os dígitos. O indicador alternativo permanece visível como contexto.
- Exceção para moeda extensa: abaixo de 640px, valores com mais de dez caracteres numéricos formatados usam `moneyShort` no destaque de 48px. Logo abaixo, “Valor integral: R$ …” mostra o montante completo a 14px, com espaço normal após a moeda. A partir de 640px o destaque permanece integral. A exceção não altera cálculo, zeros nem ausência de dados.
- O gráfico usa a mesma série/recorte original, uma unidade por vez, linha sem suavização, roxo de marca e preenchimento sólido discreto. Valores exatos estão em “Ver dados por dia”, acessível sem hover.
- Prioridades são linhas de decisão com evidências e ações, sem cartões internos nem ícones decorativos. A comparação própria da fila é identificada; resolver/desfazer mantém o armazenamento e comportamento existentes.
- Os quatro indicadores de apoio compartilham uma faixa. A grade usa uma coluna estreita e amplia conforme o espaço, sem ocultar valores.
- Atalhos estão nos blocos relacionados: comparar produtos na tabela, Planejamento nas prioridades e Por que caiu na análise de SKUs. O histórico permanece expansível.
- Canais vêm antes de produtos no mobile, com nome integral, valores, variação e participação existentes. A tabela de produtos preserva ordenação, colunas, resumo/tabela mobile e personalização de leitura.
- SKUs em queda mantêm filtros ABC, paginação, evolução e destino do anúncio; as linhas aceitam Enter/Espaço e os valores do gráfico estão acessíveis em tabela.
- Quando `dados.vazio` está ativo, as superfícies de recomendações/SKUs não confundem ausência de dados com ausência de problemas.
- Quando não há nenhuma linha no recorte (`recorte.dias === 0`), Pulso e indicadores mostram “— / Sem dados neste recorte”, sem delta. Linhas existentes com valores zero continuam exibindo zero; a agregação não foi alterada.

## Matriz de preservação

| Elemento | Dados / comportamento preservado | Implementação |
|---|---|---|
| Períodos | 7 dias, 30 dias, 90 dias e Ano; estado React e recorte por dias com movimento | `src/app/painel-cliente.tsx`; `recortar()` intacto |
| Canal e conta | Consolidado, canal agrupador e contas; `idsDoRecorte` e agrupamentos | Lógica original integral |
| Faturamento | Total, delta, base comparativa, dias com movimento, intervalo e definição | `PulsoOperacao` e tabela diária |
| Pedidos | Total, delta, base e definição | Alternância do Pulso + indicador secundário |
| Ticket médio | Valor, delta, ajuda, spark e hint | `StatTile`, fórmula original |
| Conversão | Valor/variação quando houver base; “—” sem visita registrada | `temVisitas` original, sem alterar abrangência |
| Mídia e cancelamentos | Valores, variações, inversão semântica e definições | Faixa de indicadores, sem mudar cálculo |
| Defasagem | Condição `piorAtraso >= 2`, aviso de incompletude e Ver fontes | Mantido acima do Pulso |
| Exclusões | Exclusões, canais disponíveis, removidas e controles | `PainelExclusoes` sem alterações |
| Prioridades | Todos itens, severidades, títulos, leituras, métricas, destinos | `FilaRecomendacoes` |
| Resolver/desfazer | Chave `recomendacoes-resolvidas`, marcação por dia, restauração | Lógica/persistência original integral |
| Histórico diário | Faturamento diário, total, datas, tooltip e série do recorte | Gráfico preservado, sem gradiente |
| Histórico de canais | 12 semanas, séries dinâmicas, cores e nomes por canal, tooltip e legenda | Gráfico preservado + tabela de valores |
| Produtos | Top 8, filtro de conta/canal, Produto, SKU, Vendas, Receita, Conversão | `DataTable` e extração original |
| Ver todos | Tradução slug → UUID, conta prefixada e query string | `linkVerTodos` original integral |
| Canais | Consolidado independente do filtro superior, faturamento, participação e delta | `recorteTodos` original integral |
| SKUs em queda | Ordem original, filtros Todas/A/B/C, 10 por página e expansão | Lógica original preservada |
| Evidências de SKU | Receita, visitas, conversão, preço, semanas e lacunas null | Seleção original + tabela acessível |
| Anúncio | `/anuncios/analise?anuncio=<mlb>` | Destino original integral |
| Sem dados | `dados.vazio` real do carregador | Props opcionais `semDados`, sem inventar motivo |
| Autenticação e empresa | Server component, RLS, redirecionamento `/comecar`, carregador | Nenhum arquivo de auth/dados/API modificado |

## Limites encontrados e preservados

- A janela de `topSkus` vem de `dados.anuncios`; mudar o período na home não recalcula esses anúncios pela série diária. É comportamento existente. A transformação não cria outra agregação nem altera o carregador.
- Recomendações usam sua comparação de 7 dias e os SKUs usam semanas. Não obedecem ao seletor de período/canal do Pulso; o escopo continua independente e agora fica explícito.
- A decisão `temVisitas` consulta as linhas do canal, como antes. Não foi transformada em alteração de regra de cálculo nesta fase.
- A tabela manual de SKUs em queda mantém rolagem local no mobile; suas colunas não receberam ordenação nova. A ordem original prioriza curva A. A migração completa dessa tabela para resumo mobile/ordenação fica registrada como pendência da fundação, sem retirar nenhuma coluna.
- Nenhuma chamada de integração, mutação, importação ou exclusão foi usada para implementar esta fatia.

## Verificação

- TypeScript e build: aprovados no checkpoint integrado.
- QA visual: capturas baseline/pós-mudança em três viewports e dois temas foram abertas e inspecionadas com fixtures isoladas. O QA conjunto do piloto passou em 108/108 cenários; os limites e a revisão de produto pendente estão em checkpoint-fase-1.md.
- Jornadas reais de login, troca de empresa, RBAC e fontes continuam exigindo ambiente autenticado autorizado; não há substituição por fixture em código de produção.
