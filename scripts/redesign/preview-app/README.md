# Preview isolado do redesign

Execute na pasta desta fixture: `node ../../../node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3017`. O cache persistente do Webpack está desligado apenas nesta prévia.

Por padrão usa `src` atual. Para baseline, defina `GERIZO_QA_SOURCE_DIR` com o caminho absoluto de uma cópia imutável de `src`, por exemplo `output/redesign/baseline-src`. Pare o servidor antes de alternar a fonte. O config gera `tsconfig.runtime.json` e `app/qa-utilities.css` locais (ignorados) com o alias e a fonte explícita do Tailwind correspondentes. A junction `public` também é local e aponta para os assets oficiais do repositório.

O harness importa os componentes reais e o CSS de produção, mas não importa páginas SSR de dados nem o proxy de autenticação. As métricas vêm de `fixtures.ts` e dos módulos de fixtures por área; nenhuma empresa ou pedido é real. As rotas de API locais respondem fixtures e recusam qualquer método de escrita com 403. Não oferece validação de autenticação, RLS ou integrações reais.

O catchall renderiza as outras 58 rotas com seus componentes reais; URLs com token/chave aceitam o identificador `demonstracao`. A navegação corresponde às 61 rotas, com entrada, documentação, relatórios, gestão e áreas operacionais. Não é necessário gerar capturas para o QA: os verificadores usam DOM, estilos calculados, teclado e interações. Capturas históricas, se consultadas, contêm fixtures sintéticas. O diretório `.next` é descartável e ignorado pelo Git.

Cenários adicionais: `/alertas?cenario=vazio`; `/mercado-livre/envios?cenario=vazio`, `?cenario=falha` e `?cenario=sem-contas`. Nenhum deles muda a fixture padrão ou o produto.
