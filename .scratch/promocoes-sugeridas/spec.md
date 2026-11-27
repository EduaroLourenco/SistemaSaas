# Promoções sugeridas — a lógica

Status: implementado em 26/11/2026 (ver "O que foi feito", no fim). A planilha da Black
não é tabela de mínimo (era só para a Black) — não importar; primeiro envio real feito em 26/11 (11 de 13).
Pedido do Eduardo: um cartão **"Sugeridas"** destacado, sempre primeiro no
carrossel de promoções, que junta numa lista só (1) os itens que a tabela de
preço diz que dá para pôr em promoção e (2) os convites do Meli que as regras
aprovam. Ele seleciona, ajusta com o lápis e aceita em massa.

Isto **não começa do zero**. Já existe e é reaproveitado:

| Peça | Onde | O que faz |
|---|---|---|
| Motor de regras | `src/lib/planilhas/avaliar-regras.ts` | SE/ENTÃO, primeira que bate decide, e o "não sei" separado do "não" |
| Regras salvas | `regras_promocao` (db/44) | por empresa e por conta |
| Fila de aprovação | `src/lib/dados/fila-aprovacao.ts` (db/46) | a regra decide, o envio espera o aceite |
| Envio | `/api/automacoes/enviar` + `promocoes-escrita.ts` | `confirmar:true`, até 300 por vez, 4 em paralelo, histórico antes de chamar o canal, resultado item a item |
| Piso e faixas | `piso-promocao.ts`, `tabela-faixas.ts`, `faixa-comissao.ts` | piso, folga, faixa de comissão que sobra |
| Agenda | `promocao_canal_itens` (db/47) | uma linha por janela (mês, relâmpago) |

A seção nova é **uma camada de decisão em cima disso**, não um segundo motor.

---

## 1. De onde vem o "preço mínimo" de cada item

Cada empresa tem um jeito diferente de dizer quanto aceita. O sistema usa o
primeiro que existir, nesta ordem, e **mostra qual usou**:

1. **Tabela de preço mínimo importada** (a planilha amarela da BdC, a Fórmula
   base da Probel). Por SKU e por tipo de anúncio: Clássico tem um número,
   Premium outro.
2. **Tabela do rebate** (Probel): o mínimo no nível de rebate do mês, já com a
   comissão reduzida dentro.
3. **Custo + regras do canal** (`Financeiro › Custos` + `regras-canal.ts`):
   o menor preço que deixa a margem mínima depois de comissão, tarifa fixa,
   frete, imposto e embalagem.
4. **Nada disso** → o item aparece, mas **sem botão de aceitar**, com o aviso
   "sem preço mínimo: cadastre custo ou importe a tabela".

Item sem mínimo nunca é aceito "por padrão". É o mesmo princípio do
`quando_nao_sei` da migração 44: falta de dado não é decisão.

---

## 2. As regras do sistema (o "robô")

Uma tela **Regras do robô** lista todas as regras que o sistema sabe aplicar.
Cada uma tem: o que faz, o dado de que precisa, o parâmetro editável e se
está ligada **nesta empresa**.

Uma regra que depende de um dado que a empresa não tem **fica desligada
sozinha e diz por quê**: "Margem mínima — desligada: 0 de 312 produtos com
custo cadastrado". Ela liga quando o dado chega. Isso é o que permite servir
várias empresas com o mesmo motor: a Probel não tem custo, a BdC tem; a regra
é a mesma, a cobertura é que muda.

No item, o aviso é individual: "este SKU não tem custo — regra de margem não
se aplica a ele".

### 2.1 Regras de preço (decidem se entra)

**R1 · Meta da tabela** — precisa: preço mínimo (seção 1).
Sugere quando a promoção deixa o preço de vitrine **igual ou abaixo do alvo** e
o que nós recebemos fica **igual ou acima do mínimo menos a tolerância**.
Parâmetro: tolerância (padrão 0% quando o número é piso; 5% quando é alvo —
já é o `promo_tolerancia_pct` / `promo_usar_como_piso` da db/36).

**R2 · O Meli paga a diferença** — precisa: convite co-participado.
Em `SMART`, `PRICE_MATCHING` e `SMART_LIGHTNING` o comprador paga menos do que
nós recebemos, porque o Meli põe uma parte:

- o que nós recebemos (base antes da comissão) = preço cheio × (1 − `seller_percentage`)
- o comprador paga = `price` (ou `total_price_for_boosted_offer` quando há boost)

Se o **comprador paga ≤ alvo** e **nós recebemos ≥ alvo**, essa opção é melhor
que baixar o preço sozinho: vende mais barato e recebe mais. Vai para o topo
da lista com a tag "Meli paga X%".
Exemplo real: GP730 Clássico — baixar para 99,90 sozinho, ou aceitar a
"Massivo FH Houseware Nov": comprador paga 97,49 e nós recebemos 103,49.

**R3 · Baixar preço em campanha própria já ativa** — precisa: item já dentro
de `SELLER_CAMPAIGN`. Se a vitrine está acima do alvo, sugere `PUT` com o alvo.
Pela documentação do Meli, com a campanha começada **o preço só pode descer**
("New deal_price must be lower than current deal_price"). A tela avisa:
"depois de baixar não dá para subir de volta nesta campanha; só tirando o item".
Diferença menor que 2% (ex.: 31,67 → 31,58) **não vira sugestão** — vira a tag
"no alvo".

**R4 · Margem mínima** — precisa: custo. Margem de contribuição no preço que
o comprador paga ≥ M%. Parâmetro: M (padrão por empresa, sobrescrevível por SKU).

**R5 · Faixa de comissão** — precisa: tabela de faixas. Não deixar o preço cair
numa faixa que custe mais do que o desconto rende (tarifa fixa do Meli abaixo
de R$ 79; faixas da Shopee). Mostra "cai de faixa: −R$ 6,75 de tarifa fixa".

**R6 · Rebate** — precisa: tabela do rebate (Probel). Preço ≥ tabela do nível
de rebate negociado para o mês.

### 2.2 Regras de giro (decidem quanto vale a pena dar)

**R7 · Parado** — precisa: pedidos. Sem venda há N dias (padrão 15) e com
estoque: libera uma tolerância maior (padrão +5 pontos) **até a margem
mínima**, nunca abaixo dela. Parâmetros: N dias, tolerância extra.

**R8 · Estoque parado caro** — precisa: estoque + custo. Valor em estoque
parado acima de R$ X → mesma liberação do R7.

**R9 · Girando bem, não precisa** — precisa: pedidos + visitas. Conversão
acima da média da conta e vendendo todo dia → a sugestão sai com a tag "talvez
desnecessário" e desmarcada.

### 2.3 Regras de proteção (decidem o que nunca entra sozinho)

**R10 · Estoque não cobre** — relâmpago com `stock.min` maior que o estoque,
ou estoque abaixo de D dias de venda → não sugere.
**R11 · Pré-acordo** — campanhas `PRE_NEGOTIATED` e as marcadas como acordo
com o comercial do canal ficam fora (preço negociado à mão).
**R12 · Lista de fora** — SKUs ou famílias que a empresa marca como "nunca
automático".
**R13 · Já abaixo do mínimo** — se a vitrine **hoje** já está abaixo do
mínimo, não sugere nada e levanta alerta vermelho (achado real: GPCLASSICO
vendendo a 45,12 com mínimo de 59,90).

### 2.4 O lápis

Toda regra tem parâmetros, e todo parâmetro pode ser trocado em três níveis:

1. **na empresa** (Regras do robô) — vale para tudo;
2. **em massa na lista** — seleciona as linhas, lápis, "tolerância 5 → 3",
   recalcula só as selecionadas;
3. **num item** — lápis na linha, troca preço ou tolerância daquele item.

O recálculo é na hora, na própria tela (é conta, não chamada ao canal). A
linha mostra o valor original riscado e o editado, e o histórico guarda os
dois (a db/44 já guarda `piso_na_hora` e `folga_usada`).

---

## 3. O que cada linha mostra

```
[✓] Foto  SKU · título                      Clássico · estoque 12
    Mínimo 361,68 (tabela BdC nov)   Vitrine hoje 412,80   Cheio 439,15
    → Baixar a Black Interna para 361,68       comprador 361,68 · recebe 361,68
      também cabe: Massivo FH Novembro (Meli 1,5%) comprador 395,59
    Tags: [Black Interna ativa — vale] [3 convites co-participados] [termina 30/11]
    Margem 18% · faixa 11,5% · vendeu 4 em 30 dias          ✎
```

### Tags de situação (o que está valendo de verdade)

O Meli aplica **uma** promoção por vez: a de menor preço ao comprador. O
`sale_price` diz qual é. Então cada promoção do item ganha uma tag:

- **Ativa — vale**: é a que define o preço de vitrine agora.
- **Ativa — encoberta**: está dentro, mas outra mais barata vale no lugar
  (aceitar mais coisa aqui não muda nada até a outra acabar).
- **Agendada**: `pending`, com data de início.
- **Convite**: `candidate`, com prazo (`deadline_date`).
- **Relâmpago**: dia e horário. Em `SMART_LIGHTNING` o horário **só existe
  depois do aceite** — o Meli atribui e devolve; antes disso a tag diz
  "horário definido pelo Meli" e mostra a faixa de unidades (`stock.min`–`max`).
  Depois de começar, não dá para tirar.
- **Boost**: quando `boosted_offer` vem true, o Meli dá desconto extra por
  conta dele — mostrar o valor.

---

## 4. Simulações e "o que falta para chegar"

Para cada item, um painel lateral com:

1. **Preço de melhor desempenho**: dos últimos 90 dias de `pedido_itens`,
   unidades por dia em cada faixa de preço praticado. O preço que mais vendeu
   **por dia em que esteve no ar** (não no total, para não favorecer o preço
   que ficou mais tempo). Cesta e período fixos — a lição da queda do Meli.
2. **Concorrente**: menor oferta do mesmo produto de catálogo
   (`/products/{id}/items`, já usado na concorrência semanal).
3. **O que falta**: entre o preço de melhor desempenho (ou o do concorrente) e
   o mínimo, quanto falta e de onde pode vir:
   - "com rebate de 7% o mínimo cai para X";
   - "a co-participação Y leva o comprador a Z sem mexer no seu recebido";
   - "com custo R$ C (hoje R$ D) a margem fecha";
   - "subir para Premium não compensa: +R$ E de comissão".
4. **Simulador**: digita um preço e vê recebido, comissão, tarifa fixa, frete,
   margem e faixa — a calculadora da Precificação aplicada ao item.

Nada disso chama o canal ao abrir: usa o que já está no banco (seção 5).

---

## 5. Carga e velocidade — sem pesar o banco

O problema de 24/11 (telas de 26–73 s) foi consulta, não máquina. A seção
nova segue estas regras para não repetir:

1. **A tela nunca chama o Meli ao abrir.** Os convites entram pela fila de
   atualização por blocos que já existe (bloco "promoções"), no horário
   agendado e no botão Atualizar.
2. **Gravação por diferença.** Cada linha de `promocao_canal_itens` ganha um
   hash do que importa (status, preço, percentuais, datas). Na sincronização,
   só faz upsert do que mudou. Convites mudam todo dia, mas a maioria das
   linhas não.
3. **A sugestão é calculada uma vez e guardada.** Tabela
   `sugestoes_promocao` (empresa, conta, MLB, promoção, oferta, ação, preço,
   recebido, motivo, tags, regra, hash da entrada). Recalcula quando: a
   sincronização de promoções termina, uma regra muda, a tabela de preço é
   importada, um custo muda. Só os itens afetados.
4. **A tela lê só a tabela pronta**, paginada por chave (keyset), com o resumo
   (quantas, quanto de desconto) numa consulta agregada. Entra no
   `cache-tela.ts` por empresa, como Promoções já entra.
5. **RLS no padrão novo**: `operacao_id in (select operacoes_do_usuario())` —
   nunca a função por linha que travou o banco.
6. **Índices**: `(operacao_id, conta_canal_id, acao)` e `(anuncio_id, inicio)`
   (este já existe na db/47).
7. **Conferência ao vivo só no envio, e só do que foi selecionado**: antes de
   mandar, lê `GET /seller-promotions/items/{MLB}` de cada item selecionado
   (4 por vez) e descarta o que mudou desde o cálculo — convite que sumiu,
   preço do canal que mudou, campanha que acabou. A tela mostra "3 mudaram
   desde a última atualização" antes do botão final.
8. **Cota do Meli**: a documentação diz que o limite é por aplicação e por
   endpoint, e manda usar backoff exponencial com jitter no 429 e evitar
   concorrência alta. Hoje o envio usa 4 em paralelo e para no erro; falta o
   backoff com nova tentativa (só para 429 e 5xx, nunca para 400).

---

## 6. A tela

- Cartão **"Sugeridas"** fixo e destacado como primeiro do carrossel, com o
  número de itens e o prazo mais próximo.
- Abas dentro dele: **Para aceitar** · **Para baixar preço** · **Alertas**
  (abaixo do mínimo, sem custo, sem anúncio) · **Fora por regra** (com o motivo).
- Ordem padrão: prazo de aceite → o Meli paga a diferença → maior desconto ao
  comprador dentro do mínimo.
- Filtros: conta, tipo de promoção, tag, SKU.
- Revisão antes de enviar: "12 aceites, 9 baixas de preço, desconto somado
  R$ 1.240, 2 relâmpagos (não dá para desfazer depois de começar)".
- Resultado item a item ("8 entraram, 2 recusados e por quê"), que o envio já
  devolve.

---

## 7. O que falta no código para isto funcionar

1. **Não existe `PUT`.** `aceitarItem` só faz `POST`. Toda sugestão "baixar
   preço numa campanha já ativa" precisa de `PUT /seller-promotions/items/{MLB}`
   com `promotion_id`, `promotion_type` e `deal_price`. Na lista da BdC de
   25/11 isso é a maioria das linhas.
2. **A fila manda vazio o que as regras de giro precisam.** `gerarFila` passa
   `unidades30`, `visitas30`, `margemPct`, `acos` como `null`. Os dados existem
   no banco; falta ligar.
3. **"Nós recebemos" em co-participada** não é calculado em lugar nenhum; a
   tela compara o `price` do comprador com o piso.
4. **Backoff no 429** (seção 5.8).
5. **Nenhum aceite foi enviado de verdade pela API até hoje** — `decisoes_promocao`
   não tem nenhuma linha `enviada` ou `falhou`. O caminho nunca rodou contra o
   Meli.

---

## 8. Ordem de construção

1. `PUT` em `promocoes-escrita.ts` + teste do corpo. Primeiro envio real com
   1 a 3 itens da lista da BdC, com o Eduardo junto.
2. Importar a tabela de preço mínimo da BdC (Clássico e Premium por SKU) como
   fonte nº 1 da seção 1.
3. `sugestoes_promocao` + cálculo R1, R2, R3, R13 (os que a lista de hoje usou).
4. O cartão "Sugeridas" com as tags e o lápis.
5. Regras de giro e margem (R4, R7–R9) com a tela de Regras do robô e a
   cobertura por empresa.
6. Painel de simulação.

---

## O que foi feito (26/11/2026)

| Peça | Arquivo |
|---|---|
| Motor (regras, giro de estoque, opções, ordem, simulação por faixa de preço) | `src/lib/planilhas/sugestoes-promocao.ts` · teste `scripts/testar-sugestoes-promocao.mjs` |
| Leitura da tabela de preço mínimo + amarelos da aba Black por cima | `src/lib/planilhas/preco-minimo.ts` · teste `scripts/testar-preco-minimo.mjs` |
| PUT para baixar preço em campanha ativa (só desce) + nova tentativa no 429 | `corpo-promocao.ts` (`corpoDaAlteracao`), `promocoes-escrita.ts`, `limite.ts` · teste `scripts/testar-corpo-aceite.mjs` |
| Conferência ao vivo antes do envio (`conferir: true`) | `src/lib/planilhas/conferir-pedido.ts`, `/api/automacoes/enviar` · teste `scripts/testar-conferir-pedido.mjs` |
| Carga por conta (convites por anúncio, vendas 90 dias, catálogo, custo, mínimo) | `src/lib/dados/sugestoes.ts` |
| Rotas | `/api/automacoes/sugestoes`, `/robo`, `/preco-minimo`, `/simulacao` |
| Tela: linha em destaque no topo + painel, lápis, regras do robô, simulação, revisão e envio | `src/components/automacoes/sugeridas.tsx` + `.css`, ligada em `automacoes-cliente.tsx` |
| Migração (tabela de preço mínimo + parâmetros do robô) | `db/52_promocoes_sugeridas.sql` |
| Demonstração com produtos fictícios | `src/lib/demo/fixtures-sugestoes.ts` |

### Decisões tomadas no caminho

- **Convites por anúncio, não por promoção.** A lista de promoções da conta
  (`/seller-promotions/users`) trazia 5 campanhas na BdC; as co-participadas
  em que os anúncios estavam convidados não apareciam nela. Só
  `/seller-promotions/items/{MLB}` mostra tudo. BdC: 105 anúncios em 16 s.
  Conta a prazo da Probel: 753, uns 3 minutos — por isso a tela lê uma conta
  por vez e mostra qual está lendo.
- **A tabela de novembro não foi para a Fórmula base.** Os mesmos 43 SKUs
  estão na Fórmula base de 10/10 com faixas de comissão; forçar a de
  novembro (só Clássico e Premium) lá dentro apagaria as faixas que as outras
  telas usam. Por isso `preco_minimo` próprio, e a Fórmula base vira reserva.
- **O amarelo da aba Black vale por cima.** A aba "Preço Mínimo" e a aba
  "Promoção Black 26" divergem nos amarelos (GP243 Clássico 19,90 × 14,90):
  o amarelo é o preço fechado para a Black. A importação usa a base e aplica
  as células amarelas por cima.
- **Abaixo da tabela começa desmarcado.** A tolerância de giro (parado ou
  estoque sobrando) pode deixar uma oferta passar abaixo do mínimo; essa
  linha aparece com a tag "Abaixo da tabela" e desmarcada, para "marcar
  todas" não levar junto sem ninguém ver.
- **PRICE_DISCOUNT fica fora** — é desconto avulso, sem campanha, e exige datas.

### Para ligar em produção

1. Rodar `db/52_promocoes_sugeridas.sql` no Supabase.
2. Em Promoções abertas › Promoções sugeridas › Importar tabela, subir
   `Tabela de preço Minimo_nov_26 (para importar).xlsx` (já convertido, na
   pasta Downloads). O .xlsb precisa ser salvo como .xlsx.
3. Primeiro envio real: 2 ou 3 itens, com o Eduardo junto.

### Primeiro envio real (26/11, BdC)

11 de 13 entraram, um item por chamada (o Meli não tem endpoint de lote para
`seller-promotions`; o "em massa" é a fila de 4 em paralelo). Os 2 recusados
(423 "Offer Locked" e 400 `OFFER_SIBLING_CREATION_IN_PROCESS`) eram anúncios
irmãos do mesmo produto no mesmo envio — e entraram sozinhos pela cópia do
Meli. Agora `aceitarItem` espera 4/8/12 s, relê o item e só manda de novo se
ele ainda não estiver na promoção (`jaEntrou`, `travadoNoCanal` em
`conferir-pedido.ts`).
