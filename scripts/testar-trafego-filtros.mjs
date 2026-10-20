/** Regressões do carregador real, com banco e margem isolados por fixtures. */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";
import { urlTrafego, periodoTrafego, conferirInvestimento } from "../src/lib/trafego-pago-filtros.ts";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const pasta = await mkdtemp(path.join(tmpdir(), "gerizo-trafego-"));
async function stub(nome, codigo) {
  const arquivo = path.join(pasta, nome + ".cjs");
  await writeFile(arquivo, codigo);
  return arquivo;
}
try {
  const atual = { canais: "conta:a", janela: "2026-09-30|2026-10-01", de: "2026-09-01", ate: "2026-10-11" };
  const params = (mudar) => new URL(urlTrafego(atual, mudar), "http://teste").searchParams;
  assert.equal(params({ de: "2026-09-05" }).get("janela"), atual.janela);
  assert.equal(params({ janela: "2026-10-01|2026-10-02" }).get("de"), atual.de);
  assert.equal(params({ canais: "conta:b" }).get("de"), atual.de);
  assert.equal(params({ canais: "conta:b" }).get("janela"), null);
  assert.deepEqual(periodoTrafego({ de: "2026-10-12", ate: "2026-10-01" }, "2026-10-11"), { de: "2026-10-01", ate: "2026-10-12" });
  assert.deepEqual(periodoTrafego({ de: "2026-02-30", ate: "inválida" }, "2026-10-11"), { de: "2026-09-12", ate: "2026-10-11" });
  assert.equal(conferirInvestimento([{ data: "2026-10-01", investimento_ads: null }], "2026-10-01", "2026-10-02", 10).diario, null);
  assert.equal(conferirInvestimento([{ data: "2026-10-01", investimento_ads: 0 }], "2026-10-01", "2026-10-02", 10).diario, 0);

  const vazio = await stub("vazio", "module.exports={}");
  const banco = await stub("banco", `exports.clienteServidor=async()=>({from(t){return {select(){return this},order(){return this},eq(){return this},in(){return this},gte(){return this},lte(){return this},not(){return this},limit(){return this},range:async(a,b)=>({data:(globalThis.__trafego.tabelas[t]??[]).slice(a,b+1),error:null})}}});`);
  const margem = await stub("margem", `exports.carregarBaseMargem=async(f)=>{globalThis.__trafego.filtro=f;return {itens:globalThis.__trafego.margens[f.canalId??'todos']}};exports.agregar=b=>b.itens;`);
  const contas = await stub("contas", `exports.carregarContasRecorte=async()=>globalThis.__trafego.contas;`);
  const jiti = createJiti(import.meta.url, { moduleCache: false, alias: {
    "@/lib/supabase/servidor": banco,
    "./margem": margem,
    "./contas-recorte": contas,
    [path.join(raiz, "src/lib/dados/margem.ts").replaceAll("\\", "/")]: margem,
    [path.join(raiz, "src/lib/dados/contas-recorte.ts").replaceAll("\\", "/")]: contas,
    "server-only": vazio, "@": path.join(raiz, "src"),
  } });
  const { carregarTrafegoPago } = await jiti.import(path.join(raiz, "src/lib/dados/trafego-pago.ts"));
  const ad = (codigo_externo, inicio, fim, investimento) => ({ codigo_externo, inicio, fim, investimento, campanha: "Teste", impressoes: 100, cliques: 10, receita: 100, receita_direta: 80, receita_indireta: 20 });
  const diaria = (data, conta_canal_id, investimento_ads) => ({ data, conta_canal_id, canal_id: conta_canal_id === "loja" ? "vtex" : "meli", investimento_ads, receita_ads: 100, receita: 1000 });
  globalThis.__trafego = {
    contas: ["a", "b"].map((contaId) => ({ contaId, contaNome: contaId, canalId: "meli", canalNome: "Mercado Livre" })),
    tabelas: {
      anuncio_ads: [ad("MLA", "2026-09-30", "2026-10-01", 30), ad("MLA", "2026-09-30", "2026-10-02", 90), ad("MLB", "2026-09-30", "2026-10-01", 900)],
      anuncios: ["a", "b"].map((c) => ({ codigo_externo: "ML" + c.toUpperCase(), sku_canal: c, titulo: c, tipo: "classico", canal_id: "meli", conta_canal_id: c })),
      vendas_diarias: [diaria("2026-09-30", "a", 10), diaria("2026-10-01", "a", 20), diaria("2026-10-02", "a", 60), diaria("2026-10-01", "b", 900), diaria("2026-10-01", "loja", 2000)],
    },
    margens: { "conta:a": [{ chave: "MLA", contaCanalId:'a', receita: 300, margem: 60, margemPct: 20, cobertura:100 }], todos: [{ chave: "MLA", contaCanalId:'a', receita: 300 }, { chave: "MLB", contaCanalId:'b', receita: 2700 }, {chave:'LOJA',contaCanalId:'loja',receita:90000}] },
  };
  const r = await carregarTrafegoPago(atual.janela, atual.canais, { de: "2026-09-30", ate: "2026-10-02" });
  assert.equal(r.totais.investimento, 30, "Não soma janelas sobrepostas nem outra conta");
  assert.equal(r.totais.tacos, 10, "TACoS usa o faturamento da conta selecionada");
  assert.deepEqual(globalThis.__trafego.filtro, { inicio: "2026-09-30", fim: "2026-10-01", canalId: "conta:a" });
  assert.equal(r.conferencia.diario, 30, "Conferência cruza o mês no intervalo exato");
  assert.equal(r.conferencia.diasRegistrados, 2);
  assert.equal(r.serie.reduce((s, d) => s + d.investimento, 0), 90, "Calendário é independente da janela do relatório");
  assert.equal((await carregarTrafegoPago(undefined, "conta:a")).janela, "2026-09-30|2026-10-02");
  const geral = await carregarTrafegoPago('2026-09-30|2026-10-02');
  assert.equal(geral.totais.receitaTotalConta,300,'Sem filtro exclui canais e contas ausentes do relatório');
  assert.equal(geral.conferencia.diario,90,'Conferência exclui gasto de outras contas');
  globalThis.__trafego.margens['conta:a'][0].cobertura=50;
  assert.equal((await carregarTrafegoPago(atual.janela,atual.canais)).totais.sobraAposMidia,null,'Margem parcial não vira lucro depois da mídia');
  const semRelatorio = await carregarTrafegoPago(undefined, "vtex", { de: "2026-10-01", ate: "2026-10-01" });
  assert.equal(semRelatorio.vazio, true);
  assert.equal(semRelatorio.serie[0].investimento, 2000, "Canal sem relatório preserva série diária");
  globalThis.__trafego.tabelas.anuncio_ads = [];
  assert.equal((await carregarTrafegoPago(undefined, "vtex")).serie.length, 1);
  console.log("OK: filtros, datas inválidas, janelas, TACoS por conta, conferência e canal sem relatório.");
} finally {
  delete globalThis.__trafego;
  if (path.dirname(pasta) === path.resolve(tmpdir()) && path.basename(pasta).startsWith("gerizo-trafego-")) await rm(pasta, { recursive: true, force: true });
}
