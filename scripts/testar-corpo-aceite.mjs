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
import { corpoDoAceite, corpoDaAlteracao, familiaDe } from "./lib/corpo-promocao.mjs";

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
/* A LIGHTNING recusa aceite sem preço: FINAL_PRICE_LOWER_THAN_ZERO. */
assert.match(erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "LIGHTNING", oferta: "C-1", estoque: 5 })), /preço/);
assert.match(erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "LIGHTNING", oferta: "C-1", estoque: 5, preco: 120, tetoDoCanal: 111.75 })), /sugeriu/);
{
  const c = ok(corpoDoAceite({ mlb: "MLB1", promocao: "LGH-MLB1000", tipo: "LIGHTNING", oferta: "C-1", estoque: 5, preco: 111.75, tetoDoCanal: 111.75 }));
  assert.deepEqual(c, { promotion_type: "LIGHTNING", promotion_id: "LGH-MLB1000", deal_price: 111.75, offer_id: "C-1", stock: 5 });
}
assert.match(erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "DOD", estoque: 2 })), /offer_id/);

/* ── Mudar o preço de quem já está dentro (PUT) ── */
{
  const c = ok(corpoDaAlteracao({ mlb: "MLB1", promocao: "C-MLB6565848", tipo: "seller_campaign", preco: 361.684, precoAtual: 412.8 }));
  assert.deepEqual(c, { promotion_id: "C-MLB6565848", promotion_type: "SELLER_CAMPAIGN", deal_price: 361.68 });
}
/* Com a campanha começada, só desce: igual ou maior é recusa do canal. */
assert.match(erro(corpoDaAlteracao({ mlb: "MLB1", promocao: "C", tipo: "SELLER_CAMPAIGN", preco: 412.8, precoAtual: 412.8 })), /só pode descer/);
assert.match(erro(corpoDaAlteracao({ mlb: "MLB1", promocao: "C", tipo: "SELLER_CAMPAIGN", preco: 450, precoAtual: 412.8 })), /só pode descer/);
/* Cofinanciada e relâmpago não aceitam PUT. */
assert.match(erro(corpoDaAlteracao({ mlb: "MLB1", promocao: "P", tipo: "SMART", preco: 10 })), /não dá para mudar/);
assert.match(erro(corpoDaAlteracao({ mlb: "MLB1", promocao: "P", tipo: "LIGHTNING", preco: 10 })), /não dá para mudar/);
assert.match(erro(corpoDaAlteracao({ mlb: "MLB1", promocao: "C", tipo: "DEAL" })), /preço novo/);

/* ── Tipo desconhecido não vira chamada ── */
assert.match(erro(corpoDoAceite({ mlb: "MLB1", promocao: "P", tipo: "INVENTADA" })), /não sei montar/);

console.log("corpo do aceite: ok");
