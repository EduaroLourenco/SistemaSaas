import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:3017';
assert.equal((await fetch(base+'/api/operacao').then(r=>r.json())).id,'fixture-demo');
const dir='output/revisao-2026-11-18'; await mkdir(dir,{recursive:true});
const resultados=[];
const apenas=process.argv.find(a=>a.startsWith('--route='))?.slice(8);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const width of [320,390,768,1366]) {
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:'light',reducedMotion:'reduce'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===base&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
  const page=await context.newPage();page.setDefaultTimeout(12000); let erros=[];page.on('pageerror',e=>erros.push(e.message));
  const clicar=async locator=>{await locator.waitFor();await locator.evaluate(e=>new Promise((resolve,reject)=>{const inicio=Date.now();const conferir=()=>{if(Object.keys(e).some(k=>k.startsWith('__reactProps')&&typeof e[k]?.onClick==='function'))return resolve();if(Date.now()-inicio>20000)return reject(Error('Controle não hidratou'));setTimeout(conferir,100);};conferir();}));await locator.click();};
  for(const rota of ['/vendas/dia','/vendas/semanal','/financeiro','/vendas/diario'].filter(r=>!apenas||r===apenas)) {
   erros=[];
   try {
    assert.equal((await page.goto(base+rota,{waitUntil:'domcontentloaded',timeout:90000})).status(),200);
    await page.locator('h1').first().waitFor({timeout:45000});
    await page.waitForLoadState('networkidle',{timeout:12000}).catch(()=>{});
    assert.deepEqual(erros,[]);
    const largura=await page.evaluate(()=>({pagina:document.documentElement.scrollWidth,tela:innerWidth}));
    assert(largura.pagina<=width+1,`vazamento: ${JSON.stringify(largura)}`);
    if(width===390||width===1366) await page.screenshot({path:`${dir}/${rota.slice(1).replaceAll('/','-')}-${width}.png`,fullPage:true});
    if(rota==='/vendas/dia') {
     const agenda=page.getByText('Próximos 7 dias',{exact:false}).first();
     if(await agenda.count()) {await agenda.click();assert(await page.locator('details[open] ul li').count()>=7);}
     const calendario=page.getByRole('button',{name:/01\/11:/}).first();
     if(await calendario.count()) assert(await calendario.isVisible());
     await clicar(page.getByRole('button',{name:'Por canal',exact:false}).first());
     await page.getByRole('dialog').waitFor();
     assert(await page.getByRole('dialog').getByText('Receita líquida',{exact:true}).count()>0);
     await page.keyboard.press('Escape');
    }
    if(rota==='/financeiro'&&width<768) {
     await clicar(page.getByRole('button',{name:/Receita, custos e margem/}));
     const dialog=page.getByRole('dialog');await dialog.waitFor();
     const tabela=dialog.getByRole('region',{name:'Resultado por dimensão'});
     assert(await tabela.isVisible());
     const medidas=await tabela.evaluate(e=>({w:e.clientWidth,scroll:e.scrollWidth,overflow:getComputedStyle(e).overflowX}));
     assert(medidas.scroll>medidas.w&&medidas.overflow==='auto');
     assert((await dialog.evaluate(e=>e.getBoundingClientRect().width))<=width);
     await page.keyboard.press('Escape');
    }
    if(rota==='/financeiro') {
     await clicar(page.getByRole('button',{name:/Demonstrativo mês a mês/}));
     const dialog=page.getByRole('dialog');await dialog.waitFor();
     assert(await dialog.getByRole('region',{name:'DRE mês a mês. Deslize para ver os meses.'}).isVisible());
     await page.keyboard.press('Escape');
    }
    if(rota==='/vendas/diario') {await clicar(page.getByRole('button',{name:'Sobre Comparar período',exact:true}));assert(await page.getByText('Até 4 períodos lado a lado, métrica por métrica',{exact:true}).isVisible());}
    resultados.push({rota,width,passou:true});
   }catch(e){resultados.push({rota,width,passou:false,erro:e.message,erros});}
   console.log(JSON.stringify(resultados.at(-1)));
  }
  await context.close();
 }
}finally {await browser.close();await writeFile(`${dir}/qa-refino-geral${apenas?'-'+apenas.slice(1).replaceAll('/','-'):''}.json`,JSON.stringify(resultados,null,2));}
if(resultados.some(r=>!r.passou))process.exitCode=1;
