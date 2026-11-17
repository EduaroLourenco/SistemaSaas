import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.GERIZO_QA_URL || 'http://127.0.0.1:3017';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
assert.equal((await fetch(base+'/api/operacao').then(r=>r.json())).id,'fixture-demo');
const inventario = JSON.parse(await readFile('docs/redesign/inventario-rotas.json','utf8'));
const rotas = inventario.routes.map(r=>r.route.replace('[token]','demonstracao').replace('[chave]','demonstracao'));
const resultados = [];
const apenas = process.argv.find(a=>a.startsWith('--route='))?.slice(8);
const rechecagem = (process.argv.includes('--recheck') || apenas) ? JSON.parse(await readFile('output/redesign/qa-todas-rotas.json','utf8')) : null;
const browser = await chromium.launch({channel:'msedge',headless:true});
const variantes = process.argv.includes('--rapido') ? [{width:390,tema:'light'},{width:1366,tema:'light'}] : [320,390,1366].flatMap(width=>['light','dark'].map(tema=>({width,tema})));
try {
  for (const {width,tema} of variantes) {
    const context = await browser.newContext({viewport:{width,height:844},colorScheme:tema,reducedMotion:'reduce'});
    await context.addInitScript(t=>localStorage.setItem('tema',t),tema);
    await context.route('**/*',route=>{
      const r=route.request();
      if(new URL(r.url()).origin!==new URL(base).origin || !['GET','HEAD'].includes(r.method()))return route.abort();
      return route.continue();
    });
    const page=await context.newPage();
    let erros=[];
    page.on('pageerror',e=>erros.push(e.message));
    for(const rota of rotas) {
      if(apenas&&rota!==apenas)continue;
      if(rechecagem&&!apenas&&!rechecagem.resultados.some(r=>r.rota===rota&&r.viewport===width&&r.tema===tema&&r.status==='falhou'))continue;
      erros=[];
      try {
        const response=await page.goto(base+rota,{waitUntil:'domcontentloaded',timeout:60000});
        assert.equal(response.status(),200,'HTTP da rota');
        await page.locator('h1').first().waitFor({timeout:30000});
        await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
        if(await page.locator('#conteudo').count())await page.locator('.gerizo-company').waitFor({state:'visible',timeout:10000});
        await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,3000))]));
        if(rota.startsWith('/relatorio/')&&tema==='dark')await page.getByRole('button',{name:'Escuro',exact:true}).click();
        const medida=await page.evaluate(()=>{
          const width=document.documentElement.clientWidth;
          const scroll=document.documentElement.scrollWidth;
          const elementos=scroll>width+1?[...document.querySelectorAll('body *')].filter(e=>{
            const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
            return r.width>0&&r.right>width+1&&s.display!=='none'&&s.position!=='fixed';
          }).slice(-12).map(e=>({tag:e.tagName,classe:e.className?.baseVal??e.className,direita:Math.round(e.getBoundingClientRect().right)})):[];
          return {width,scroll,titulo:document.querySelector('h1')?.textContent??null,elementos};
        });
        const falhas=[];
        if(medida.scroll>medida.width+1)falhas.push('overflow');
        if(!medida.titulo)falhas.push('sem h1');
        if(erros.length)falhas.push('erro de navegador');
        const r={rota,viewport:width,tema,status:falhas.length?'falhou':'passou',falhas,...medida,erros:[...erros]};
        resultados.push(r);
        if(falhas.length)console.error(JSON.stringify(r));
        console.log(`${width} ${tema} ${rota} ${r.status}`);
        await mkdir('output/redesign',{recursive:true});
        await writeFile('output/redesign/qa-todas-rotas-parcial.json',JSON.stringify(resultados,null,2));
      }catch(e){const r={rota,viewport:width,tema,status:'falhou',erro:e.message,erros:[...erros]};resultados.push(r);console.error(JSON.stringify(r));}
    }
    await context.close();
    console.log(`${width}px ${tema}: ${resultados.filter(r=>r.viewport===width&&r.tema===tema&&r.status==='passou').length}/${rotas.length}`);
  }
}finally{
  await browser.close();
  await mkdir('output/redesign',{recursive:true});
  const consolidados=rechecagem?rechecagem.resultados.map(anterior=>{const novo=resultados.find(r=>r.rota===anterior.rota&&r.viewport===anterior.viewport&&r.tema===anterior.tema);return novo?{...novo,historico:[...(anterior.historico??[]),anterior]}:anterior;}):resultados;
  const relatorio={tipo:'DOM e reflow, sem capturas',dados:'fixtures sintéticas',total:consolidados.length,passou:consolidados.filter(r=>r.status==='passou').length,falhou:consolidados.filter(r=>r.status==='falhou').length,resultados:consolidados};
  await writeFile('output/redesign/qa-todas-rotas.json',JSON.stringify(relatorio,null,2));
  console.log(JSON.stringify({total:relatorio.total,passou:relatorio.passou,falhou:relatorio.falhou}));
  if(relatorio.falhou)process.exitCode=1;
}
