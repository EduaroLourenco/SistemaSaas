# Revisão geral das telas — backlog

Capturado em 15/09/2026, a partir de feedback do Eduardo tela por tela. Antes
de duplicar o projeto pro SaaS, ele quer uma limpeza e um aprofundamento
reais, não só cosmético. Este arquivo é a lista de trabalho — vamos riscando
conforme fecha.

**Legenda:**
- `[fix]` mudança direta, dá pra fazer sem mais decisão do Eduardo
- `[decisão]` precisa de uma resposta dele antes (pergunta embutida)
- `[proposta]` ele pediu documento/design ANTES de qualquer código

---

## Visão geral

- [x] `[fix]` Seletor de canal — e de **conta**: a lista já vinha pronta com "Mercado Livre" inteiro e cada conta dentro. Ele recorta os KPIs, a curva de faturamento e a tabela de produtos. **Os painéis de canal ficam de fora de propósito:** "Participação por canal" e "Canais" existem para comparar um canal com os outros; recortados num canal só virariam uma barra de 100%. Eles seguem no consolidado, e o cabeçalho diz isso.
- [x] `[fix]` Conversão sem visita — agora aparece **—** com a nota "sem visita registrada no recorte", em vez de "0,00%". Vale para o indicador e para a coluna de cada produto. As duas leituras pedem ações opostas: "0" manda mexer no anúncio, "não sei" manda arrumar a importação de visitas.
- [x] `[fix]` "Produtos com maior receita" segue o seletor, e o "Ver todos" leva o recorte junto para a Análise de SKU (traduzindo o slug da tela para o uuid que aquela página espera).
- [ ] `[proposta]` Alertas e recomendações do dia: hoje é raso, não dá pra entender o que aconteceu. **Preciso propor um redesenho** antes de mexer — ver seção própria abaixo.

## Vendas · Dia

- [x] `[fix]` **Bug:** clicar num canal sem dado faz o seletor sumir (precisa recarregar a página pra voltar)
- [x] `[fix]` Escolher a conta (São Paulo / 2ª conta) separadamente — **já estava resolvido** desde a auditoria de 12/09. Conferi: o carregador lê o recorte por conta e o seletor oferece "Mercado Livre — todas as contas" e cada conta dentro do grupo. O que estava quebrado era outra coisa: escolher uma conta sem movimento fazia o seletor sumir — esse bug foi corrigido.

## Vendas · Mês até aqui

- [ ] `[fix]` Poder distribuir a meta por canal: escolher pra quais canais joga o gap, não só todos juntos

## Vendas · Diário

- [x] `[fix]` Renomear a aba pra "Comparar período"
- [x] `[fix]` No seletor de canal, poder escolher UMA conta do Mercado Livre pra comparar, não as duas somadas

## Vendas · Comparativos

- [x] `[fix]` Remover a seção "Padrão início vs. fim do mês" / "1ª ocorrência de cada dia da semana contra a última"

## Vendas · Análise de SKU

- [ ] `[fix]` Ao filtrar por canal, adicionar atalhos de período comparativo: 30×30, 7×7, 90×90, ano todo por mês, período de calendário livre — até 3 períodos ao mesmo tempo

## Vendas · Cancelamentos

- [ ] `[fix]` Poder ver por canal, ao longo do ano, agrupado por mês

## Vendas · Metas

- [ ] `[fix]` Reformular pra ser dinâmico: escolher quais canais puxam a meta, poder somar meta extra pra outros canais, editar um por um se quiser — mas manter a distribuição por sazonalidade (últimos 90 dias) como base automática

## Vendas · Lançamentos

- Sem mudança. Confirmado que está bom como está.

---

## Anúncios · Análise

- [x] `[fix]` Remover os filtros de lente (Todos/Sangrando margem/Joias escondidas/Falsa tração/Desperdício de tráfego/Fora do preço ideal) — os chips saíram da barra e do painel mobile. **O cálculo continua vivo:** o raio-X de cada anúncio ainda mostra os diagnósticos, então o sinal não foi jogado fora, só deixou de ser filtro.
- [x] `[fix]` Poder escolher a quantidade de semanas da análise — virou um seletor (4/8/12/16/26/39/52), montado a partir do que existe de fato no histórico importado, com um item final "tudo". Antes eram só dois botões, 4 ou 8.
- [x] `[fix]` Remover filtro de categoria (produto) — saiu do desktop e do mobile. A categoria continua aparecendo no raio-X do anúncio, como informação.
- [x] `[fix]` Remover "mapa de carteira" — o painel recolhível de tráfego × conversão saiu. A tabela "SKU × semana" foi mantida: apesar do nome parecido, é outra coisa, e é onde dá pra ver quem subiu e quem caiu semana a semana. Se quiser, tiro também.
- [x] `[decisão]` **Mantido, com justificativa.** O filtro Ativos/Pausados/Todos não é enfeite: a situação vem da API do Meli (`/users/{id}/items/search?status=active` e `status=paused`, duas varreduras), e o campo está preenchido de verdade nos anúncios importados. "Todos" mostra os dois juntos — que é exatamente o universo que a API devolve. Tirar o filtro só esconderia a distinção sem ganhar nada. Se você quiser retirar mesmo assim, é uma linha.

## Anúncios · Catálogo

- [x] `[fix]` Documentar todo dado mostrado e sua origem — botão "De onde vem" no topo abre um painel que separa por FONTE, não por coluna. **E aqui tem uma correção à premissa:** não é tudo que vem por API. Sete colunas vêm (MLB, título, SKU, tipo, status, preço de vitrine, comissão padrão), uma vem dos seus pedidos (comissão praticada) e duas são derivadas aqui dentro (categoria, que é a primeira palavra do título, e o histórico de preço, que a plataforma acumula porque a API só devolve o preço de agora). O painel diz isso nessas palavras.
- [x] `[fix]` Botão "Atualizar" bem visível no topo — feito, e roda só a etapa de catálogo (segundos), não a sincronização inteira. Mostra a idade do dado logo abaixo do cabeçalho e avisa em vermelho se a chamada falhar, mantendo a última leitura na tela.
- [x] `[decisão]` **Resolvido sem precisar da API.** A API não devolve comissão praticada agregada — mas não precisa: ela já é calculada a partir dos pedidos em `tarifa-cobrada.ts`, e agora aparece por MLB, na ficha e no indicador do topo. A média do topo é ponderada por RECEITA, não por número de anúncios, porque um MLB de R$ 40 mil e outro de R$ 200 não pesam igual no caixa. Onde o canal não informou a comissão, fica traço — nunca cai na de tabela fingindo ser praticada.

## Anúncios · Performance de preço

- [x] `[fix]` Separar as duas contas do Mercado Livre — **já estava resolvido.** Conferi o carregador: o recorte entra por `conta_canal_id` tanto nos pedidos quanto no catálogo. Não voltou a juntar. **Mas atenção a outra coisa:** a 2ª conta (a prazo) não tem NENHUM anúncio no catálogo — só a de São Paulo tem, com 468. Então escolher a conta a prazo nesta tela devolve pouca coisa, e o motivo não é o filtro, é a falta de catálogo dela.
- [x] `[fix]` Deixar nítido que "preço" = preço VENDIDO — as colunas viraram "Melhor preço vendido", "Último preço vendido" e "Média vendida 14 dias", e o rodapé abre dizendo que todo preço da tela é o que o cliente pagou, com a vitrine como única exceção.
- [x] `[fix]` Aviso EM MAIÚSCULO quando a vitrine falhar — implementado, mas com uma correção de premissa: a vitrine desta tela **não** é uma chamada ao vivo, é `anuncios.preco_atual`, abastecido pela sincronização. Então ela nunca "falha" visivelmente — ela ENVELHECE em silêncio, que é pior. O aviso agora dispara quando a última sincronização passou de 48h ou quando não há preço nenhum, e diz que só a coluna de vitrine está comprometida. Estado de hoje: última sync 14/09 13:16, 461 dos 468 anúncios com preço — sem aviso, só a nota dos 7 sem preço.

## Anúncios · Tráfego pago

- [x] `[fix]` Adicionar tag "EM DESENVOLVIMENTO"

## Anúncios · Preço-alvo

- [x] `[fix]` Adicionar tag "EM DESENVOLVIMENTO"

## Anúncios · Preço ideal

- [x] `[fix]` Renomear para "Lógica de promoção" (confirmado: só serve pra Fórmula base / preço mínimo de campanha)

## Anúncios · Clássico vs Premium

- [x] `[fix]` Trazer a comissão REALMENTE praticada — feito, vindo dos pedidos (`tarifa-cobrada.ts`), ponderada por receita, com a cobertura ao lado. A de tabela continua visível, porque é a régua do canal.
- [x] `[fix]` Poder selecionar o período de análise — 30 / 90 / 180 dias / 1 ano / tudo. A janela é ancorada na semana mais recente que existe no relatório, não em hoje: o desempenho chega por importação manual e costuma estar 1–2 semanas atrás.
- [x] `[fix]` Poder comparar mais de um período — caixa "Comparar com o período anterior", que recalcula a mesma conta na janela imediatamente anterior, do mesmo tamanho.
- [x] `[fix]` Seletor de conta do Mercado Livre (era o item transversal) — entrou aqui junto.

> **Achado que saiu disso (15/09):** pela tabela, o Premium custa 4,99 p.p.
> a mais que o Clássico (16,54% contra 11,55%). Pela tarifa **realmente
> cobrada**, a diferença é de **0,83 p.p.** — 10,23% contra 9,40%. Ou seja:
> a redução negociada come quase toda a diferença, e o Premium é bem menos
> caro do que a tela dizia. Cobertura do dado: 67% da receita no Clássico,
> 41% no Premium.

## Todas as abas de Anúncios

- [x] `[fix]` Escolher qual conta do Mercado Livre está sendo analisada. Estado tela a tela:

| Tela | Situação |
|---|---|
| Análise | já tinha seletor de conta |
| Catálogo | tinha só no celular — **agora também no desktop** |
| Performance de preço | já tinha, e o filtro é por conta de verdade (conferido) |
| Clássico vs Premium | **novo**, por canal e por conta |
| Lógica de promoção | **novo**, por conta |
| Preço-alvo | tem seletor, mas por **canal** — e é o certo: a tela trabalha com tabela de comissão e custo, que são do canal, não da conta |
| Tráfego pago | **não tem, e não deve ter por ora.** O relatório de mídia não traz conta: ele vem por anunciante/campanha, e só a conta de São Paulo tem anunciante configurado. Um seletor aqui seria um filtro que não filtra nada. Quando a 2ª conta tiver mídia, entra. |

---

## Promoções

- [ ] `[proposta]` A única aba usada de verdade é "Processar planilha". As outras (Campanhas, Comparar ofertas, Histórico) têm potencial mas, do jeito que estão, com o volume de dado que só vai crescer, ficaram confusas e pouco úteis. **Pedido: unificar numa aba só e propor o formato ideal** — ver seção própria abaixo.

## Financeiro

> **Correção do Eduardo (15/09), depois de eu ter entendido errado:**
> *"nao entendi o financeiro, nao é construir um sistema fora nao, é só
> melhorar e corrigir o que ja tem"*.
>
> Eu tinha anotado como "construir o sistema financeiro de verdade" — não
> é. **Não se constrói nada novo aqui.** O escopo é o que já existe na
> aba Financeiro: entender, arrumar o que está errado e deixar a tela
> menos confusa. Sem projeto paralelo, sem reescrita.

- [ ] `[fix]` Relatório de como funciona HOJE: quais dados existem, de onde vêm (automático via API ou manual), o que dá pra analisar quando tudo preenchido — primeiro passo, pra saber o que arrumar
- [ ] `[fix]` Corrigir o que estiver errado no que já existe
- [ ] `[fix]` Melhorar estética e front — está confuso

## Relatórios · Apresentação

- [ ] `[proposta]` Hoje não serve pra nada — não dá pra analisar por canal nem por período. **Reconstruir do zero**: quais apresentações fazem sentido, o que personalizar, o que é útil de verdade.

---

## As três propostas grandes (fazer antes de qualquer código nessas áreas)

1. **Alertas e recomendações (Visão geral)** — hoje é raso
2. **Promoções** — unificar numa aba, formato ideal pros dados que temos
3. **Financeiro** — relatório do estado atual, para saber o que corrigir
   (**não** é construir sistema novo — ver a correção na seção)
4. **Apresentação** — reconstrução completa

Essas quatro eu trago como documento (provavelmente artifact/HTML) pra você
ler e decidir antes de eu tocar em código.
