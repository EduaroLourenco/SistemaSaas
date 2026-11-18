import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";

const origin = "http://127.0.0.1:3017";
const output = "output/revisao-2026-11-18";
const onlyRoute = process.argv.find(a => a.startsWith("--route="))?.slice(8);
assert.equal((await fetch(origin + "/api/operacao").then(r => r.json())).id, "fixture-demo");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ colorScheme: "light", reducedMotion: "reduce" });
await context.route("**/*", route => new URL(route.request().url()).origin === origin && ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort());
const page = await context.newPage();
page.setDefaultTimeout(15000);
const results = [];
let pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
const open = async route => {
  pageErrors = [];
  await page.goto(origin + route, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator("h1").first().waitFor({ timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]));
  await page.locator(".gerizo-company").first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll("main .recharts-responsive-container")].every(el => el.querySelector("svg.recharts-surface")), { timeout: 30000 });
};
const test = async (name, run) => {
  if (onlyRoute && !name.includes(onlyRoute) && !(onlyRoute === "/mercado-livre" && name.startsWith("Termômetro:")) && !(onlyRoute === "/anuncios/trafego-pago" && name.startsWith("Ads:")) && !(onlyRoute === "/vendas/skus" && name.startsWith("SKU:")) && !(onlyRoute === "/vendas/queda" && name.startsWith("Queda:"))) return;
  let initialIssue;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const evidence = await run(); assert(!pageErrors.length, pageErrors.join("; ")); results.push({ name, passed: true, ...(initialIssue ? { recoveredDevReload: initialIssue } : {}), ...evidence }); break; }
    catch(error) {
      if (!attempt && /Invalid or unexpected token|net::ERR_ABORTED/.test(error.message)) { initialIssue = error.message; continue; }
      results.push({ name, passed: false, error: error.message, pageErrors: [...pageErrors] }); break;
    }
  }
  console.log(JSON.stringify(results.at(-1)));
};
try {
  await test("Ads: escolhe um único relatório pelas datas sem alterar a lista", async () => {
    pageErrors = [];
    const source = await readFile("src/app/anuncios/trafego-pago/trafego-pago-cliente.tsx", "utf8");
    const helper = source.match(/function janelaDoPeriodo\([^]*?\n\}/)?.[0];
    assert(helper);
    const code = ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    const choose = new Function(`${code}; return janelaDoPeriodo;`)();
    const reports = [{ inicio: "2026-10-17", fim: "2026-11-15" }, { inicio: "2026-10-01", fim: "2026-10-31" }, { inicio: "2026-09-01", fim: "2026-09-30" }];
    const original = JSON.stringify(reports);
    const cases = [["2026-10-01", "2026-10-31", "2026-10-01|2026-10-31"], ["2026-11-01", "2026-11-15", "2026-10-17|2026-11-15"], ["2026-09-01", "2026-09-30", "2026-09-01|2026-09-30"], ["2026-12-01", "2026-12-05", "2026-10-17|2026-11-15"]];
    for (const [from, to, expected] of cases) assert.equal(choose(reports, from, to), expected);
    assert.equal(choose([], "2026-11-01", "2026-11-15"), "");
    assert.equal(choose(reports, "", "2026-11-15"), "");
    assert.equal(JSON.stringify(reports), original);
    return { cases: cases.length + 2, source: "Função de seleção extraída do componente real; sem carregadores ou rede." };
  });
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    for (const route of ["/vendas/skus", "/vendas/queda", "/mercado-livre", "/anuncios/trafego-pago"]) {
      await test(`${route} @ ${width}`, async () => {
        await open(route);
        const layout = await page.evaluate(() => ({
          viewport: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          clippedNumbers: [...document.querySelectorAll("main .num")].filter(el => el.getClientRects().length && !el.closest("table") && getComputedStyle(el).overflow !== "visible" && el.scrollWidth > el.clientWidth + 2).map(el => ({ text: el.textContent, width: el.clientWidth, scrollWidth: el.scrollWidth })),
        }));
        assert(layout.pageWidth <= width + 1, `Página excede a tela: ${layout.pageWidth}/${width}`);
        assert.equal(layout.clippedNumbers.length, 0, JSON.stringify(layout.clippedNumbers));
        const screenshot = `${output}/${route.slice(1).replaceAll("/", "-")}-${width}.png`;
        await page.screenshot({ path: screenshot, fullPage: true });
        return { ...layout, screenshot };
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await test("SKU: visões e métricas acessíveis no celular", async () => {
    await open("/vendas/skus");
    const view = page.getByRole("combobox", { name: "Visão dos produtos", exact: true });
    assert(await view.isVisible());
    assert.equal(await page.locator(".analysis-desktop-views").isVisible(), false);
    for (const mode of ["canal", "periodo", "curva", "mes"]) { await view.selectOption(mode); assert.equal(await view.inputValue(), mode); }
    for (const metric of ["unidades", "preco", "comissao", "receita"]) { await page.getByRole("combobox", { name: "Medir por", exact: true }).selectOption(metric); }
    const table = page.getByRole("region", { name: "Tabela de produtos, com rolagem horizontal", exact: true });
    const scroll = await table.evaluate(el => { el.scrollLeft = 180; return { left: el.scrollLeft, width: el.clientWidth, scrollWidth: el.scrollWidth, maxHeight: getComputedStyle(el).maxHeight }; });
    assert(scroll.left > 0); assert.equal(scroll.maxHeight, "none");
    await page.getByRole("textbox", { name: "Buscar SKU ou título", exact: true }).fill("zz-inexistente");
    await page.waitForFunction(() => document.querySelectorAll(".sku-table tbody tr").length === 0);
    assert.equal(await table.locator("tbody tr").count(), 0);
    return { scroll };
  });
  await test("Termômetro: métrica, dia e reputação sem cortes", async () => {
    await open("/mercado-livre");
    for (const name of ["Unidades", "Visitas", "Receita"]) { const button = page.locator("main").getByRole("button", { name, exact: true }).first(); await button.click(); await page.locator("main button[aria-pressed=true]").filter({ hasText: new RegExp(`^${name}$`) }).waitFor(); assert.equal(await button.getAttribute("aria-pressed"), "true"); }
    await page.locator(".thermometer-days button").first().click();
    assert(await page.locator("main").getByText("Receita ads", { exact: true }).isVisible());
    const rep = await page.locator(".thermometer-reputation-metrics").evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, columns: getComputedStyle(el).gridTemplateColumns }));
    assert(rep.scrollWidth <= rep.width + 1);
    const overview = await page.locator(".thermometer-catalog-overview").evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns.split(" ").length, width: el.clientWidth, scrollWidth: el.scrollWidth }));
    assert.equal(overview.columns, 1); assert(overview.scrollWidth <= overview.width + 1);
    assert.equal(await page.locator(".thermometer-ranking-columns").isVisible(), false);
    await page.getByRole("combobox", { name: "Ordenar produtos mais vistos", exact: true }).selectOption("receita");
    await page.getByText("Como a semana é comparada", { exact: true }).click();
    assert(await page.getByText(/O ritmo compara os mesmos/).isVisible());
    await page.getByRole("button", { name: "Ver os 1 que mudaram", exact: true }).click();
    const catalog = page.getByRole("region", { name: "Mudanças no catálogo, com rolagem horizontal", exact: true });
    assert(await catalog.isVisible());
    assert(await catalog.evaluate(el => el.scrollWidth > el.clientWidth));
    return { reputation: rep, catalogOverview: overview };
  });
  await test("Ads: fonte recolhida, ajuste manual e série diária", async () => {
    await open("/anuncios/trafego-pago");
    assert.equal(await page.getByRole("combobox", { name: "Relatório por anúncio", exact: true }).isVisible(), false);
    await page.locator(".analysis-source > summary").click();
    const report = page.getByRole("combobox", { name: "Relatório por anúncio", exact: true });
    assert(await report.isVisible());
    await report.selectOption({ index: 1 });
    await page.waitForURL(/janela=2026-10-01/);
    assert(await page.getByText("Relatório escolhido manualmente", { exact: true }).isVisible());
    await page.getByRole("button", { name: "Usar seleção automática", exact: true }).click();
    assert(await page.getByText("Relatório escolhido pelas datas", { exact: true }).isVisible());
    await page.getByText("Ver dados diários", { exact: true }).click();
    assert(await page.getByRole("region", { name: "Investimento e faturamento diários", exact: true }).isVisible());
    return { report: await report.inputValue() };
  });
  await test("Queda: filtro, detalhe e evolução por unidade", async () => {
    await open("/vendas/queda");
    const showAll = page.getByRole("button", { name: "Ver todos os 5 sinais", exact: true });
    await showAll.click();
    assert.equal(await page.getByRole("button", { name: "Ver principais", exact: true }).getAttribute("aria-expanded"), "true");
    await page.locator("main li > button[aria-expanded]").first().click();
    await page.locator("main").getByRole("button", { name: "Evolução", exact: true }).click();
    await page.getByRole("heading", { name: "Receita por dia", exact: true }).waitFor();
    assert(await page.getByRole("heading", { name: "Preço anunciado e vendido", exact: true }).isVisible());
    assert(await page.getByRole("heading", { name: "Visitas por dia", exact: true }).isVisible());
    await page.getByText("Ver todos os dados por dia", { exact: true }).click();
    assert.equal(await page.getByRole("region", { name: "Evidência diária", exact: true }).locator("tbody tr").count(), 14);
    return {};
  });
} finally {
  await browser.close();
  await writeFile(`${output}/qa-refino-analitico${onlyRoute ? onlyRoute.replaceAll("/", "-") : ""}.json`, JSON.stringify({ data: "2026-11-18", source: "Componentes reais no harness com dados sintéticos; rede externa e escritas bloqueadas no navegador.", results }, null, 2));
}
if (results.some(r => !r.passed)) process.exitCode = 1;
