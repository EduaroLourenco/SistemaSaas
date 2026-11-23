// Testa os gatilhos do acompanhamento (src/lib/acompanhamento/gatilhos.ts) com casos já vistos.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";
const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { avaliarGatilhos } = await jiti.import(path.join(raiz, "src/lib/acompanhamento/gatilhos.ts"));

const lado = (o) => ({ receita: 0, unidades: 0, pedidos: 0, visitas: null, conversao: null, precoVendido: null, precoVitrine: null, ...o });
const linha = (o) => ({ codigo: "X", sku: "X", titulo: "X", curva: "A", antes: lado({}), agora: lado({}), delta: 0, deltaPct: null, diasSemEstoque: 0, status: "active", precoAtual: null, estoqueAtual: null, sobEncomenda: false, catalogo: null, causa: "estável", explicacao: "", ...o });
const base = (o) => ({ de: "2026-11-12", ate: "2026-11-18", hoje: "2026-11-22", dias: 7, diasAnterior: 7, totais: { antes: lado({ receita: 1000, unidades: 10, pedidos: 10 }), agora: lado({ receita: 1000, unidades: 10, pedidos: 10 }) }, linhas: [], saude: [], midia: [], promocoes: [], convites: [], acoes: [], ...o });
const ids = (g) => g.map((x) => x.id);

// Luminária (cenário Atlas, 05–11/11 × 12–18/11): preço sobe, visitas iguais, conversão cai.
const luminaria = linha({
  codigo: "AT-LUZ-02", sku: "AT-LUZ-02", titulo: "Luminária de mesa Arco",
  antes: lado({ receita: 4558.1, unidades: 19, pedidos: 19, visitas: 952, conversao: 2.0, precoVitrine: 239.9 }),
  agora: lado({ receita: 2849.99, unidades: 11, pedidos: 11, visitas: 952, conversao: 1.16, precoVitrine: 259.09 }),
  delta: -1708.11, causa: "preço subiu", precoAtual: 259.09,
});
let g = avaliarGatilhos(base({ linhas: [luminaria], convites: [{ sku: "at-luz-02", mlb: "MLB1", promocao: "Black", tipo: "DEAL", preco: 229.9, fim: "2026-12-01" }, { sku: "AT-LUZ-02", mlb: "MLB1", promocao: "Velha", tipo: "SMART", preco: 199, fim: "2026-11-01" }] }));
const g08 = g.find((x) => x.id === "G08");
assert.ok(g08, "preço subiu dispara G08");
assert.equal(g08.slide, "S5");
assert.equal(g08.hipotese, true, "preço é hipótese");
assert.ok(g08.texto.includes("visitas 0% · conversão -42% · vitrine +8%"), g08.texto);
const g18 = g.find((x) => x.id === "G18");
assert.ok(g18, "convite abaixo do preço atual dispara G18");
assert.equal(g18.numeros.precoConvite, 229.9, "convite vencido não conta");

// Denominador mínimo: −80% em 3 visitas e 1 pedido não dispara.
g = avaliarGatilhos(base({ linhas: [linha({ antes: lado({ receita: 100, unidades: 1, pedidos: 1, visitas: 3 }), agora: lado({ receita: 20, visitas: 1 }), delta: -80, causa: "perdeu visitas" })] }));
assert.deepEqual(ids(g), []);

// Ruptura: 3 dias sem estoque numa curva A que vendia R$ 700/semana → ~R$ 300 perdidos.
g = avaliarGatilhos(base({ linhas: [linha({ antes: lado({ receita: 700, unidades: 7, pedidos: 7 }), agora: lado({ receita: 400, unidades: 4, pedidos: 4 }), delta: -300, diasSemEstoque: 3, causa: "sem estoque" })] }));
assert.deepEqual(ids(g), ["G10"], "sem estoque vira ruptura, não queda genérica");
assert.equal(g[0].numeros.vendaPerdidaEstimada, 300);

// Ruptura iminente, e estoque "sem controle" não conta.
const ritmo = { antes: lado({ receita: 1400, unidades: 14, pedidos: 14 }), agora: lado({ receita: 1400, unidades: 14, pedidos: 14 }) };
assert.deepEqual(ids(avaliarGatilhos(base({ linhas: [linha({ ...ritmo, estoqueAtual: 5 })] }))), ["G11"]);
assert.deepEqual(ids(avaliarGatilhos(base({ linhas: [linha({ ...ritmo, estoqueAtual: 99999 })] }))), []);
assert.deepEqual(ids(avaliarGatilhos(base({ linhas: [linha({ ...ritmo, estoqueAtual: 5, curva: "C" })] }))), []);

// Catálogo: conta SP que ganhava e passou a perder (13/10).
g = avaliarGatilhos(base({ linhas: [linha({ ...ritmo, catalogo: { antes: { ganhando: 7, dias: 7 }, agora: { ganhando: 1, dias: 7 } } })] }));
assert.deepEqual(ids(g), ["G13"]);

// Total: queda de 20% e unidade × receita divergentes.
g = avaliarGatilhos(base({ totais: { antes: lado({ receita: 1000, unidades: 10, pedidos: 10 }), agora: lado({ receita: 800, unidades: 12, pedidos: 12 }) } }));
assert.deepEqual(ids(g).sort(), ["G03", "G05"]);

// Promoção: base pequena não dá veredito; fora do período também não.
const promo = (o) => ({ id: "p", nome: "Black", processadaEm: "2026-11-10", dias: 14, participam: 10, receitaParticipantes: { antes: 5000, agora: 9000 }, crescimento: 80, efeito: 30, veredito: "deu certo", ...o });
assert.deepEqual(ids(avaliarGatilhos(base({ promocoes: [promo({})] }))), ["G19"]);
assert.deepEqual(ids(avaliarGatilhos(base({ promocoes: [promo({ receitaParticipantes: { antes: 50, agora: 1000 } })] }))), [], "+1900% sobre R$ 50 não é veredito");
assert.deepEqual(ids(avaliarGatilhos(base({ promocoes: [promo({ processadaEm: "2026-10-01" })] }))), [], "janela acabou antes do período");
assert.deepEqual(ids(avaliarGatilhos(base({ promocoes: [promo({ veredito: "cedo demais" })] }))), []);

// Saúde e dia parcial vêm primeiro.
g = avaliarGatilhos(base({ ate: "2026-11-22", saude: [{ id: "api", pergunta: "A API está viva?", estado: "problema", resposta: "parada desde 20/11" }], linhas: [luminaria] }));
assert.deepEqual(ids(g).slice(0, 2), ["G01", "G02"]);

// Catálogo com 1 de 2 dias medidos não é estado; mídia de troco não é pauta; "atenção" na saúde não é pauta.
assert.deepEqual(ids(avaliarGatilhos(base({ linhas: [linha({ ...ritmo, catalogo: { antes: { ganhando: 1, dias: 2 }, agora: { ganhando: 1, dias: 14 } } })] }))), []);
const midia = (inv) => ({ mlb: "MLB9", sku: "S", titulo: "T", acao: "desligar", motivo: "sem venda", investimento: inv, receitaReal: 0, conversao: null, visitas: 10 });
assert.deepEqual(ids(avaliarGatilhos(base({ midia: [midia(0.47)] }))), []);
assert.deepEqual(ids(avaliarGatilhos(base({ midia: [midia(36.76)] }))), ["G16"]);
assert.deepEqual(ids(avaliarGatilhos(base({ saude: [{ id: "custo", pergunta: "Tem custo?", estado: "atencao", resposta: "124 sem custo" }] }))), []);

// Reputação: nível que cai ou taxa que sobe 50% e passa de 1%.
const rep = (o) => ({ nivel: "5_green", reclamacoes: 0.005, cancelamentos: 0.004, atrasos: 0.02, ...o });
assert.deepEqual(ids(avaliarGatilhos(base({ reputacao: [{ conta: "SP", antes: rep({}), agora: rep({ nivel: "4_light_green" }) }] }))), ["G24"]);
assert.deepEqual(ids(avaliarGatilhos(base({ reputacao: [{ conta: "SP", antes: rep({}), agora: rep({ atrasos: 0.035 }) }] }))), ["G24"]);
assert.deepEqual(ids(avaliarGatilhos(base({ reputacao: [{ conta: "SP", antes: rep({}), agora: rep({ reclamacoes: 0.009 }) }] }))), [], "subiu, mas abaixo de 1%");

// Cancelamento: 1% → 4% acende; 1% → 1,5% não.
const canc = (r, c) => ({ receita: r, cancelado: c, pedidos: 10, pedidosCancelados: 1 });
assert.deepEqual(ids(avaliarGatilhos(base({ cancelamentos: { antes: canc(9900, 100), agora: canc(9600, 400) } }))), ["G25"]);
assert.deepEqual(ids(avaliarGatilhos(base({ cancelamentos: { antes: canc(9900, 100), agora: canc(9850, 150) } }))), []);

// Margem: com 70% de custo conhecido liga; com 30% não.
const ml = (r, ap, mg) => ({ receita: r, receitaApurada: ap, margem: mg, comissao: 0 });
g = avaliarGatilhos(base({ margem: { antes: ml(1000, 900, 300), agora: ml(1200, 1000, 250), porSku: [{ sku: "A", titulo: "A", antes: ml(1000, 900, 300), agora: ml(1200, 1000, 200) }] } }));
assert.deepEqual(ids(g).sort(), ["G23", "G30"]);
assert.deepEqual(ids(avaliarGatilhos(base({ margem: { antes: ml(1000, 300, 100), agora: ml(1000, 300, 100), porSku: [] } }))), []);

// PA62652 (Probel, 15–21/11): os anúncios que vendiam zeraram e pausaram; os "sem controle" não vendem.
g = avaliarGatilhos(base({ linhas: [linha({ sku: "PA62652", antes: lado({ receita: 5050, unidades: 2, pedidos: 2, visitas: 300 }), agora: lado({ receita: 0, visitas: 42 }), delta: -5050, causa: "parou de vender" })], parados: { PA62652: [{ mlb: "MLB5298254542", status: "pausado", estoque: 0, unidadesAntes: 2 }] } }));
assert.deepEqual(ids(g), ["G31"], "vira 'anúncio que vendia parou', não 'parou de vender'");

// Ponte: cada produto numa parte só, e as partes somam a diferença.
const { montarPonte } = await jiti.import(path.join(raiz, "src/lib/acompanhamento/ponte.ts"));
const pl = (sku, a, b, o = {}) => ({ sku, delta: b - a, antes: { receita: a }, agora: { receita: b }, diasSemEstoque: 0, causa: "", efeito: { visitas: null, conversao: null, unidades: null, preco: 0 }, ...o });
const pt = montarPonte([
  pl("Z", 5000, 0),
  pl("N", 0, 2000),
  pl("E", 3000, 1000, { diasSemEstoque: 3 }),
  pl("V", 1000, 800, { efeito: { visitas: -150, conversao: -30, unidades: null, preco: -20 } }),
  pl("P", 500, 0, {}),
], 9500, 3800, { P: [{}] });
const parte = (k) => pt.partes.find((x) => x.chave === k)?.valor;
assert.equal(parte("zerou"), -5000);
assert.equal(parte("novos"), 2000);
assert.equal(parte("estoque"), -2500, "sem estoque e anúncio parado vão inteiros para estoque");
assert.equal(pt.partes.reduce((a, x) => a + x.valor, 0), 3800 - 9500, "as partes somam a diferença");
assert.equal(pt.partes[0].chave, "zerou", "maior parte primeiro");
// As bases da tela fecham com o total: os que seguiram + cada grupo.
const bases = (k) => pt.seguiram[k].receita + Object.values(pt.grupos).reduce((a, g) => a + g[k], 0);
assert.equal(bases("antes"), 9500);
assert.equal(bases("agora"), 3800);
assert.equal(pt.seguiram.produtos, 1, "só V vendeu nos dois períodos sem parar");
assert.deepEqual(pt.partes.find((x) => x.chave === "visitas").top.map((t) => t.sku), ["V"]);

console.log("gatilhos: ok");
