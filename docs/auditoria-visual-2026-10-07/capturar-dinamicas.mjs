/**
 * As duas rotas que a passada principal não alcança, porque têm segmento
 * dinâmico: `/relatorio/[chave]` e `/convite/[token]`.
 *
 * ── `/relatorio/[chave]` ──
 *
 * Capturada com chave REAL da operação de teste (lida por
 * `chave-relatorio.mjs`). É a maior tela do sistema e a única desenhada
 * como peça para diretoria — deixá-la fora seria a omissão mais cara do
 * pacote.
 *
 * ── `/convite/[token]` ──
 *
 * Capturada só com token inválido. Um convite válido exigiria gravar uma
 * linha de convite no banco de produção, e o estado de aceite consome o
 * convite ao ser visitado. O estado válido fica como PENDENTE, dito no
 * documento 07.
 *
 * Os dois enquadramentos de sempre: página inteira e dobra.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const DESTINO = path.join(RAIZ, "docs/redesign-ui/screenshots");
const CHAVE = fs.readFileSync(path.join(RAIZ, "docs/auditoria-visual-2026-10-07/.chave-relatorio.txt"), "utf8").trim();

const DESKTOP = { width: 1440, height: 900 };
const CELULAR = { width: 390, height: 844 };

const ALVOS = [
  { rota: `/relatorio/${CHAVE}`, nome: "relatorio-publico", pasta: "sem-moldura" },
  { rota: "/convite/token-invalido-de-teste", nome: "convite-token-invalido", pasta: "sem-moldura" },
];

const feitas = [];
const falhas = [];

const navegador = await chromium.launch({ channel: "chrome" });
const ctx = await navegador.newContext({ viewport: DESKTOP, locale: "pt-BR" });
const pag = await ctx.newPage();

const quieto = async () => {
  await pag.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
  await pag.waitForTimeout(1200);
};

async function tirar(pasta, nome, inteira) {
  fs.mkdirSync(pasta, { recursive: true });
  const arq = path.join(pasta, nome + ".png");
  await pag.screenshot({ path: arq, fullPage: inteira });
  feitas.push(path.relative(DESTINO, arq).replace(/\\/g, "/"));
}

for (const a of ALVOS) {
  try {
    await pag.setViewportSize(DESKTOP);
    const r = await pag.goto(BASE + a.rota, { waitUntil: "domcontentloaded", timeout: 45000 });
    await quieto();
    const st = r ? r.status() : 0;

    await tirar(path.join(DESTINO, a.pasta), `${a.nome}--desktop`, true);
    await tirar(path.join(DESTINO, "dobra", a.pasta), `${a.nome}--desktop`, false);

    await pag.setViewportSize(CELULAR);
    await quieto();
    await tirar(path.join(DESTINO, a.pasta), `${a.nome}--mobile`, true);
    await tirar(path.join(DESTINO, "dobra", a.pasta), `${a.nome}--mobile`, false);

    console.log(`  ✓ ${a.nome}  (HTTP ${st})`);
  } catch (e) {
    falhas.push({ rota: a.nome, motivo: String(e).slice(0, 160) });
    console.log(`  ✗ ${a.nome}: ${String(e).slice(0, 110)}`);
  }
}

await navegador.close();
fs.writeFileSync(
  path.join(DESTINO, "_dinamicas.json"),
  JSON.stringify({ geradoEm: new Date().toISOString(), feitas, falhas }, null, 1)
);
console.log(`\n${feitas.length} capturas · ${falhas.length} falha(s)`);
