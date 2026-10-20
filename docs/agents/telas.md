# Como construir uma tela aqui

Leia antes de criar ou redesenhar qualquer tela. Não é teoria de design: é a
lista do que já deu errado neste produto e do que o dono pediu.

O sistema de cor e espaçamento já existe — tokens em `src/app/globals.css`,
componentes em `src/components/ui/`. Esta página é sobre **decisão de tela**,
não sobre paleta.

## O ciclo (não pule)

1. **Olhe o dado antes de desenhar.** Rode a função de carga contra o banco real
   e veja os números que a tela vai mostrar. Tela desenhada com número inventado
   cabe no exemplo e não cabe na vida: 206 produtos numa campanha, título de
   colchão com 68 caracteres, veredito nulo em metade das linhas.
2. **Monte a tela fora do app primeiro**, como página solta com o dado real, e
   abra no navegador. O app pede sessão; a página solta não, e o ciclo fica curto.
3. **Tire print do SEU resultado e compare com o alvo.** Print para "ver a tela"
   é desperdício; print para conferir o que você acabou de fazer é o que impede o
   resultado genérico. Confira em duas larguras: 1280 e 390.
4. **Só então reconstrua no código do app.**

## O que o dono pediu, em ordem

- **Telefone é diferencial, não adaptação.** Ele trabalha andando, consultando
  pelo celular. Tela que só funciona no desktop está errada, não "pendente".
- **Sem cara de IA.** O que produz essa cara: parágrafo explicativo no meio do
  dado, cartão genérico repetido, texto que descreve o que o número já diz.
- **Maior, mais visual, mais fácil de navegar.** Número grande onde a decisão
  está; detalhe atrás de um clique.

## Formas: o que usar

| O dado é | Use | Nunca |
|---|---|---|
| Um número que resume a tela | número herói (≥48px, sans) | gráfico de uma barra |
| Punhado de números de topo | fila de cartões, cada um com comparação | gráfico de barras agrupadas |
| Uma série no tempo | linha; área se for uma só | — |
| Uma série importa, o resto é contexto | **ênfase**: a série na cor, o resto em cinza | categórico com 8 cores |
| Mais de ~7 itens que todos importam | **tabela** | mais cores |
| Antes → depois por item | dumbbell, ou tabela com as duas colunas | duas barras soltas |

Tabela é para investigar, gráfico é para enxergar. As duas coisas na mesma tela
é certo; a mesma informação nas duas é ruído.

## Proibido

- **Dois eixos y no mesmo gráfico.** É o erro mais caro: o alinhamento das duas
  escalas é arbitrário e a tela inventa uma correlação que não existe no dado.
  Duas séries de grandeza diferente viram dois gráficos, ou as duas indexadas a
  100 no início.
- **Coluna que só mostra "—".** Linha sem dado não ganha três colunas vazias; ela
  diz o motivo de não ter dado, uma vez.
- **Número em todo ponto do gráfico.** Rotule o extremo, a ponta, o que a história
  precisa. O resto fica no eixo e na tabela.
- **Cor por posição no ranking.** A cor segue o produto, não a linha. Filtrar não
  pode repintar quem sobrou.
- **Gradiente de valor em categoria sem ordem.** Produto, conta e canal não têm
  ordem natural: uma cor para a série inteira.
- **Linha tracejada em grade ou eixo.** Fio sólido, um tom fora da superfície.
- **Tooltip como único caminho para o valor.** No telefone não há hover.
- **Filtro dentro do cartão.** Uma faixa de filtro acima de tudo que ela recorta.

## Vazio, parcial e ausente são três coisas

Esta é a regra que mais se quebra aqui, e a que mais gerou pergunta do dono.

- **Zero** é "mediu e deu zero".
- **Nulo** é "não mediu" — dia sem coleta, anúncio pausado, janela fora do
  alcance da API. Mostre travessão e, se couber, o motivo.
- **Parcial** é "ainda está acontecendo". Diga, não compare como se estivesse
  fechado.

Três vezes num mesmo dia o dono achou que o sistema estava desatualizado quando
o dado estava certo: o anúncio estava pausado, a campanha media por anúncio e ele
lia por SKU, a leitura de catálogo era da madrugada. **Quando a tela não tem o
que mostrar, ela diz por quê, na própria linha.**

## Telefone

- Largura de referência 390px. Nada de rolagem horizontal na página.
- Tabela larga rola dentro do próprio quadro, com a primeira coluna fixa.
- Alvo de toque mínimo 44px. Nada que dependa de hover.
- A ordem muda: no telefone, primeiro o número e a decisão; o detalhe desce.

## Antes de dar por pronta

- [ ] Abre em 390px sem rolagem lateral e sem texto cortado
- [ ] Linha sem dado diz o motivo
- [ ] Nenhum gráfico com dois eixos
- [ ] Nome de produto aparece inteiro (o dono cobrou duas vezes)
- [ ] Todas as colunas de tabela ordenam
- [ ] O número que decide é o maior da tela
