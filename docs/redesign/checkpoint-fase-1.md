> Histórico do primeiro checkpoint. Em 17/11 o usuário autorizou a expansão completa e o commit. Consulte entrega-completa.md para a entrega vigente; este documento não limita mais o escopo.

# Gerizo — primeiro checkpoint do redesign

Data: 16/11/2026. Base: `main`, HEAD `56f69bd`. Referência: GERIZO MASTER DESIGN & UX BLUEPRINT v1.0 e inventário `5e711fa`.

## Entrega e escopo real

O blueprint foi lido integralmente e confrontado com a implementação. Esta entrega é o checkpoint da fundação e de três verticais funcionais: **Visão geral, Alertas e Envios**. A reconstrução das 61 rotas ainda não está concluída. A [matriz de cobertura](cobertura-rotas.md) distingue 3 rotas parciais de 58 não iniciadas; a fundação tem efeito indireto nas demais, sem equivaler a aceite por rota.

O documento propõe que a revisão visual do piloto preceda a expansão. Este relatório torna o resultado revisável; não registra aprovação do usuário nem inventa validação de fluxos reais.

## Fase 0 — auditoria

- As 61 URLs do snapshot existem no código. O README descreve um estágio estático antigo; o produto atual usa Supabase, autenticação, RLS, múltiplas empresas e integrações reais.
- Contratos, fontes, filtros, estados, ações e permissões foram mapeados na matriz; os componentes piloto têm [paridade da home](paridade-home.md) e [paridade das filas](paridade-filas.md).
- Alterações locais de precificação em `src/app/api/precificacao/frete/route.ts` e `src/app/produtos/precificacao/precificacao-cliente.tsx` foram preservadas. Os arquivos e anexos não rastreados do usuário também foram preservados.
- O baseline de fonte está em `output/redesign/baseline-src`, ignorado pelo Git. Foram capturadas as três rotas piloto em 390×844, 1366×768 e 1440×900, claro/escuro: 18 combinações. O baseline das outras prioridades (Termômetro, Ads, Queda e Planejamento) **ainda não foi capturado**.
- A suíte completa contém testes de escrita no banco real. A execução usou uma seleção inspecionada com rede bloqueada, sem carregar credenciais de teste reais.

## Fase 1 — o que mudou

**Fundação e navegação:** neutros e roxo consistentes nos dois temas; contornos de controles reforçados para contraste; tipografia tabular sem zero especial; títulos e controles mais legíveis; sidebar organizada pela rotina, administração recolhível, rail de 64px e busca preservada. A barra mobile passa a Visão/Vendas/Meli/Alertas/Mais; Importar continua na administração e na busca. Contexto da empresa visível inclusive com uma única empresa. Marca oficial e GDF3 preservadas.

**Interações compartilhadas:** busca em diálogo nativo, contenção de foco, Escape e retorno ao acionador; folhas respeitam safe areas e retornam o foco. O tema acompanha a preferência efetiva; densidade e preferências mantêm as chaves existentes. A abertura artificial de 1,1s e a animação de entrada de todas as páginas foram retiradas; a indicação de carregamento e o bloqueio durante troca de empresa permanecem.

**Visão geral:** seletor de métrica fora da superfície; resultado focal de 48/56px; série temporal com valor acessível em tabela; faturamento e pedidos continuam disponíveis; prioridades em linhas com evidência, investigar, resolver e desfazer; indicadores em faixa, histórico recolhível, nomes completos de produtos, canais e SKUs. Escopos independentes de recomendações e canais continuam explícitos. Ausência de linhas é distinta de vendas zero.

**Alertas:** número de críticos e contagens na mesma faixa; fila contínua por severidade; Investigar disponível por toque; evidência expansível com gráfico e tabela; vazio neutro com acesso à cobertura das fontes.

**Envios:** quantidade pendente focal e prazos em faixa; filtro por conta, ordem inicial por prazo, cabeçalhos ordenáveis; tabela semântica com scroll local; lista mobile com produto integral e todas as informações existentes, alternância para tabela. Consulta incompleta não recebe mensagem de sucesso.

## Arquivos de produto alterados

- `src/app/globals.css` e `tsconfig.json` (exclusão de artefatos gerados e harness da checagem do produto).
- `src/components/layout/app-shell.tsx`, `busca-global.tsx`, `seletor-empresa.tsx`; `src/lib/nav.ts`.
- `src/components/ui/primitives.tsx`, `controls.tsx`, `stat-tile.tsx`, `alerta.tsx`.
- `src/app/painel-cliente.tsx`; `src/components/painel/pulso-operacao.tsx`, `fila-recomendacoes.tsx`, `skus-em-queda.tsx`.
- `src/app/alertas/alertas-cliente.tsx`; `src/app/mercado-livre/envios/envios-cliente.tsx`.

Os scripts e o harness em `scripts/redesign/` são ferramentas locais de QA, fora das rotas do produto. Não foi adicionada dependência de produção.

## Evidência visual e ambiente

Preview local: `http://127.0.0.1:3017`. Dados **sintéticos**, empresa de demonstração; os componentes e o CSS são os do produto. O harness não importa o proxy nem as páginas SSR de dados, não modifica autenticação, e recusa métodos de escrita das APIs com 403. Os testes de navegador também bloqueiam requisições externas e de escrita.

Capturas de referência: `output/redesign/baseline/`. Capturas novas: `output/redesign/fase-1/`. Cada nome contém rota, viewport e tema; arquivos `-viewport.png` mostram a primeira tela e os demais mostram a página completa. Em capturas longas, a barra fixa aparece na posição do viewport original; isso não representa uma barra repetida durante a rolagem real.

[Galeria antes/depois](../../output/redesign/index.html) · [Notebook claro](../../output/redesign/fase-1/visao-geral-1366x768-light-viewport.png) · [Celular escuro](../../output/redesign/fase-1/visao-geral-390x844-dark-viewport.png). As imagens e logs ficam em `output/`, fora do histórico Git.

As capturas foram abertas e inspecionadas. Foram corrigidos eixos recortados, quebra de dígitos em valores monetários, contexto de empresa longa e retorno de foco dos diálogos. Compilação não foi tratada como aprovação visual.

## Validação técnica

- `next typegen` e `tsc --noEmit`: aprovados; o typegen regenerou referências obsoletas de cron em `.next/types` que já falhavam no baseline.
- `npm run build`: aprovado novamente após o congelamento dos arquivos de produto e os ajustes finais do QA.
- Regressões existentes com rede bloqueada: **9/10 aprovadas**. A exceção é `testar-atualizacao.mjs`, cujo stub antigo não cobre `estadoDaEmpresa` e exige service role. Nenhum segredo ou acesso real foi usado para contornar isso. [Detalhes](testes-offline.md).
- `npm run lint`: falha preexistente de configuração; o script usa `next lint`, removido nesta versão do Next. Não foi instalado linter ou alterado o comando para mascarar a ausência.
- Contraste: **36 pares de tokens aprovados**, nos dois temas, com mínimo 4,5:1 para texto normal e 3:1 para contornos de controle. Os tokens `line-2` foram escurecidos/clareados em relação à proposta inicial para satisfazer os pares usados. Isso não equivale a conformidade WCAG integral.
- Reflow/interações: **108/108 cenários aprovados**, com 60 amostras das três rotas em dez larguras e dois temas, filtros, ordenação, tabelas, evidência, busca, diálogos e estados amostrais. Resultados em `output/redesign/qa-interface.json`.
- `git diff --check`: sem erros de whitespace; há avisos do Git sobre conversão LF/CRLF no Windows.

## Paridade, decisões e limites

Nenhum arquivo de regras, cálculo, carregador, API, autenticação, banco ou integração foi alterado por este redesign. As alterações locais do usuário nesses caminhos não fazem parte desta entrega. Nenhuma sincronização, oferta, importação, exclusão, convite ou troca real de empresa foi disparada. Não houve push nem deploy.

As descriptions das rotas ainda não migradas mantêm o comportamento anterior: algumas contêm datas e alertas indispensáveis. Elas não foram recolhidas indiscriminadamente em nome de limpeza visual. Roteiros genéricos duplicados saíram da shell; destinos autorizados seguem no menu, na busca e nos links contextuais. Rotas deliberadamente ocultas mantêm a visibilidade anterior.

Pendências materiais:

- Autenticação, RLS, RBAC, isolamento/troca real de empresa, GDF3 em sessão real, integrações, exportações reais e relatórios públicos ainda precisam de ambiente de teste autenticado. Fixtures não comprovam esses fluxos.
- A tabela manual de SKUs em queda mantém ordem original e scroll local no mobile; resumo mobile dedicado e ordenação adicional ainda não foram migrados.
- Os contratos da home e de Alertas não modelam erro SSR no componente cliente. Não foi fabricado um estado de falha nem criado um novo fluxo de erro nesta fase.
- Estados de loading, preferências e fontes têm cobertura amostral. Valores monetários extremos foram renderizados em 320 e 390px, com resumo compacto e valor integral explícito, sem overflow da página ou dos indicadores. Leitor de tela humano, device iOS físico e 200% de zoom do navegador ainda não foram validados integralmente. Reflow em 320 CSS px não é prova de zoom de navegador.
- Não foram coletados web vitals comparáveis de campo nem alegada melhora de performance. O harness em desenvolvimento serve para inspeção e interação, não para afirmar LCP/INP de produção.
- As 58 rotas restantes ainda exigem revisão específica para absorver a fundação, em especial CSS paralelo do estúdio, gráficos com várias unidades, formulários e fluxos de alto risco.

## Próximos checkpoints

| Fase | Escopo | Situação |
|---|---|---|
| 0 | Auditoria e baseline | Estrutura auditada; baseline visual limitado às três pilotos |
| 1 | Fundação, Visão geral, Alertas, Envios | Implementada; QA técnico/visual amostral; revisão de direção pendente |
| 2 | Termômetro, Ads, Queda, MTD, Anual, demais Vendas e Produtos | Não iniciada; preservar alterações de precificação do usuário |
| 3 | Catálogo, anúncios, automações, promoções, importações, lançamentos | Não iniciada; fixtures de confirmação e seleção antes de qualquer escrita |
| 4 | Planejamento/Resultados e Financeiro | Não iniciada; CSS paralelo e DRE exigem paridade própria |
| 5 | Gestão, relatórios, entrada, públicos e ocultos | Não iniciada; sem reescrever conteúdo legal ou expor rotas ocultas |
| 6 | Regressão integral, acessibilidade e cobertura final | Parcial no piloto; aceite por rota ainda pendente |

## Fechamento do QA

**Concluído o QA amostral do piloto.** Foram aprovados 108/108 cenários; as 60 amostras de reflow cobrem 320/360/390/430/768/1024/1280/1366/1440/1920px, claro/escuro. Não houve overflow global, erro de página, requisição externa ou tentativa de escrita de produto. Um POST de diagnóstico interno do Next (`/__nextjs_original-stack-frames`) foi bloqueado pelo guard e separado das escritas de produto.

Quatro falhas iniciais de retorno de foco foram corrigidas e rechecadas; o histórico permanece no JSON. A rechecagem seletiva de foco passou em 6/6 combinações. Home vazio/zero/nulo/defasado passou em 16 amostras de 390/1366px nos dois temas. Os valores extremos adicionais em 320/390px também passaram, com logs em `output/redesign/valores-extremos.json`.

O build final passou após o congelamento da interface; 36 pares de contraste passaram. Os limites de sessão real, leitor de tela, zoom nativo e cobertura das outras rotas continuam abertos. A próxima decisão de produto é a revisão da direção deste piloto antes de sua expansão, como previsto no blueprint.
