# Regras personalizadas de promoção

Status: estudo, antes de codar
Pedido: criar regras do tipo **SE (condição) ENTÃO (ação)**, salvar por
conta do Mercado Livre, e apertar um botão para aplicar — como a tela de
promoção da Wake.

## 1. O que dá para perguntar, hoje, com dado de verdade

Conferi campo por campo na Probel antes de desenhar. A tabela abaixo é a
lista honesta: a coluna da direita é o que existe preenchido.

### Serve (dado completo)

| Condição | De onde vem | Cobertura |
|---|---|---|
| Tipo de campanha | o canal | 100% |
| Nome da campanha contém… | o canal | 100% |
| Conta | nossa | 100% |
| Clássico ou premium | `anuncios.tipo` | 100% |
| Anúncio ativo / pausado | `anuncios.status` | 100% |
| Estoque maior/menor que N | `anuncios.estoque` | 100%, com a ressalva do 40.000 |
| SKU está na lista / começa com | `anuncios.sku_canal` | 100% |
| Vendas nos últimos N dias | pedidos não cancelados | 100% |
| Visitas nos últimos N dias | relatório semanal | 100% dos que o canal reporta |
| Conversão nos últimos N dias | as duas acima | idem |
| Situação no catálogo | `anuncio_catalogo_diario` | 1.147 de 1.267 anúncios |
| Família (os irmãos do catálogo) | `anuncios.familia_nome` | 1.147 de 1.267 |
| Desconto que o canal propõe, em % | o canal + preço cheio | 100% dos que têm preço |
| **Faixa de comissão que sobra** | Fórmula base | 100% dos que têm tabela |
| Quanto o canal põe (meli %) | o canal | só onde ele informa |
| ACOS / investimento em Ads | `anuncio_ads` | só quem tem mídia |

### NÃO serve hoje — o dado não existe

| Condição | Por quê |
|---|---|
| **Margem** | 8 de 716 produtos da Probel têm custo cadastrado. Uma regra de margem valeria para 1% do catálogo e pareceria valer para tudo. |
| Margem mínima por produto | zero produtos preenchidos |
| Frete por unidade | zero preenchidos |
| **Curva A/B/C** | zero preenchidos |
| Categoria | zero preenchidos |

Isso não é motivo para tirar margem do desenho — é motivo para a regra
**dizer o que fazer quando não sabe**. Toda condição tem um terceiro
caminho além de sim e não: *não deu para saber*. Sem isso, "margem maior
que 20%" reprovaria 708 produtos por falta de cadastro, silenciosamente.

### A armadilha do estoque

`estoque = 40.000` é o marcador de "sem controle de estoque", não saldo.
Uma regra "estoque maior que 50" aceita esses sem querer. Então a
condição de estoque tem três opções: *maior que*, *menor que* e **"tem
controle de estoque"**.

## 2. A faixa é a condição que faltava na planilha

A planilha compara preço com piso e devolve sim ou não. A faixa responde
melhor: **em que comissão aquele preço ainda fecha**.

Clássico paga 11,5% cheio. Se o que sobra equivale a 6,5%, o desconto
consumiu 5 pontos de rebate. É a mesma conta que ele já faz no
pré-acordo, e permite escrever a regra do jeito que ele pensa:

> aceitar enquanto sobrar pelo menos 8,5% de comissão

em vez de "tolerar 5% abaixo do piso", que muda de significado conforme
o produto.

As duas formas ficam disponíveis — tolerância em % sobre o piso, e piso
de faixa — porque ele já pensa na primeira.

## 3. O formato da regra

Uma regra é uma lista de condições que precisam bater **todas**, e uma
ação. As regras são **ordenadas, e a primeira que bate decide** — é o que
torna o conjunto legível: a exceção vem em cima, o geral embaixo.

```
Regra
  nome              "Relâmpago só no que gira"
  conta             uma conta do Meli, ou todas
  ativa             sim / não
  ordem             1, 2, 3…
  condicoes[]       { campo, operador, valor }   (E entre elas)
  acao              { tipo, folgaPct?, faixaMinima? }
  quandoNaoSei      pular | recusar | mandar para conferência
```

### Ações

| Ação | O que faz |
|---|---|
| **Aceitar** | entra no preço que o canal propôs |
| **Reescrever com folga X%** | escreve piso × (1 − X), respeitando o teto do canal |
| **Reescrever até a faixa Y%** | escreve o preço daquela faixa da Fórmula base |
| **Não entrar** | deixa de fora, com o motivo |
| **Mandar para conferência** | não decide; separa para o olho humano |

"Reescrever" só existe onde o canal aceita preço — DEAL, campanha própria
e desconto avulso. Em SMART, pré-acordo e cofinanciada **não há campo de
preço na API**: ou aceita o dele, ou não entra. A tela precisa esconder a
ação em vez de oferecer o que vai falhar.

### Exemplos no formato dele

```
SE  tipo da campanha = Relâmpago
E   vendas nos últimos 30 dias < 10
ENTÃO mandar para conferência

SE  tipo da campanha = Automática
E   faixa que sobra >= 8,5%
ENTÃO aceitar

SE  anúncio é premium
E   situação no catálogo = ganhando
ENTÃO reescrever com folga 3%

SE  estoque tem controle
E   estoque < 5
ENTÃO não entrar
```

## 4. As telas

**Lista de regras** (`/automacoes/regras`): as regras na ordem em que
rodam, com arrastar para reordenar, ligar/desligar, duplicar. Uma linha
por regra, escrita em português: *"Relâmpago com menos de 10 vendas →
conferência"*. Sem jargão de campo.

**Editor**: condição a condição, com o campo primeiro — escolher o campo
troca os operadores e o tipo do valor. Abaixo, **a prévia**: quantos dos
itens convidados hoje bateriam nessa regra, por conta. É o que impede
regra escrita no escuro.

**Aplicar**: na tela de promoções, um botão *Aplicar regras*. Ele não
envia — preenche a decisão e o preço de cada linha, e a pessoa revisa como
já revisa hoje. O caminho continua **marcar → revisar → enviar**.

Cada linha decidida mostra **qual regra a decidiu**. Sem isso ninguém
confia no conjunto nem acha a regra errada.

## 5. O que guardar

```sql
regras_promocao
  id, operacao_id, conta_canal_id (null = todas), nome, ativa, ordem,
  condicoes jsonb, acao jsonb, quando_nao_sei text,
  criada_por, criada_em, atualizada_em
```

E, quando a regra decide algo que foi enviado, o registro guarda a regra
junto — senão em dezembro ninguém explica por que a linha entrou em
novembro.

## 6. Ordem de construção

1. A migração e o avaliador puro, com teste. O avaliador é regra pura:
   recebe item + regras, devolve decisão + qual regra decidiu.
2. O botão *Aplicar regras* na tela de promoções, usando o avaliador.
3. A lista e o editor de regras, com a prévia.
4. Guardar a regra junto do envio.

O avaliador vem primeiro de propósito: é onde mora o erro caro, e é a
parte que dá para testar sem tela.
