import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
const base='http://127.0.0.1:3017';
assert.equal((await fetch(base+'/api/operacao').then(r=>r.json())).id,'fixture-demo');
const inventario=JSON.parse(await readFile('docs/redesign/inventario-rotas.json','utf8'));
const fila=inventario.routes.map(r=>r.route.replace('[token]','demonstracao').replace('[chave]','demonstracao'));
const resultados=[];
// Renderização no servidor com fixtures. Fluxos e reflow são verificados
// separadamente nos scripts de cada área; aqui não se afirma teste visual.
await Promise.all(Array.from({length:2},async()=>{
 while(fila.length){const rota=fila.shift();try{
  const resposta=await fetch(base+rota,{signal:AbortSignal.timeout(90000)});
  const html=await resposta.text();
  assert.equal(resposta.status,200);assert(/<h1(?:\s|>)/.test(html),'Título ausente na renderização do servidor');
  assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500'),'falha de renderização');
  assert(!html.includes('Switched to client rendering because the server rendering errored:'),'falha de renderização do servidor');
  resultados.push({rota,passou:true});
 }catch(e){resultados.push({rota,passou:false,erro:e.message});}
 console.log(JSON.stringify(resultados.at(-1)));
 }
}));
await mkdir('output/revisao-2026-11-18',{recursive:true});
await writeFile('output/revisao-2026-11-18/qa-renderizacao-rotas.json',JSON.stringify({tipo:'HTTP e renderização SSR, sem interação ou inspeção visual',resultados},null,2));
if(resultados.some(r=>!r.passou))process.exitCode=1;
