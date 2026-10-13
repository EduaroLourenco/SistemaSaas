# Estoques, confiabilidade dos dados e clareza das análises

Status: implementação enviada; validação das integrações pendentes acompanhada em correcoes-telas-outubro

## Pedido aprovado em 12/10/2026

O usuário retomou explicitamente o estoque, anteriormente pausado. Implementar leitura de saldos por origem/local via APIs, sem alterar quantidades nos sistemas de origem. Probel: identificar o que o número atual representa. Bom de Compras: integrar todos os depósitos do Bling, inclusive saldos zero. Permitir novos clientes sem código específico por empresa.

Exibir separadamente estoque do canal e estoque ERP, preservando nomes originais, local, conta e atualização. Full e depósito próprio não são equivalentes; ERP e canal podem espelhar o mesmo estoque, portanto não devem ser somados. Falha de consulta não pode virar zero.

Revisar dados por canal e origem, completar histórico que a API permite, fazer API prevalecer sobre lançamentos/importações equivalentes sem apagar informação de outras fontes ou métricas. Manter cópia local dos valores substituídos para conferência. Não inventar histórico de estoque/preço: instantâneos atuais não provam estoque de meses anteriores.

Simplificar Tráfego pago e Por que caiu. Abertura de um SKU deve mostrar seus canais e anúncios vinculados, com diagnósticos limitados aos dados de cada origem. Reduzir textos permanentes, separar resumo, evidências, próximos passos e detalhes de metodologia. Só chamar de IA o que realmente usar IA.

Revisar todas as abas e entregar guia simples: para que serve, o que olhar, fontes, limitações, melhorias. Não ocultar ou remover telas antes da decisão do usuário.

## Trabalho já em andamento que deve ser preservado

- Tráfego: filtros preservados, seletor único por canal/conta, conferência do mesmo intervalo/recorte, TACoS com faturamento da conta correta, série preservada sem relatório.
- Atualizar: plano por empresa; pedidos, publicidade e visitas em requisições separadas; progresso compartilhado entre botões; falha parcial visível; mudança de empresa interrompe próximos passos.
- Testes `scripts/testar-trafego-filtros.mjs` e `scripts/testar-atualizacao.mjs` passaram. Build passou antes do último ajuste de filtros otimistas.
- Leitura real de publicidade executada nas três contas: Probel 15 campanhas/72 anúncios + 5 campanhas/24 anúncios; BdC 3 campanhas/33 anúncios; oito dias diários atualizados por conta. Falta completar histórico anterior e avaliar diferenças de cobertura/campanha.

## Acessos e dependências

- Supabase: cliente privilegiado local disponível; permite consultas/gravações nas tabelas existentes. Não há conexão SQL/Postgres no ambiente local.
- Bling: integração BdC no cofre; client ID/secret presentes na produção, ausentes localmente. Verificar possibilidade de leitura com token válido sem expô-lo. Renovação local depende das credenciais do aplicativo.
- Vercel MCP recusou acesso ao projeto com 403; verificar CLI própria. GitHub permite publicação pelo fluxo existente.
- Navegador da plataforma está sem sessão. Prévia isolada em `output/fidelity-preview`, dados fictícios; não equivale a validação autenticada.

## Fontes oficiais consultadas

- https://developer.bling.com.br/referencia — OpenAPI capturada em `output/bling-openapi.json`.
- https://developers.mercadolivre.com.br/pt_br/estoque-multi-origem
- https://developers.mercadolivre.com.br/pt_br/user-products

## Entregas pendentes

Atualização em 12/10/2026: estrutura 37 instalada pelo usuário, leitura Meli/estoques e histórico de pedidos/Ads/visitas conferidos separadamente nas três contas. Código principal enviado em 44528aa. Bling ainda depende das credenciais disponíveis apenas na produção; publicação Vercel sem autorização na conexão desta sessão. A lista original abaixo é histórica; o acompanhamento atual está em `.scratch/correcoes-telas-outubro/`.

1. Conferir APIs reais e esquema; desenhar e disponibilizar migração de estoques/proveniência.
2. Integrar estoques, tela de origens/depósitos e diagnóstico por produto/canal/anúncio.
3. Auditar cobertura por conta, recuperar histórico suportado, proteger métricas API contra gravação manual.
4. Simplificar textos e organizar evidências e ações.
5. Validar cálculos, isolamento, dados reais e mobile; publicar conforme autorização; guia e pendências concretas.
