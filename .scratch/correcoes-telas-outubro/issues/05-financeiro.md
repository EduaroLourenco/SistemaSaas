# 05 — Financeiro, custos e fontes

Status: publicado em 14/10/2026 e migração db/38 confirmada; conferência autenticada pendente

Usar receita, comissão e frete dos pedidos quando disponíveis. Evidenciar custos ausentes (produto, embalagem, imposto), de onde “Trazer produto” importa e quais categorias/fontes são automáticas ou manuais. Permitir margem por produto opcional sem comprometer regras existentes.

## Comments

- 12/10/2026: não apresentar lucro completo quando componentes de custo não foram cadastrados.
- 13/10/2026: comissão, frete e cada custo conhecido aparecem com cobertura própria mesmo sem cadastro completo. Corrigida dupla dedução de cancelamentos, associação de itens por SKU e frete de outro canal. Receita bruta inclui cancelados; líquida usa pedidos válidos.
- 13/10/2026: conferência por leitura em Probel e Bom de Compras confirmou custos disponíveis e margem indisponível por cadastros incompletos. Fonte de cadastro de produtos, categorias manuais e mídia identificada na tela.
- 13/10/2026: margem mínima opcional por produto aplicada às promoções por margem, preservando zero e a regra da campanha quando vazia. Migração 38 preparada; tela funciona antes dela com edição desse campo desativada. Salvamento de custos atualiza somente campos enviados, com empresa e permissão verificadas.
- 13/10/2026: revisão final estendeu os custos conhecidos à tabela por mês, semana, canal, conta, SKU e anúncio. Comissão/frete disponíveis não desaparecem quando falta mercadoria; zero continua diferente de ausência. Agregados usados no cálculo da margem preservam apenas itens completos.
- 13/10/2026: migração 38 executada pelo usuário e confirmada pela API. O carregador real reconheceu a margem configurável nas duas empresas. A edição deixa de depender da estrutura do banco e aguarda apenas a publicação do código; nenhuma preferência de margem foi preenchida automaticamente.
