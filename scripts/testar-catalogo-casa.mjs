/**
 * Catálogo: perder para o próprio anúncio não é perder.
 *
 * O dono pegou isto antes de eu apresentar o número errado. A Probel
 * tem duas contas, e dos 169 produtos de catálogo com algum anúncio
 * "disputando", TODOS os 169 têm outro anúncio da casa ganhando. O
 * padrão é sempre o mesmo: o clássico ganha e o premium do mesmo
 * produto aparece atrás, porque custa mais — comissão 16,5% contra
 * 11,5%.
 *
 * Eu ia apresentar "34 SKUs perdendo catálogo por menos de R$ 25, o
 * primeiro por R$ 1,26, é a ação mais barata que existe". Seguir isso
 * teria trocado venda de margem boa por margem pior, sem ganhar
 * visita nenhuma.
 *
 * A regra abaixo é a de `carregarDisputa`, replicada.
 */
import assert from "node:assert/strict";

/** Quem ganha cada produto de catálogo, entre os nossos anúncios. */
function vencedores(anuncios) {
  const m = new Map();
  for (const a of anuncios) {
    if (!a.produto) continue;
    if (a.situacao === "ganhando" || a.situacao === "dividindo") m.set(a.produto, a.mlb);
  }
  return m;
}

/** A leitura de uma linha, como a tela monta. */
function linha(a, venc) {
  const ganha = a.situacao === "ganhando" || a.situacao === "dividindo";
  const vencedor = a.produto ? venc.get(a.produto) ?? null : null;
  const casaJaGanha = Boolean(vencedor) && vencedor !== a.mlb;
  const falta =
    !ganha && !casaJaGanha && a.meuPreco != null && a.paraGanhar != null && a.meuPreco > a.paraGanhar
      ? +(a.meuPreco - a.paraGanhar).toFixed(2)
      : null;
  return { casaJaGanha, vencedorDaCasa: casaJaGanha ? vencedor : null, faltaReais: falta };
}

/* ══ 1. O caso real: clássico ganha, premium "disputa" ══
   PA51521 em 21/10/2026: clássico R$ 518,81 ganhando, premium
   R$ 625,05 competindo com "preço para ganhar" R$ 538. */
{
  const ads = [
    { mlb: "MLB5904901678", produto: "P1", situacao: "ganhando", meuPreco: 518.81, paraGanhar: 518 },
    { mlb: "MLB5903964028", produto: "P1", situacao: "competindo", meuPreco: 625.05, paraGanhar: 538 },
  ];
  const v = vencedores(ads);
  const classico = linha(ads[0], v);
  const premium = linha(ads[1], v);

  assert.equal(classico.casaJaGanha, false, "quem ganha não 'perde para a casa'");
  assert.equal(premium.casaJaGanha, true, "o premium perde para o clássico da própria casa");
  assert.equal(premium.vencedorDaCasa, "MLB5904901678");
  assert.equal(
    premium.faltaReais, null,
    "não se mostra 'falta R$ 87' para quem perderia a venda do próprio clássico",
  );
}

/* ══ 2. Perder de verdade continua aparecendo ══ */
{
  const ads = [
    { mlb: "MLB_NOSSO", produto: "P2", situacao: "competindo", meuPreco: 1000, paraGanhar: 950 },
  ];
  const l = linha(ads[0], vencedores(ads));
  assert.equal(l.casaJaGanha, false, "ninguém da casa ganha este produto");
  assert.equal(l.faltaReais, 50, "aqui baixar R$ 50 ganha a vitrine de verdade");
}

/* ══ 3. Anúncio fora do catálogo não tem produto, e não é afetado ══ */
{
  const ads = [{ mlb: "MLB_SOLTO", produto: null, situacao: "competindo", meuPreco: 800, paraGanhar: 700 }];
  const l = linha(ads[0], vencedores(ads));
  assert.equal(l.casaJaGanha, false);
  assert.equal(l.faltaReais, 100);
}

/* ══ 4. Dividindo o primeiro lugar conta como ganhar ══
   Quem divide já aparece na página; o irmão atrás dele não precisa
   baixar preço. */
{
  const ads = [
    { mlb: "MLB_A", produto: "P3", situacao: "dividindo", meuPreco: 300, paraGanhar: 300 },
    { mlb: "MLB_B", produto: "P3", situacao: "competindo", meuPreco: 360, paraGanhar: 305 },
  ];
  const v = vencedores(ads);
  assert.equal(linha(ads[1], v).casaJaGanha, true);
  assert.equal(linha(ads[1], v).faltaReais, null);
}

/* ══ 5. Produtos diferentes não se cobrem ══
   Ganhar o Queen não resolve o Solteiro: são páginas diferentes. */
{
  const ads = [
    { mlb: "MLB_QUEEN", produto: "P_QUEEN", situacao: "ganhando", meuPreco: 4229, paraGanhar: 4229 },
    { mlb: "MLB_SOLT", produto: "P_SOLT", situacao: "competindo", meuPreco: 2351, paraGanhar: 2200 },
  ];
  const v = vencedores(ads);
  assert.equal(linha(ads[1], v).casaJaGanha, false, "produto diferente, disputa diferente");
  assert.equal(linha(ads[1], v).faltaReais, 151);
}

console.log(
  "OK: perder para o próprio anúncio vira 'a casa já ganha' sem sugestão de preço, e perder de verdade continua sendo perder.",
);
