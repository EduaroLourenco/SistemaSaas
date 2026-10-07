/**
 * Mede contraste, tipografia e altura de página — os três números que a
 * auditoria visual precisa afirmar sem depender de olho.
 *
 * Contraste é WCAG 2.1 calculado do hex, não estimado. Altura de página sai
 * do cabeçalho IHDR dos PNGs capturados.
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const css = fs.readFileSync(path.join(RAIZ, "src/app/globals.css"), "utf8");

/* ── tokens de cor, por bloco ── */
function tokensDe(bloco) {
  const t = {};
  for (const m of bloco.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) t[m[1]] = m[2];
  return t;
}
const raiz = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const iEscuro = css.indexOf('[data-theme="dark"]');
const escuroBloco = iEscuro > 0 ? css.slice(iEscuro, css.indexOf("}", iEscuro)) : "";
const claro = tokensDe(raiz);
const escuro = { ...claro, ...tokensDe(escuroBloco) };

/* ── WCAG 2.1 ── */
const canal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lum(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}
const razao = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* Distância perceptual grosseira, para achar cores quase iguais. */
function dist(a, b) {
  const p = (h) => {
    let s = h.replace("#", "");
    if (s.length === 3) s = [...s].map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  };
  const [x, y] = [p(a), p(b)];
  return Math.round(Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0)));
}

const PARES = [
  ["--ink", "--panel", "texto principal sobre cartão", 4.5],
  ["--ink", "--ground", "texto principal sobre fundo", 4.5],
  ["--ink-2", "--panel", "texto secundário sobre cartão", 4.5],
  ["--ink-3", "--panel", "rótulo/legenda sobre cartão", 4.5],
  ["--ink-3", "--panel-2", "rótulo sobre campo", 4.5],
  ["--brand-ink", "--brand", "texto do botão primário", 4.5],
  ["--brand", "--panel", "link/marca sobre cartão", 4.5],
  ["--up", "--panel", "número positivo", 4.5],
  ["--down", "--panel", "número negativo", 4.5],
  ["--warn", "--panel", "número de atenção", 4.5],
  ["--info", "--panel", "número informativo", 4.5],
  ["--up", "--up-wash", "selo positivo", 4.5],
  ["--down", "--down-wash", "selo negativo", 4.5],
  ["--warn", "--warn-wash", "selo de atenção", 4.5],
  ["--brand", "--brand-wash", "selo da marca", 4.5],
  ["--line", "--panel", "divisória sobre cartão", 3],
  ["--line-2", "--panel", "borda de controle", 3],
];

const contraste = [];
for (const [fg, bg, nome, alvo] of PARES) {
  const linha = { nome, par: `${fg} / ${bg}`, alvo };
  for (const [tema, t] of [["claro", claro], ["escuro", escuro]]) {
    if (!t[fg] || !t[bg]) continue;
    const r = razao(t[fg], t[bg]);
    linha[tema] = Math.round(r * 100) / 100;
    linha[tema + "Passa"] = r >= alvo;
  }
  contraste.push(linha);
}

/* ── cores quase iguais entre si ── */
const SEMANTICAS = ["--brand", "--up", "--warn", "--down", "--info"];
const colisoes = [];
for (let i = 0; i < SEMANTICAS.length; i++)
  for (let j = i + 1; j < SEMANTICAS.length; j++) {
    const [a, b] = [SEMANTICAS[i], SEMANTICAS[j]];
    if (!claro[a] || !claro[b]) continue;
    const d = dist(claro[a], claro[b]);
    const r = razao(claro[a], claro[b]);
    if (d < 90) colisoes.push({ a, b, hexA: claro[a], hexB: claro[b], distancia: d, razao: Math.round(r * 100) / 100 });
  }

/* ── séries de gráfico, duas a duas ── */
const serie = Object.entries(claro).filter(([k]) => /^--s\d+$/.test(k));
const seriesProximas = [];
for (let i = 0; i < serie.length; i++)
  for (let j = i + 1; j < serie.length; j++) {
    const d = dist(serie[i][1], serie[j][1]);
    if (d < 80) seriesProximas.push({ a: serie[i][0], b: serie[j][0], hexA: serie[i][1], hexB: serie[j][1], distancia: d });
  }

/* ── tipografia: tamanhos arbitrários em uso ── */
const arqs = [];
(function andar(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) andar(p);
    else if (/\.tsx$/.test(e.name)) arqs.push(p);
  }
})(path.join(RAIZ, "src"));
const corpo = arqs.map((a) => fs.readFileSync(a, "utf8")).join("\n");
const tam = {};
for (const m of corpo.matchAll(/text-\[([\d.]+)px\]/g)) tam[m[1]] = (tam[m[1]] ?? 0) + 1;
const tamanhos = Object.entries(tam).sort((a, b) => b[1] - a[1]);
const abaixoDe12 = tamanhos.filter(([t]) => +t < 12);

const bp = {};
for (const p of ["sm", "md", "lg", "xl", "2xl"]) bp[p] = (corpo.match(new RegExp(`\\b${p}:`, "g")) ?? []).length;

/* ── altura das capturas ── */
const CAP = path.join(RAIZ, "docs/redesign-ui/screenshots");
const png = (f) => {
  const b = fs.readFileSync(f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), kb: Math.round(fs.statSync(f).size / 1024) };
};
const imagens = [];
(function andar(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) andar(p);
    else if (e.name.endsWith(".png") && !p.includes("dobra")) {
      const i = png(p);
      imagens.push({ arq: path.relative(CAP, p).replace(/\\/g, "/"), ...i, telas: Math.round(i.h / (i.w === 1440 ? 900 : 844) * 10) / 10 });
    }
  }
})(CAP);
imagens.sort((a, b) => b.h - a.h);

const saida = {
  medidoEm: new Date().toISOString(),
  contraste,
  reprovados: contraste.filter((c) => c.claroPassa === false || c.escuroPassa === false),
  colisoesSemanticas: colisoes,
  seriesProximas,
  tipografia: { distintos: tamanhos.length, tamanhos, abaixoDe12 },
  breakpoints: bp,
  alturas: imagens.slice(0, 20),
  totalCapturas: imagens.length,
};
fs.writeFileSync(path.join(RAIZ, "docs/auditoria-visual-2026-10-07/evidencias/visual.json"), JSON.stringify(saida, null, 1));

console.log("── CONTRASTE (WCAG 2.1) ──");
for (const c of contraste)
  console.log(
    `  ${c.claroPassa === false || c.escuroPassa === false ? "✗" : "✓"} claro ${String(c.claro).padStart(6)}  escuro ${String(c.escuro).padStart(6)}  (alvo ${c.alvo})  ${c.nome}`
  );
console.log(`\nreprovados: ${saida.reprovados.length}`);
console.log("\n── CORES SEMÂNTICAS QUASE IGUAIS ──");
for (const c of colisoes) console.log(`  ${c.a} ${c.hexA}  vs  ${c.b} ${c.hexB}   distância ${c.distancia}  razão ${c.razao}`);
console.log("\n── SÉRIES DE GRÁFICO PRÓXIMAS ──");
for (const s of seriesProximas) console.log(`  ${s.a} ${s.hexA} vs ${s.b} ${s.hexB}  distância ${s.distancia}`);
console.log(`\n── TIPOGRAFIA ── ${tamanhos.length} tamanhos distintos`);
console.log("  " + tamanhos.map(([t, n]) => `${t}px×${n}`).join("  "));
console.log(`  abaixo de 12px: ${abaixoDe12.map(([t, n]) => t + "px×" + n).join(" ")}`);
console.log("\n── BREAKPOINTS ──", JSON.stringify(bp));
console.log(`\n── ALTURA (${imagens.length} capturas de página inteira) ──`);
for (const i of imagens.slice(0, 12)) console.log(`  ${String(i.h).padStart(7)}px  ${String(i.telas).padStart(6)} telas  ${String(i.kb).padStart(6)}KB  ${i.arq}`);
