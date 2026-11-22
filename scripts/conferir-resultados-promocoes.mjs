/**
 * Roda a medição de "deu certo?" das promoções contra o banco real, uma
 * operação por vez, e grava o resultado em output/promocoes-resultados/.
 *
 * Serve para comparar antes × depois de mexer na regra:
 *   node scripts/conferir-resultados-promocoes.mjs antes
 *   (muda o código)
 *   node scripts/conferir-resultados-promocoes.mjs depois
 * O segundo comando imprime o que mudou de veredito.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const l of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const TAG = process.argv[2] ?? "agora";
const saida = path.join(raiz, "output/promocoes-resultados");
mkdirSync(saida, { recursive: true });

const pasta = mkdtempSync(path.join(tmpdir(), "gerizo-promo-"));
const vazio = path.join(pasta, "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const pacote = path.join(raiz, "node_modules/@supabase/supabase-js").replaceAll(String.fromCharCode(92), "/");
const stubServidor = path.join(pasta, "servidor.cjs");
writeFileSync(stubServidor, [
  `const { createClient } = require(${JSON.stringify(pacote)});`,
  `const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });`,
  `module.exports = { clienteServidor: async () => sb, usuarioAtual: async () => null, COOKIE_OPERACAO: "operacao", HEADER_OPERACAO: "x-operacao" };`,
].join("\n"));
const stubOperacao = path.join(pasta, "operacao.cjs");
writeFileSync(stubOperacao, `module.exports = { operacaoPadrao: async () => ({ id: process.env.OPERACAO_CONFERENCIA, nome: "conferência" }), listarOperacoes: async () => [] };`);

const jiti = createJiti(import.meta.url, {
  alias: {
    "@/lib/supabase/servidor": stubServidor,
    "@/lib/dados/operacao": stubOperacao,
    "./operacao": stubOperacao,
    "@": path.join(raiz, "src"),
    "server-only": vazio,
  },
  interopDefault: true,
  moduleCache: false,
});
const { carregarResultadosPlanejamento } = await jiti.import(path.join(raiz, "src/lib/dados/planejamento-resultados.ts"));

const OPERACOES = {
  "00000000-0000-0000-0000-000000000101": "Probel",
  "01b057f3-4541-4423-ada4-288cfbbc6dd7": "BdC",
  "123c2f3c-c4ed-48ba-b4c4-753d78265946": "Imprimil",
  "614a2246-81ae-46c4-aa34-7f87a276bce0": "Boa Forma",
};
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const todos = {};
for (const [id, nome] of Object.entries(OPERACOES)) {
  process.env.OPERACAO_CONFERENCIA = id;
  const t0 = Date.now();
  const r = await carregarResultadosPlanejamento();
  todos[nome] = r.promocoes.map((p) => ({
    id: p.id, nome: p.nome, desde: String(p.processadaEm).slice(0, 10), origem: p.origem ?? "planilha", peloGerizo: p.peloGerizo ?? 0,
    participam: p.participam, fora: p.fora, controle: p.controle, dias: p.dias,
    crescimento: r1(p.crescimento), crescimentoFora: r1(p.crescimentoFora), efeito: r1(p.efeito), veredito: p.veredito,
    tipo: p.tipo ?? null,
  }));
  console.log(`${nome}: ${r.promocoes.length} promoções, ${r.linhas.length} ações, ${((Date.now() - t0) / 1000).toFixed(1)}s${r.aviso ? ` · aviso: ${r.aviso}` : ""}`);
}
writeFileSync(path.join(saida, `${TAG}.json`), JSON.stringify(todos, null, 2));

/* Comparação com "antes", se existir e esta não for ela. */
const arqAntes = path.join(saida, "antes.json");
if (TAG !== "antes" && existsSync(arqAntes)) {
  const antes = JSON.parse(readFileSync(arqAntes, "utf8"));
  const linhas = [];
  for (const [emp, lista] of Object.entries(todos)) {
    const velhos = new Map((antes[emp] ?? []).map((p) => [p.id, p]));

    linhas.push(`\n== ${emp}`);
    for (const p of lista) {
      const v = velhos.get(p.id);
      if (!v) linhas.push(`  NOVA       ${p.veredito.padEnd(14)} ${p.nome} · ${p.origem} · desde ${p.desde} · ${p.participam} entraram × ${p.fora} (${p.controle}) · efeito ${p.efeito ?? "—"} · ${p.tipo ?? ""}`);
      else if (v.veredito !== p.veredito || v.efeito !== p.efeito) linhas.push(`  MUDOU      ${v.veredito} → ${p.veredito} · ${p.nome} · efeito ${v.efeito ?? "—"} → ${p.efeito ?? "—"}`);
    }
    for (const v of antes[emp] ?? []) {
      if (lista.some((p) => p.id === v.id)) continue;
      linhas.push(`  SAIU       ${v.veredito.padEnd(14)} ${v.nome} · desde ${v.desde}`);
    }
  }
  const txt = linhas.join("\n");
  writeFileSync(path.join(saida, `diferencas-${TAG}.txt`), txt);
  console.log(txt);
}
