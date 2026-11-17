import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.GERIZO_QA_URL || 'http://127.0.0.1:3017';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use somente a fixture local.');
const fixture = await fetch(base + '/api/operacao').then(r => r.json());
if (fixture.id !== 'fixture-demo') throw new Error('A fonte não é a fixture isolada.');
const pares = [
  ...['ink', 'ink-2', 'ink-3'].flatMap(t => ['ground', 'panel', 'panel-2'].map(f => [t, f, 4.5])),
  ['brand', 'panel', 4.5], ['brand-ink', 'brand', 4.5], ['nav-ink', 'nav-active', 4.5],
  ...['up', 'warn', 'down', 'info'].map(t => [t, t + '-wash', 4.5]),
  ['line-2', 'panel', 3], ['line-2', 'ground', 3],
];
const luminancia = hex => {
  const digits = hex.replace('#', '');
  const normal = digits.length === 3 ? [...digits].map(n => n + n).join('') : digits;
  const rgb = normal.match(/.{2}/g).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const resultados = [];
try {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  for (const tema of ['light', 'dark']) {
    const cores = await page.evaluate(({ tema, tokens }) => {
      document.documentElement.dataset.theme = tema;
      const estilo = getComputedStyle(document.documentElement);
      return Object.fromEntries(tokens.map(t => [t, estilo.getPropertyValue('--' + t).trim()]));
    }, { tema, tokens: [...new Set(pares.flatMap(([a, b]) => [a, b]))] });
    for (const [texto, fundo, minimo] of pares) {
      const a = luminancia(cores[texto]), b = luminancia(cores[fundo]);
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      resultados.push({ tema, texto, fundo, cores: [cores[texto], cores[fundo]], ratio: +ratio.toFixed(2), minimo, passou: ratio >= minimo });
    }
  }
} finally { await browser.close(); }
await mkdir('output/redesign', { recursive: true });
await writeFile('output/redesign/contraste.json', JSON.stringify(resultados, null, 2));
const falhas = resultados.filter(r => !r.passou);
console.log(JSON.stringify({ pares: resultados.length, falhas }, null, 2));
if (falhas.length) process.exitCode = 1;
