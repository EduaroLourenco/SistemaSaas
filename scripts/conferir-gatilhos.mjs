/**
 * Roda os gatilhos do acompanhamento contra o banco real e grava a pauta
 * em TXT, para conferir os cortes antes de desenhar a tela.
 *
 * Uso: node scripts/conferir-gatilhos.mjs [operacao] [de] [ate]
 *   padrão: BdC, 15/11 a 21/11/2026
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const l of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const OPERACOES = { probel: "00000000-0000-0000-0000-000000000101", bdc: "01b057f3-4541-4423-ada4-288cfbbc6dd7", imprimil: "123c2f3c-c4ed-48ba-b4c4-753d78265946" };
const [nomeOp = "bdc", de = "2026-11-15", ate = "2026-11-21"] = process.argv.slice(2);
process.env.OPERACAO_CONFERENCIA = OPERACOES[nomeOp] ?? nomeOp;

const pasta = mkdtempSync(path.join(tmpdir(), "gerizo-gatilhos-"));
const vazio = path.join(pasta, "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const pacote = path.join(raiz, "node_modules/@supabase/supabase-js").replaceAll(String.fromCharCode(92), "/");
const stubServidor = path.join(pasta, "servidor.cjs");
writeFileSync(stubServidor, [
  `const { createClient } = require(${JSON.stringify(pacote)});`,
  `const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { headers: { "x-operacao": process.env.OPERACAO_CONFERENCIA } } });`,
  `module.exports = { clienteServidor: async () => sb, usuarioAtual: async () => null, COOKIE_OPERACAO: "operacao", HEADER_OPERACAO: "x-operacao" };`,
].join("\n"));
const stubOperacao = path.join(pasta, "operacao.cjs");
writeFileSync(stubOperacao, `module.exports = { operacaoPadrao: async () => ({ id: process.env.OPERACAO_CONFERENCIA, nome: "conferência" }), listarOperacoes: async () => [] };`);
const jiti = createJiti(import.meta.url, {
  alias: { "@/lib/supabase/servidor": stubServidor, "@/lib/dados/operacao": stubOperacao, "./operacao": stubOperacao, "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { carregarAcompanhamento } = await jiti.import(path.join(raiz, "src/lib/dados/acompanhamento.ts"));

const t0 = Date.now();
const r = await carregarAcompanhamento(de, ate);
const dm = (s) => (s ? s.split("-").reverse().join("/") : "—");
const linhas = [
  `GATILHOS DO MERCADO LIVRE — ${nomeOp.toUpperCase()}`,
  `${dm(r.de)} a ${dm(r.ate)} contra ${dm(r.deAnterior)} a ${dm(r.ateAnterior)} · mídia: janela ${r.janelaMidia ?? "—"}`,
  `${r.gatilhos.length} gatilhos · gerado em ${new Date().toISOString().slice(0, 16)} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  r.aviso ? `aviso: ${r.aviso}` : "",
  "",
];
const porSlide = new Map();
for (const g of r.gatilhos) porSlide.set(g.slide, [...(porSlide.get(g.slide) ?? []), g]);
const ORDEM = ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S13"];
const TITULO = { S0: "Dá para confiar?", S1: "Como foi o período?", S2: "Unidade ou receita?", S3: "O que puxou para baixo?", S4: "O que puxou para cima / potencial?", S5: "O preço mudou. E as vendas?", S6: "Perdeu a vitrine?", S7: "Faltou produto?", S8: "As promoções funcionaram?", S9: "A mídia pagou?", S13: "E as ações que fizemos?" };
for (const s of ORDEM) {
  const lista = porSlide.get(s) ?? [];
  linhas.push(`== ${s} · ${TITULO[s]} (${lista.length})`);
  if (!lista.length) linhas.push("   (nenhum gatilho: slide não aparece)");
  for (const g of lista.slice(0, 8)) {
    const it = g.item ? `${g.item.sku || g.item.codigo}${g.item.curva ? ` [${g.item.curva}]` : ""} ${g.item.titulo.slice(0, 60)}` : "";
    linhas.push(`   ${g.id} ${g.nome}${g.hipotese ? " (hipótese)" : ""}${it ? ` · ${it}` : ""}`);
    linhas.push(`        ${g.texto}  → ${g.destino}`);
  }
  if (lista.length > 8) linhas.push(`   … e mais ${lista.length - 8} em "ver todos"`);
  linhas.push("");
}
const contagem = {};
for (const g of r.gatilhos) contagem[`${g.id} ${g.nome}`] = (contagem[`${g.id} ${g.nome}`] ?? 0) + 1;
linhas.push("== Contagem por gatilho");
for (const [k, v] of Object.entries(contagem).sort()) linhas.push(`   ${k}: ${v}`);
const txt = linhas.join("\n");
const saida = path.join(raiz, "output/acompanhamento");
mkdirSync(saida, { recursive: true });
const arq = path.join(saida, `gatilhos-${nomeOp}-${de}_${ate}.txt`);
writeFileSync(arq, txt);
writeFileSync(path.join(saida, `dados-${nomeOp}-${de}_${ate}.json`), JSON.stringify(r));
console.log(txt);
console.log(`\n→ ${arq}`);
