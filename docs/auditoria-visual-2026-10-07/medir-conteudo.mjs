/**
 * Mede o texto da interface: quantas frases existem, quão longas são, e onde
 * o mesmo conceito aparece com nome diferente.
 *
 * Saída em `evidencias/conteudo.json`, para o documento 04 citar número
 * medido em vez de impressão.
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const arqs = [];
(function andar(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) andar(p);
    else if (/\.tsx?$/.test(e.name)) arqs.push(p);
  }
})(path.join(RAIZ, "src"));

/* Descarta o que é código travestido de string: classe do Tailwind, caminho,
 * nome de campo, expressão. Sobra prosa. */
const CODIGO =
  /[<>{}=|&$\\]|\/\/|=>|\bpx-|\btext-\[|\bw-\d|\bflex\b|\bgrid\b|\bborder\b|\brounded\b|^[a-z]+[A-Z]|^\/|^#|^[a-z_]+$|^[a-z]+\.[a-z]/;

const frases = new Map();
const guardar = (t, a) => {
  t = t.replace(/\s+/g, " ").trim();
  if (t.length < 12 || t.length > 300) return;
  if (!/\s/.test(t)) return;
  if (CODIGO.test(t)) return;
  if (!/[a-zA-ZÀ-ú]{3}/.test(t)) return;
  if (!frases.has(t)) frases.set(t, path.relative(RAIZ, a).replace(/\\/g, "/"));
};

for (const a of arqs) {
  const s = fs.readFileSync(a, "utf8");
  for (const m of s.matchAll(/"([^"\n]{12,300})"/g)) guardar(m[1], a);
  for (const m of s.matchAll(/'([^'\n]{12,300})'/g)) guardar(m[1], a);
  for (const m of s.matchAll(/>([^<>{}\n]{12,300})</g)) guardar(m[1], a);
}

const todas = [...frases.keys()];
const acima = (k) => todas.filter((t) => t.length > k);

/* ── Vocabulário: o mesmo conceito com nomes diferentes ── */
const corpo = arqs.map((a) => fs.readFileSync(a, "utf8")).join("\n");
const contar = (re) => (corpo.match(re) ?? []).length;
const vocabulario = {
  "receita / faturamento / GMV": {
    receita: contar(/\breceita\b/gi),
    faturamento: contar(/\bfaturamento\b/gi),
    gmv: contar(/\bGMV\b/g),
  },
  "pedido / venda / order": {
    pedido: contar(/\bpedidos?\b/gi),
    venda: contar(/\bvendas?\b/gi),
    order: contar(/\borders?\b/gi),
  },
  "anúncio / listing / item": {
    anuncio: contar(/\banúncios?\b/gi),
    listing: contar(/\blistings?\b/gi),
    item: contar(/\bitems?\b/gi),
  },
  "operação / empresa / organização": {
    operacao: contar(/\boperaç(ão|ões)\b/gi),
    empresa: contar(/\bempresas?\b/gi),
    organizacao: contar(/\borganizaç(ão|ões)\b/gi),
  },
  "canal / marketplace": {
    canal: contar(/\bcanal\b|\bcanais\b/gi),
    marketplace: contar(/\bmarketplaces?\b/gi),
  },
  "visitas / sessões / cliques": {
    visitas: contar(/\bvisitas?\b/gi),
    sessoes: contar(/\bsess(ão|ões)\b/gi),
    cliques: contar(/\bcliques?\b/gi),
  },
};

/* ── Siglas e jargão que a tela mostra sem explicar ── */
const JARGAO = [
  "MTD", "SKU", "MLB", "ABC", "ROI", "ROAS", "TACoS", "CPC", "CTR", "GMV",
  "Buy Box", "Full", "rebate", "curva A", "take rate", "sell-out", "ticket",
  "elasticidade", "sparkline", "MoM", "YoY",
];
const jargao = {};
for (const j of JARGAO) {
  const re = new RegExp("\\b" + j.replace(/[-\s]/g, "[-\\s]") + "\\b", "gi");
  const n = contar(re);
  if (n) jargao[j] = n;
}

/* ── Estado vazio: quantas telas dizem algo quando não há dado ── */
const vazio = {
  EmptyState: contar(/<EmptyState/g),
  SemFonte: contar(/<SemFonte/g),
  TudoCerto: contar(/<TudoCerto/g),
  ComingSoon: contar(/<ComingSoon/g),
  ErroComSaida: contar(/<ErroComSaida/g),
};

const saida = {
  medidoEm: new Date().toISOString(),
  arquivos: arqs.length,
  frases: todas.length,
  comprimento: {
    acima80: acima(80).length,
    acima100: acima(100).length,
    acima140: acima(140).length,
    mediana: todas.map((t) => t.length).sort((a, b) => a - b)[Math.floor(todas.length / 2)],
  },
  maisLongas: acima(100)
    .sort((a, b) => b.length - a.length)
    .slice(0, 25)
    .map((t) => ({ n: t.length, onde: frases.get(t), texto: t })),
  vocabulario,
  jargao,
  vazio,
};

const destino = path.join(RAIZ, "docs/auditoria-visual-2026-10-07/evidencias/conteudo.json");
fs.writeFileSync(destino, JSON.stringify(saida, null, 1));

console.log(`frases: ${saida.frases}`);
console.log(`>80: ${saida.comprimento.acima80}  >100: ${saida.comprimento.acima100}  >140: ${saida.comprimento.acima140}  mediana: ${saida.comprimento.mediana}`);
console.log("\nvocabulário:");
for (const [k, v] of Object.entries(vocabulario)) console.log("  " + k + " → " + JSON.stringify(v));
console.log("\njargão:", JSON.stringify(jargao));
console.log("vazio:", JSON.stringify(vazio));
console.log("\nas 10 mais longas:");
for (const f of saida.maisLongas.slice(0, 10)) console.log(`  ${f.n}  ${f.onde}\n     ${f.texto.slice(0, 150)}`);
