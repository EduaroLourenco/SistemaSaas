# Gerizo — cobertura das 61 rotas

Consolidação em 17/11/2026, branch codex/redesign-gerizo-completo; base de auditoria 56f69bd35e894fc7d53059cb1d36a058d5731433. Blueprint v1.0 de 15/11/2026 lido integralmente e confrontado com as 61 rotas do inventário de referência (commit 5e711fa), código vivo e relatórios de área. A extração estática não equivale a prova de paridade funcional.

## Estado e evidência

**61 rotas implementadas; nenhuma rota de interface não iniciada.** O escopo foi ampliado pelo pedido posterior do usuário para todas as áreas. O comando de partida do documento, limitado ao piloto, é referência histórica e não restringe esta expansão. Os relatórios de área descrevem composição, campos, ações e regras mantidas em cada rota. A fundação compartilhada tem efeito transversal, complementado por tratamento específico das páginas e ferramentas.

A coluna “Estado do redesign” separa implementação concluída de **aceite parcial**: renderizar e exercitar fixtures não comprova todas as condições autenticadas, estados e critérios do blueprint. Nenhuma rota é marcada como integralmente aprovada só por build ou smoke de navegador. A consolidação final dos testes pertence ao [relatório principal](entrega-completa.md).

| Área implementada | Rotas | Evidência técnica de área disponível |
|---|---:|---|
| [Piloto](checkpoint-fase-1.md) | 3 | 108/108 verificações amostrais |
| [Decisão](fase-decisao.md) | 16 | 21/21 verificações e 2/2 adicionais de Queda |
| [Operação](fase-operacao.md) | 16 | 46/46 verificações |
| [Estúdio e financeiro](fase-estudio-financeiro.md) | 8 | 56/56 verificações |
| [Gestão, relatórios e acesso](entrega-completa.md) | 18 | 50/50 verificações aprovadas |

A matriz geral disponível registra **366/366 combinações aprovadas**: 61 rotas × 320/390/1366px × claro/escuro. O ensaio verifica DOM, título, erros de JavaScript e overflow de página, sem novas capturas. O piloto já possui capturas e QA em dez larguras. A rechecagem final confirmou /promocoes/campanhas em 320px claro; os timeouts de infraestrutura permanecem no histórico local. As 50 verificações de gestão foram consolidadas após correções e rechecagem. Os históricos locais preservam as falhas anteriores e seus resultados posteriores.

O harness scripts/redesign/preview-app renderiza componentes reais com fixtures sintéticas e bloqueia escrita/conexão externa. Os números, pedidos, convites e empresas não são reais. O baseline do piloto e suas imagens são históricos locais em output/redesign; a expansão foi verificada por DOM, estilos calculados, reflow e interações, sem novas capturas por preferência posterior do usuário. Auth, SSR de dados, RLS e integrações permanecem fora do harness.

## Divergências e trabalho existente

- HEAD difere do snapshot somente em 'src/app/api/cron/blocos/route.ts' e 'src/lib/atualizacao-fila.ts' (20 adições, 6 remoções). São mudanças de atualização no servidor, fora do redesign.
- O README encontrado na auditoria inicial descrevia a antiga fase estática. Foi atualizado durante a expansão para refletir sessão, banco Supabase, RLS e integrações. src/mock continua sendo formato/referência e fixture, não fonte global do produto.
- Alterações locais pré-existentes em 'src/app/api/precificacao/frete/route.ts' e 'src/app/produtos/precificacao/precificacao-cliente.tsx' pertencem ao usuário; preservá-las. Também havia arquivos não rastreados de inventário, PPTX e contas.
- Comparar ofertas é encontrado na navegação de área atual; Apresentação, Guia, Preço-alvo, Performance de preço e Monitoramento têm visibilidade deliberadamente limitada. Não ampliar descoberta por conta de uma proposta textual.

## Matriz das 61 rotas

Todas as URLs do snapshot continuam presentes. “Implementada · aceite parcial” significa que a transformação de interface foi entregue, com evidências em fixture e limites explícitos. As condições de sessão, regras de escrita, dados reais e consentimentos continuam sendo verificadas no servidor/banco; não foram contornadas pelo redesign.

| Rota | Estado do redesign | Fonte de página | Contrato/módulos diretos | Preservação por rota | Evidência atual |
|---|---|---|---|---|---|
| /alertas | implementada · aceite parcial | [fonte](../../src/app/alertas/page.tsx) | alertas | todos os achados, estados, ordem e links; não confundir nenhum crítico com ausência de coleta. | Geral 6/6 em fixture; [Piloto](checkpoint-fase-1.md). Aceite autenticado pendente. |
| /anuncios/analise | implementada · aceite parcial | [fonte](../../src/app/anuncios/analise/page.tsx) | analise | painel-lentes, comparar, linha do tempo, elasticidade, promoção-ao-vivo, fotos e todas as ações/dados; estado sem seleção e coleta. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /anuncios/catalogo | implementada · aceite parcial | [fonte](../../src/app/anuncios/catalogo/page.tsx) | catalogo, disputa-catalogo | cargas, comissão, MLB/SKU, histórico 12 semanas, vencedor/estoque, gavetas, “De onde vem” por coluna; evitar divulgar preço sugerido como garantia de vitória. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /anuncios/preco-alvo | implementada · aceite parcial | [fonte](../../src/app/anuncios/preco-alvo/page.tsx) | preco-alvo, formula-preco | metodologia e status, cálculos existentes, sem completar funcionalidade nem publicar sem aprovação. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /anuncios/preco-ideal | implementada · aceite parcial | [fonte](../../src/app/anuncios/preco-ideal/page.tsx) | preco-ideal | relatórios, preço praticado/ideal, comissão negociada, datas, exportações e todas as ações; explicação acessível. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /anuncios/preco-performance | implementada · aceite parcial | [fonte](../../src/app/anuncios/preco-performance/page.tsx) | performance-preco | recortes, 10 colunas, limitações de inferência, sem afirmar causalidade. Não publicar no menu automaticamente. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /anuncios/tipo | implementada · aceite parcial | [fonte](../../src/app/anuncios/tipo/page.tsx) | tipo-anuncio | todas as 6 métricas por tipo, tarifas tabela/praticadas/extra, receita, razão de visitas, definição e limitações de médias. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /anuncios/trafego-pago | implementada · aceite parcial | [fonte](../../src/app/anuncios/trafego-pago/page.tsx) | trafego-pago, trafego-oportunidades, disputa-catalogo | todas as colunas, export, distinção receita atribuída x conta, comissão/margem, avisos de conferência e fontes; não misturar recortes nem confundir receita indireta com lucro. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /automacoes | implementada · aceite parcial | [fonte](../../src/app/automacoes/page.tsx) | automacoes, trafego-pago, regras-promocao, folga-campanha, fila-aprovacao | toda regra, janela, prazo, preço, estoque, situação, mídia e seleção, confirmação explícita existente; nunca autoenviar, alterar piso ou simular sucesso. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /automacoes/regras | implementada · aceite parcial | [fonte](../../src/app/automacoes/regras/page.tsx) | regras-promocao, cobertura-regras, canais | aviso quando dado faltar, tipos de condição, ordem, regra desligada, percentual abaixo do piso, confirmação, todas as ações. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /cadastro | implementada · aceite parcial | [fonte](../../src/app/cadastro/page.tsx) | Componente local / estático; ver inventário | modos empresa/conta, validação e login; não alterar cadastro/permissão. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /comecar | implementada · aceite parcial | [fonte](../../src/app/comecar/page.tsx) | Componente local / estático; ver inventário | comportamento, erros/redirect e contexto, não criar empresa em teste de UI real. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /configuracoes | implementada · aceite parcial | [fonte](../../src/app/configuracoes/page.tsx) | Componente local / estático; ver inventário | persistência no navegador, tamanhos confortável/compacto, sem sobrescrever preferência. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /conversa | implementada · aceite parcial | [fonte](../../src/app/conversa/page.tsx) | Componente local / estático; ver inventário | histórico/ações existentes, fontes consultadas, respostas e estados; método em ajuda; texto gerado não é substituído por resumo fictício. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /convite/[token] | implementada · aceite parcial | [fonte](../../src/app/convite/[token]/page.tsx) | Componente local / estático; ver inventário | token, direitos, validação e encaminhamento; não expor token em logs/UI. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /empresas | implementada · aceite parcial | [fonte](../../src/app/empresas/page.tsx) | empresas | criação e convite, conexão, rename/ops, contagens, permissões, condição de apagar e isolamento multiempresa; não realizar exclusão real em teste. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /entrar | implementada · aceite parcial | [fonte](../../src/app/entrar/page.tsx) | Componente local / estático; ver inventário | autenticação, erros, campos, aviso de criação por administrador, redirecionamento, dark se aplicável; não criar recuperação de senha sem suporte. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /equipe | implementada · aceite parcial | [fonte](../../src/app/equipe/page.tsx) | equipe, papeis | ações de convite/gestão/roles, restrições e feedback, não ampliar permissões. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /financeiro/categorias | implementada · aceite parcial | [fonte](../../src/app/financeiro/categorias/page.tsx) | financeiro | descrição, ordem DRE, ativa e demais campos/ações; não mudar categoria usada em cálculo automaticamente. | Geral 6/6 em fixture; [Estúdio e financeiro](fase-estudio-financeiro.md). Aceite autenticado pendente. |
| /financeiro/contas | implementada · aceite parcial | [fonte](../../src/app/financeiro/contas/page.tsx) | financeiro | Previsto/Em aberto/Pago/Atrasado/Cancelado, recorrência, competência, boleto/NF/forma e demais campos; sem pagamento ou alteração de status automática. | Geral 6/6 em fixture; [Estúdio e financeiro](fase-estudio-financeiro.md). Aceite autenticado pendente. |
| /financeiro/custos | implementada · aceite parcial | [fonte](../../src/app/financeiro/custos/page.tsx) | custos, contas-recorte | custo fixo/variável recorrente/avulso, preço/peso e origens conforme código, 3 tabelas editáveis e ações, novo SKU, validação e regras. | Geral 6/6 em fixture; [Estúdio e financeiro](fase-estudio-financeiro.md). Aceite autenticado pendente. |
| /financeiro/folha | implementada · aceite parcial | [fonte](../../src/app/financeiro/folha/page.tsx) | financeiro | salários bruto/líquido, encargos/benefícios, dia/periodicidade, categoria, admissão/demissão e observação; manter permissões existentes. | Geral 6/6 em fixture; [Estúdio e financeiro](fase-estudio-financeiro.md). Aceite autenticado pendente. |
| /financeiro/fornecedores | implementada · aceite parcial | [fonte](../../src/app/financeiro/fornecedores/page.tsx) | financeiro | razão social, nome fantasia, CNPJ, categoria, condições, vencimento, contato, campos existentes e validação. | Geral 6/6 em fixture; [Estúdio e financeiro](fase-estudio-financeiro.md). Aceite autenticado pendente. |
| /financeiro | implementada · aceite parcial | [fonte](../../src/app/financeiro/page.tsx) | margem, contas-recorte | todos os componentes da DRE, sinais/valores, metodologia e recortes, categoria e totais; não alterar tratamento de custos, não assumir fechamento. | Geral 6/6 em fixture; [Estúdio e financeiro](fase-estudio-financeiro.md). Aceite autenticado pendente. |
| /glossario | implementada · aceite parcial | [fonte](../../src/app/glossario/page.tsx) | glossario | todas as definições e destinos existentes. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /guia | implementada · aceite parcial | [fonte](../../src/app/guia/page.tsx) | Componente local / estático; ver inventário | texto instrucional e links; acesso conforme permissão e visibilidade atuais. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /importar | implementada · aceite parcial | [fonte](../../src/app/importar/page.tsx) | Componente local / estático; ver inventário | validação, bloqueios, duplicidade, prévia, contagens, últimos resultados, seleção/confirmar; não executar automaticamente. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /integracoes/canais | implementada · aceite parcial | [fonte](../../src/app/integracoes/canais/page.tsx) | canais | campos de canais/contas, seller ID, reputação, Full, padrão, lojas Bling, puxar histórico, conexões, ajuda/avisos e estados; sincronizar apenas por ação real autorizada. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /integracoes/estoques | implementada · aceite parcial | [fonte](../../src/app/integracoes/estoques/page.tsx) | estoques | todas as origens, integrações, estoques e estados extraídos do componente; não acrescentar quantidade/estado fictício. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /integracoes | implementada · aceite parcial | [fonte](../../src/app/integracoes/page.tsx) | fontes, operacao, saude | mapa/saúde de dados, limites de fonte, todas as ações existentes, sem alegar cobertura não medida. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /manual/bling | implementada · aceite parcial | [fonte](../../src/app/manual/bling/page.tsx) | Componente local / estático; ver inventário | todas as instruções, permissões, erros 403, instalação/desinstalação/suporte; manter texto necessário e versão. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /mercado-livre/envios | implementada · aceite parcial | [fonte](../../src/app/mercado-livre/envios/page.tsx) | envios-meli | ordem de prazo real, status, nenhuma ação de envio inventada; “Nenhum envio pendente” só se consulta válida. | Geral 6/6 em fixture; [Piloto](checkpoint-fase-1.md). Aceite autenticado pendente. |
| /mercado-livre | implementada · aceite parcial | [fonte](../../src/app/mercado-livre/page.tsx) | termometro, catalogo-semana | comparação mesma semana anterior, status parcial, eventos de campanha/preço/estoque, reputação e contas, todas as tabelas. Não atribuir venda baixa a foto/preço/prazo como certeza. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /monitoramento/fretes | implementada · aceite parcial | [fonte](../../src/app/monitoramento/fretes/page.tsx) | Componente local / estático; ver inventário | rota e condição de acesso, não desenvolver recurso novo. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /monitoramento/precos | implementada · aceite parcial | [fonte](../../src/app/monitoramento/precos/page.tsx) | precos-praticados | valores, datas e fontes; zero duplo eixo; manter visibilidade atual. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| / | implementada · aceite parcial | [fonte](../../src/app/page.tsx) | painel | links Investigar queda, Comparar produtos e Planejamento integrados aos blocos correspondentes ou menu de ações; filtros, recorte dinâmico, todas as métricas, exclusões e saúde de dados. Pulso não perde definição (help). | Geral 6/6 em fixture; [Piloto](checkpoint-fase-1.md). Aceite autenticado pendente. |
| /planejamento | implementada · aceite parcial | [fonte](../../src/app/planejamento/page.tsx) | planejamento | campanhas, ações soltas, grupos, tipos, eventos e fonte Sebrae, todas as visões, edições, datas, regras, comparativos, extrações e vínculos; nunca migrar regras só por CSS. | Geral 6/6 em fixture; [Estúdio e financeiro](fase-estudio-financeiro.md). Aceite autenticado pendente. |
| /planejamento/resultados | implementada · aceite parcial | [fonte](../../src/app/planejamento/resultados/page.tsx) | planejamento-resultados | universo, controles, dados de promoções e ações, ausência de dados de cada origem distinta; não alegar causalidade não comprovada. | Geral 6/6 em fixture; [Estúdio e financeiro](fase-estudio-financeiro.md). Aceite autenticado pendente. |
| /privacidade | implementada · aceite parcial | [fonte](../../src/app/privacidade/page.tsx) | Componente local / estático; ver inventário | texto, links, datas e conteúdo legal sem reescrita. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /produtos | implementada · aceite parcial | [fonte](../../src/app/produtos/page.tsx) | produtos-precos | Vitrine/Vendido médio/Unidades/Receita/Curva, período, canal, sem venda, Excel/CSV, ordenação. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /produtos/precificacao | implementada · aceite parcial | [fonte](../../src/app/produtos/precificacao/page.tsx) | precificacao, formula-preco | fórmulas, taxas, custo, origem, simulador não confundir com valor real; sem custo aponta para Financeiro/Custos. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /promocoes/campanhas | implementada · aceite parcial | [fonte](../../src/app/promocoes/campanhas/page.tsx) | promocoes | última rodada, campos, filtros e ações existentes; não confundir histórico com campanha ativa. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Rechecagem geral pendente. Aceite autenticado pendente. |
| /promocoes/comparar | implementada · aceite parcial | [fonte](../../src/app/promocoes/comparar/page.tsx) | comparar-ofertas | todas as propostas, colunas e ações existentes. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /promocoes/historico | implementada · aceite parcial | [fonte](../../src/app/promocoes/historico/page.tsx) | promocoes | rodadas, preços, decisões, tipos, exportação/filtros se presentes, datas e estados. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /promocoes/processar | implementada · aceite parcial | [fonte](../../src/app/promocoes/processar/page.tsx) | Componente local / estático; ver inventário | todos os campos, cálculos, descontos, redução de tarifa, decisão/motivo, items para revisar, planilha, bloqueios e estados; sem alterar fórmula ou automatizar aprovação. | Geral 6/6 em fixture; [Operação](fase-operacao.md). Aceite autenticado pendente. |
| /relatorio/[chave] | implementada · aceite parcial | [fonte](../../src/app/relatorio/[chave]/page.tsx) | relatorio, operacao | chave pública, permissões e ausência de sessão, todas as 7 tabelas/dados e 12 ações do código conforme estado, impressão/exportação se existente, confidencialidade. Não adicionar dados internos, links de administração ou login obrigatório; não mudar contrato do link. Estilo de impressão dedicado quando permitido. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /relatorios/apresentacao | implementada · aceite parcial | [fonte](../../src/app/relatorios/apresentacao/page.tsx) | apresentacao | gráficos, seleção, todos os slides/ações/navegação, rota permanece conforme acesso atual. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /relatorios/exportacoes | implementada · aceite parcial | [fonte](../../src/app/relatorios/exportacoes/page.tsx) | Componente local / estático; ver inventário | todos os formatos, filtros e colunas, sem mudar contratos CSV. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /termos | implementada · aceite parcial | [fonte](../../src/app/termos/page.tsx) | Componente local / estático; ver inventário | conteúdo, termos, datas e consentimento existente, sem alterar obrigação. | Geral 6/6 em fixture; [Gestão, relatórios e acesso](entrega-completa.md). Interações da área em consolidação. Aceite autenticado pendente. |
| /vendas/anual | implementada · aceite parcial | [fonte](../../src/app/vendas/anual/page.tsx) | vendas | meta, acumulado, ano anterior e todos os indicadores/colunas, mês e detalhe; ano em curso identificado. Zero múltiplos eixos Y. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/canais | implementada · aceite parcial | [fonte](../../src/app/vendas/canais/page.tsx) | vendas | 12 semanas e comparar período, pedidos, ticket, conversão, margem, tendência, cor do canal. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/cancelamentos | implementada · aceite parcial | [fonte](../../src/app/vendas/cancelamentos/page.tsx) | cancelamentos | valores, taxas, causas apenas se existentes, todos os pedidos e métodos; aumento semântica adequada, nulo distinto de zero. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/comparativos | implementada · aceite parcial | [fonte](../../src/app/vendas/comparativos/page.tsx) | vendas | comparação mês anterior, valores, datas e legenda de melhor/pior, não usar cor única. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/dia | implementada · aceite parcial | [fonte](../../src/app/vendas/dia/page.tsx) | dia | data, contagem de dias na meta, sincronização falha/incompleta, métricas, detalhe e filtros, cor com texto/símbolo. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/diario | implementada · aceite parcial | [fonte](../../src/app/vendas/diario/page.tsx) | diario | ordem/base da comparação e variação, todos os indicadores, sem comparar períodos desiguais inadvertidamente. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/lancamentos | implementada · aceite parcial | [fonte](../../src/app/vendas/lancamentos/page.tsx) | vendas, automacao | edição, validação, dados da origem, receita bruta/líquida/pedidos/TACOS, cálculo sem alterações; não substituir por tabela somente leitura. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/metas | implementada · aceite parcial | [fonte](../../src/app/vendas/metas/page.tsx) | metas-planejamento, ratear-meta | dias travados manualmente, rateio, revisões, regras e validações. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/mtd | implementada · aceite parcial | [fonte](../../src/app/vendas/mtd/page.tsx) | mtd | fechamento real, contas, dias, modo de recuperação e explicação de hipótese, não representar simulação como previsão. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/queda | implementada · aceite parcial | [fonte](../../src/app/vendas/queda/page.tsx) | queda | fórmula, leitura dos dados e limites da análise acessíveis, todos os campos; não inferir causalidade, não forçar contribuição sem cálculo; zero múltiplos eixos Y. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/semanal | implementada · aceite parcial | [fonte](../../src/app/vendas/semanal/page.tsx) | vendas | todos os indicadores, WoW/participação, detalhe, dados em curso, as duas formas de leitura. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |
| /vendas/skus | implementada · aceite parcial | [fonte](../../src/app/vendas/skus/page.tsx) | analise-sku | todos os períodos, canais, abas, métricas/ações dos blocos-sku, tabelas e filtros. | Geral 6/6 em fixture; [Decisão](fase-decisao.md). Aceite autenticado pendente. |

## Contratos e ações do piloto

### Visão geral

Fonte SSR: 'carregarPainel()' em 'src/lib/dados/painel.ts'. Recebe 'DadosPainel': kpis, faturamento30d, canais, canaisSemanas, canalCores, canalNomes, anuncios, linhas diárias, canaisInfo, recomendacoes, quedas, ultimaData, vazio, fontes, exclusoes, removidas e canaisDisponiveis. A tela recalcula o recorte com 'recortar' no cliente e mantém comparação entre canais consolidada.

- Campos e filtros: canal/conta/grupo, 7/30/90 dias/Ano, intervalo e dias com movimento; faturamento, pedidos, ticket, visitas/conversão, mídia, cancelamento e demais KPIs retornados pelo cálculo existente. Não criar ou trocar a fórmula de ticket/conversão.
- Ações: investigar queda, produtos, planejamento; seletor de métrica do Pulso e definição; resolver/desfazer recomendações no armazenamento local diário; histórico expansível; Ver todos com tradução do canal para URL; ordenação/colunas/resumo/tabela dos produtos; filtros/detalhe de SKUs em queda; exclusões com confirmação/validação existentes.
- Evidência: nome completo e SKU, vendas, receita, conversão; série de faturamento e participação por canal; receita/variação/participação consolidadas por canal; séries e causa calculada do SKU.
- Estados: sem visitas mostra nulo em conversão; atraso de fonte ≥2 dias mostra aviso; zero mantém zero; vazios e recomendações resolvidas mantêm a lógica; nenhum dado de outra empresa pode permanecer após troca.

### Alertas

Fonte SSR: 'carregarAlertas()', com 'DadosAlertas' contendo alertas, exclusoes, removidas e canaisDisponiveis. Cada achado tem id, severidade, tipo, titulo, leitura, numeros, evidencia, formato e destino opcional. Limiares e denominadores são regra de negócio do carregador.

- Campos/filtros: Todos/Críticos/Atenção, com contagens derivadas da lista; informativos continuam em Todos. Severidade, tipo e ordem ficam preservados.
- Ações: filtro, abrir evidência recolhível, Investigar com href original; painel de exclusões existente.
- Estados: sem achados, sem achados nesta severidade, evidência vazia; não equiparar ausência de alerta a confirmação de coleta completa.

### Envios

Fonte SSR: 'carregarEnvios()', que lê retrato em 'agendamentos'; não consulta cada pedido ao abrir a página. 'atualizarEnvios' é o caminho separado de atualização e deve continuar separado. 'DadosEnvios': hoje, contas, envios, falhas por conta e geradoEm. 'EnvioMeli': conta, pedido, compra, limite/origem/dias nulos permitidos, situacao, comprador, itens (titulo/sku/quantidade), total.

- Campos/filtros: Todas/conta; pendências e contagens atrasado/hoje/amanhã/depois; atualização real do retrato. Ordenação por prazo (nulo por último), pedido, conta e situação.
- Evidência: Restam, Enviar até, Produto integral e SKU, Pedido/data da compra, Conta e Situação. Ordenar produtos deve preservar todos os itens de um pedido.
- Estados: sem prazo não é atrasado nem zero; conta com falha permanece identificada; “Nenhum envio pendente” depende de consulta válida, não de falha mascarada. Nenhuma ação de despachar foi inventada.

## Autenticação, isolamento e permissões

'src/proxy.ts' valida a sessão com 'auth.getUser()'; página protegida sem sessão redireciona para /entrar com destino, API retorna 401 JSON. Rotas públicas incluem entrada/cadastro/auth, convite, relatório por chave, manual, privacidade/termos e cron (este último protegido pelo próprio segredo). Relatório sem sessão exige resolução válida da chave e responde 404 em falha. Nunca registrar token/chave real em evidência.

'clienteServidor' usa chave publicável e sessão com RLS. Cookie 'operacao' vira cabeçalho 'x-operacao' para restringir dados; 'listarOperacoes' tem exceção explícita para listar todas as operações autorizadas. Cookie não é autoridade: 'operacaoPadrao' só aceita operação encontrada pela sessão. Seletor grava por POST /api/operacao e chama router.refresh, mantendo contexto novo. Marcas GDF3 e Gerizo dependem da operação existente. Papéis: proprietário, administrador, editor, leitor; descrições em 'papeis.ts' espelham travas de 'db/22_equipe.sql'. Visual não deve alterar essas condições.

O harness comprova apenas composição e interações locais em fixture. Login real, retorno de sessão, RBAC/RLS, duas empresas, troca de operação em produção, integrações e relatório autorizado ainda exigem ambiente de teste apropriado; não marcar essas jornadas aprovadas usando o harness.

## Verificação e limites

- Scripts do package: 'dev', 'build', 'start', 'lint'. 'lint' aponta 'next lint', removido da CLI Next 16; registrar limitação, não alegar lint aprovado. Não adicionar dependências só para contornar neste piloto.
- Há regressões em 'scripts/testar-*.mjs', com runner 'testar-tudo.mjs'. O runner executa tudo sem distinção entre testes puros e operações reais. **Não executar a suíte inteira no ambiente configurado.**
- 'testar-gravacao.mjs' grava/apaga promoções no banco real configurado; 'testar-empresa-nova.mjs' cria/apaga organização e operação; 'testar-operacao-ativa.mjs' lê funções RPC/RLS; 'testar-promocoes.mjs' lê banco. Há ainda testes que carregam .env.local como Meli/contas. Separar explicitamente antes de executar.
- Testes com stub/fixture de servidor cobrem fórmulas e regras sem alterações: exemplos planejamento, queda-filtros, tráfego-filtros, financeiro-resumo, portao-escrita, custos-gravacao e persistencia-promocoes. Inspecionar cada arquivo selecionado e dependências antes do uso.
- O typecheck do harness passou em 16/11/2026: 'node node_modules/typescript/bin/tsc -p scripts/redesign/preview-app/tsconfig.json --noEmit'. Isso não substitui screenshot nem teste visual.
- A auditoria inicial encontrou referências antigas em .next/types a cron removido. Esse é um resultado histórico do baseline; a regeneração e o último build/TypeScript são consolidados no relatório principal.
- Não há medição comparável de LCP/CLS/INP nem teste com operador humano. Não alegar ganho de performance ou conformidade integral WCAG.

## Lacunas concretas frente ao blueprint

- **Sessão e isolamento reais:** J8, login/retorno de sessão, RBAC, RLS, troca real de empresa incluindo GDF3 e relatório público com chave autorizada não são comprovados pelas fixtures. O teste extra de remonta de duas operações do Planejamento está pendente após erro de disco; o key por dados.operacao foi implementado e deve ser verificado em ambiente apropriado.
- **Cobertura de estados e jornadas:** a matriz geral mede estado populado e não demonstra loading, erro, sem fonte, zero, nulo, parcial, defasado e texto/valor extremo em todas as 61 rotas. As interações de área são amostrais. Escrita, confirmações de ponta a ponta, exportações integrais e reconciliação contra dados autenticados não foram executadas.
- **Dispositivos e acessibilidade:** só o piloto cobre as dez larguras previstas. A expansão geral cobre 320/390/1366px; faltam ensaios sistemáticos das demais larguras, 200% de zoom nativo, teclado completo de cada fluxo, leitor de tela, iPhone físico, todos os pares de contraste e todos os alvos de toque. A existência de componentes acessíveis e scanners parciais não comprova WCAG integral.
- **Mapa/drag e calendário:** as cinco visões do estúdio foram exercitadas, mas drag/drop por mouse/teclado, salvamento de posições, revisões concorrentes e remonta multiempresa não têm aceite completo.
- **Qualidade quantitativa:** não há baseline e pós-mudança comparáveis de LCP/CLS/INP nem pesquisa com operadores. A meta de localizar decisão em dez segundos e reduzir pela metade textos repetidos não foi medida.
- **Ferramentas:** a regressão existente de Atualização continua com stub antigo (9/10 testes offline aprovados); o lint legado chama next lint, indisponível na versão instalada. O estado final de build/TypeScript deve ser conferido no relatório principal, sem reutilizar a falha histórica de tipos gerados como resultado atual.
- **Rechecagens finais:** a combinação geral de Campanhas e as interações da Gestão precisam do resultado consolidado do agente principal. Os logs antigos/falhos não foram apagados para fabricar aprovação.

A auditoria final encontrou dois títulos de produto ainda limitados a duas linhas em src/components/analise/tabela-bi.tsx e src/components/analise/comparar.tsx. O clamp foi removido e substituído por quebra local de palavra, preservando a coluna e a composição. São módulos legados preservados, sem import direto na Central atual; o ajuste protege nomes integrais se reutilizados, sem expor nova funcionalidade. A correção não muda dados, ordenação ou ação; sua verificação final de build/navegador é coordenada pelo agente principal.

## Inventário estático complementar

Lista gerada de páginas, arquivos cliente adjacentes, módulos de dados diretos e chamadas fetch literais. Dependências indiretas e condicionais precisam ser abertas durante cada fase. A lista não autoriza escrita nas APIs.

### /alertas

- Página: src/app/alertas/page.tsx.
- Arquivos locais: `src/app/alertas/alertas-cliente.tsx`.
- Dados diretos: `@/lib/dados/alertas`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /anuncios/analise

- Página: src/app/anuncios/analise/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: `@/lib/dados/analise`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /anuncios/catalogo

- Página: src/app/anuncios/catalogo/page.tsx.
- Arquivos locais: `src/app/anuncios/catalogo/catalogo-cliente.tsx`, `src/app/anuncios/catalogo/disputa-painel.tsx`.
- Dados diretos: `@/lib/dados/catalogo`, `@/lib/dados/disputa-catalogo`.
- Fetch literal local: `/api/meli/sincronizar`.

### /anuncios/preco-alvo

- Página: src/app/anuncios/preco-alvo/page.tsx.
- Arquivos locais: `src/app/anuncios/preco-alvo/preco-alvo-cliente.tsx`.
- Dados diretos: `@/lib/dados/preco-alvo`, `@/lib/dados/formula-preco`.
- Fetch literal local: `/api/comissoes-canal`.

### /anuncios/preco-ideal

- Página: src/app/anuncios/preco-ideal/page.tsx.
- Arquivos locais: `src/app/anuncios/preco-ideal/preco-ideal-cliente.tsx`.
- Dados diretos: `@/lib/dados/preco-ideal`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /anuncios/preco-performance

- Página: src/app/anuncios/preco-performance/page.tsx.
- Arquivos locais: `src/app/anuncios/preco-performance/performance-cliente.tsx`.
- Dados diretos: `@/lib/dados/performance-preco`.
- Fetch literal local: `/api/exportar/preco?${q}`.

### /anuncios/tipo

- Página: src/app/anuncios/tipo/page.tsx.
- Arquivos locais: `src/app/anuncios/tipo/tipo-cliente.tsx`.
- Dados diretos: `@/lib/dados/tipo-anuncio`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /anuncios/trafego-pago

- Página: src/app/anuncios/trafego-pago/page.tsx.
- Arquivos locais: `src/app/anuncios/trafego-pago/trafego-pago-cliente.tsx`.
- Dados diretos: `@/lib/dados/trafego-pago`, `@/lib/dados/trafego-oportunidades`, `@/lib/dados/disputa-catalogo`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /automacoes

- Página: src/app/automacoes/page.tsx.
- Arquivos locais: `src/app/automacoes/automacoes-cliente.tsx`.
- Dados diretos: `@/lib/dados/automacoes`, `@/lib/dados/trafego-pago`, `@/lib/dados/regras-promocao`, `@/lib/dados/folga-campanha`, `@/lib/dados/fila-aprovacao`.
- Fetch literal local: `/api/automacoes/contagem?${q}`, `/api/automacoes/folga`, `/api/automacoes/itens?${q}`, `/api/automacoes/enviar`, `/api/automacoes/revisar`.

### /automacoes/regras

- Página: src/app/automacoes/regras/page.tsx.
- Arquivos locais: `src/app/automacoes/regras/regras-cliente.tsx`.
- Dados diretos: `@/lib/dados/regras-promocao`, `@/lib/dados/cobertura-regras`, `@/lib/dados/canais`.
- Fetch literal local: `/api/automacoes/regras`.

### /cadastro

- Página: src/app/cadastro/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /comecar

- Página: src/app/comecar/page.tsx.
- Arquivos locais: `src/app/comecar/criar-empresa.tsx`.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /configuracoes

- Página: src/app/configuracoes/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /conversa

- Página: src/app/conversa/page.tsx.
- Arquivos locais: `src/app/conversa/conversa-cliente.tsx`.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: `/api/conversa`.

### /convite/[token]

- Página: src/app/convite/[token]/page.tsx.
- Arquivos locais: `src/app/convite/[token]/aceitar.tsx`.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /empresas

- Página: src/app/empresas/page.tsx.
- Arquivos locais: `src/app/empresas/empresas-cliente.tsx`.
- Dados diretos: `@/lib/dados/empresas`.
- Fetch literal local: `/api/empresas`, `/api/empresas/${empresa.id}`.

### /entrar

- Página: src/app/entrar/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /equipe

- Página: src/app/equipe/page.tsx.
- Arquivos locais: `src/app/equipe/equipe-cliente.tsx`.
- Dados diretos: `@/lib/dados/equipe`, `@/lib/dados/papeis`.
- Fetch literal local: `/api/equipe`.

### /financeiro/categorias

- Página: src/app/financeiro/categorias/page.tsx.
- Arquivos locais: `src/app/financeiro/categorias/categorias-cliente.tsx`.
- Dados diretos: `@/lib/dados/financeiro`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /financeiro/contas

- Página: src/app/financeiro/contas/page.tsx.
- Arquivos locais: `src/app/financeiro/contas/contas-cliente.tsx`.
- Dados diretos: `@/lib/dados/financeiro`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /financeiro/custos

- Página: src/app/financeiro/custos/page.tsx.
- Arquivos locais: `src/app/financeiro/custos/cadastro-produtos.tsx`, `src/app/financeiro/custos/custos-cliente.tsx`.
- Dados diretos: `@/lib/dados/custos`, `@/lib/dados/contas-recorte`.
- Fetch literal local: `/api/custos/produto`, `/api/custos/planilha`, `/api/custos`, `/api/custos/faixas`, `/api/custos/canal`.

### /financeiro/folha

- Página: src/app/financeiro/folha/page.tsx.
- Arquivos locais: `src/app/financeiro/folha/folha-cliente.tsx`.
- Dados diretos: `@/lib/dados/financeiro`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /financeiro/fornecedores

- Página: src/app/financeiro/fornecedores/page.tsx.
- Arquivos locais: `src/app/financeiro/fornecedores/fornecedores-cliente.tsx`.
- Dados diretos: `@/lib/dados/financeiro`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /financeiro

- Página: src/app/financeiro/page.tsx.
- Arquivos locais: `src/app/financeiro/financeiro-cliente.tsx`.
- Dados diretos: `@/lib/dados/margem`, `@/lib/dados/contas-recorte`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /glossario

- Página: src/app/glossario/page.tsx.
- Arquivos locais: `src/app/glossario/glossario-cliente.tsx`.
- Dados diretos: `@/lib/dados/glossario`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /guia

- Página: src/app/guia/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /importar

- Página: src/app/importar/page.tsx.
- Arquivos locais: `src/app/importar/importar-cliente.tsx`.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: `/api/operacao`, `/api/importar/previa`, `/api/importar/gravar`.

### /integracoes/canais

- Página: src/app/integracoes/canais/page.tsx.
- Arquivos locais: `src/app/integracoes/canais/canais-cliente.tsx`, `src/app/integracoes/canais/erp-painel.tsx`, `src/app/integracoes/canais/google-painel.tsx`.
- Dados diretos: `@/lib/dados/canais`.
- Fetch literal local: `/api/bling/historico`, `/api/bling/lojas`.

### /integracoes/estoques

- Página: src/app/integracoes/estoques/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: `@/lib/dados/estoques`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /integracoes

- Página: src/app/integracoes/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: `@/lib/dados/fontes`, `@/lib/dados/operacao`, `@/lib/dados/saude`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /manual/bling

- Página: src/app/manual/bling/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /mercado-livre/envios

- Página: src/app/mercado-livre/envios/page.tsx.
- Arquivos locais: `src/app/mercado-livre/envios/envios-cliente.tsx`.
- Dados diretos: `@/lib/dados/envios-meli`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /mercado-livre

- Página: src/app/mercado-livre/page.tsx.
- Arquivos locais: `src/app/mercado-livre/termometro-cliente.tsx`.
- Dados diretos: `@/lib/dados/termometro`, `@/lib/dados/catalogo-semana`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /monitoramento/fretes

- Página: src/app/monitoramento/fretes/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /monitoramento/precos

- Página: src/app/monitoramento/precos/page.tsx.
- Arquivos locais: `src/app/monitoramento/precos/precos-cliente.tsx`.
- Dados diretos: `@/lib/dados/precos-praticados`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /

- Página: src/app/page.tsx.
- Arquivos locais: `src/app/painel-cliente.tsx`.
- Dados diretos: `@/lib/dados/painel`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /planejamento

- Página: src/app/planejamento/page.tsx.
- Arquivos locais: `src/app/planejamento/calendario.tsx`, `src/app/planejamento/componentes.tsx`, `src/app/planejamento/editor.tsx`, `src/app/planejamento/estrategia-editor.tsx`, `src/app/planejamento/estudio-shell.tsx`, `src/app/planejamento/ficha.tsx`, `src/app/planejamento/foco.tsx`, `src/app/planejamento/hoje.tsx`, `src/app/planejamento/mapa.tsx`, `src/app/planejamento/planejamento-cliente.tsx`, `src/app/planejamento/quadro.tsx`.
- Dados diretos: `@/lib/dados/planejamento`.
- Fetch literal local: `/api/planejamento/resultados?${new URLSearchParams({ id: item.id, operacao, revisao: String(item.revisao) })}`, `/api/planejamento`.

### /planejamento/resultados

- Página: src/app/planejamento/resultados/page.tsx.
- Arquivos locais: `src/app/planejamento/resultados/resultados-cliente.tsx`.
- Dados diretos: `@/lib/dados/planejamento-resultados`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /privacidade

- Página: src/app/privacidade/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /produtos

- Página: src/app/produtos/page.tsx.
- Arquivos locais: `src/app/produtos/produtos-cliente.tsx`.
- Dados diretos: `@/lib/dados/produtos-precos`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /produtos/precificacao

- Página: src/app/produtos/precificacao/page.tsx.
- Arquivos locais: `src/app/produtos/precificacao/precificacao-cliente.tsx`.
- Dados diretos: `@/lib/dados/precificacao`, `@/lib/dados/formula-preco`.
- Fetch literal local: `/api/precificacao/frete?${q}`, `/api/custos`.

### /promocoes/campanhas

- Página: src/app/promocoes/campanhas/page.tsx.
- Arquivos locais: `src/app/promocoes/campanhas/campanhas-cliente.tsx`.
- Dados diretos: `@/lib/dados/promocoes`.
- Fetch literal local: `/api/promocoes/limpar`.

### /promocoes/comparar

- Página: src/app/promocoes/comparar/page.tsx.
- Arquivos locais: `src/app/promocoes/comparar/comparar-cliente.tsx`.
- Dados diretos: `@/lib/dados/comparar-ofertas`.
- Fetch literal local: `/api/exportar/recusadas${q}`.

### /promocoes/historico

- Página: src/app/promocoes/historico/page.tsx.
- Arquivos locais: `src/app/promocoes/historico/historico-cliente.tsx`.
- Dados diretos: `@/lib/dados/promocoes`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /promocoes/processar

- Página: src/app/promocoes/processar/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: `/api/promocoes/piso`, `/api/promocoes/ajustar`, `/api/promocoes/baixar/${id}`, `/api/promocoes/processar`.

### /relatorio/[chave]

- Página: src/app/relatorio/[chave]/page.tsx.
- Arquivos locais: `src/app/relatorio/[chave]/relatorio-cliente.tsx`.
- Dados diretos: `@/lib/dados/relatorio`, `@/lib/dados/operacao`.
- Fetch literal local: `/api/relatorio/anotacao`.

### /relatorios/apresentacao

- Página: src/app/relatorios/apresentacao/page.tsx.
- Arquivos locais: `src/app/relatorios/apresentacao/apresentacao-cliente.tsx`.
- Dados diretos: `@/lib/dados/apresentacao`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /relatorios/exportacoes

- Página: src/app/relatorios/exportacoes/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /termos

- Página: src/app/termos/page.tsx.
- Arquivos locais: nenhum cliente adjacente.
- Dados diretos: não identificado por import direto; seguir componentes.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /vendas/anual

- Página: src/app/vendas/anual/page.tsx.
- Arquivos locais: `src/app/vendas/anual/anual-cliente.tsx`.
- Dados diretos: `@/lib/dados/vendas`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /vendas/canais

- Página: src/app/vendas/canais/page.tsx.
- Arquivos locais: `src/app/vendas/canais/canais-cliente.tsx`.
- Dados diretos: `@/lib/dados/vendas`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /vendas/cancelamentos

- Página: src/app/vendas/cancelamentos/page.tsx.
- Arquivos locais: `src/app/vendas/cancelamentos/cancelamentos-cliente.tsx`.
- Dados diretos: `@/lib/dados/cancelamentos`.
- Fetch literal local: `/api/cancelamentos/pedidos?${qs}`.

### /vendas/comparativos

- Página: src/app/vendas/comparativos/page.tsx.
- Arquivos locais: `src/app/vendas/comparativos/comparativos-cliente.tsx`.
- Dados diretos: `@/lib/dados/vendas`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /vendas/dia

- Página: src/app/vendas/dia/page.tsx.
- Arquivos locais: `src/app/vendas/dia/dia-cliente.tsx`.
- Dados diretos: `@/lib/dados/dia`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /vendas/diario

- Página: src/app/vendas/diario/page.tsx.
- Arquivos locais: `src/app/vendas/diario/diario-cliente.tsx`.
- Dados diretos: `@/lib/dados/diario`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /vendas/lancamentos

- Página: src/app/vendas/lancamentos/page.tsx.
- Arquivos locais: `src/app/vendas/lancamentos/lancamentos-cliente.tsx`.
- Dados diretos: `@/lib/dados/vendas`, `@/lib/dados/automacao`.
- Fetch literal local: `/api/lancamentos`.

### /vendas/metas

- Página: src/app/vendas/metas/page.tsx.
- Arquivos locais: `src/app/vendas/metas/metas-cliente.tsx`.
- Dados diretos: `@/lib/dados/metas-planejamento`, `@/lib/dados/ratear-meta`.
- Fetch literal local: `/api/metas`, `/api/metas/dia`.

### /vendas/mtd

- Página: src/app/vendas/mtd/page.tsx.
- Arquivos locais: `src/app/vendas/mtd/mtd-cliente.tsx`.
- Dados diretos: `@/lib/dados/mtd`.
- Fetch literal local: `/api/metas/redistribuir`.

### /vendas/queda

- Página: src/app/vendas/queda/page.tsx.
- Arquivos locais: `src/app/vendas/queda/queda-cliente.tsx`.
- Dados diretos: `@/lib/dados/queda`.
- Fetch literal local: `/api/exportar/queda`, `/api/queda?${q}`.

### /vendas/semanal

- Página: src/app/vendas/semanal/page.tsx.
- Arquivos locais: `src/app/vendas/semanal/semanal-cliente.tsx`.
- Dados diretos: `@/lib/dados/vendas`.
- Fetch literal local: nenhum; pode estar em componente compartilhado.

### /vendas/skus

- Página: src/app/vendas/skus/page.tsx.
- Arquivos locais: `src/app/vendas/skus/analise-sku-cliente.tsx`.
- Dados diretos: `@/lib/dados/analise-sku`.
- Fetch literal local: `/api/exportar/skus?${q}`.
