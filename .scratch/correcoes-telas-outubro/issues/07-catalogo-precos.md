# 07 — Catálogo e preços

Status: concluído no código; publicação pendente

Catálogo anunciado por canal e intervalo de calendário; preço vendido por canal, preço atual de vitrine/oferta onde a API disponibiliza, evolução disponível e itens sem vendas. Não preencher preço desconhecido com zero nem prometer histórico anterior à coleta.

## Comments

- 12/10/2026: métricas e preços devem conservar o recorte de empresa e conta.
- 13/10/2026: nova área Produtos e preços, com canais/contas, calendário, busca, ordenação por SKU/receita/preço, filtro sem vendas e exportação CSV. Inclui anúncios sem venda. Sem API de catálogo, lista itens conhecidos dos pedidos.
- 13/10/2026: preço vendido vem dos pedidos; oferta da API vem da última leitura, com data. Sem oferta observada, o cadastro cheio aparece identificado, sem ser tratado como desconto. Histórico usa apenas leituras disponíveis. Detalhe compartilha evolução e estoques do produto.
- 13/10/2026: carga real conferiu todos os anúncios de Probel e Bom de Compras, preços nulos quando desconhecidos e quantidade zero sem vendas. Prévia responsiva conferida em 390 e 1440 px; compilação de produção passou.
