# 12 — Curva ABC na comparação de preços

Status: implementado e validado; publicação em acompanhamento

## Comportamento

- Cada combinação SKU/canal (ou conta individual) tem sua própria curva pelo faturamento dos itens não cancelados no período escolhido.
- Receita calculada antes do preço médio e comparada em centavos. A inclui os produtos até atingir 80% da receita conhecida; B até 95%; C o restante. O produto que atravessa o limite permanece na faixa que estava sendo preenchida, inclusive quando um único SKU domina o canal.
- Receita ausente, incompleta ou zero não recebe curva artificial.
- Buscar um SKU, paginar, ordenar ou aplicar filtros não recalcula as curvas contra o subconjunto encontrado. Até o filtro exato de SKU na URL é aplicado depois da classificação.
- Abaixo do preço vendido aparece a curva daquele canal. O usuário pode escolher Curva A + Mercado Livre e continuar vendo os mesmos produtos nas demais colunas. O canal de referência é independente das colunas exibidas e fica explícito no resumo.
- Filtros guardados na URL, preservados ao mudar o período. CSV traz a curva de cada canal e somente as linhas filtradas.

## Validação

- Testes de canais com curvas diferentes para o mesmo SKU, contas separadas, limites 80/95, SKU dominante, período novo, busca exata, receita nula/zero/incompleta, receita original e exportação filtrada passaram.
- TypeScript aprovado. Leitura real do carregador em Probel e Bom de Compras manteve unidades e preços reconciliados com os pedidos.
- Prévia fictícia: filtros A/C e troca de canal, busca, etiqueta por canal e URL conferidos. Mobile em 390px sem transbordamento da página e sem erro no console.
- Escopo restrito a Produtos e preços. As análises existentes usam suas próprias bases, incluindo período anterior em Por que caiu, e não foram alteradas.
