# Correções das telas — outubro de 2026

Status: código publicado e migração 38 confirmada; validação autenticada e estoque Bling pendentes

## Pedido

Implementar as quatro páginas de “Telas a arrumar e melhorar.pdf”, enviado em 12/10/2026. As mudanças são comuns a todas as empresas; verificar Bom de Compras e Probel separadamente, sem regras especiais por cliente. Manter o design atual e a navegação no celular. Salvar cada entrega concluída em um commit e enviar ao GitHub.

## Em espera por decisão do usuário

- **Relatório interativo:** trabalho pausado; não ampliar nem publicar nesta tarefa.
- **Versão de afiliados:** ideia guardada para uma etapa futura; não implementar agora.

## Entregas

1. Atualização de dados por qualquer membro autorizado da empresa, com erros e progresso claros.
2. Salvar regras de promoções e resultados do processamento; refletir em histórico e campanhas.
3. Agrupar navegação de vendas e anúncios, preservando endereços e filtros; melhorar a leitura de campanhas.
4. Conferir tráfego pago no mesmo período e conta, explicar bases e cobertura sem misturar fontes.
5. Conectar financeiro aos dados de pedidos disponíveis; identificar fontes de produtos/categorias e margem opcional por produto.
6. Fortalecer Por que caiu: SKU, anúncios, visitas, conversão, preços, comparações, filtros, ordenação e detalhe diário.
7. Catálogo de produtos anunciados com canal, calendário, preços vendidos/anunciados e histórico disponível.
8. Estoques por fonte e depósito, incluindo Full, dentro do contexto do produto.
9. Corrigir o bloqueio de publicação causado pela frequência do estoque automático incompatível com o plano Vercel.

Cada entrega tem seu próprio arquivo em `issues/`. O estado e as verificações ficam nesses arquivos.

## Regras de dados e acesso

- Toda consulta operacional usa a empresa da sessão e preserva conta/canal; nunca misturar empresas.
- Ausência de medição não é zero. Sem vendas significa quantidade zero e preço vendido indisponível.
- Não somar estoques de ERP e canal que possam espelhar as mesmas unidades.
- Distinguir preço de vitrine, oferta atual, preço vendido e mínimo calculado. Não inventar histórico.
- API prevalece nas métricas cobertas; importações continuam válidas onde não há API ou cobertura.
- Diagnósticos são evidências/comparações, não afirmações de causalidade sem suporte.
- Leituras das APIs não alteram anúncios, preços ou saldos nos canais.

## Publicação

Em 14/10/2026, a integração Vercel confirmou a publicação de `1dc1d41` em Production. O domínio `https://sistema-saas-one.vercel.app` respondeu normalmente e seu arquivo público de interface contém o novo catálogo `/produtos` e a navegação “Resultados de vendas”. O acesso administrativo direto continua indisponível nesta sessão; a publicação foi feita pela integração GitHub.

## Pendências para liberar tudo

- Conferir as telas publicadas com uma sessão autenticada.
- Revisar a permissão de leitura de depósitos no aplicativo do Bling, reconectar as empresas afetadas e sincronizar. A produção retornou `403 /depositos` por autorização insuficiente. Não declarar estoque do Bling atualizado antes dessa leitura.

## Comments

- 13/10/2026: oito entregas organizadas e enviadas por etapas ao GitHub. Relatório e afiliados permanecem em espera.
- 13/10/2026: build de produção e verificação de tipos aprovados. Regressões cobrem permissões de atualização, regras e gravação de promoções, custos parciais, margem por produto, contas/períodos de publicidade, filtros e causas de queda, estoque zero e origem.
- 13/10/2026: leituras reais separadas de Probel e Bom de Compras validaram financeiro, publicidade, catálogo, detalhe diário e consulta de estoque por SKU. Nenhuma alteração foi enviada aos anúncios ou preços dos canais.
- 13/10/2026: prévia isolada com dados fictícios conferiu desktop e celular, seleção de dia no gráfico, produto sem vendas e Full separado do depósito. Isso não substitui a conferência da aplicação publicada com login.
- 13/10/2026: usuário executou a migração 38. Leitura da coluna pela API e execução de `carregarMargensProduto` confirmaram disponibilidade nas operações Probel e Bom de Compras. Nenhuma margem individual foi alterada; o campo vazio continua herdando a regra da campanha.
- 14/10/2026: GitHub confirmou recebimento de `ab8fdc3`, mas a Vercel rejeitou o agendamento de estoque a cada meia hora. Ajustado para uma execução diária, mantendo atualização manual; acompanhar a nova publicação no ticket 09.
- 14/10/2026: após a correção, a publicação `HZWsmPJ3PmvqeFSfPa851U46KvcF` do commit `1dc1d41` concluiu em produção. Resposta HTTP e presença das novidades no pacote público do domínio confirmadas; nenhum acesso autenticado ou sincronização Bling foi declarado como testado.
- 14/10/2026: diagnóstico do `403 /depositos` registrado no ticket 08. Mensagem de permissão insuficiente e ajuda no ERP ajustadas. A correção de interface não libera permissões no provedor: administrador/integrador precisa revisar o aplicativo no Bling e autorizar novamente.
