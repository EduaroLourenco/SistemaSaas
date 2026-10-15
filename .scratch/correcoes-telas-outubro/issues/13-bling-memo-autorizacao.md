# 13 — Chopeiras Memo: acesso recusado pelo Bling

Status: reconexão realizada pelo usuário e confirmada nos registros em 15/10/2026

- Retorno: `400 Invalid refresh token`. A integração havia sido criada em 14/10 e ainda mantinha a validade do primeiro token de acesso; não era vencimento normal de 30 dias. O retorno não informou a causa exata da invalidação.
- Orientado reconectar em Canais e contas → ERP, com Chopeiras Memo selecionada e conta Bling correspondente. As quatro lojas já estavam vinculadas, sem necessidade de refazer o emparelhamento.
- Após a reconexão informada pelo usuário, consulta confirmou nova validade do acesso, sincronização em 15/10/2026 às 11:18 no horário de São Paulo, erro limpo e quatro vínculos preservados. Nenhuma credencial foi impressa ou alterada manualmente.
- Documentação oficial: https://developer.bling.com.br/aplicativos — mudanças nos escopos podem revogar autorizações; isso é uma possibilidade documentada, não uma causa comprovada deste episódio.

## Esclarecimento de estoque

O usuário perguntou pelo depósito `Magalu 205976634 (Fulfillment)`, disponível -1, físico 0 e reservado 1. A coleta é do depósito cadastrado no Bling, não uma consulta direta ao Magalu. `saldoBling` preserva o saldo virtual informado pelo ERP e calcula reservado como físico menos virtual quando ambos existem e a diferença é não negativa. Portanto o 1 reservado é calculado, não um campo de reserva independente. O saldo sozinho não identifica pedido, baixa ou sincronização responsável. A repetição `ERP · Bling · ERP` é um rótulo de origem, não três estoques.

## Investigação dos saldos negativos

- Leituras restritas à integração da empresa, sem renovar tokens, alterar saldos, pedidos, reservas ou configurações do ERP. Evidências detalhadas ficam nos arquivos locais ignorados de `output/`, fora do Git.
- Conferência direta em `GET /estoques/saldos/{idDeposito}` e `GET /estoques/saldos`, com o mesmo ID de produto, confirmou o saldo negativo retornado pelo Bling. O saldo total disponível informado pelo ERP é diferente da soma dos saldos virtuais por depósito nesse caso.
- Na base sincronizada, o mesmo negativo aparece em ambos os depósitos Magalu de físico zero. Em parte dos cadastros, a diferença físico/virtual também coincide no Geral; em outros, não coincide. Portanto não extrapolar a aritmética de um produto para todos os demais.
- Isso é compatível com regras de reserva que afetam os depósitos vazios; a configuração exata e os pedidos responsáveis não foram confirmados. Não afirmar falta física no Magalu, venda sem estoque ou reserva exclusiva daquele canal apenas a partir desses números.
- Há SKUs repetidos entre IDs de produto distintos no ERP. Toda reconciliação precisa usar o ID de produto e o depósito, sem escolher arbitrariamente o primeiro cadastro pelo SKU.
- Conferência operacional indicada: Bling → perfil da empresa → Todas as configurações → Suprimentos → Estoque → Reserva de estoque por depósito e situações de venda consideradas. O mapeamento de loja/depósito também influencia a leitura; não alterar essas opções sem conhecer a operação.
- Documentação oficial das configurações: https://ajuda.bling.com.br/hc/pt-br/articles/15800372255767-Como-filtrar-os-produtos-por-saldo-de-estoque
- Referência da API consultada: https://developer.bling.com.br/build/assets/openapi-Dw6cY8yQ.json — saldo virtual desconta produtos reservados; não há campo independente de quantidade reservada nessa resposta.

## Regra para próximas melhorias

Preservar o valor original e a origem. Não substituir negativos por zero nem somar automaticamente saldos virtuais de depósitos. Distinguir reserva calculada de reserva identificada em pedidos e não apresentar o saldo do ERP como consulta direta à API do marketplace.
