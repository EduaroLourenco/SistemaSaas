/**
 * Lê o texto de uma apresentação, slide a slide.
 *
 * O `slide_text.py` do kit de PowerPoint não roda aqui: esta máquina não
 * tem Python. Um .pptx é um zip de XML, e é só isso que isto faz — abre,
 * acha os `<a:t>` na ordem em que aparecem e imprime, marcando tabela e
 * gráfico quando encontra.
 *
 * Uso: node scripts/local/ler-pptx.mjs arquivo.pptx [--xml 3]
 */
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

const arquivo = process.argv[2];
if (!arquivo) throw new Error("Passe o caminho do .pptx");
const soXml = process.argv.includes("--xml") ? Number(process.argv[process.argv.indexOf("--xml") + 1]) : null;

const zip = await JSZip.loadAsync(readFileSync(arquivo));
const slides = Object.keys(zip.files)
  .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const texto = (xml) => [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
  .map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));

for (const nome of slides) {
  const n = Number(nome.match(/\d+/)[0]);
  const xml = await zip.file(nome).async("string");
  if (soXml != null) {
    if (n !== soXml) continue;
    writeFileSync(`slide${n}.xml`, xml);
    console.log(`escrito slide${n}.xml (${xml.length} caracteres)`);
    continue;
  }
  const t = texto(xml);
  const tabelas = (xml.match(/<a:tbl>/g) ?? []).length;
  const graficos = (xml.match(/r:id="[^"]*"\/>\s*<\/p:graphicFrame>|chart/gi) ?? []).length;
  console.log(`\n══════ slide ${n} ══════  ${t.length} textos${tabelas ? ` · ${tabelas} tabela(s)` : ""}${graficos ? " · tem gráfico" : ""}`);
  console.log(t.map((x, i) => `  [${i}] ${x}`).join("\n"));
}

/* Os gráficos ficam em partes próprias, com os números dentro. */
const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
if (charts.length && soXml == null) {
  console.log(`\n\n══════ ${charts.length} gráfico(s) ══════`);
  for (const nome of charts) {
    const xml = await zip.file(nome).async("string");
    const series = [...xml.matchAll(/<c:tx>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>[\s\S]*?<\/c:tx>/g)].map((m) => m[1]);
    const valores = [...xml.matchAll(/<c:val>([\s\S]*?)<\/c:val>/g)].map((m) =>
      [...m[1].matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map((v) => v[1]).join(", "));
    const cats = [...xml.matchAll(/<c:cat>([\s\S]*?)<\/c:cat>/g)].map((m) =>
      [...m[1].matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map((v) => v[1]).join(", "));
    console.log(`\n  ${nome}`);
    console.log(`  séries: ${series.join(" | ")}`);
    cats.slice(0, 1).forEach((c) => console.log(`  categorias: ${c}`));
    valores.forEach((v, i) => console.log(`  valores ${series[i] ?? i}: ${v}`));
  }
}
