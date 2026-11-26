/**
 * A conferência ao vivo antes do envio. Não chama o Mercado Livre.
 *
 * Uso: node scripts/gerar-lib.mjs && node scripts/testar-conferir-pedido.mjs
 */
import { strict as assert } from "node:assert";
import { conferirPedido } from "./lib/conferir-pedido.mjs";

const vai = (r) => { assert.ok(r.vai, `esperava ir e voltou: ${r.motivo}`); return r.pedido; };
const fica = (r) => { assert.ok(!r.vai, "esperava ficar e foi"); return r.motivo; };

/* Formato real de /seller-promotions/items/MLB5188476420 em 25/11/2026. */
const gp524 = [
  { id: "P-MLB18161016", type: "SMART", status: "candidate", price: 395.23, offer_id: "CANDIDATE-MLB5188476420-77573742272" },
  { id: "C-MLB6565848", type: "SELLER_CAMPAIGN", status: "started", price: 412.8 },
  { type: "PRICE_DISCOUNT", status: "candidate", price: 0, max_discounted_price: 417.19 },
];

/* ── Baixar preço (PUT) ── */
{
  const p = vai(conferirPedido({ mlb: "MLB5188476420", promocao: "C-MLB6565848", tipo: "SELLER_CAMPAIGN", preco: 361.68, alterar: true, precoAtual: 412.8 }, gp524));
  assert.equal(p.precoAtual, 412.8);
}
assert.match(
  fica(conferirPedido({ mlb: "MLB5188476420", promocao: "C-MLB6565848", tipo: "SELLER_CAMPAIGN", preco: 361.68, alterar: true, precoAtual: 420 }, gp524)),
  /mudou de 420.00 para 412.80/
);
assert.match(
  fica(conferirPedido({ mlb: "MLB1", promocao: "C-MLB6565848", tipo: "SELLER_CAMPAIGN", preco: 10, alterar: true, precoAtual: 12 }, [])),
  /já não está/
);

/* ── Aceitar co-participada: o preço do canal tem de ser o que a pessoa viu ── */
vai(conferirPedido({ mlb: "MLB5188476420", promocao: "P-MLB18161016", tipo: "SMART", oferta: "CANDIDATE-MLB5188476420-77573742272", tetoDoCanal: 395.23 }, gp524));
assert.match(
  fica(conferirPedido({ mlb: "MLB5188476420", promocao: "P-MLB18161016", tipo: "SMART", oferta: "CANDIDATE-MLB5188476420-77573742272", tetoDoCanal: 390 }, gp524)),
  /mudou a oferta/
);
assert.match(
  fica(conferirPedido({ mlb: "MLB5188476420", promocao: "P-MLB18161016", tipo: "SMART", oferta: "CANDIDATE-OUTRA", tetoDoCanal: 395.23 }, gp524)),
  /não existe mais/
);

/* ── Entrar com preço nosso: o teto pode ter descido ── */
const convite = [{ id: "C-MLB6565848", type: "SELLER_CAMPAIGN", status: "candidate", price: 0, max_discounted_price: 21.75 }];
{
  const p = vai(conferirPedido({ mlb: "MLB5293298598", promocao: "C-MLB6565848", tipo: "SELLER_CAMPAIGN", preco: 14.9 }, convite));
  assert.equal(p.tetoDoCanal, 21.75);
}
assert.match(
  fica(conferirPedido({ mlb: "MLB5293298598", promocao: "C-MLB6565848", tipo: "SELLER_CAMPAIGN", preco: 22 }, convite)),
  /aceita até 21.75/
);
/* Já entrou por outro caminho: não manda de novo. */
assert.match(
  fica(conferirPedido({ mlb: "MLB5188476420", promocao: "C-MLB6565848", tipo: "SELLER_CAMPAIGN", preco: 400 }, gp524)),
  /já entrou/
);

console.log("conferência ao vivo: ok");
