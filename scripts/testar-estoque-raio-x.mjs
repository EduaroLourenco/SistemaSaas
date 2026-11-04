import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Executa o carregador de produção com respostas controladas, sem acesso à rede.
const source = readFileSync(new URL("../src/lib/dados/raio-x-sku.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let falha = false;
const filtros = [];
const cadastro = [1, 2].map(i => ({ id: String(i), codigo_externo: `MLB${i}`, titulo: "Produto", tipo: "classico", status: "ativo", estoque: 71, preco_atual: 100, contas_canal: { nome: "Conta" } }));
const leituras = [1, 2].map(i => ({ id: String(i), origem: "canal", provedor: "mercado_livre", local_nome: "Depósito", disponivel: 71, consultado_em: "2026-11-03T12:00:00Z", contas_canal: { nome: `Conta ${i}` } }));
const sb = { from(tabela) {
  const q = { select() { return q; }, eq(c, v) { filtros.push([tabela,c,v]); return q; }, order() { return q; }, gte() { return q; }, lte() { return q; }, then(resolve, reject) {
    return (tabela === "estoque_saldos" && falha ? Promise.reject(new Error("indisponível")) : Promise.resolve({ data: tabela === "anuncios" ? cadastro : tabela === "estoque_saldos" ? leituras : [], error: null })).then(resolve,reject);
  } }; return q;
} };
const mods = {
  "server-only": {},
  "@/lib/supabase/servidor": { clienteServidor: async () => sb },
  "./operacao": { operacaoPadrao: async () => ({ id: "empresa-teste" }) },
  "./paginar": { paginar: async montar => (await montar()).data },
  "./preco-atual": { ultimosPrecosDeVenda: async () => new Map() },
  "./disputa-catalogo": { situacaoDeCatalogo: async () => new Map() },
  "./recorde-sku": { carregarRecordeSku: async () => ({ recorde: null, ultima: null }) },
};
const modulo = { exports: {} };
new Function("require", "module", "exports", code)(name => {
  if (!(name in mods)) throw new Error(`Dependência inesperada: ${name}`);
  return mods[name];
}, modulo, modulo.exports);
const carregar = modulo.exports.carregarRaioXSku;
const resultado = await carregar("SKU-1");
assert.equal(resultado.estoque.saldo, null, "Anúncios com saldo compartilhado não viram 142 unidades físicas");
assert.equal(resultado.estoque.diasDeCobertura, null, "Não derivar cobertura de estoque duplicado");
assert.equal(resultado.estoque.leituras.length, 2);
assert.deepEqual(resultado.estoque.leituras.map(l => l.disponivel), [71,71]);
assert.equal(resultado.estoque.erroLeitura, false);
assert.ok(filtros.some(([t,c,v]) => t === "estoque_saldos" && c === "operacao_id" && v === "empresa-teste"));
assert.ok(filtros.some(([t,c,v]) => t === "estoque_saldos" && c === "sku" && v === "SKU-1"));
falha = true;
const erro = await carregar("SKU-1");
assert.equal(erro.estoque.erroLeitura, true);
assert.equal(erro.estoque.leituras.length, 0);
assert.equal(erro.anuncios.length, 2, "Falha de uma origem não apaga os anúncios");
console.log("Estoque: origens preservadas, sem soma duplicada, sem cobertura fictícia e erro explícito.");
