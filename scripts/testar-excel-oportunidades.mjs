/**
 * A planilha do "O que fazer" sai válida, com os cortes escritos e só com
 * as linhas filtradas.
 *
 * Duas coisas erradas aqui custam decisão de verba: valor na coluna errada
 * (vinte colunas montadas à mão) e ausência virando zero — "converte 0%" e
 * "ACOS 0%" são afirmações falsas sobre quem não tem o dado, e no Excel
 * entram na média e na ordenação como se fossem medidas.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") }, interopDefault: true });
const { planilhaOportunidades } = await jiti.import(path.join(raiz, "src/lib/planilhas/trafego-oportunidades.ts"));
const { classificarOportunidades } = await jiti.import(path.join(raiz, "src/lib/dados/trafego-oportunidades.ts"));

const base = {
  conta: "Mercado Livre · São Paulo",
  tipo: "classico",
  status: "ativo",
  estoque: 7,
  catalogo: null,
};

/* Passa pelo classificador de verdade: a planilha mostra ação e motivo, e
   montá-los à mão no teste provaria só que o Excel copia strings. */
const { linhas, referencias } = classificarOportunidades([
  {
    ...base,
    mlb: "MLB1",
    sku: "GP745",
    titulo: "Tigela Bowl Aço Inox",
    visitas: 60,
    unidades: 6,
    receitaReal: 900,
    margem: 300,
    margemPct: 33.3,
    investimento: 0,
    receitaAtribuida: 0,
  },
  {
    ...base,
    mlb: "MLB2",
    sku: "PA85361",
    titulo: "Colchão",
    visitas: 400,
    unidades: 8,
    receitaReal: 0,
    margem: null,
    margemPct: null,
    investimento: 374.19,
    receitaAtribuida: 0,
    catalogo: "listado",
  },
  {
    ...base,
    mlb: "MLB3",
    sku: "SEMVIS",
    titulo: "Produto sem visita medida",
    visitas: null,
    unidades: 1,
    receitaReal: 50,
    margem: 10,
    margemPct: 20,
    investimento: 0,
    receitaAtribuida: 0,
  },
]);

const contexto = { janela: "2026-09-16|2026-10-15", recorte: "Conta única", filtro: "Entrar no ads" };
const wb = planilhaOportunidades(linhas, referencias, contexto);
const reaberto = new ExcelJS.Workbook();
await reaberto.xlsx.load(await wb.xlsx.writeBuffer());
const ws = reaberto.worksheets[0];

assert.equal(reaberto.worksheets.length, 1);
assert.equal(ws.name, "O que fazer");

/* ── O contexto, para a planilha se explicar depois de salva ── */
assert.match(String(ws.getCell("A2").value), /16\/09\/2026 a 15\/10\/2026/, "a janela vai em data brasileira");
assert.match(String(ws.getCell("A2").value), /Conta única/);
assert.match(String(ws.getCell("A2").value), /3 anúncios/);
assert.match(String(ws.getCell("A3").value), /Filtro aplicado: Entrar no ads/);
assert.match(String(ws.getCell("A4").value), /conversão mediana/, "os cortes da classificação ficam escritos");
assert.match(String(ws.getCell("A4").value), /piso de 20 visitas/);
assert.match(String(ws.getCell("A5").value), /vazia é ausência de dado/);

/* ── Os títulos, e os valores achados PELO título ── */
const titulos = ws.getRow(6).values.slice(1).map(String);
assert.equal(titulos[0], "O que fazer");
assert.equal(new Set(titulos).size, titulos.length, "nenhum título repetido");
for (const esperado of ["SKU", "Código", "Produto", "Catálogo", "Visitas", "Conversão", "Investido", "ACOS", "Estoque", "Sobra após mídia"]) {
  assert.ok(titulos.includes(esperado), `falta a coluna ${esperado}`);
}

const porSku = new Map(
  linhas.map((l, i) => [l.sku, ws.getRow(7 + i)])
);
const col = (titulo) => titulos.indexOf(titulo) + 1;
const valor = (sku, titulo) => {
  const v = porSku.get(sku).getCell(col(titulo)).value;
  return v == null ? null : typeof v === "object" ? (v.result ?? v.text ?? null) : v;
};

/* A ordem das linhas é a do classificador: o que custa dinheiro primeiro. */
assert.equal(valor("PA85361", "O que fazer"), "Desligar");
assert.equal(valor("GP745", "O que fazer"), "Entrar no ads");

assert.equal(valor("GP745", "Código"), "MLB1");
assert.equal(valor("GP745", "Produto"), "Tigela Bowl Aço Inox");
assert.equal(valor("GP745", "Visitas"), 60);
assert.equal(valor("GP745", "Conversão"), 10, "6 em 60 é 10%, guardado como número para ordenar");
assert.equal(valor("GP745", "Faturou"), 900);
assert.ok(porSku.get("GP745").getCell(col("Faturou")).numFmt.includes("R$"));
assert.equal(valor("GP745", "Estoque"), 7);

/* O anúncio de catálogo que o sistema manda desligar: a coluna existe para
   avisar que a venda pode ter saído pelo anúncio vencedor. */
assert.equal(valor("PA85361", "Catálogo"), "listado");
assert.equal(valor("PA85361", "Investido"), 374.19);
assert.match(String(valor("PA85361", "Por quê")), /catálogo \(listado\)/);

/* ── Ausência fica VAZIA ── */
assert.equal(valor("SEMVIS", "Visitas"), null, "visita não medida não vira zero");
assert.equal(valor("SEMVIS", "Conversão"), null, "sem visita não há taxa de conversão");
assert.equal(valor("GP745", "ACOS"), null, "anúncio sem mídia não tem ACOS");
assert.equal(valor("GP745", "Investido"), null, "investimento zero não é investimento");
assert.equal(valor("PA85361", "Margem"), null, "SKU sem custo cadastrado não ganha margem inventada");

/* ── O recorte: só o que foi filtrado entra ── */
const sozinha = planilhaOportunidades([linhas[0]], referencias, { ...contexto, filtro: "Desligar" });
const so = (await (async () => {
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(await sozinha.xlsx.writeBuffer());
  return w.worksheets[0];
})());
assert.equal(so.rowCount, 7, "cinco linhas de contexto, o cabeçalho e uma linha de dados");
assert.match(String(so.getCell("A2").value), /1 anúncios/);
assert.ok(!JSON.stringify(so.model).includes("Tigela Bowl"), "linha fora do filtro não vaza para o arquivo");
assert.equal(so.autoFilter, "A6:T7");

/* Sem referências (janela sem anúncio acima do piso) a planilha ainda sai. */
const semRef = planilhaOportunidades(linhas, null, { ...contexto, filtro: "" });
const wsSem = (await (async () => {
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(await semRef.xlsx.writeBuffer());
  return w.worksheets[0];
})());
assert.match(String(wsSem.getCell("A3").value), /Sem filtro/);
assert.match(String(wsSem.getCell("A4").value), /sem referências de corte/);

console.log("ok: planilha do 'O que fazer' reaberta, cortes escritos, ausência vazia e só o filtrado dentro.");
