/**
 * Conta os controles de cada tela: botão, campo, select, aba, folha lateral.
 *
 * Conta o que está declarado no JSX — não o que aparece em runtime. Uma
 * tabela que gera um botão por linha conta 1 aqui e cem na tela; está dito
 * no documento.
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const APP = path.join(RAIZ, "src/app");

/* Agrupa arquivos por rota: page.tsx + irmãos -cliente.tsx */
const rotas = new Map();
(function andar(d) {
  const ent = fs.readdirSync(d, { withFileTypes: true });
  const tsx = ent.filter((e) => e.isFile() && /\.tsx$/.test(e.name));
  if (tsx.some((e) => e.name === "page.tsx")) {
    const rota = "/" + path.relative(APP, d).replace(/\\/g, "/");
    rotas.set(rota === "/." ? "/" : rota, tsx.map((e) => path.join(d, e.name)));
  }
  for (const e of ent) if (e.isDirectory()) andar(path.join(d, e.name));
})(APP);

const PADROES = {
  botoes: /<button\b|<Button\b/g,
  campos: /<input\b|<Input\b|<textarea\b|<Textarea\b/g,
  selects: /<select\b|<Select\b/g,
  abas: /<Segmented\b|<Tabs\b/g,
  folhas: /<Sheet\b|<FilterSheet\b/g,
  toggles: /<Toggle\b|<Checkbox\b/g,
  links: /<Link\b/g,
  graficos: /<(Line|Bar|Area|Pie|Composed|Scatter|Radar)Chart\b/g,
  tabelasAMao: /<table\b/g,
  recarteSelect: /<SelectRecorte\b/g,
  seletorCanal: /<SeletorCanal\b/g,
  /* Escrita: o que grava */
  postPut: /method:\s*"(POST|PUT|PATCH|DELETE)"/g,
  onSubmit: /onSubmit=/g,
};

const linhas = [];
for (const [rota, arqs] of [...rotas].sort()) {
  const corpo = arqs.map((a) => fs.readFileSync(a, "utf8")).join("\n");
  const r = { rota, arquivos: arqs.length, linhas: corpo.split("\n").length };
  for (const [k, re] of Object.entries(PADROES)) r[k] = (corpo.match(re) ?? []).length;
  /* Rótulos de aba, para enumerar os estados visuais */
  const rotulos = [...corpo.matchAll(/\{\s*v:\s*"[^"]+",\s*l:\s*"([^"]+)"/g)].map((m) => m[1]);
  const opcoes = [...corpo.matchAll(/(?:label|l):\s*"([^"]{2,28})"/g)].map((m) => m[1]);
  r.abasRotulos = [...new Set(rotulos.length ? rotulos : opcoes)].slice(0, 14);
  r.escreve = r.postPut > 0 || r.onSubmit > 0;
  linhas.push(r);
}

const soma = (k) => linhas.reduce((a, l) => a + l[k], 0);
const totais = {};
for (const k of Object.keys(PADROES)) totais[k] = soma(k);

const saida = { medidoEm: new Date().toISOString(), rotas: linhas.length, totais, telas: linhas };
fs.writeFileSync(
  path.join(RAIZ, "docs/auditoria-visual-2026-10-07/evidencias/interacao.json"),
  JSON.stringify(saida, null, 1)
);

console.log(`${linhas.length} rotas\n`);
console.log("TOTAIS:", JSON.stringify(totais, null, 1));
console.log(`\nescrevem no banco: ${linhas.filter((l) => l.escreve).length}`);
console.log(`só leem:           ${linhas.filter((l) => !l.escreve).length}`);
console.log("\n-- as 12 mais densas (botão + campo + select) --");
for (const l of [...linhas].sort((a, b) => b.botoes + b.campos + b.selects - (a.botoes + a.campos + a.selects)).slice(0, 12))
  console.log(`  ${String(l.botoes + l.campos + l.selects).padStart(4)}  ${l.rota.padEnd(32)} bot ${l.botoes} · campo ${l.campos} · sel ${l.selects} · graf ${l.graficos}${l.escreve ? " · ESCREVE" : ""}`);
console.log("\n-- só leitura, zero controle --");
for (const l of linhas.filter((x) => x.botoes + x.campos + x.selects + x.toggles === 0))
  console.log(`  ${l.rota}`);
