/**
 * A planilha do "Por que caiu" sai válida e com os números nas colunas.
 *
 * Quarenta colunas montadas na mão erram fácil, e o sintoma é ruim: o
 * arquivo baixa, o Excel reclama ou — pior — abre com a coluna trocada e
 * ninguém desconfia. Aqui o arquivo é gerado e LIDO DE VOLTA.
 */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";
import ExcelJS from "exceljs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const pasta = await mkdtemp(path.join(tmpdir(), "gerizo-export-"));
const stub = async (nome, codigo) => {
  const arquivo = path.join(pasta, nome + ".cjs");
  await writeFile(arquivo, codigo);
  return arquivo;
};

try {
  globalThis.__exp = { usuario: true };
  const vazio = await stub("vazio", "module.exports={}");
  const banco = await stub(
    "banco",
    "exports.clienteServidor=async()=>({auth:{getUser:async()=>({data:{user:globalThis.__exp.usuario?{id:'u'}:null}})}});"
  );
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    alias: { "@/lib/supabase/servidor": banco, "server-only": vazio, "@": path.join(raiz, "src") },
  });
  const { POST } = await jiti.import(path.join(raiz, "src/app/api/exportar/queda/route.ts"));

  const lado = (x) => ({
    receita: 0, unidades: 0, pedidos: 0, visitas: null, conversao: null,
    precoVendido: null, precoVitrine: null, cobertura: 1, ...x,
  });
  const linha = {
    chave: "p:GP745",
    nivel: "produto",
    codigo: "GP745",
    sku: "GP745",
    titulo: "Tigela Bowl Aço Inox",
    onde: "Mercado Livre · São Paulo",
    curva: "A",
    antes: lado({ receita: 1000, unidades: 10, pedidos: 9, visitas: 500, conversao: 2, precoVitrine: 100, precoVendido: 100 }),
    agora: lado({ receita: 600, unidades: 5, pedidos: 5, visitas: 300, conversao: 1.67, precoVitrine: 120, precoVendido: 120 }),
    delta: -400,
    deltaPct: -40,
    efeito: { visitas: -250, conversao: -80, unidades: null, preco: -70 },
    diasSemEstoque: 3,
    diasComEstoque: 27,
    status: "ativo",
    precoAtual: 119.9,
    estoqueAtual: 17,
    sobEncomenda: false,
    catalogo: { antes: { ganhando: 20, dias: 30 }, agora: { ganhando: 4, dias: 30 } },
    causa: "preço subiu",
    explicacao: "O preço anunciado subiu 20%.",
    partes: [],
  };
  const periodo = {
    de: "2026-09-15", ate: "2026-10-14", deAnterior: "2026-08-16", ateAnterior: "2026-09-14",
    dias: 30, diasAnterior: 30,
  };
  const chamar = (corpo) =>
    POST(new Request("http://teste/api/exportar/queda", { method: "POST", body: JSON.stringify(corpo) }));

  /* 1. Guardas: sem sessão, sem linhas, e acima do limite. */
  globalThis.__exp.usuario = false;
  assert.equal((await chamar({ periodo, linhas: [linha] })).status, 401);
  globalThis.__exp.usuario = true;
  assert.equal((await chamar({ periodo, linhas: [] })).status, 400);
  assert.equal((await chamar({ periodo, linhas: Array(5001).fill(linha) })).status, 413);

  /* 2. O arquivo. */
  const r = await chamar({ periodo, filtro: "só quedas · preço subiu", linhas: [linha] });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /spreadsheetml/);
  assert.match(r.headers.get("content-disposition"), /por-que-caiu-2026-09-15-a-2026-10-14\.xlsx/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));
  const ws = wb.getWorksheet("Por que caiu");
  assert.ok(ws, "a aba existe");

  /* O recorte está escrito na primeira linha, com o filtro usado. */
  assert.match(String(ws.getCell("A1").value), /2026-09-15 a 2026-10-14 \(30 dias\)/);
  assert.match(String(ws.getCell("A1").value), /filtro: só quedas · preço subiu/);
  assert.match(String(ws.getCell("A1").value), /1 linhas/);

  /* Cabeçalho na linha 3, e cada métrica em DUAS colunas, com a data no
     rótulo — "antes" e "agora" não se lembram numa reunião. */
  const cab = ws.getRow(3).values.slice(1).map(String);
  assert.equal(cab[0], "SKU");
  assert.equal(cab[1], "Código");
  assert.ok(cab.includes("Receita 2026-08-16 a 2026-09-14"), "receita do período anterior");
  assert.ok(cab.includes("Receita 2026-09-15 a 2026-10-14"), "receita do período atual");
  assert.ok(cab.includes("Visitas 2026-08-16 a 2026-09-14"));
  assert.ok(cab.includes("Conversão % 2026-09-15 a 2026-10-14"));
  assert.ok(cab.includes("Preço anunciado 2026-09-15 a 2026-10-14"));
  assert.ok(cab.includes("Efeito preço R$"));
  assert.equal(new Set(cab).size, cab.length, "nenhum rótulo repetido");

  /* Os valores, lidos pelo rótulo da coluna — se a ordem mudar, o teste
     continua certo; se o valor for para a coluna errada, ele quebra. */
  const dados = ws.getRow(4);
  const valor = (rotulo) => dados.getCell(cab.indexOf(rotulo) + 1).value;
  assert.equal(valor("SKU"), "GP745");
  assert.equal(valor("Produto"), "Tigela Bowl Aço Inox");
  assert.equal(valor("Causa"), "preço subiu");
  assert.equal(valor("Estoque agora"), 17);
  assert.equal(valor("Receita 2026-08-16 a 2026-09-14"), 1000);
  assert.equal(valor("Receita 2026-09-15 a 2026-10-14"), 600);
  assert.equal(valor("Receita Δ R$"), -400);
  assert.equal(valor("Visitas 2026-08-16 a 2026-09-14"), 500);
  assert.equal(valor("Visitas Δ %"), -40);
  assert.equal(valor("Unidades Δ %"), -50);
  assert.equal(valor("Preço anunciado Δ %"), 20);
  assert.equal(valor("Dias ganhando catálogo 2026-09-15 a 2026-10-14"), 4);

  /* A repartição fecha com a queda: é a propriedade que dá sentido às
     quatro colunas de efeito. */
  const soma =
    valor("Efeito visitas R$") + valor("Efeito conversão R$") + valor("Efeito preço R$");
  assert.equal(soma, valor("Receita Δ R$"));

  /* Número sem base vira célula VAZIA, não zero: zero diria "não mudou". */
  const semVisita = { ...linha, antes: lado({ receita: 10 }), agora: lado({ receita: 5 }), deltaPct: -50, catalogo: null };
  const r2 = await chamar({ periodo, linhas: [semVisita] });
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(Buffer.from(await r2.arrayBuffer()));
  const d2 = wb2.getWorksheet("Por que caiu").getRow(4);
  const v2 = (rotulo) => d2.getCell(cab.indexOf(rotulo) + 1).value;
  assert.equal(v2("Visitas 2026-09-15 a 2026-10-14"), null);
  assert.equal(v2("Conversão Δ %"), null);
  assert.equal(v2("Dias ganhando catálogo 2026-09-15 a 2026-10-14"), null);

  console.log("ok");
} finally {
  await rm(pasta, { recursive: true, force: true });
}
