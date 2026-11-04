# Central de anúncios — 03/11/2026

## Problema e plano executado

A navegação anterior começava agrupada por produto e levava a sucessivos painéis. O objetivo desta etapa é permitir localizar um anúncio, entender o período, comparar outros anúncios e verificar preços/estoque sem empilhar janelas.

1. Conferir a tela autenticada e as fontes existentes: cadastro, desempenho semanal, Fórmula base, preços coletados, comissões cobradas e estoque por origem.
2. Prototipar a lista e o detalhe com três anúncios reais, em 1280 e 390 pixels.
3. Trocar a hierarquia por busca → filtro por situação → lista → detalhe único; manter ferramentas especializadas acessíveis.
4. Preservar ausência, zero e período parcial; incluir cadastro sem histórico e impedir sua entrada nas médias de desempenho.
5. Introduzir comparação de até quatro anúncios, exportação filtrada e acesso direto por MLB.
6. Exercitar os fluxos autenticados, revisar larguras pequenas, testar cálculos e compilar para produção.

## Referências

- [NN/g — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/): manter o essencial na primeira leitura e abrir detalhes sob demanda.
- [NN/g — Modal & Nonmodal Dialogs](https://www.nngroup.com/articles/modal-nonmodal-dialog/): preservar o contexto da tarefa durante a consulta de detalhes.
- [NN/g — Mobile Tables](https://www.nngroup.com/articles/mobile-tables/): preservar a comparação e dar acesso seletivo a dados em telas pequenas.
- [GOV.UK — Clear structure](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/): títulos literais, breves e sem repetição.

## Entrega

- Lista por anúncio, busca por título/SKU/MLB, filtros de conta/tipo/situação/período, ordenação e paginação.
- Filtros contados: sem estoque, abaixo/acima da referência, baixa conversão, poucas visitas, sem histórico e sem referência.
- Totais do conjunto filtrado, com quantidade de anúncios efetivamente medidos.
- Desktop com lista e detalhe lado a lado; celular alterna lista/detalhe no mesmo espaço, com retorno explícito.
- Três abas: Desempenho, Preços e Produto. Gráfico de uma métrica por vez, valores semanais acessíveis e navegação por teclado nas abas.
- Troca entre anúncios do mesmo SKU no próprio detalhe; nenhuma nova janela interna.
- Comparação de 2–4 anúncios e CSV de todos os resultados filtrados, não apenas da página visível. Valores ausentes ficam vazios no arquivo.
- Vitrine do cadastro, preço pago e vitrine histórica separados e datados. Referência identificada como Fórmula base. Diferença acumulada explicitamente não equivale a perda de lucro.
- Estoque do produto consultado por origem/local. Removida a soma dos estoques dos anúncios: o mesmo saldo pode ser espelhado em vários MLBs. A cobertura derivada dessa soma deixa de ser calculada.
- Cadastro inclui anúncios sem histórico. Status finalizado deixa de ser convertido indevidamente em ativo.
- Produtos e preços: leitura mobile por produto, detalhes dos canais expansíveis e modo tabela opcional para comparação.

## Validação

- `scripts/testar-central-anuncios.mjs`: produção executada com casos de período vazio, histórico fora do recorte, cadastro sem história, null vs. zero, referência, status, totais, média sem ausentes e entrada não mutada.
- `scripts/testar-estoque-raio-x.mjs`: carregador real com consultas controladas; saldos espelhados não somam, cobertura permanece desconhecida, origem preservada, filtros de operação/SKU e falha de fonte explícita.
- `scripts/testar-semana-em-curso.mjs` e `scripts/testar-produtos-precos.mjs`: aprovados.
- TypeScript e build de produção: aprovados antes da publicação.
- Navegador autenticado: busca PA85352 encontrou nove anúncios e manteve o foco; detalhe, preços, produto, troca para outro MLB, teclado entre abas, comparação de dois anúncios e filtro de pausados exercitados.
- A leitura de estoque real mostrou CD Cotia separado de registros sob encomenda, sem saldo total inflado.
- Layout do detalhe conferido em 390 e 320 pixels, sem overflow horizontal; os valores monetários receberam uma linha inteira para não quebrar os centavos.
- O controle de viewport do navegador deixou de aplicar a largura durante a sessão. A conferência final estreita usou um quadro local de tamanho fixo com o app real, sessão autenticada e leitura de dimensões do DOM. Não equivale a teste em aparelho físico/Safari.

## Escopo da sequência

Esta publicação fecha a central de anúncios e a melhoria de Produtos que já estava em andamento. O usuário pediu depois uma revisão mais profunda do mobile em todas as telas e orientou terminar esta etapa primeiro. A revisão completa do mobile é a próxima etapa; não é considerada concluída por este documento.

Não foram ativadas automações de escrita no Mercado Livre, alterados preços de venda, apagados pedidos ou executadas migrações de outros módulos.
