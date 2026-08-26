# Plataforma

Sistema unificado de operação de e-commerce. **Fase 1: front-end estático.**
Sem banco, sem API, sem autenticação — todos os números vêm de `src/mock/`.

```bash
npm run dev -- --port 3010
```

## Decisões travadas

| | |
|---|---|
| Paleta | Grafite + verde-petróleo `#0F5C57` (escuro: `#3AA396`) |
| Tema | Claro por padrão, escuro completo, respeita o sistema |
| Densidade | Compacta (linha de 32px); `data-density="comfortable"` sobe para 42px |
| Tipografia | Inter na interface, JetBrains Mono tabular em **todo** número |
| Proibido | `backdrop-blur`, gradiente de fundo, sombra colorida, card que flutua no hover |
| Nome | Ainda não definido — monograma neutro como placeholder |

## Estrutura

```
src/
  app/
    page.tsx                    Visão geral            ← piloto
    vendas/canais/              Vendas por canal       ← piloto
    anuncios/analise/           Análise de anúncios    ← piloto
    …                           23 rotas reservadas (ComingSoon)
  components/
    layout/app-shell.tsx        Casca, navegação, PageHeader, PageBody
    ui/primitives.tsx           Button, Panel, Badge, Delta, EmptyState, Skeleton
    ui/stat-tile.tsx            StatTile, Sparkline
    ui/data-table.tsx           Tabela densa + cartões no mobile
    ui/chart.tsx                Cores de série, eixos, tooltip, legenda
  lib/
    format.ts                   money, count, pct, delta — toda saída numérica passa aqui
    nav.ts                      Árvore de navegação e barra inferior do mobile
  mock/index.ts                 Dados estáticos, tipados no formato da API futura
```

## Trocar mock por API (fase 3)

Cada export de `src/mock/` tem o mesmo formato que a rota real vai devolver.
A troca é uma linha por tela: `import { CANAIS } from "@/mock"` vira um `fetch`.

## Fonte dos módulos

Portados de projetos anteriores, mantidos intocados como referência somente-leitura:

- `Downloads/Sistema Saas E commerce/src/` — análise de anúncios, promoções, busca-preço
- `Downloads/Sistema Saas E commerce/probel-marketplace/` — KPIs, canais, semanal/anual

As bibliotecas de `src/lib/` do projeto Next antigo (`excel-analise`, `derived-metrics`,
`report-generator`) entram na fase 3.
