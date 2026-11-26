/**
 * O motor das Promoções sugeridas, com os anúncios reais da Bom de
 * Compras lidos em 25/11/2026. Não chama banco nem canal.
 *
 * Uso: node scripts/gerar-lib.mjs && node scripts/testar-sugestoes-promocao.mjs
 */
import { strict as assert } from "node:assert";
import { desempenhoPorPreco, sugerir, sugerirTodos, giroDoItem, cobertura, estadoDaRegra, REGRAS_DO_ROBO, PARAMETROS_PADRAO as P } from "./lib/sugestoes-promocao.mjs";

const HOJE = new Date("2026-11-26T12:00:00-03:00");
const promo = (o) => ({
  codigo: "X", tipo: "SMART", nome: null, status: "candidate", preco: null, precoCheio: null, minimo: null, maximo: null,
  sugerido: null, meliPct: null, sellerPct: null, oferta: null, inicio: null, fim: null, prazo: null,
  estoqueMin: null, estoqueMax: null, boost: null, ...o,
});
const item = (o) => ({
  contaId: "bdc", contaNome: "Meli", mlb: "MLB1", sku: "SKU", titulo: "t", foto: null, tipoAnuncio: "classico",
  statusAnuncio: "active", estoque: 100, precoCheio: null, minimo: null, custo: null, comissaoPct: null,
  vendas: { u7: 20, u30: 100, u90: 300, ultimaVenda: "2026-11-25T10:00:00-03:00" }, catalogo: null, promos: [], ...o,
});
const black = (o) => promo({ codigo: "C-MLB6565848", tipo: "SELLER_CAMPAIGN", nome: "Oferta Black Interna", ...o });

/* ── GP730 Clássico: a co-participada ganha de baixar sozinho ── */
{
  const s = sugerir(item({
    mlb: "MLB4679320929", sku: "GP730", estoque: 522, precoCheio: 148.9,
    minimo: { valor: 99.9, fonte: "tabela", vigencia: "2026-11-26" },
    promos: [
      promo({ codigo: "P-MLB18251004", nome: "Massivo FH Houseware Nov", preco: 97.49, precoCheio: 148.9, meliPct: 4, sellerPct: 30.5, oferta: "CANDIDATE-MLB4679320929-77851483561" }),
      black({ status: "started", preco: 101.25, precoCheio: 148.9 }),
    ],
  }), P, {}, HOJE);
  assert.equal(s.vitrine, 101.25);
  assert.equal(s.grupo, "aceitar");
  assert.equal(s.recomendada.regra, "meli_paga");
  assert.equal(s.recomendada.comprador, 97.49);
  assert.equal(s.recomendada.recebe, 103.49, "148,90 × (1 − 30,5%)");
  assert.deepEqual(s.recomendada.pedido, { mlb: "MLB4679320929", promocao: "P-MLB18251004", tipo: "SMART", oferta: "CANDIDATE-MLB4679320929-77851483561", estoque: null, tetoDoCanal: 97.49 });
  assert.ok(s.tags.some((t) => t.texto === "Meli paga 4%"));
  /* Baixar a Black de 101,25 para 99,90 é 1,3%: abaixo da diferença mínima, não vira opção. */
  assert.ok(!s.opcoes.some((o) => o.acao === "baixar"));
}

/* ── GP524 Clássico: baixar a Black (PUT), a co-participada fica acima ── */
{
  const s = sugerir(item({
    mlb: "MLB5188476420", sku: "GP524", estoque: 12, precoCheio: 439.15,
    minimo: { valor: 361.68, fonte: "tabela", vigencia: null },
    promos: [
      promo({ codigo: "P-MLB18161016", preco: 395.23, precoCheio: 439.15, meliPct: 0.8, sellerPct: 9.2, oferta: "C1" }),
      black({ status: "started", preco: 412.8, precoCheio: 439.15 }),
    ],
  }), P, {}, HOJE);
  assert.equal(s.grupo, "baixar");
  assert.deepEqual(s.recomendada.pedido, { mlb: "MLB5188476420", promocao: "C-MLB6565848", tipo: "SELLER_CAMPAIGN", preco: 361.68, alterar: true, precoAtual: 412.8 });
}

/* ── GP524 Premium: a Black aceita até 430,25 e o mínimo é 440,58 ── */
{
  const s = sugerir(item({
    tipoAnuncio: "premium", vendas: null, precoCheio: 452.9, minimo: { valor: 440.58, fonte: "tabela", vigencia: null },
    promos: [black({ preco: 0, precoCheio: 452.9, minimo: 90.58, maximo: 430.25 })],
  }), P, {}, HOJE);
  assert.equal(s.grupo, "fora");
  assert.match(s.motivo, /aceita até 430,25/);
}

/* ── GP243 Clássico: convite da Black, entra no mínimo ── */
{
  const s = sugerir(item({
    precoCheio: 22.9, minimo: { valor: 14.9, fonte: "tabela", vigencia: null },
    promos: [black({ preco: 0, precoCheio: 22.9, minimo: 4.58, maximo: 21.75, prazo: "2026-11-30T23:59:00-03:00" })],
  }), P, {}, HOJE);
  assert.equal(s.grupo, "aceitar");
  assert.equal(s.recomendada.acao, "entrar");
  assert.deepEqual(s.recomendada.pedido, { mlb: "MLB1", promocao: "C-MLB6565848", tipo: "SELLER_CAMPAIGN", preco: 14.9, oferta: null, estoque: null, tetoDoCanal: 21.75 });
}

/* ── GPCLASSICO: já vende abaixo do mínimo — alerta, nenhuma ação ── */
{
  const s = sugerir(item({
    precoCheio: 47.5, minimo: { valor: 59.9, fonte: "tabela", vigencia: null },
    promos: [black({ status: "started", preco: 45.12, precoCheio: 47.5 })],
  }), P, {}, HOJE);
  assert.equal(s.grupo, "alerta");
  assert.equal(s.opcoes.length, 0);
  assert.match(s.alertas[0], /45,12.*59,90/);
}

/* ── Diferença de centavos não vira sugestão ── */
{
  const s = sugerir(item({
    precoCheio: 45.9, minimo: { valor: 31.58, fonte: "tabela", vigencia: null },
    promos: [black({ status: "started", preco: 31.67 })],
  }), P, {}, HOJE);
  assert.equal(s.grupo, "no_alvo");
}

/* ── Sem mínimo: alerta, nunca aceita por padrão ── */
{
  const s = sugerir(item({ precoCheio: 100, promos: [promo({ preco: 80, precoCheio: 100, sellerPct: 15, oferta: "C" })] }), P, {}, HOJE);
  assert.equal(s.grupo, "alerta");
  assert.match(s.motivo, /sem preço mínimo/);
}

/* ── Estoque: quanto dura, há quanto não vende ── */
{
  const g = giroDoItem(item({ estoque: 300, vendas: { u7: 0, u30: 30, u90: 60, ultimaVenda: "2026-11-25T10:00:00-03:00" } }), P, HOJE);
  assert.equal(g.vendaDia, 1);
  assert.equal(g.coberturaDias, 300);
  assert.equal(g.sobrando, true);
  assert.equal(g.acabando, false);
}
{
  const g = giroDoItem(item({ estoque: 50, vendas: { u7: 0, u30: 0, u90: 0, ultimaVenda: null } }), P, HOJE);
  assert.equal(g.parado, true, "nunca vendeu em 90 dias e tem estoque");
  assert.equal(g.coberturaDias, null);
}
{
  const g = giroDoItem(item({ estoque: 40000 }), P, HOJE);
  assert.equal(g.semControle, true);
  assert.equal(g.coberturaDias, null, "40.000 é marcador, não saldo");
}
/* Parado libera tolerância extra: uma co-participada 4% abaixo do mínimo passa. */
{
  const base = {
    precoCheio: 100, minimo: { valor: 80, fonte: "tabela", vigencia: null },
    promos: [promo({ preco: 74, precoCheio: 100, sellerPct: 23, meliPct: 3, oferta: "C" })],
  };
  const girando = sugerir(item(base), P, {}, HOJE);
  assert.equal(girando.grupo, "fora", "recebe 77 < 80");
  const parado = sugerir(item({ ...base, vendas: { u7: 0, u30: 0, u90: 2, ultimaVenda: "2026-10-01T10:00:00-03:00" } }), P, {}, HOJE);
  assert.equal(parado.grupo, "aceitar", "parado: mínimo efetivo 76");
  assert.equal(parado.toleranciaUsada, 5);
  assert.equal(parado.marcada, false, "abaixo da tabela só por giro: começa desmarcada");
  assert.ok(parado.tags.some((t) => t.texto.startsWith("Abaixo da tabela")));
}
/* Estoque acabando: a sugestão vem desmarcada, e relâmpago não entra. */
{
  const s = sugerir(item({
    estoque: 5, vendas: { u7: 3, u30: 30, u90: 90, ultimaVenda: "2026-11-25T10:00:00-03:00" },
    precoCheio: 129.9, minimo: { valor: 100, fonte: "tabela", vigencia: null },
    promos: [
      promo({ codigo: "P-MLB18055120", tipo: "SMART_LIGHTNING", preco: 102.66, precoCheio: 129.9, sellerPct: 19.4, oferta: "R", estoqueMin: 5, estoqueMax: 33 }),
      promo({ codigo: "P-MLB18161016", preco: 108.16, precoCheio: 129.9, sellerPct: 15.5, oferta: "S" }),
    ],
  }), P, {}, HOJE);
  assert.equal(s.giro.acabando, true);
  assert.equal(s.marcada, false);
  assert.ok(!s.opcoes.some((o) => o.tipo === "SMART_LIGHTNING"));
}
/* Relâmpago: 30% do estoque, dentro da faixa do Meli. */
{
  const s = sugerir(item({
    estoque: 632, precoCheio: 19.45, minimo: { valor: 14, fonte: "tabela", vigencia: null },
    promos: [promo({ codigo: "P-MLB18055120", tipo: "SMART_LIGHTNING", preco: 15.29, precoCheio: 19.45, sellerPct: 12, meliPct: 9.4, oferta: "R", estoqueMin: 5, estoqueMax: 633 })],
  }), P, {}, HOJE);
  assert.equal(s.recomendada.unidades, 189);
  assert.equal(s.recomendada.pedido.estoque, 189);
}

/* ── O lápis: tolerância e mínimo por item ── */
{
  const base = item({ precoCheio: 100, minimo: { valor: 80, fonte: "tabela", vigencia: null }, promos: [promo({ preco: 75, precoCheio: 100, sellerPct: 22, oferta: "C" })] });
  assert.equal(sugerir(base, P, {}, HOJE).grupo, "fora");
  assert.equal(sugerir(base, P, { toleranciaPct: 3 }, HOJE).grupo, "aceitar", "77,60 ≤ 78");
  assert.equal(sugerir(base, P, { minimo: 70 }, HOJE).grupo, "aceitar");
}

/* ── Margem: nunca recebe abaixo do que fecha a margem ── */
{
  const custo = { mercadoria: 50, embalagem: 2, frete: 0, impostoPct: 10 };
  const base = item({ custo, comissaoPct: 12, precoCheio: 100, minimo: { valor: 70, fonte: "tabela", vigencia: null }, promos: [promo({ preco: 72, precoCheio: 100, sellerPct: 28, oferta: "C" })] });
  assert.equal(sugerir(base, P, {}, HOJE).grupo, "aceitar");
  const comMargem = sugerir(base, { ...P, margemMinimaPct: 10 }, {}, HOJE);
  assert.equal(comMargem.grupo, "fora", "52 / (1 − 0,32) = 76,47 > 72");
}

/* ── Pré-acordo e lista de fora ── */
{
  const base = item({ sku: "PA1", precoCheio: 100, minimo: { valor: 80, fonte: "tabela", vigencia: null }, promos: [promo({ tipo: "PRE_NEGOTIATED", preco: 85, precoCheio: 100, sellerPct: 10, oferta: "C" })] });
  assert.equal(sugerir(base, P, {}, HOJE).grupo, "fora");
  assert.equal(sugerir(base, { ...P, regrasDesligadas: ["pre_acordo"] }, {}, HOJE).grupo, "aceitar");
  assert.equal(sugerir(base, { ...P, regrasDesligadas: ["pre_acordo"], listaFora: ["pa1"] }, {}, HOJE).motivo, "na lista de fora");
}

/* ── Regra sem dado desliga sozinha ── */
{
  const itens = [item({}), item({ mlb: "MLB2" })];
  const cob = cobertura(itens);
  assert.deepEqual(cob.custo, { tem: 0, total: 2 });
  const margem = REGRAS_DO_ROBO.find((r) => r.codigo === "margem");
  assert.deepEqual(estadoDaRegra(margem, P, cob), { ligada: false, motivo: "0 de 2 com custo" });
}

/* ── A ordem da lista: aceitar antes de baixar, alertas depois ── */
{
  const lista = sugerirTodos([
    item({ mlb: "A", precoCheio: 47.5, minimo: { valor: 59.9, fonte: "tabela", vigencia: null }, promos: [black({ status: "started", preco: 45.12 })] }),
    item({ mlb: "B", precoCheio: 439.15, minimo: { valor: 361.68, fonte: "tabela", vigencia: null }, promos: [black({ status: "started", preco: 412.8 })] }),
    item({ mlb: "C", precoCheio: 22.9, minimo: { valor: 14.9, fonte: "tabela", vigencia: null }, promos: [black({ preco: 0, maximo: 21.75 })] }),
  ], P, new Map(), HOJE);
  assert.deepEqual(lista.map((s) => s.item.mlb), ["C", "B", "A"]);
}

/* ── Desempenho por preço: por dia no ar, não no total ── */
{
  const d = (data, preco, unidades, estoque = 10) => ({ data, preco, unidades, visitas: 100, estoque });
  const dias = [
    ...Array.from({ length: 20 }, (_, k) => d("a" + k, 120, 1)),      // 20 dias a 120: 1/dia
    ...Array.from({ length: 5 }, (_, k) => d("b" + k, 101.5 + k * 0.1, 3)), // 5 dias perto de 101: 3/dia
    d("c", 90, 9),                                                     // 1 dia a 90: sorte
    d("z", 80, 0, 0),                                                  // sem estoque: fora
    d("n", null, 4),                                                   // sem preço lido: fora
  ];
  const r = desempenhoPorPreco(dias);
  assert.equal(r.faixas.length, 3);
  assert.equal(r.melhor.de, 101.5, "a faixa de 1 dia não ganha");
  assert.equal(r.melhor.porDia, 3);
  assert.equal(r.faixas.find((f) => f.de === 120).unidades, 20);
}

console.log("promoções sugeridas: ok");
