# Aceitar em massa, sem deixar de conferir

Status: proposta
Pedido do Eduardo: *"aceitar automaticamente, subscrever automaticamente,
e fazer em massa, com regras de tolerância etc, mas que eu confiro e vejo
o produto e promoção antes de aceitar."*

As duas metades desse pedido brigam. Automático é o que acontece sem
ninguém olhar; conferir é olhar. O que concilia as duas é separar **quem
decide** de **quando sai** — a regra decide sozinha, o envio espera o
aceite. Abaixo, em três degraus, do que já existe ao que é mais arriscado.

## Degrau 1 — a régua, que já está de pé

Hoje a tela já faz a parte difícil: para cada item convidado ela sabe o
piso, a folga, o teto do canal e em que faixa de comissão o preço fecha.
Mudar a folga no topo reclassifica as 36 promoções na hora.

O que falta aqui é só memória: a folga volta a 5% a cada visita.

**Proposta**: guardar a régua por operação e por tipo de campanha, em
`regras_automacao` — a mesma ideia do painel de regras que ele já pediu
em outra conversa. Uma linha por regra:

```
operacao | tipo_campanha | folga_pct | reescrever | so_com_estoque | curva | ativa
```

Com isso a Probel pode ter 5% nas automáticas e 0% no pré-acordo, que é
como ela já trabalha na planilha.

## Degrau 2 — a fila de aprovação

É o que entrega o pedido inteiro sem abrir mão de nada.

1. **A regra roda sozinha**, de madrugada, em cima do que o canal
   convidou. Não envia: escreve em `aceites_pendentes` o que ela decidiu
   e por quê — item, promoção, preço que iria, faixa que sobra, e o
   motivo em uma linha.
2. **De manhã a tela mostra a fila**, agrupada por promoção, com o prazo
   de aceite na frente. O Eduardo vê produto, preço e promoção, desmarca
   o que não quer, e aprova o resto num clique.
3. **O envio é o que já existe**: `aceitarEmLote`, quatro por vez, com o
   resultado voltando item a item.

O ganho real está no passo 1: hoje ele abre promoção por promoção para
descobrir o que cabe. A fila inverte — chega pronta, ele só tira.

**O que a fila precisa guardar**, e é o que a torna auditável:

```
quando · promocao · mlb · decisao (aceitar | reescrever | recusar)
preco_proposto · piso_na_hora · folga_usada · faixa_resultante
motivo · aprovado_por · aprovado_em · resposta_do_canal
```

`piso_na_hora` é o detalhe que parece bobo e não é: a Fórmula base muda
de vigência, e sem congelar o piso do momento ninguém consegue explicar
em dezembro por que uma linha foi aceita em novembro.

## Degrau 3 — aceite sem clique, com coleira

Só para o caso em que esperar custa a oferta: relâmpago e oferta do dia,
que abrem e fecham no mesmo dia.

Mesmo aí, não solto. Três coleiras:

- **Teto de exposição**: no máximo N itens e R$ X de desconto somado por
  dia, por conta. Estourou, vira fila de aprovação.
- **Lista de fora**: SKU ou curva que nunca entra sozinho.
- **Janela**: só nas campanhas marcadas como automáticas na regra, nunca
  em pré-acordo — ali o preço foi negociado a dedo.

E um aviso por onde ele já lê: o que entrou sozinho aparece no dia
seguinte com o que custou, para ele desligar a coleira se não gostar.

## O que NÃO entra em automação nenhuma

- **Subir preço.** O canal recusa, e a trava já está em
  `corpo-promocao.ts`. Automatizar isso é automatizar recusa.
- **Sair de promoção em massa.** Tirar item de campanha ativa derruba
  posição de catálogo, e o estrago não desfaz com um botão.
- **Pré-acordo.** O preço ali é negociado com o comercial do canal; um
  robô aceitando por cima disso queima a negociação.
- **Qualquer coisa numa conta cuja aplicação de escrita não esteja
  conectada.** A revisão já diz isso antes do clique.

## Ordem

1. `regras_automacao` + a folga lembrada por tipo de campanha. É pequeno
   e tira o retrabalho diário.
2. A fila de aprovação (degrau 2) — é onde está quase todo o ganho.
3. O degrau 3 só depois de o envio manual ter rodado algumas semanas sem
   susto. Antes disso, não.

## O que falta saber antes de começar

- O teste manual de escrita ainda não aconteceu. Enquanto o canal não
  aceitar um item nosso de verdade, o degrau 2 é teoria.
- Em campanha com redução de tarifa o motor ainda não reescreve preço
  (`Caso A` devolve `newPrice: null`). Se o canal passou a aceitar isso
  pelo painel, como ele suspeita, muda o que a regra pode propor — e esse
  teste também está pendente.
