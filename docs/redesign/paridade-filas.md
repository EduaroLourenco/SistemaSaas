# Paridade — filas do piloto

Implementação do piloto, 16/11/2026. Fonte de verdade: código atual; comparado com as seções 08.02 e 08.25 do blueprint e as extrações correspondentes de `INTERFACE-ATUAL-GERIZO.txt`. Este registro não equivale a aprovação visual ou validação com usuários.

## Alertas — `/alertas`

| Contrato existente | Preservação / novo posicionamento |
| --- | --- |
| `DadosAlertas.alertas`, com id, severidade, tipo, título, leitura, números, evidência, formato e destino | Nenhum contrato de dados alterado. Título, severidade e todos os números estão na fila; leitura, evolução e destino específico estão na expansão. |
| Quantidade de críticos, atenção e achados totais | Mesmos filtros e contagens. Críticos em destaque de 48px; demais na mesma faixa sem três cartões separados. |
| Filtros Todos / Críticos / Atenção | Mesmos valores e resultados. Botões com `aria-pressed`, área de toque mínima de 44px e rolagem local quando necessário. |
| Ordenação por severidade crítico → atenção → informativo | Mesma ordenação anterior. Nenhuma prioridade de negócio nova. |
| Exclusões, canais disponíveis, quantidade removida | Mesmo componente `PainelExclusoes` e mesmas props, antes da fila. Fluxos de criar e reverter exclusão não foram alterados ou executados. |
| Link Investigar e link específico do achado | Mesmos hrefs; Investigar fica disponível também no celular sem precisar expandir. |
| Expansão de leitura e minigráfico | Mesma série e formatação. Área linear com preenchimento discreto, sem gradiente. Botão nomeado, `aria-expanded` e vínculo com a expansão. |
| Acesso aos valores de evolução | Tabela adicional em “Ver dados da evolução”, baseada na mesma evidência, sem cálculo novo; acessível por teclado e toque. |
| Vazio global e vazio de severidade | Ambos mantidos. O vazio global usa `EmptyState` neutro e diz “Nenhum alerta encontrado” nos dados disponíveis, com link contextual às fontes; sem selo de sucesso ou afirmação de cobertura/saúde que o contrato não comprova. |
| Prop de apresentação do componente compartilhado | `emLista` é opcional e apenas `/alertas` o utiliza. Padrão de superfície individual mantido para outros consumidores. |

O texto promocional inicial foi removido; não continha regra, fórmula, fonte, aviso legal ou ação. A fila mantém todas as informações necessárias à investigação.

## Envios — `/mercado-livre/envios`

| Contrato existente | Preservação / novo posicionamento |
| --- | --- |
| `DadosEnvios.hoje`, contas, envios, falhas e geradoEm | Nenhuma mudança de backend, consulta, cache, cálculo de prazo ou integração. |
| Filtro Todas / conta | Mesmo estado e condição de filtragem por conta. Rótulos curtos preservados nos controles; o nome completo aparece nas linhas/detalhes. |
| Ordem inicial pelo limite de envio ascendente, nulo ao fim | Mesmo comparador anterior, inclusive sentinela `9999`. Alteração de ordenação só por comando do usuário. |
| Ordenação por Restam / Enviar até / Pedido / Conta / Situação | Mesmos critérios; agora com cabeçalhos semânticos, `aria-sort` e acesso também no celular. Produto recebeu ordenação textual de apresentação. |
| Resumo Atrasados / Hoje / Amanhã / Depois | Mesmas condições `< 0`, `=== 0`, `=== 1`, `>= 2` sobre o recorte filtrado. Nulos permanecem fora dessas quatro contagens. |
| Total da fila | Contagem direta dos envios do recorte em destaque 56px no desktop / 48px no celular. Quando existe falha, rotulada “Pendentes nas contas consultadas”. Não é uma estimativa do restante. |
| Restam: negativo, zero, um, múltiplos e nulo | Valores e rótulos preservados, inclusive “sem prazo”; tratamento semântico por cor acompanhado por texto. |
| Limite por origem canal ou prazo | Mesma função `limiteBr`, mesmo dia/hora e mesmos critérios. |
| Produto, quantidade e SKU de todos os itens | Sempre disponíveis, nomes completos com quebra natural. SKU separado em metadado. Nenhuma foto inventada. |
| Pedido e data da compra | Sempre disponíveis nas duas vistas, sem cortar números. |
| Conta e situação | Sempre disponíveis nas duas vistas. Nome completo da conta; selo de atraso usa o mesmo critério anterior. |
| Horário da leitura | Preservado e acrescido de dia/mês reais de `geradoEm`, com o mesmo fuso America/Sao_Paulo para não sugerir atualização de hoje quando antiga. |
| Falhas por conta e motivo | Mantidas em aviso legível. Respeitam o filtro de conta; não são ocultadas no recorte Todas. |
| Estado sem envios | Só diz “Nenhum envio pendente” quando há conta e nenhuma falha no recorte. Falhas mostram “Consulta incompleta”; ausência de contas mostra “Nenhuma conta disponível”. São estados de apresentação baseados nos campos existentes. |
| Tabela no notebook | Tabela semântica de seis colunas, com rolagem horizontal interna, cabeçalho e primeira coluna fixos. |
| Celular | Lista com todos os campos; opção Tabela preserva a leitura integral em scroll local, com os mesmos filtros e ordenação. |

Os campos `comprador`, `total` e `origem` que não tinham exposição direta não foram publicados como informação nova. `origem` continua sendo usada apenas para formatar o limite. Nenhuma ação de envio foi criada.

## Verificação e limites

- Leitura dos guias locais de Next.js sobre CSS e limites entre Server/Client Components antes da edição.
- As páginas servidor e os módulos `src/lib/dados/alertas.ts` e `src/lib/dados/envios-meli.ts` permanecem intocados.
- Verificação TypeScript inicial interrompida, pois o glob do projeto incluiu o snapshot de baseline e ampliou indevidamente o escopo; a execução consolidada após ajustar as exclusões está no relatório do piloto.
- Fixtures necessárias para revisão: severidades mistas; zero críticos com atenção; vazio global; filtro vazio; prazo negativo/zero/um/maior/nulo; nome de produto longo e SKU longo; falha parcial/total; nenhuma conta; filtro e ordenação nas duas vistas.
- Não foram executadas mutações de exclusão, sincronização de envios ou integrações. Auth, RBAC e isolamento multiempresa dependem da validação consolidada do projeto.

## QA de navegador executado

Execução real com Playwright/Edge headless no harness isolado, importando os componentes reais. Resultado consolidado em `output/redesign/qa-interface.json`: **108/108 cenários aprovados**, incluindo 60 amostras de reflow das três rotas piloto nas larguras 320/360/390/430/768/1024/1280/1366/1440/1920px, em claro e escuro.

Para estas filas, foram verificados filtros de severidade, expansão e valores integrais da evidência, destinos de investigação, filtro por conta, ordenação e preservação de foco do cabeçalho, alternância Lista/Tabela e scroll local, além de vazios, falha de consulta e ausência de contas. As interações e estados foram amostrados em 390 e 1366px nos dois temas. Menu Mais e busca tiveram quatro falhas iniciais de retorno de foco no celular; a correção dos componentes compartilhados foi validada em seis novos cenários, todos aprovados, com histórico preservado no JSON.

Não houve erro JavaScript de página, requisição externa ou tentativa de escrita do produto. Um POST do diagnóstico de desenvolvimento do Next.js (`/__nextjs_original-stack-frames`) foi bloqueado pela proteção de rede e está registrado separadamente. O script não usa contas reais e não valida auth/RBAC/RLS. Leitor de tela real e zoom nativo de 200% continuam fora desta verificação.
