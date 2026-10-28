# Pendências — a porta de entrada

Atualizado em 27/10/2026.

Este é o único arquivo que precisa ser lido para saber o que falta. Cada
item aponta para a especificação onde o detalhe está. Quem abrir uma
sessão nova lê daqui.

**Quem risca:** quem termina o item, no mesmo commit da entrega.

---

## Em andamento

### 1. Tela de anúncios — a visão completa
Spec: `.scratch/anuncios-raio-x/spec.md` (o diagnóstico de 27/10 está no fim)

- [x] `Metricas.precoVitrine` e `Metricas.precoPraticado` separados em
      `src/lib/analise.ts`. Era um campo só — e era por isso que o preço
      de vitrine nunca aparecia em anúncio que vendeu. Typecheck passou.
- [ ] Semana em curso fora do recorte por padrão. Hoje a S44 entra com
      2 dias de 7 (25 vendas contra 264 da S43) e derruba toda métrica e
      toda comparação "vs. N semanas anteriores".
- [ ] O rótulo do filtro mostra as datas reais. Hoje diz só "8 semanas",
      e o usuário não tem como ver qual período está olhando.
- [ ] A tabela BI densa: uma linha por anúncio, ordenável, primeira
      coluna fixa, com vitrine e praticado em colunas separadas.
- [ ] O raio-x por SKU: rota própria `/api/anuncios/sku/[sku]`,
      `lib/dados/raio-x-sku.ts`, `lib/dados/recorde-sku.ts`, e os cinco
      blocos do drawer.

**O que a coluna de vitrine vai mostrar, e por quê:** dado só das últimas
~5 semanas. `anuncio_desempenho_semanal.preco_anunciado` está nulo nas
11.039 linhas, e `anuncio_estoque_diario` só começa em 30/09/2026. Não é
defeito a corrigir — é a idade da coleta. Semana sem leitura diz "não
medimos", nunca zero.

### 2. Automações — fazer a automação funcionar
Spec: `.scratch/automacoes/spec.md`, `automacao-em-massa.md`,
`regras-personalizadas.md`

A tela, o motor de regras e o diagnóstico de cobertura estão feitos e
publicados, com a **escrita desligada**.

- [ ] O botão de sincronizar da aba Ads segue desabilitado.
- [ ] Degrau 2 de `automacao-em-massa.md`: a fila de aprovação.
- [ ] Memória de folga em `regras_automacao`.
- [ ] Aposentar a planilha de promoção — é o objetivo final deste módulo.

---

## Travado no Eduardo

Nada aqui anda sem ele. Não é falta de código.

- [ ] **Primeira escrita de verdade no Meli.** Um item só, com ele
      presente. Ele pediu para deixar para depois. Até então a escrita
      fica desligada na Bom de Compras.
- [ ] **Custos por SKU.** 54 SKUs da Bom de Compras sem custo. Enquanto
      faltarem, toda regra de margem devolve "não sei" em vez de
      decidir — de propósito. Ver `src/lib/dados/cobertura-regras.ts`.
      Na Probel é pior: 8 produtos com custo, de 716.
- [ ] **Lojas Bling da Bom de Compras.**
- [ ] **Código de site do Magalu.** O Ads do Magalu não aceita o SKU
      interno, pede o código próprio dele (ex.: `dbj762k3b1`), e o
      sistema não guarda esse campo. Precisa de coluna e de importação.
- [ ] **As quatro operações chamadas "Operação principal".** Precisa
      decidir os nomes.

---

## Soltos, menores

- [ ] `/equipe` não aparece na navegação.
- [ ] VTEX: cancelado inflado em ago/set — conferir. Vem da auditoria
      de 08/10.
- [ ] Relatório semanal pode estar perdendo venda recente — conferir.
- [ ] Kit moleskine `MLB6777275760` entrou a 3%.
- [ ] 6 linhas da Imprimil no 11.11 não pegaram preço.
- [ ] `LIV_PACK100` saiu R$ 2 abaixo do piso.

---

## Regras que valem para qualquer sessão

- **Preço nunca é inventado.** Toda recomendação de preço sai do custo,
  da margem real ou da Fórmula base. Se o dado não existe, a resposta é
  "não sei", com o link para a página que resolve.
- **O preço proposto pelo canal é teto.** Nunca escrever acima dele.
  Já quebrou a planilha da Imprimil uma vez.
- **Zero, nulo e parcial são três coisas.** Ver `docs/agents/telas.md`.
- Antes de criar ou redesenhar tela, ler `docs/agents/telas.md`.
