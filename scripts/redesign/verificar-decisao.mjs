import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3017";
const marker = await fetch(origin + "/api/operacao").then(r => r.json());
assert.equal(marker.id, "fixture-demo");
const routes = ["/vendas/anual","/vendas/semanal","/vendas/comparativos","/vendas/lancamentos","/vendas/canais","/vendas/diario","/vendas/dia","/vendas/mtd","/vendas/metas","/vendas/skus","/vendas/queda","/vendas/cancelamentos","/mercado-livre","/anuncios/trafego-pago","/produtos","/produtos/precificacao"];
const somenteQueda = process.argv.includes("--somente-queda");
const browser = await chromium.launch({channel:"msedge",headless:true});
const context = await browser.newContext({viewport:{width:1366,height:768},colorScheme:"light"});
await context.route("**/*",r=>new URL(r.request().url()).origin===origin&&["GET","HEAD"].includes(r.request().method())?r.continue():r.abort());
const page = await context.newPage();
page.setDefaultTimeout(15000);
const results=[];let errors=[];
page.on("pageerror",e=>errors.push(e.message));
const open = async route => {await page.goto(origin+route,{waitUntil:"domcontentloaded",timeout:90000});await page.locator("h1").first().waitFor({timeout:60000});await page.waitForLoadState("networkidle",{timeout:20000}).catch(()=>{});};
try {
 for(const route of somenteQueda ? routes.filter(r=>r==="/vendas/queda") : routes){errors=[];try{await open(route);assert(!errors.length,errors.join("; "));results.push({route,passou:true,titulo:await page.locator("h1").first().innerText(),errors:[...errors]});}catch(error){results.push({route,passou:false,erro:error.message,errors:[...errors]});}console.log(JSON.stringify(results.at(-1)));}
 const cases = [
  ["anual-separa-mensal-acumulado",async()=>{await open("/vendas/anual");assert(await page.getByRole("heading",{name:"Receita por mês",exact:true}).isVisible());assert(await page.getByRole("heading",{name:"Receita acumulada",exact:true}).isVisible());assert.equal(await page.locator("main .recharts-yAxis").count(),2);} ],
  ["semanal-alterna-matriz-lista",async()=>{await open("/vendas/semanal");await page.locator("main").getByRole("button",{name:"Lista ordenável",exact:true}).click();assert(await page.getByRole("heading",{name:"Lista ordenável",exact:true}).isVisible());await page.locator("main").getByRole("button",{name:"Matriz",exact:true}).click();assert(await page.getByRole("heading",{name:"Semana a semana",exact:true}).isVisible());} ],
  ["termometro-troca-unidade",async()=>{await open("/mercado-livre");await page.locator("main").getByRole("button",{name:"Unidades",exact:true}).click();assert.equal(await page.locator("main").getByRole("button",{name:"Unidades",exact:true}).getAttribute("aria-pressed"),"true");} ],
  ["ads-recortes-e-dados",async()=>{await open("/anuncios/trafego-pago");assert(await page.getByLabel("Margem depois da mídia",{exact:true}).isVisible());await page.locator("main").getByText("Ver dados diários",{exact:true}).click();assert(await page.getByRole("region",{name:"Investimento e faturamento diários"}).isVisible());} ],
  ["queda-unidades-separadas",async()=>{await open("/vendas/queda");await page.locator("main li > button[aria-expanded]").first().click();await page.locator("main").getByRole("button",{name:"Evolução",exact:true}).click();await page.getByRole("heading",{name:"Preço anunciado e vendido",exact:true}).waitFor();assert(await page.getByRole("heading",{name:"Receita por dia",exact:true}).isVisible());assert(await page.getByRole("heading",{name:"Visitas por dia",exact:true}).isVisible());await page.locator("main").getByText("Ver todos os dados por dia",{exact:true}).click();assert.equal(await page.getByRole("region",{name:"Evidência diária"}).locator("tbody tr").count(),14);} ],
  ["precificacao-abas-cotacao",async()=>{await open("/produtos/precificacao");await page.locator("main").getByRole("button",{name:"Cotação",exact:true}).click();assert(await page.getByRole("heading",{name:"Produto e medidas",exact:true}).isVisible());await page.locator("main").getByRole("button",{name:"Contribuição",exact:true}).click();assert(await page.getByLabel(/Contribuição estimada/).isVisible());} ],
 ];
 for(const[nome,run]of somenteQueda ? cases.filter(([nome])=>nome.startsWith("queda-")) : cases){errors=[];try{await run();assert(!errors.length,errors.join("; "));results.push({nome,passou:true,errors:[...errors]});}catch(error){results.push({nome,passou:false,erro:error.message,errors:[...errors]});}console.log(JSON.stringify(results.at(-1)));}
} finally {await browser.close();await mkdir("output/redesign",{recursive:true});await writeFile(`output/redesign/qa-decisao${somenteQueda ? "-queda" : ""}.json`,JSON.stringify({dados:"fixture sintética isolada",screenshots:false,resultados:results},null,2));}
if(results.some(r=>!r.passou))process.exitCode=1;
