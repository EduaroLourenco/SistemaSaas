# 01 — Leitura das promoções com os itens

Status: resolvido

Estender `src/lib/meli/promocoes-canal.ts` para devolver, além da promoção, os
itens com todos os campos que a tela precisa: `min/max/suggested_discounted_price`,
`meli_percentage`, `seller_percentage`, `offer_id`/`ref_id`, `stock`, `sub_type`,
`fixed_percentage` e os campos de boost.

Paginação por `search_after` (limite 50, cursor expira em 5 min) — não dá para
guardar o cursor entre requisições do usuário, então a varredura de uma
promoção inteira acontece numa chamada só do servidor.

Sem tabela nova: a tela lê ao vivo. Listar os cartões é uma chamada por conta;
os itens só quando o cartão abre.
