import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.GERIZO_QA_URL || "http://127.0.0.1:3017";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
assert.equal((await fetch(base + "/api/operacao").then(r => r.json())).id, "fixture-demo");
const routes = ["/anuncios/analise", "/anuncios/catalogo", "/anuncios/preco-alvo", "/anuncios/preco-ideal", "/anuncios/preco-performance", "/anuncios/tipo", "/automacoes", "/automacoes/regras", "/promocoes/campanhas", "/promocoes/comparar", "/promocoes/historico", "/promocoes/processar", "/importar", "/conversa", "/monitoramento/precos", "/monitoramento/fretes"];
const results = [], network = { externalBlocked: [], writesBlocked: [], mockedPosts: [] };
const apenasCentral = process.argv.includes("--somente-central");
const filtroCaso = process.argv.find(arg => arg.startsWith("--caso="))?.slice(7).toLowerCase();
const browser = await chromium.launch({ channel: "msedge", headless: true });
async function check(name, width, action) {
  if (apenasCentral && !name.startsWith("Central:")) return;
  if (filtroCaso && !name.toLowerCase().includes(filtroCaso)) return;
  try { const evidence = await action(); results.push({ name, width, status: "passou", evidence }); }
  catch (e) { results.push({ name, width, status: "falhou", error: String(e?.stack || e) }); console.log("FALHA " + name + ": " + e.message); }
}
async function open(page, route) {
  const response = await page.goto(base + route, { waitUntil: "networkidle", timeout: 90000 });
  assert.equal(response.status(), 200, `HTTP ${response.status()} em ${route}`);
  await page.locator("h1").waitFor({timeout:15000});
}
try {
  for (const width of [1366, 390]) {
    const context = await browser.newContext({viewport:{width,height:844}, reducedMotion:"reduce",colorScheme:"light"});
    await context.route("**/*", async route => {
      const req=route.request(), url=new URL(req.url());
      if(url.origin!==new URL(base).origin){network.externalBlocked.push(url.hostname);return route.abort();}
      if(req.method()==="POST"&&url.pathname==="/api/importar/previa") {
        network.mockedPosts.push(url.pathname);
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({operacaoId:"fixture-demo",previa:{tipo:"pedidos",evidencia:"Fixture sintética de prévia, sem gravação",nomeArquivo:"pedidos-demonstracao.xlsx",jaImportado:null,periodo:{inicio:"2026-11-01",fim:"2026-11-16"},linhas:12,novas:10,atualizadas:2,reconhecidos:[{canal:"Mercado Livre",conta:"Conta de demonstração",linhas:12,mostrarConta:false}],naoReconhecidos:[],orfaos:[],avisos:[],contasDisponiveis:[]}})});
      }
      if(req.method()==="POST"&&url.pathname==="/api/automacoes/revisar") {
        network.mockedPosts.push(url.pathname);const data=req.postDataJSON();
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({conta:"Conta de demonstração",escritaConectada:false,vao:data.itens.length,ficam:0,linhas:data.itens.map(i=>({mlb:i.mlb,vai:true,metodo:"POST",caminho:"/fixture/sem-escrita",corpo:{preco:i.preco}}))})});
      }
      if(!["GET","HEAD"].includes(req.method())){network.writesBlocked.push(url.pathname);return route.abort();}
      return route.continue();
    });
    const page = await context.newPage(); const errors=[];page.on("pageerror", e=>errors.push(e.message));
    for(const route of routes) await check("Renderizar " + route,width,async()=>{const start=errors.length;await open(page,route);assert.equal(errors.length,start,errors.slice(start).join("\n"));return{h1:await page.locator("h1").first().textContent()};});
    await check("Central: buscar, abrir anúncio, trocar abas e voltar",width,async()=>{
      await open(page,"/anuncios/analise");await page.getByRole("textbox",{name:"Buscar anúncios",exact:true}).fill("DEMO-001");
      await page.waitForFunction(() => document.querySelectorAll(".ads-row").length === 1);assert.equal(await page.locator(".ads-row").count(),1);await page.getByRole("button",{name:"Ver anúncio MLBDEMO0001",exact:true}).click();
      await page.getByRole("tab",{name:"Preços",exact:true}).click();assert.match(await page.getByRole("tabpanel").innerText(),/Preço de referência/);
      await page.getByRole("tab",{name:"Desempenho",exact:true}).click();await page.getByText("Valores por dia",{exact:true}).click();
      assert(await page.locator(".ads-week-table tbody tr").count()>0);await page.getByRole("button",{name:"Voltar à lista",exact:true}).click();
      assert.equal(await page.locator(".ads-row").count(),1);return{contextoPreservado:true};
    });
    await check("Catálogo: filtrar disputa e abrir ficha",width,async()=>{
      await open(page,"/anuncios/catalogo");const busca=page.getByPlaceholder("Buscar SKU, código ou título",{exact:true});await busca.fill("INEXISTENTE_FIXTURE");
      assert(await page.getByText("Nenhum anúncio com esse filtro.",{exact:true}).isVisible());await busca.fill("");
      if(width<768)await page.getByRole("button",{name:"Abrir detalhes →",exact:true}).first().click();else await page.locator(".gerizo-data-table").last().locator("tbody tr").first().click();
      const dialog=page.getByRole("dialog");await dialog.waitFor();assert.match(await dialog.innerText(),/Cadastro/);await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});return{ficha:true};
    });
    await check("Automações: marcar e revisar sem enviar",width,async()=>{
      await open(page,"/automacoes");await page.locator(".auto-linha").first().click();await page.getByRole("button",{name:/Marcar os .* que cabem/}).waitFor();
      await page.getByRole("button",{name:/Marcar os .* que cabem/}).click();await page.getByRole("button",{name:"Revisar envio",exact:true}).click();
      const dialog=page.getByRole("dialog");await dialog.getByText("Oferta revisada",{exact:true}).first().waitFor();assert.match(await dialog.innerText(),/Nada foi enviado ainda/);await page.keyboard.press("Escape");return{envioReal:false};
    });
    await check("Histórico: alternar produto e processamentos",width,async()=>{
      await open(page,"/promocoes/historico");await page.getByRole("button",{name:"Processamentos",exact:true}).click();assert(await page.getByText("campanha-demonstracao.xlsx",{exact:true}).isVisible());await page.getByRole("button",{name:"Por produto",exact:true}).click();assert(await page.getByText("SKUs em promoção",{exact:true}).isVisible());return{ambasVisoes:true};
    });
    await check("Importação: prévia sintética sem gravar",width,async()=>{
      await open(page,"/importar");await page.locator('input[type="file"]').first().setInputFiles({name:"pedidos-demonstracao.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:Buffer.from("fixture-local")});
      await page.locator(".gerizo-reading").filter({hasText:"Pronto para importar"}).waitFor();assert.match(await page.locator("main").innerText(),/Linhas lidas/);return{previa:true,gravacao:false};
    });
    await check("Regras: abrir editor e cancelar",width,async()=>{
      await open(page,"/automacoes/regras");await page.getByRole("button",{name:"Nova regra",exact:true}).click();const dialog=page.getByRole("dialog");await dialog.waitFor();assert.match(await dialog.innerText(),/Quando faltar o dado/);await page.keyboard.press("Escape");return{escrita:false};
    });
    await check("Preços: evolução com escalas e dados separados",width,async()=>{
      await open(page,"/monitoramento/precos");await page.locator('tr[aria-label^="Evolução de preço"]').first().click();assert(await page.getByRole("region",{name:"Evolução do preço médio",exact:true}).isVisible().catch(()=>false)||await page.getByRole("region",{name:"Evolução das unidades",exact:true}).isVisible().catch(()=>false)||await page.getByText("Preço médio · R$",{exact:true}).isVisible());
      await page.getByText("Ver dados da evolução",{exact:true}).click();assert(await page.getByRole("region",{name:"Valores de preço e unidades",exact:true}).isVisible());return{eixosSeparados:true};
    });
    assert.equal(errors.length,0,errors.join("\n"));await context.close();
  }
} finally {
  await browser.close();await mkdir("output/redesign",{recursive:true});
  if(apenasCentral||filtroCaso){const antigo=JSON.parse(await readFile("output/redesign/qa-operacao.json","utf8"));const novos=[...results];results.splice(0,results.length,...antigo.results.map(r=>{const novo=novos.find(n=>n.name===r.name&&n.width===r.width);return novo?{...novo,rechecagem:{statusAnterior:r.status,erroAnterior:r.error}}:r;}));for(const key of Object.keys(network))network[key]=[...antigo.network[key],...network[key]];}
  await writeFile("output/redesign/qa-operacao.json",JSON.stringify({fixture:true,results,network},null,2));
}
const failures=results.filter(r=>r.status!=="passou");console.log(`${results.length-failures.length}/${results.length} cenários de Operação aprovados`);if(failures.length)process.exitCode=1;
