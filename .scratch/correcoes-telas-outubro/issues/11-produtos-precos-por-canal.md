# 11 — Comparar preços por SKU e canal

Status: publicado — commit b8dacfd confirmado em Production em 14/10/2026

Uma linha por SKU. Para cada canal escolhido, preço vendido médio, vitrine da API e unidades. Período livre e múltiplos canais/contas selecionáveis. Sem informação ou sem venda, mostrar “Sem dado”.

## Regras

- Preço vendido = valor dos itens / unidades, somente pedidos não cancelados no período, independente da origem API/planilha.
- Vitrine = última leitura da API de anúncios ativos, com data; quando diverge entre anúncios, mostrar faixa. Nunca preencher com preço vendido ou catálogo manual.
- SKU preserva variações; canais e contas não se misturam. Consultas usam sessão e operação explícita.
- SKU e cabeçalhos fixos na rolagem. Comparação horizontal também no celular; exportar todas as linhas filtradas e só as colunas escolhidas.

## Comments

- 14/10/2026: usuário cancelou a investigação da ligação do Bling com Chopeiras Memo e priorizou esta comparação. Nenhum emparelhamento foi alterado.
- 14/10/2026: interface agora usa dados específicos de produtos/preços, sem carregar visitas, diagnóstico e comparação anterior da tela Por que caiu. Histórico e estoques continuam acessíveis pelo SKU.
- 14/10/2026: testes de SKU único, média ponderada, contas distintas, cancelamentos, período, variações, faixa de vitrine, ausência de informação, preço zero e CSV passaram. Build de produção e TypeScript aprovados.
- 14/10/2026: leitura real, somente consulta e separada por operação, validou 710 SKUs/15 canais de Probel e 224 SKUs/8 canais de Bom de Compras. Unidades e receita reconstruída pelo preço médio conferiram com os itens dos pedidos de 01 a 14/10, respeitando o arredondamento. Foram encontradas 244 e 66 combinações SKU/canal com vitrine da API, respectivamente. Nenhum pedido ou preço foi alterado.
- 14/10/2026: prévia com dados fictícios conferida em desktop e 390px: seleção múltipla, filtro de ausência de venda, mudança efetiva de período, navegação voltar, coluna SKU fixa e rolagem horizontal sem transbordar a página. Nome do canal acompanha a rolagem no celular. Exportação pelo navegador gerou todos os 31 produtos, além da primeira página de 25. Sem erros no console.
- Limite da conferência: leitura real do carregador não substitui a validação visual de uma sessão autenticada em produção. A vitrine é a última leitura disponível da API, com data explícita, e não uma média histórica do período de vendas.
