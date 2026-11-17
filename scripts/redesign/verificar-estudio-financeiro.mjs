import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:3017";
assert.equal((await fetch(base + "/api/operacao").then(r => r.json())).id, "fixture-demo");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const resultados = [], erros = [], escritas = [];
const rotas = ["/planejamento", "/planejamento/resultados", "/financeiro", "/financeiro/custos", "/financeiro/categorias", "/financeiro/folha", "/financeiro/fornecedores", "/financeiro/contas"];
async function caso(nome, contexto, tarefa) { console.log("Executando " + JSON.stringify({ nome, ...contexto })); try { resultados.push({ nome, ...contexto, status: "passou", evidencia: await tarefa() }); } catch(e) { const r = { nome, ...contexto, status: "falhou", erro: String(e) }; resultados.push(r); console.log(JSON.stringify(r)); } }
try {
  for (const width of [390, 1366]) for (const tema of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 768 }, colorScheme: tema, reducedMotion: "reduce" });
    await context.addInitScript(t => localStorage.setItem("tema", t), tema);
    await context.route("**/*", route => { const r = route.request(); if (new URL(r.url()).origin !== base) return route.abort(); if (!["GET", "HEAD"].includes(r.method())) { escritas.push({ url: r.url(), method: r.method() }); return route.abort(); } return route.continue(); });
    const page = await context.newPage(); page.on("pageerror", e => erros.push(e.message));
    for (const rota of rotas) await caso("Reflow e renderização", { width, tema, rota }, async () => {
      const resposta = await page.goto(base + rota, { waitUntil: "domcontentloaded", timeout: 90000 });
      assert(resposta?.status() === 200, `HTTP ${resposta?.status()}`);
      await page.locator("h1").waitFor({ timeout: 45000 });
      await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]));
      const dados = await page.evaluate(() => ({ titulo: document.querySelector("h1")?.textContent, width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert(dados.scroll <= dados.width + 1, JSON.stringify(dados)); return dados;
    });
    await caso("Modos e editor do Planejamento", { width, tema }, async () => {
      await page.goto(base + "/planejamento", { waitUntil: "networkidle", timeout: 90000 });
      const nav = page.getByRole("navigation", { name: "Visualizações do planejamento" });
      for (const modo of ["Quadro", "Calendário", "Mapa", "Foco", "Hoje"]) { const button = nav.getByRole("button", { name: modo, exact: true }); await button.click(); await page.waitForTimeout(250); assert.equal(await button.getAttribute("aria-pressed"), "true"); const medida = await page.evaluate(() => ({ w: document.documentElement.clientWidth, s: document.documentElement.scrollWidth })); assert(medida.s <= medida.w + 1, modo + " causou overflow"); }
      await page.getByRole("button", { name: "Nova campanha", exact: true }).click();
      const dialogo = page.getByRole("dialog"); await dialogo.waitFor(); assert(await dialogo.locator("input").count() > 0); await page.keyboard.press("Escape"); await dialogo.waitFor({ state: "hidden" }); return { modos: 5, formulario: "aberto e fechado sem gravação" };
    });
    await caso("Custos: modos e edição local", { width, tema }, async () => {
      await page.goto(base + "/financeiro/custos", { waitUntil: "networkidle", timeout: 90000 });
      for (const aba of ["Frete por peso", "Custos do canal", "Por SKU"]) { await page.getByRole("button", { name: new RegExp("^" + aba) }).click(); }
      if (width === 390) { await page.getByText("Editar custos do produto", { exact: true }).first().click(); const input = page.getByRole("textbox", { name: "Mercadoria de DEMO-138" }); await input.fill("430"); await input.press("Tab"); assert(await page.getByRole("button", { name: "Gravar alterações", exact: true }).first().isEnabled()); await page.getByRole("button", { name: "Ver tabela", exact: true }).click(); assert(await page.getByRole("region", { name: "Tabela completa de custos por SKU" }).isVisible()); }
      return { abas: 3, gravacao: "não executada" };
    });
    for (const [rota, singular] of [["/financeiro/categorias", "categoria"], ["/financeiro/folha", "funcionário"], ["/financeiro/fornecedores", "fornecedor"], ["/financeiro/contas", "conta"]]) await caso("Cadastro: formulário por seções", { width, tema, rota }, async () => {
      await page.goto(base + rota, { waitUntil: "networkidle", timeout: 90000 });
      await page.getByRole("button", { name: "Adicionar " + singular, exact: true }).click();
      const dialogo = page.getByRole("dialog"); await dialogo.waitFor(); const secoes = await dialogo.locator("fieldset").count(); assert(secoes >= 2); await page.keyboard.press("Escape"); await dialogo.waitFor({ state: "hidden" }); return { secoes, gravacao: "não executada" };
    });
    await context.close();
  }
} finally { await browser.close(); await mkdir("output/redesign", { recursive: true }); await writeFile("output/redesign/qa-estudio-financeiro.json", JSON.stringify({ total: resultados.length, passaram: resultados.filter(r => r.status === "passou").length, erros, escritas, resultados }, null, 2)); }
console.log(JSON.stringify({ total: resultados.length, passaram: resultados.filter(r => r.status === "passou").length, erros, escritas }));
if (resultados.some(r => r.status === "falhou") || erros.length) process.exitCode = 1;
