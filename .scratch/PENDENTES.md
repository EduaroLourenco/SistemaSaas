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
Teste: `node scripts/testar-semana-em-curso.mjs`

- [x] `Metricas.precoVitrine` e `Metricas.precoPraticado` separados em
      `src/lib/analise.ts`. Era um campo só — e era por isso que o preço
      de vitrine nunca aparecia em anúncio que vendeu. Typecheck passou.
- [x] Semana em curso fora do recorte por padrão. A S44 (2 dias de 7, 25
      vendas contra 264 da S43) sai da soma e da comparação; a caixa
      "incluir · 2 de 7 dias" a traz de volta para quem quiser o parcial.
      `parcial` e `dias` saem do carregador, no fuso de São Paulo.
- [x] O rótulo do filtro mostra as datas reais: "Semanas · 31/08 – 25/10",
      no cabeçalho do campo e na folha de filtros do celular.
- [x] O ano no rótulo da semana. Achado ao conferir o item acima: a chave
      era `S${semana_iso}` sem o ano, e as quatro semanas de 2025
      (S41 a S44) tinham o mesmo rótulo das de 2026. A tela listava 52
      semanas em vez de 56, somava 2025 dentro de 2026 nessas quatro, e a
      semana em curso herdava as datas da S44 de 2025 — passando por
      fechada. Agora é `S44/26`, e a ordem é pela data, não pelo número.
      Conferido no banco: 56 semanas, só a S44/26 parcial, 2 de 7 dias.
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

- [x] `/equipe` na navegação: **já estava lá**, e o item era engano. Está
      em `NAV_FOOTER` (`src/lib/nav.ts`) desde 01/10, e `NavTree` desenha
      esse grupo tanto na barra do desktop (`app-shell.tsx:507`) quanto na
      folha "Mais" do celular (`:526`). Fica abaixo do divisor, com
      Empresas, Canais, Fontes, Estoques, Glossário e Configurações — é aí
      que se procura, não entre os grupos de cima.
- [x] VTEX: cancelado inflado — **era o importador, e continuava
      entrando**. A listagem do hub marca "Cancelado" o carrinho cujo
      pagamento nunca passou. Na Loja própria, mesmo mês e duas fontes:
      API 2% a 5% de cancelamento, planilha 49% a 99%. A data de aprovação
      separa os dois casos — dos pedidos de planilha que estão de pé,
      nenhum está sem ela; dos cancelados da Loja própria, 93% está, e os
      309 cancelados do Meli TÊM a data (cancelamento real).
      `src/lib/planilhas/pedidos.ts` agora deixa esses de fora e a tela de
      importação diz quantos. Último lote ruim: 27/10, 85 pedidos, 83
      "cancelados", R$ 134.645.
- [ ] **Apagar os 1.199 nunca pagos que já estão na base.** Script pronto
      e ensaiado: `node scripts/limpar-pedidos-nunca-pagos.mjs
      00000000-0000-0000-0000-000000000101` (ensaio) e `--aplicar`. São
      R$ 1.481.734 de "cancelado" que nunca foi venda, em 10 contas, de
      01/2026 a 22/10. Apaga dado e refaz as diárias: **é do Eduardo**.
- [x] Relatório semanal "perdendo venda recente": **a conta está certa, o
      dado é que ainda não chegou**. Conferido em 28/10 contra a base:
      21–27/10 dá 196 pedidos e R$ 355.173,53 na tela e na base, ao
      centavo. O que falta não é soma — nos 60 dias fechados antes da
      janela, **55% do valor de um dia só foi gravado mais de um dia
      depois** da data do pedido (aprovação que sai depois, planilha
      importada depois). A janela fecha ontem, então os últimos dias estão
      sempre incompletos e a comparação com a janela anterior (fechada)
      sai desfavorecida. O relatório agora diz isso, medido, em
      "Pendências" — não é defeito a corrigir, é leitura a declarar.

---

## Regras que valem para qualquer sessão

- **Preço nunca é inventado.** Toda recomendação de preço sai do custo,
  da margem real ou da Fórmula base. Se o dado não existe, a resposta é
  "não sei", com o link para a página que resolve.
- **O preço proposto pelo canal é teto.** Nunca escrever acima dele.
  Já quebrou a planilha da Imprimil uma vez.
- **Zero, nulo e parcial são três coisas.** Ver `docs/agents/telas.md`.
- Antes de criar ou redesenhar tela, ler `docs/agents/telas.md`.
