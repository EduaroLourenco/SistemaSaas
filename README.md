# Gerizo

Plataforma de operação e análise de e-commerce com Next.js App Router, React, Supabase, múltiplas empresas e integrações reais. src/mock fornece referências de contratos e dados sintéticos de teste; o produto usa os dados autorizados pela sessão.

## Desenvolvimento

    npm run dev -- --port 3010
    npx next typegen
    npx tsc --noEmit
    npm run build

Leia AGENTS.md e os guias da versão instalada em node_modules/next/dist/docs antes de alterar APIs do framework. Não versione arquivos de ambiente, tokens ou dados de clientes.

## Interface

Tokens de superfície, texto, marca e estado em src/app/globals.css. Composições compartilhadas em src/app/workspace.css; análises, operação e estúdio têm estilos próprios de área. Inter na interface, números tabulares e códigos monoespaçados quando pertinentes. Temas claro/escuro/sistema e densidade compacta/confortável persistem no navegador.

A navegação usa sidebar agrupada, contexto de empresa, navegação de área e barra mobile. As URLs e rotas deliberadamente ocultas permanecem. Cálculos, dados e permissões continuam nos módulos existentes; componentes visuais recebem seus resultados.

## Prévia e verificações isoladas

scripts/redesign/preview-app renderiza os componentes reais das 61 rotas com fixtures sintéticas e APIs locais de escrita bloqueadas. Não é um modo de autenticação do produto. Consulte o README do harness para executar em http://127.0.0.1:3017.

    node scripts/redesign/verificar-todas-rotas.mjs
    node scripts/redesign/verificar-interface.mjs
    node scripts/redesign/verificar-contraste.mjs
    node scripts/redesign/testar-offline.mjs

Os logs ficam em output/redesign, fora do histórico. Não é necessário gerar screenshots. A suíte histórica contém testes que escrevem no banco: não execute scripts/testar-tudo.mjs indiscriminadamente contra o ambiente real. O runner offline seleciona testes inspecionados e bloqueia rede.

O script legado npm run lint usa next lint, removido na versão instalada. Essa limitação e a fixture antiga do teste de atualização são registradas nos resultados.

## Redesign

O inventário, a paridade por área e os resultados estão em docs/redesign. A cobertura distingue implementação, verificações de navegador e fluxos que ainda dependem de sessão de teste autorizada. Fixtures não comprovam autenticação, RLS, integração ou gravação real.
