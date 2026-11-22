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

console.log("gatilhos: ok");
