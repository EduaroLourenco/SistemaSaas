# Mobile e textos — 02/11/2026

## Referências e decisões

- NN/g, Mobile Tables: https://www.nngroup.com/articles/mobile-tables/ — manter comparação em tabela, legibilidade e acesso seletivo a dados.
- NN/g, Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/ — detalhes secundários sob demanda.
- Material, Accessibility: https://m1.material.io/usability/accessibility.html — hierarquia, contraste e áreas de toque.
- GOV.UK, Clear structure: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-structure/ — títulos descritivos, palavras principais primeiro e evitar repetição.

## Alterações

1. DataTable: resumo por registro como padrão mobile; dados adicionais expansíveis; modo tabela opcional para comparação; ordenação e paginação preservadas. Uma única representação é montada de cada vez, evitando duplicar controles e IDs.
2. Navegação mobile: cinco destinos com nomes sempre visíveis, cores do tema, altura fixa de 54px e área segura inferior. A seção Vendas/Meli permanece marcada nas subpáginas.
3. Atualização de dados no menu mobile, liberando espaço no cabeçalho; desktop mantém o acesso anterior.
4. Controles de pelo menos 44px, filtros com campos de largura disponível, folhas ajustadas à altura dinâmica da tela.
5. Títulos: Indicadores, Vendas no período, Resultado financeiro e Histórico de vendas. Removidos números decorativos, títulos repetidos e frases genéricas dos atalhos de área. Explicações de cálculo, alertas e ressalvas sobre os dados permanecem.

## Verificações

- Build de produção na cópia isolada: aprovado, incluindo TypeScript e 75 páginas estáticas. Alteração posterior apenas de aria-label passou por TypeScript adicional.
- Painel autenticado em 390px e 320px: sem overflow horizontal.
- Alternância resumo/tabela: oito cartões para uma tabela, sem duplicação.
- Expansão Mais dados e ordenação de Receita exercitadas; ordem crescente mudou o primeiro valor de R$118.856,36 para R$23.973,24 no conjunto exibido.
- Filtros e menu mobile abriram/fecharam; cinco destinos medidos com 54px de altura em 320px.
- A cobertura é dos componentes compartilhados e fluxos descritos. Tabelas próprias que não usam DataTable continuam com seu tratamento anterior; não se afirma migração de todas as tabelas nem teste de todos os formulários.
- Testes em viewport de navegador, não em aparelho físico ou Safari iOS.
