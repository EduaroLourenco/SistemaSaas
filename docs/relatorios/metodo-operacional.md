# Relatório operacional reutilizável

## Escopo desta edição

Uma página separada do painel, aberta pelo link de relatório da operação e pelo sufixo `/analise`. Não adiciona menus nem altera as análises existentes. Snapshot privado no Supabase; nunca publicar os dados do cliente no GitHub. Há também um HTML autossuficiente para apresentação sem internet.

## Método para outras empresas

1. Resolver a operação e filtrar **todas** as fontes por ela antes de coletar. Não inferir identidade pelo nome da loja.
2. Fechar o período no último dia completo e usar janelas de igual duração. Nesta edição: 30 × 30 ou 60 × 60 dias. 90/120 dias ficam para uma etapa posterior, mediante cobertura.
3. Definir receita como valor dos pedidos válidos disponíveis, com cancelamentos separados. Explicar que não é lucro nem recebimento líquido. Verificar se o ERP inclui frete e outros ajustes no total.
4. Separar marketplaces de venda direta quando pedidos pontuais alterarem muito o total. Preservar ambas as visões e conferir pedidos sem SKU ou de linhas diferentes do varejo principal.
5. Descer de operação → canal → SKU → anúncio. Identificar o SKU do anúncio por cadastro; se ausente, usar histórico de pedidos somente quando o código do anúncio aponta para um único SKU. Não aproximar títulos para juntar produtos. Kits continuam sendo unidades de kit.
6. Distribuir receita do pedido entre itens proporcionalmente ao valor registrado. Aplicar o resíduo de centavos no último item. Conferir soma de pedidos = canais = SKUs. Preço médio praticado usa preço × quantidade, separado desse rateio.
7. Comparar quantidade, receita e mix. “Sem venda no período anterior” não significa lançamento. “Parou” significa ausência de venda registrada; registrar a janela explicitamente.
8. Visitas e conversão pertencem ao canal que as mede. Sem visitas, analisar frequência de vendas, itens, concentração, quantidade e preço. Não deduzir tráfego ou conversão dos pedidos.
9. Receita = visitas × pedidos/visitas × receita/pedido é uma identidade, não uma prova de causa. Uma ponte sequencial depende da ordem; declarar a ordem aplicada. Média por dia da semana deve considerar o número de ocorrências de cada dia.
10. Catálogo e estoque atuais são fotografias. Verificar a data inicial do histórico antes de relacionar com uma queda longa. Não converter falta de registro em zero físico, somar saldos compartilhados ou recomendar baixar preço sem validar custos.
11. No Mercado Livre, `competing` indica disputa perdida; `not_listed` é diferente. Preço igual pode perder por outras condições. Consultar todos os anúncios de catálogo relevantes, não apenas uma amostra silenciosa.
12. Métricas de Ads são atribuídas pelo provedor; não somar à receita da loja nem chamar ROAS de lucro. Comparação deve usar duas janelas inteiras disponíveis. Se o anterior ultrapassa a retenção da API, marcar como indisponível, sem completar com zero ou extrapolação.
13. Não afirmar migração de clientes/canibalização só porque um canal subiu e outro caiu. Mostrar os movimentos do mesmo SKU e a soma; motivos exigem mais evidência.
14. Apresentar primeiro o fato verificável. Hipóteses e dúvidas permanecem explícitas; decisões e conclusões do usuário ficam em notas separadas.

## Apresentação

Fundo claro, verde para altas, terracota para quedas; sinal e texto acompanham a cor. Títulos editoriais, texto de interface curto, valores tabulares. Uma seção por vez. Curvas para tendência; barras para comparação; tabela para exatidão. Detalhe por clique. Notas locais com exportação/importação por empresa e edição. Exportação CSV por seção, incluindo período e recorte, com proteção contra fórmulas em células de texto. Impressão salva a seção selecionada como PDF.

## Limites conhecidos e próximos passos

- A edição não renova os números enquanto está aberta. Regenerar para atualizar.
- Notas são locais ao navegador; não há colaboração ou sincronização entre dispositivos. Usar exportação/importação para transferência.
- Sem histórico confiável do frete cobrado do comprador, não calcular efeito do frete na conversão.
- Validar estoque Bling antes de incluí-lo em cobertura, ruptura ou recomendação.
- Registrar futuramente transições do catálogo com timestamp, ofertas, promoções, condições logísticas e estoque por origem, para permitir análises temporais melhores. Este relatório não implementa essas alterações no sistema.

## Referências

- [Mercado Livre — competição em catálogo](https://developers.mercadolivre.com.br/concorrencia-em-catalogo)
- [Shopify — relatórios de vendas](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report)
- [Carbon — anatomia dos gráficos](https://www.carbondesignsystem.com/building-blocks/data-visualization/chart-anatomy)
- [Nielsen Norman Group — detalhes sob demanda](https://www.nngroup.com/articles/progressive-disclosure/)

## Arquivos e reprodução

`scripts/relatorio-bdc-extrair.mjs` lê o banco da operação; `relatorio-bdc-api.mjs` consulta somente endpoints de leitura do Mercado Livre; `relatorio-bdc-analisar.mjs` reconcilia e prepara as janelas; `relatorio-bdc-gerar.mjs` gera o HTML. Código genérico de cálculo e apresentação: `scripts/relatorios/`. Dados e entregáveis ficam em `output/relatorio-bom-de-compras/`, ignorado pelo Git. `relatorio-bdc-guardar.mjs` envia somente o HTML para o bucket privado. A rota valida a chave de uma única operação antes de ler o arquivo correspondente.
