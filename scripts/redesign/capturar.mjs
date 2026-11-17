import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.GERIZO_QA_URL || 'http://127.0.0.1:3017';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use somente a fixture local.');
const operacao = await fetch(base + '/api/operacao').then(r => r.json());
if (operacao.id !== 'fixture-demo') throw new Error('A fonte não é a fixture isolada.');
const etapa = process.argv[2] || 'baseline';
const destino = path.resolve('output/redesign', etapa);
await mkdir(destino, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const resultados = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
    for (const tema of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, colorScheme: tema, reducedMotion: 'reduce' });
      await context.addInitScript((t) => localStorage.setItem('tema', t), tema);
      // A fixture nunca deve falar com serviços ou contas reais.
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(base).origin || !['GET', 'HEAD'].includes(route.request().method())) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      const erros = [];
      page.on('pageerror', (error) => erros.push(error.message));
      for (const [nome, rota] of [['visao-geral', '/'], ['alertas', '/alertas'], ['envios', '/mercado-livre/envios']]) {
        await page.goto(base + rota, { waitUntil: 'networkidle' });
        await page.locator('#gerizo-abertura').waitFor({ state: 'hidden', timeout: 25000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        if (etapa !== 'baseline') await page.locator('.gerizo-company').waitFor({ state: 'visible', timeout: 30000 });
        const arquivo = `${nome}-${viewport.width}x${viewport.height}-${tema}.png`;
        await page.screenshot({ path: path.join(destino, arquivo), fullPage: true });
        await page.screenshot({ path: path.join(destino, arquivo.replace('.png', '-viewport.png')), fullPage: false });
        resultados.push({ rota, viewport, tema, dados: 'fixture sintética isolada', arquivo, ...await page.evaluate(() => ({
          largura: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          titulo: document.querySelector('h1')?.textContent,
          texto: document.querySelector('main')?.textContent,
        })), erros: [...erros] });
      }
      await context.close();
    }
  }
} finally { await browser.close(); }
await writeFile(path.join(destino, 'resultados.json'), JSON.stringify(resultados, null, 2));
console.log(JSON.stringify(resultados.map(({ texto, ...result }) => result), null, 2));
