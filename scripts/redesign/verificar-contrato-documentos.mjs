// Contratos reais, dependências externas substituídas e rede bloqueada.
import "./offline-guard.mjs";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const { NextResponse } = require("next/server");
const resultados = [];

// A lista fechada impede importar banco, tokens ou clientes reais por acidente.
function modulo(arquivo, dependencias) {
  const source = readFileSync(path.join(root, arquivo), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  // Usa o mesmo realm do PDF-lib para que Array/Uint8Array mantenham os
  // contratos nativos. O processo do módulo não recebe variáveis de ambiente.
  const executar = vm.runInThisContext(`(function(exports, require, process) {\n${code}\n})`, { filename: arquivo });
  executar(exports, id => {
    if (!(id in dependencias)) throw new Error(`Dependência não substituída: ${id}`);
    return dependencias[id];
  }, Object.freeze({ env: Object.freeze({}) }));
  return exports;
}

async function teste(nome, executar) {
  try { await executar(); resultados.push({ nome, passou: true }); }
  catch (e) { resultados.push({ nome, passou: false, erro: e.message }); }
  console.log(`${resultados.at(-1).passou ? "PASS" : "FAIL"} ${nome}`);
}

const envio = (id, contaId = "conta-fixture-a") => ({ envio: id, contaId, pedido: 200000 + id, comprador: "Pessoa de demonstração", itens: [{ sku: "SKU-FIXTURE", titulo: "Produto de demonstração", quantidade: 2 }] });
let dados, autorizacao, chamadas, falhas;
function limpar() {
  dados = { envios: [envio(11), envio(12), envio(13, "conta-fixture-b")] };
  autorizacao = { conta: { id: "conta-fixture-a" }, motivo: null };
  chamadas = { carregar: 0, autorizar: [], montar: [] };
  falhas = [];
}
const api = modulo("src/app/api/envios/etiquetas/route.ts", {
  "next/server": { NextResponse },
  "@/lib/dados/envios-meli": { carregarEnvios: async () => { chamadas.carregar++; return dados; } },
  "@/lib/meli/rota": { contaEditavel: async id => { chamadas.autorizar.push(id); return autorizacao; } },
  "@/lib/meli/etiquetas": { montarEtiquetas: async (conta, envios) => { chamadas.montar.push(JSON.parse(JSON.stringify({ conta, envios }))); return { pdf: new Uint8Array([37, 80, 68, 70]), falhas }; } },
});
const pedir = corpo => api.POST({ json: async () => corpo });
async function recusa(nome, corpo, status, preparar = () => {}) {
  await teste(nome, async () => { limpar(); preparar(); const r = await pedir(corpo); assert.equal(r.status, status); assert.equal(chamadas.montar.length, 0, "Recusa deve ocorrer antes do efeito no canal"); });
}

await teste("JSON inválido é recusado antes de consultar", async () => {
  limpar(); const r = await api.POST({ json: async () => { throw new Error("JSON inválido"); } });
  assert.equal(r.status, 400); assert.equal(chamadas.carregar, 0);
});
await recusa("Confirmação ausente", { envios: [11] }, 400);
await recusa("Confirmação falsa", { envios: [11], confirmar: false }, 400);
await recusa("Corpo nulo", null, 400);
await recusa("Envios fora do formato de lista", { envios: "11", confirmar: true }, 400);
await recusa("Lote vazio", { envios: [], confirmar: true }, 400);
await recusa("Mais de 100 envios", { envios: Array.from({ length: 101 }, (_, i) => i + 1), confirmar: true }, 400);
await recusa("Envio fora do retrato atual", { envios: [999], confirmar: true }, 404);
await recusa("Lote de duas contas", { envios: [11, 13], confirmar: true }, 400);
await recusa("Retrato sem conta de canal", { envios: [11], confirmar: true }, 400, () => { delete dados.envios[0].contaId; });
await recusa("Leitor não marca o envio como impresso", { envios: [11], confirmar: true }, 403, () => { autorizacao = { conta: null, motivo: "sem_permissao" }; });
await recusa("Conta não autorizada por RLS não chega ao canal", { envios: [11], confirmar: true }, 404, () => { autorizacao = { conta: null, motivo: "nao_encontrada" }; });

await teste("Editor gera PDF com itens do servidor e IDs sem duplicação", async () => {
  limpar(); const r = await pedir({ envios: [11, 11], confirmar: true, itens: [{ sku: "forjado", quantidade: 999 }] });
  assert.equal(r.status, 200); assert.deepEqual(chamadas.autorizar, ["conta-fixture-a"]);
  assert.deepEqual(chamadas.montar, [{ conta: "conta-fixture-a", envios: [{ envio: 11, pedido: 200011, comprador: "Pessoa de demonstração", itens: dados.envios[0].itens }] }]);
  assert.equal(r.headers.get("content-type"), "application/pdf");
  assert.match(r.headers.get("content-disposition"), /^inline; filename="etiquetas-\d{4}-\d{2}-\d{2}\.pdf"$/);
  assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "%PDF");
});
await teste("Teto de 100 envios é aceito", async () => {
  limpar(); dados.envios = Array.from({ length: 100 }, (_, i) => envio(i + 1));
  assert.equal((await pedir({ envios: dados.envios.map(e => e.envio), confirmar: true })).status, 200);
  assert.equal(chamadas.montar[0].envios.length, 100);
});
await teste("Falha parcial preserva PDF e motivos no x-falhas", async () => {
  limpar(); falhas = [{ envio: 12, pedido: 200012, motivo: "falta emitir a nota" }];
  const r = await pedir({ envios: [11, 12], confirmar: true }); assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(decodeURIComponent(r.headers.get("x-falhas"))), falhas);
});
await teste("Falha de todos responde 422 com motivos", async () => {
  limpar(); falhas = [{ envio: 11, pedido: 200011, motivo: "já foi coletado" }];
  const r = await pedir({ envios: [11], confirmar: true }); assert.equal(r.status, 422); assert.deepEqual((await r.json()).falhas, falhas);
});

// A geração usa PDF-lib real; só a obtenção da etiqueta é substituída.
let arquivos = [], pdfFonte, rejeitados = new Set();
const gerador = modulo("src/lib/meli/etiquetas.ts", {
  "server-only": {},
  "pdf-lib": require("pdf-lib"),
  "./cliente": { meliArquivo: async (caminho, conta) => { arquivos.push({ caminho, conta }); const id = Number(new URL(caminho, "https://fixture.invalid").searchParams.get("shipment_ids")); if (rejeitados.has(id)) throw new Error("NOT_PRINTABLE_STATUS: status is invoice_pending"); return pdfFonte; } },
});
async function fonte(tamanhos) { const pdf = await PDFDocument.create(); for (const tamanho of tamanhos) pdf.addPage(tamanho); return pdf.save(); }
await teste("PDF mantém etiqueta e DANFE 10×15, remove A4 e antepõe separação", async () => {
  arquivos = []; rejeitados = new Set(); pdfFonte = await fonte([[283.46, 425.2], [283.46, 425.2], [595.28, 841.89]]);
  const r = await gerador.montarEtiquetas("conta-fixture-a", [envio(11)]); const pdf = await PDFDocument.load(r.pdf);
  assert.equal(pdf.getPageCount(), 3); assert(pdf.getPages().every(p => Math.abs(p.getWidth() - 283.46) < .01 && Math.abs(p.getHeight() - 425.2) < .01));
  assert.equal(r.falhas.length, 0); assert.deepEqual(arquivos, [{ caminho: "/shipment_labels?shipment_ids=11&response_type=pdf", conta: "conta-fixture-a" }]);
});
await teste("Sem DANFE, inclui folha de itens sem perder etiqueta", async () => {
  arquivos = []; pdfFonte = await fonte([[283.46, 425.2]]);
  const r = await gerador.montarEtiquetas("conta-fixture-a", [envio(11)]); assert.equal((await PDFDocument.load(r.pdf)).getPageCount(), 3);
});
await teste("Geração parcial pede cada envio separado e conserva falha legível", async () => {
  arquivos = []; rejeitados = new Set([12]);
  const r = await gerador.montarEtiquetas("conta-fixture-a", [envio(11), envio(12)]);
  assert.equal(arquivos.length, 2); assert.equal(r.falhas.length, 1); assert.equal(r.falhas[0].envio, 12); assert.match(r.falhas[0].motivo, /falta emitir a nota/);
  assert.equal((await PDFDocument.load(r.pdf)).getPageCount(), 3);
});

let consultasFrete = [], custoFrete = 8.15, contaConectada = true;
const cotacao = modulo("src/app/api/precificacao/frete/route.ts", {
  "next/server": { NextResponse },
  "@/lib/meli/rota": { contasMeli: async () => [{ id: "conta-fixture-a", conectada: contaConectada }] },
  "@/lib/meli/cliente": { vendedor: async () => ({ id: 123 }), meliGet: async caminho => { consultasFrete.push(caminho); return { coverage: { all_country: { list_cost: custoFrete } } }; } },
});
const urlFrete = "https://fixture.invalid/api/precificacao/frete?conta=conta-fixture-a&altura=10&largura=15&comprimento=20&peso=0.1&preco=53.99&tipo=premium";
for (const [extra, modo] of [["", "true"], ["&gratis=0", "false"]]) {
  await teste(`Cotação preserva free_shipping=${modo}`, async () => {
    consultasFrete = []; custoFrete = 8.15; contaConectada = true;
    const r = await cotacao.GET({ url: urlFrete + extra }); assert.equal(r.status, 200); assert.equal((await r.json()).frete, 8.15);
    const query = new URL(consultasFrete[0], "https://fixture.invalid").searchParams;
    assert.equal(query.get("free_shipping"), modo); assert.equal(query.get("listing_type_id"), "gold_pro"); assert.equal(query.get("item_price"), "53.99");
  });
}
await teste("Cotação sem custo positivo conserva o estado ausente existente", async () => {
  custoFrete = 0; const r = await cotacao.GET({ url: urlFrete + "&gratis=0" }); assert.equal((await r.json()).frete, null);
});
await teste("Conta de frete não conectada é recusada antes do canal", async () => {
  consultasFrete = []; contaConectada = false; assert.equal((await cotacao.GET({ url: urlFrete })).status, 403); assert.equal(consultasFrete.length, 0);
});

const resumo = { rede: "bloqueada", dados: "fixtures sintéticas; sem banco, credenciais ou impressão real", total: resultados.length, passou: resultados.filter(r => r.passou).length, falhou: resultados.filter(r => !r.passou).length, limites: ["Validação estrutural do PDF, sem aceite visual de documentos fiscais reais", "RLS e papéis exercitados por stub do guard de produção"], resultados };
mkdirSync(path.join(root, "output/redesign"), { recursive: true });
writeFileSync(path.join(root, "output/redesign/qa-contrato-documentos.json"), JSON.stringify(resumo, null, 2) + "\n");
console.log(`${resumo.passou}/${resumo.total} contratos aprovados; rede bloqueada.`);
for (const r of resultados.filter(r => !r.passou)) console.error(`${r.nome}: ${r.erro}`);
if (resumo.falhou) process.exitCode = 1;
