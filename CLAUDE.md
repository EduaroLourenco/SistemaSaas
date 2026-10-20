@AGENTS.md

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Telas

Antes de criar ou redesenhar qualquer tela, leia `docs/agents/telas.md`: o ciclo
(dado real → página solta → print do próprio resultado → código), as formas que
cabem em cada tipo de dado, o que é proibido, e a diferença entre zero, nulo e
parcial — que é o que mais gerou mal-entendido aqui.
