/**
 * O corpo do aceite, por tipo de campanha.
 *
 * É o teste que mais importa desta parte: o corpo errado não dá erro
 * aqui — dá uma linha recusada lá, depois de gastar a chamada. E a trava
 * do teto é a que já derrubou uma planilha inteira.
 *
 * Uso: node scripts/testar-corpo-aceite.mjs
 */
import { strict as assert } from "node:assert";
import { corpoDoAceite, familiaDe } from "./lib/corpo-promocao.mjs";

const ok = (r) => { assert.ok(!("erro" in r), `esperava corpo e veio erro: ${r.erro}`); return r.corpo; };
const erro = (r) => { assert.ok("erro" in r, "esperava erro e veio corpo"); return r.erro; };

/* ── As três famílias ── */
assert.equal(familiaDe("DEAL"), "nosso_preco");
assert.equal(familiaDe("SMART"), "aceite");
assert.equal(familiaDe("SMART_LIGHTNING"), "aceite_com_estoque");
assert.equal(familiaDe("coisa_que_nao_existe"), null);

/* ── Nós definimos o preço ── */
{
  const c = ok(corpoDoAceite({ mlb: "MLB1", promocao: "P-MLB9", tipo: "DEAL", preco: 1234.567, tetoDoCanal: 2000 }));
  assert.deepEqual(c, { promotion_type: "DEAL", promotion_id: "P-MLB9", deal_price: 1234.57 });
}
{
  const c = ok(corpoDoAceite({ mlb: "MLB1", promocao: "C-MLB9", tipo: "SELLER_CAMPAIGN", preco: 100, precoTopo: 90 }));
  assert.equal(c.top_deal_price, 90);
}
/* Desconto avulso não pertence a campanha: mandar promotion_id é recusa. */
{
  const c = ok(corpoDoAceite({ mlb: "MLB1", promocao: "nenhuma", tipo: "PRICE_DISCOUNT", preco: 50 }));
  assert.equal(c.promotion_id, undefined);
}
assert.match(erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "DEAL" })), /não veio preço/);

/* ── A trava do teto, que é o ponto ── */
{
  const e = erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "DEAL", preco: 2100, tetoDoCanal: 2000 }));
  assert.match(e, /não pode subir/);
}
/* Igual ao teto passa: só subir é que o canal recusa. */
ok(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "DEAL", preco: 2000, tetoDoCanal: 2000 }));
/* Sem teto conhecido, não inventa trava. */
ok(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "DEAL", preco: 9999 }));

/* ── O canal define: vai o offer_id, nunca o preço ── */
{
  const c = ok(corpoDoAceite({ mlb: "MLB1", promocao: "P-MLB9", tipo: "SMART", oferta: "CANDIDATE-MLB1-77" }));
  assert.deepEqual(c, { promotion_type: "SMART", promotion_id: "P-MLB9", offer_id: "CANDIDATE-MLB1-77" });
  assert.equal(c.deal_price, undefined);
}
assert.match(erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "SMART" })), /offer_id/);
/* A cofinanciada é a exceção: entra só com a promoção. */
{
  const c = ok(corpoDoAceite({ mlb: "MLB1", promocao: "P-MLB9", tipo: "MARKETPLACE_CAMPAIGN" }));
  assert.deepEqual(c, { promotion_type: "MARKETPLACE_CAMPAIGN", promotion_id: "P-MLB9" });
}

/* ── Relâmpago: aceite com quantidade ── */
{
  const c = ok(corpoDoAceite({ mlb: "MLB1", promocao: "P-MLA1", tipo: "SMART_LIGHTNING", oferta: "CANDIDATE-X", estoque: 3.9 }));
  assert.equal(c.stock, 3, "unidade é inteiro, e truncar é mais seguro que arredondar para cima");
  assert.equal(c.deal_price, undefined);
}
assert.match(erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "LIGHTNING", oferta: "C-1" })), /quantidade/);
assert.match(erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "DOD", estoque: 2 })), /offer_id/);

/* ── Tipo desconhecido não vira chamada ── */
assert.match(erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "INVENTADA" })), /não sei montar/);

console.log("corpo do aceite: ok");
