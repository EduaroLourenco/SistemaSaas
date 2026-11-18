# Integração de frete e documentos de expedição

17/11/2026. Continuação do redesign após o pedido de incorporar e aprimorar as funções feitas em paralelo.

## Histórico e escopo

Os commits `ace7e8b` (frete “Comprador paga”) e `4ee97d6` (etiquetas, SKU no DANFE e separação) já são descendentes do redesign `bd6b9f7` na mesma branch. Foram preservados integralmente na sequência de entrega. Esta etapa aprimora a experiência dessas funções e aplica a autorização de edição existente à geração de etiquetas.

## Tela de envios

- Área própria de documentos: etiqueta, DANFE com SKU quando fornecido pelo canal e lista de separação em PDF 10 × 15 cm.
- Seleção de um lote por conta, até 100 envios, com seleção disponível, limpeza e bloqueio de contas diferentes. Trocar o filtro limpa seleção, arquivo e aviso do contexto anterior.
- Revisão com conta, pedidos, unidades, produtos e SKU integrais. O botão final informa que gerar o arquivo marca os envios como impressos no Mercado Livre. Abrir ou cancelar a revisão não envia a solicitação.
- Retorno de PDF com ações Abrir/Baixar. Bloqueio de popup mantém o usuário na tela. Falhas parciais permanecem selecionadas para nova tentativa; erros mantêm a seleção e ficam visíveis na revisão.
- Retratos antigos sem dados de conta/envio/substatus orientam atualizar a leitura. Atualização do retrato descarta arquivo antigo; respostas de uma leitura anterior não substituem o contexto atual.
- Composição adaptada ao celular, incluindo revisão, ações e nomes completos, usando os tokens do produto.

## Frete na precificação

A cotação mantém os controladores, a seleção “Comprador paga”, a chave de invalidação, os cálculos e o parâmetro `gratis=0` do commit anterior. O campo ganhou legenda “Quem paga o frete” e instruções distintas para custo do vendedor e modalidade abaixo de R$ 79. A logística continua disponível no modo em que o vendedor banca o envio. Não foram alteradas fórmulas, o comportamento do frete manual nem a interpretação de custo zero da API.

## Autorização e preservação

A rota de documentos passou a usar `contaEditavel`, já existente no produto, antes de qualquer efeito no canal. Isso mantém RLS e a permissão de edição da operação: leitor recebe 403; conta não autorizada recebe 404. Corpo inválido, ausência de confirmação, limite de 100 e conta única permanecem verificados no servidor. Os itens vêm do retrato autorizado do servidor.

O gerador de PDF do outro agente foi preservado. A validação usa documentos sintéticos e não comprova o carimbo em todos os modelos reais de DANFE, SKUs extensos ou impressão física. Nenhuma etiqueta real foi baixada ou marcada como impressa durante o QA.

## Verificação

Contratos offline: **23/23 aprovados**, com rede bloqueada. Incluem confirmação, lote, conta única, leitor/editor, dados do servidor, falhas parciais, estrutura do PDF e contratos de cotação de frete.

TypeScript e compilação de produção aprovados. Navegador: **36/36 aprovados**, com render/reflow de Envios e Precificação em 320/390/1366px, claro/escuro, e fluxos de seleção, revisão, cancelamento, PDF, download, erro, parcial, legado, limite de 100 e frete. Os dois casos de nome acessível da logística foram corrigidos com fieldset/legend e rechecados.

Rede de teste: nove POSTs de PDF e consultas de frete foram respondidos por mocks dentro do navegador. Não houve POST real, consulta real de frete ou acesso externo. Logs em `output/redesign/qa-documentos-interface.json` e `output/redesign/qa-contrato-documentos.json`.

## Publicação

O estado remoto foi consultado: `origin/main` ainda estava em `56f69bd` no início desta etapa. Commit local e publicação no sistema são etapas distintas. Não se considera publicada uma alteração apenas por existir no histórico local.
