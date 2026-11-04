# Pendências — a porta de entrada

Atualizado em 29/10/2026.

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
- [x] A tabela BI densa: `src/components/analise/tabela-bi.tsx`, uma
      linha por MLB, toda coluna ordenável, primeira coluna fixa, vitrine
      e praticado em colunas separadas. Entra por um seletor "uma linha
      por Produto / Anúncio" — a tabela de produtos continua sendo o
      padrão, porque ela responde "qual colchão" e esta responde "qual
      anúncio". Desenhada fora do app com dado real (1.016 anúncios da
      Probel) e conferida em 1280 e 390; `next build` passa.
      Fica em `components/analise/` e não em `components/anuncios/` como
      dizia a spec: é onde moram as outras tabelas desta tela.
      Nulo ordena sempre para o fim, e cada célula vazia diz o motivo —
      "sem leitura", "sem venda" e "sem tabela" são três coisas.
- [x] O raio-x por SKU: rota `/api/anuncios/sku/[sku]`,
      `lib/dados/raio-x-sku.ts` e `lib/dados/recorde-sku.ts` prontos, e o
      drawer ganhou três blocos que buscam sob demanda
      (`components/analise/blocos-sku.tsx`): contra o recorde do próprio
      SKU, estoque e ruptura pelo giro, e os anúncios irmãos com a
      situação de catálogo. Conferido contra o banco com
      `node scripts/conferir-raio-x-sku.mjs` — o giro é recontado por
      fora e tem de bater. No PA85352: 9 anúncios, recorde de 22 un em
      S8/26 a R$ 1.976, última semana 1 un (5% do recorde), saldo 360 com
      giro de 1,64/dia.
- [x] **Bloco de promoção ao vivo no drawer — feito em 29/10.** O que
      destravou foi o token: ele sai do cofre do sistema, o mesmo que a
      comissão por API usa, e com ele deu para SONDAR o endpoint antes de
      escrever o parser, em vez de chutar o formato.
      `promocoesDoAnuncio()` em `lib/meli/promocoes-canal.ts`, rota
      `/api/anuncios/promocoes/[mlb]`, bloco em
      `components/analise/promocao-ao-vivo.tsx`. O caminho entrou na
      lista de leitura permitida (`lib/meli/limite.ts`).
      Confere com `node scripts/conferir-promocao-ao-vivo.mjs`, que fala
      com o canal de verdade — 4 anúncios lidos, 1 recusado.

      **As quatro coisas que só a resposta real mostrou:**
      · devolve um ARRAY puro, não `{results}` como os outros dois
        endpoints de `seller-promotions`;
      · `app_version=v2` é obrigatório — sem ele, 400 "Invalid
        app_version", e não um formato antigo;
      · `price: 0` no convite é "ainda não tem preço", não promoção de
        graça. Vira nulo, senão a tela oferta R$ 0,00;
      · no CONVITE o `price` não é proposta: o relâmpago do MLB5792078252
        veio com 29,09 contra teto de 27,00 do próprio canal. A proposta
        é `suggested_discounted_price`, dentro de piso e teto. A tela só
        mostra `price` no que já está no ar.

      Anúncio em revisão responde 400 — que é "não dá para perguntar", e
      não "nenhuma promoção". Por isso a leitura volta como
      `{ lido: false, motivo }` e o bloco mostra travessão com o motivo,
      nunca lista vazia. Três estados separados na tela: no ar, agendada
      e convite.

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

- [ ] O botão de sincronizar da aba Ads segue desabilitado — e vai ficar
      até a primeira escrita de verdade. Ele não tem código por trás:
      ligá-lo é escrever no Meli Ads, que é a mesma trava do item
      "Primeira escrita de verdade no Meli", logo abaixo.
- [x] Degrau 2, a fila de aprovação: `db/46_fila_de_aprovacao.sql`,
      `lib/dados/fila-aprovacao.ts`, `/api/automacoes/fila` e a aba
      **Fila** em Automações. Gerar roda as regras em cima do que o canal
      convidou e grava a decisão com o **piso e a folga do momento** — é
      o que torna a linha explicável em dezembro. Uma promoção por
      chamada, quatro ao mesmo tempo, como os contadores: as 36 juntas
      estouram a cota.
      Nada é enviado: aprovar só muda o estado. O envio continua em
      `/api/automacoes/enviar`, com `confirmar: true`.
      A migração 46 **já rodou** (conferida em 29/10), então a fila
      guarda. Falta o passo 1 do degrau (rodar de madrugada): depende do
      agendamento, que está parado por `CRON_SECRET` e companhia.
- [x] Memória de folga — virou `folgas_campanha` (migração
      `db/45_folga_por_campanha.sql`), **por tipo de campanha**, que é
      como a Probel trabalha: 5% nas automáticas e 0% no pré-acordo. O
      campo no topo edita a régua do tipo em foco (a promoção aberta, o
      filtro, ou o padrão) e grava sozinho. Zero é régua, não ausência —
      `scripts/testar-folga-por-campanha.mjs` cobre justamente esse caso,
      que com `||` no lugar de `??` ofertaria 5% abaixo de um preço
      negociado.
      A migração 45 **já rodou** (conferida em 29/10): a folga editada na
      tela agora persiste, em vez de voltar a 5% a cada recarga.
- [ ] Aposentar a planilha de promoção — é o objetivo final deste módulo.

---

## Para rodar no Supabase — nenhuma

As duas que faltavam já rodaram. Conferido em 29/10 contra o banco:

- [x] `db/45_folga_por_campanha.sql` — `folgas_campanha` responde
      (`node scripts/conferir-migracoes.mjs`).
- [x] `db/46_fila_de_aprovacao.sql` — as sete colunas novas de
      `decisoes_promocao` respondem (`estado`, `aprovada_por`,
      `aprovada_em`, `titulo`, `sku`, `preco_canal`, `prazo`).
      O índice parcial e o check de `estado` não dão para sondar de
      fora: só se vê tentando gravar, e isso é escrita.

Com isso, a folga por campanha e a fila de aprovação passam a guardar o
que decidem — era o que faltava para os dois itens acima valerem.

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
- [ ] **Apagar os 1.199 pedidos nunca pagos.** Script pronto e ensaiado
      (ver em "Soltos"). Apaga dado e refaz as diárias: é decisão dele.

---

## Soltos, menores

- [x] **Junho da 2ª conta do Meli — fechado em 29/10.** 9.600 visitas,
      do painel. As duas contas do Meli agora têm o ano inteiro: jan a
      jun do painel e jul em diante da coleta diária.
      Conferido antes de gravar: 94 vendas no painel e 94 pedidos na
      base, e a conversão calculada (0,98%) bate com a do painel
      (1,0%). A receita fica 15,7% acima porque a nossa inclui frete.

      **O que o ano dessa conta mostra:** março foi o pico (R$ 442.950,
      28.312 visitas), abril caiu 93% de uma vez, junho repicou sozinho
      (R$ 191.050 com 9.600 visitas) e de julho em diante ela ficou
      entre 2.650 e 10.418 visitas, com a conversão caindo de 0,98%
      para 0,15–0,29%. A queda é de tráfego, e o repique de junho não
      se sustentou.

- [x] **`carregarFormulaBase()` filtrava nada — corrigido em 28/10.**
      Ela pegava o `vigente_de` mais recente de QUALQUER operação e
      carregava itens e preços daquela vigência, também sem filtro. No
      app o RLS salvava; com a chave de serviço, não: a Probel recebia a
      base de 22/10 de outra empresa, com 82 itens em vez dos 1.379 dela.
      Agora as três consultas e a de `anuncios` filtram a operação — do
      cookie na tela, na mão no script —, e sem operação devolve null em
      vez de pegar a base alheia. Conferido: Probel 1.379 itens da
      vigência de 30/09, outra empresa 82 da de 22/10, nenhuma chave de
      preço vazando entre as duas.
      Nunca saiu preço errado daqui: o efeito era base VAZIA, que o
      sistema já trata como "sem tabela", isto é, "não sei".

- [x] **Comissão praticada pela API — feito em 28/10.** A cobertura por
      SKU subiu de 16–32% para **55%**, e os 45% que faltam são receita
      de OUTROS canais, onde a API do Meli não tem o que dizer: a
      cobertura de cada SKU agora acompanha a fatia do Meli nele (47% de
      Meli → 45% de cobertura; 66% → 65%). O lado Meli está fechado.
      3.082 pedidos preenchidos com `order_items[].sale_fee`, o extrato
      de quem cobrou, por `scripts/local/comissao-por-api.mjs`.
      Não foi só carimbo: **293 pedidos tinham comissão errada**, com
      valores impossíveis como 28%, 22% e 42% do pedido — frete
      capturado pela reconstrução antiga. A API corrigiu para 3% a 5%.
      O token sai do cofre do sistema (a integração do app do Meli), que
      renova sozinha; os `token.json` dos CLIs antigos não entram nisso.

- [x] **Bloco de promoção ao vivo — feito em 29/10, e por MLB, não por
      SKU.** O raio-x do SKU junta os irmãos; a promoção não se junta:
      cada MLB tem convite, piso e teto próprios, e a média de dois
      pisos não é um número que exista em lugar nenhum. Por isso o bloco
      ficou ao lado dos do SKU, mas com chamada própria por anúncio. Ver
      o item 1, em "Em andamento".

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

- [x] **Planilha de grupos da Black Friday da Probel — entregue em
      29/10, fora do app.** Pedido do Eduardo: os 109 MLBs da aba
      `11-BLACK FRIDAY 2026` do `Controle_Probel_2026_10.xlsx`, em grupos
      de modelo × ticket médio, 4 concorrentes por grupo (preço e link) e
      colunas por fórmula (desconto extra, preço final, melhor preço de
      performance menos o final, diferença contra o concorrente em foco).
      Desde 30/10 são duas abas separadas, **Grupos** e **Produtos**, e os
      concorrentes são **por marca fixa**, não "concorrente 1 a 4": cada
      marca (BF Colchões, Ortobom, Castor, Anjos, Herval, Sankonfort,
      Luckspuma, Paropas, mais "Outra marca") tem a sua coluna e é a mesma
      em todos os grupos. A marca se troca no menu (A2 de Produtos para
      todos, menu por grupo e preço manual na aba Grupos) — feito para
      usar em reunião. BF Colchões cobre 8 dos 15 grupos; a linha "Grupos
      com produto da marca" na aba Grupos mostra a cobertura de cada uma.
      Arquivo: `scratchpad/probel/Probel_Black_Friday_grupos.xlsx`. Para
      refazer: `coletar-marcas.mjs` (busca no catálogo, cache em
      `cache_pool.json` e `cache_itens.json`, grava `marcas.json`) e
      depois `montar-xlsx3.mjs`. Os `montar-xlsx.mjs` e `montar-xlsx2.mjs`
      são versões antigas. **Tudo em `scratchpad/`, sem commit** — nada
      disso entrou no app.
      15 grupos, 3.083 fórmulas, zero erro (recalculado no Excel).
      Os dois preços de base são as colunas M ("Campanha Mês, 01/11 a
      20/11") e S da aba. O cabeçalho de S era só uma data (11/11); li
      como o preço do 11.11. Vazio em 18 produtos (17 travesseiros e 1
      colchão).

      **O que descobri, e vale para a próxima vez:**
      · `anuncios.preco_atual` é o preço CHEIO. A vitrine real é o
        `sale_price` diário (`ultimosPrecosDeVenda`). Dos 717 produtos da
        Probel só 245 têm vitrine nos últimos 7 dias; os outros 472 estão
        pausados ou sem anúncio (PA65752: 349 un em 4 meses e os 8
        anúncios pausados). "Sem vitrine" é verdade, não buraco.
      · Na aba, NMV é de 4 meses e "Unid." é de 8: dividir um pelo outro
        dá ticket errado. Ticket sai do banco, por MLB
        (`pedido_itens.codigo_externo` guarda o MLB). Receita do banco ÷
        NMV da aba: mediana 0,88. Visitas batem (10.630 contra 10.645) e
        o "Melhor preço vendido" da aba bate com o preço da semana-recorde
        do sistema (mediana 1,00). 24 dos 109 MLBs não venderam nos 4
        meses.
      · Concorrente pela API do Meli: `/sites/MLB/search` segue fechada;
        o que abre é o CATÁLOGO. `/products/search` dá nome, marca e a
        ficha (`SPRING_SYSTEM`, `HEIGHT`, `MATTRESS_PILLOW_TYPE`,
        `MATTRESS_FIRMNESS`, `DENSITY_BRASIL`); `/products/{id}/items` dá
        as ofertas com preço, vendedor e `official_store_id`.
        `buy_box_winner` vem `null` nesses produtos — não use. Os
        produtos da Probel também estão no catálogo.
      · **A API NÃO entrega venda de concorrente.** A oferta não tem
        `sold_quantity`; `/items/{MLB}` de outro vendedor e
        `/visits/items` respondem 403. Comparar preço é possível;
        saber quem vende mais, não.
      · `/items/{MLB}` do NOSSO anúncio também deu 403 com o token da
        primeira integração: o token do cofre é por CONTA, e aquele não
        era o da conta dona do anúncio.
      · Selecionar concorrente só por nome e preço próximo enviesa: o
        primeiro corte deu "−4%" onde, com a mesma ficha (altura, mola
        ensacada, pillow, firmeza), o Casal A está +35% acima do menor.
        Em Pet, Beliche, Viúva A e Travesseiro B só há 2 de 4 com a
        ficha igual; ficou vazio em vez de completar.
      · Marcas que a Probel vende sob o próprio nome não são concorrente:
        Prodormir, Boa Forma, Própet, Próintense, Pelmex, Guardian.

- [x] **Negociação da Magalu preenchida — 29/10, fora do app.** As abas
      `Negociação 11.11` e `Negociação Black` do `probelcolchoes.xlsx`,
      coluna G (PREÇO SELLER), 41 linhas cada. Arquivo:
      `scratchpad/probel/probelcolchoes-preenchida.xlsx`; o gerador é
      `scratchpad/probel/magalu-preencher.mjs`. **Sem commit.**

      **O que vale para a próxima vez:**
      · **A base do sistema é a tabela ANTECIPADO.** Conferido: nos 776
        SKUs em comum, `formula_base_precos` bate AO CENTAVO com a aba
        "Probel (Antecipado)" da `Tabela de preços - marketplaces.xlsx`
        (Drive) e com NENHUM da aba de fluxo. O fluxo é ~9,9% mais alto
        (antecipado = MKP×0,91×0,9 na base das faixas; fluxo = MKP×0,9).
        Quem pedir "preço em fluxo" não pode ser servido pelo banco.
      · **A faixa de 11% não existe em tabela nenhuma** — as colunas vão
        de 4,5% a 20,5% de meio em meio ponto. Mas a fórmula da célula diz
        a lei: `cartão × (0,75 + comissão)`, cartão = MKP Atual × 0,9.
        Erro ZERO nas 17 faixas. Então 11% em fluxo é `cartão × 0,86`,
        avaliado na fórmula da planilha — não interpolado.
      · O PREÇO SELLER que a aba "Negociação Outubro" já tinha é o
        **antecipado a 11%**: o modelo reproduz 15 dos 22 ao centavo, e os
        7 restantes terminam em ,99/,88 (preço redondo posto na mão).
      · O sugerido da Magalu é o preço de outubro −2% (11.11) e −4%
        (Black), não um número novo dela.
      · Dois dos 41 SKUs são **Prodormir**, não Probel (PA67504 e
        PA65751): saem da aba "Prodormir | BF (fluxo)", que tem a mesma
        lei e só desloca as colunas em um.
      · A régua aplicada: o preço de tabela é o pretendido e 5% é o quanto
        se abre dele. Em fluxo o nosso 11% ficou acima do sugerido nas 41
        linhas, então foi o sugerido onde ele cabia nos 5% (14 no 11.11,
        12 no Black) e o LIMITE, tabela −5%, no resto — decisão do Eduardo
        em 29/10 ("pode aceitar −5%"), porque responder a um pedido de
        −21% com desconto nenhum fecha a porta.
      · **Consequência de ofertar o limite:** ele depende só da nossa
        tabela, não da campanha. Nas 27 linhas recusadas nas duas abas o
        preço do Black ficou IGUAL ao do 11.11; só as 14 que aceitaram o
        sugerido ficam mais baratas no Black. Se a Magalu exigir Black
        abaixo do 11.11, essas 27 precisam de decisão nova.

- [ ] **Concorrente por API dentro do app — só se virar tela.** Os
      scripts de `scratchpad/probel/` leram `/products/search` e
      `/products/{id}/items` por fora do cliente do sistema, então não
      passaram pelo portão de `lib/meli/limite.ts`. Se isso entrar no app,
      os dois caminhos têm de entrar na lista de leitura permitida, e a
      tela tem de dizer "preço de catálogo, sem venda" — nunca sugerir
      quem lidera. Não foi pedido; fica anotado para não refazer a
      sondagem.

---

## Regras que valem para qualquer sessão

- **Preço nunca é inventado.** Toda recomendação de preço sai do custo,
  da margem real ou da Fórmula base. Se o dado não existe, a resposta é
  "não sei", com o link para a página que resolve.
- **O preço proposto pelo canal é teto.** Nunca escrever acima dele.
  Já quebrou a planilha da Imprimil uma vez.
- **Zero, nulo e parcial são três coisas.** Ver `docs/agents/telas.md`.
- Antes de criar ou redesenhar tela, ler `docs/agents/telas.md`.
