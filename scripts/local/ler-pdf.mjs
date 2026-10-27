/**
 * Tira o texto de um PDF sem depender de poppler, que não existe nesta
 * máquina. Um PDF é uma pilha de streams comprimidos; o que interessa são
 * os que carregam operadores de texto, e dentro deles os literais entre
 * parênteses que os operadores Tj e TJ desenham.
 *
 * Não resolve PDF de imagem escaneada — ali não há texto nenhum, só pixel.
 *
 * Uso: node scripts/local/ler-pdf.mjs arquivo.pdf
 */
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const arquivo = process.argv[2];
if (!arquivo) throw new Error("Passe o caminho do .pdf");
const b = readFileSync(arquivo);

const pedacos = [];
let i = 0;
for (;;) {
  const ini = b.indexOf("stream", i);
  if (ini < 0) break;
  let p = ini + 6;
  if (b[p] === 13) p++;
  if (b[p] === 10) p++;
  const fim = b.indexOf("endstream", p);
  if (fim < 0) break;
  try {
    const d = zlib.inflateSync(b.subarray(p, fim)).toString("latin1");
    if (/\bTJ\b|\bTj\b/.test(d)) pedacos.push(d);
  } catch {
    /* stream que não é deflate, ou é imagem — não interessa */
  }
  i = fim + 9;
}

/* Octal e os escapes que o PDF usa dentro de um literal. */
const ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
function literal(s) {
  let out = "";
  for (let k = 0; k < s.length; k++) {
    if (s[k] !== "\\") { out += s[k]; continue; }
    const prox = s[++k];
    if (prox >= "0" && prox <= "7") {
      let oct = prox;
      while (oct.length < 3 && s[k + 1] >= "0" && s[k + 1] <= "7") oct += s[++k];
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += ESCAPES[prox] ?? prox;
  }
  return out;
}

let texto = "";
for (const d of pedacos) {
  /* Cada bloco de texto termina com ET; TD/Td/T* quebram linha. */
  for (const m of d.matchAll(/\((?:\\.|[^\\()])*\)|TJ|Tj|T\*|Td|TD|ET/gs)) {
    const t = m[0];
    if (t.startsWith("(")) texto += literal(t.slice(1, -1));
    else if (t === "T*" || t === "Td" || t === "TD" || t === "ET") texto += "\n";
  }
}

/* O PDF quebra a linha a cada deslocamento, então o texto sai picado em
   pedaços de uma palavra. Junta de volta o que era parágrafo. */
const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
const juntas = [];
for (const l of linhas) {
  const ultima = juntas[juntas.length - 1];
  if (ultima && ultima.length < 90 && !/[.:;!?]$/.test(ultima) && l[0] === l[0].toLowerCase()) {
    juntas[juntas.length - 1] = `${ultima} ${l}`;
  } else juntas.push(l);
}
console.log(juntas.join("\n"));
console.error(`\n[${pedacos.length} streams de texto · ${texto.length} caracteres]`);
