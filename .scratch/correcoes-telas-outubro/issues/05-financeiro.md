# 05 — Financeiro, custos e fontes

Status: implementado; margem opcional depende da migração db/38

Usar receita, comissão e frete dos pedidos quando disponíveis. Evidenciar custos ausentes (produto, embalagem, imposto), de onde “Trazer produto” importa e quais categorias/fontes são automáticas ou manuais. Permitir margem por produto opcional sem comprometer regras existentes.

## Comments

- 12/10/2026: não apresentar lucro completo quando componentes de custo não foram cadastrados.
- 13/10/2026: comissão, frete e cada custo conhecido aparecem com cobertura própria mesmo sem cadastro completo. Corrigida dupla dedução de cancelamentos, associação de itens por SKU e frete de outro canal. Receita bruta inclui cancelados; líquida usa pedidos válidos.
- 13/10/2026: conferência por leitura em Probel e Bom de Compras confirmou custos disponíveis e margem indisponível por cadastros incompletos. Fonte de cadastro de produtos, categorias manuais e mídia identificada na tela.
- 13/10/2026: margem mínima opcional por produto aplicada às promoções por margem, preservando zero e a regra da campanha quando vazia. Migração 38 preparada; tela funciona antes dela com edição desse campo desativada. Salvamento de custos atualiza somente campos enviados, com empresa e permissão verificadas.
