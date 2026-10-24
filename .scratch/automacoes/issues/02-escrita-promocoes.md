# 02 — Entrar e sair de promoção pela API

Status: aberto
Blocked by: 01

`src/lib/meli/promocoes-escrita.ts`, único lugar que monta o corpo por tipo
(ver spec, seção 1). Usa `meliEscrever`, que já existe e já passa pelo portão.

Cada envio devolve item a item: enviado, recusado com o motivo do canal, ou
não tentado. Nada de "deu certo" agregado — o canal recusa linha a linha e é
assim que o resultado tem de voltar para a tela.

A primeira chamada de verdade na conta do Eduardo só sai com ele junto.
