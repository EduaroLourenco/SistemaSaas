import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJiti} from '../node_modules/jiti/lib/jiti.mjs';

const pasta=await mkdtemp(path.join(tmpdir(),'gerizo-origens-'));
let base={},gravacoes=[];
const sb={auth:{getUser:async()=>({data:{user:globalThis.__sessaoOrigem===false?null:{id:'usuario'}}})},from(tabela){
 const filtros=[];let carga;
 const q={select(){return q},order(){return q},eq(k,v){filtros.push(r=>r[k]===v);return q},in(k,v){filtros.push(r=>v.includes(r[k]));return q},gte(k,v){filtros.push(r=>r[k]>=v);return q},lte(k,v){filtros.push(r=>r[k]<=v);return q},upsert(rows){carga=Array.isArray(rows)?rows:[rows];return q},range(a,b){return Promise.resolve(resultado(a,b))},then(ok,no){return Promise.resolve(resultado()).then(ok,no)}};
 function resultado(a=0,b=1e9){
   if(carga){
     gravacoes.push({tabela,linhas:carga});
     // Simula o preenchimento por null de colunas omitidas em um lote misto.
     const colunas=new Set(carga.flatMap(r=>Object.keys(r)));
     for(const r of carga){
       const linha=Object.fromEntries([...colunas].map(k=>[k,r[k]??null]));
       const existente=(base[tabela]??=[]).find(x=>x.conta_canal_id===r.conta_canal_id&&x.data===r.data);
       if(existente)Object.assign(existente,linha);else base[tabela].push(linha);
     }
     return {data:null,error:null};
   }
   return {data:(base[tabela]??[]).filter(r=>filtros.every(f=>f(r))).slice(a,b+1),error:null};
 }
 return q;
}};
globalThis.__origensSb=sb;
try{
 const stub=path.join(pasta,'sb.cjs'),vazio=path.join(pasta,'vazio.cjs');
 await writeFile(stub,'module.exports={clientePrivilegiado:()=>globalThis.__origensSb,clienteServidor:async()=>globalThis.__origensSb,carregarAutomacao:async()=>globalThis.__automacaoOrigem||{}};');
 await writeFile(vazio,'module.exports={};');
 const jiti=createJiti(import.meta.url,{moduleCache:false,alias:{'@':path.join(process.cwd(),'src'),'server-only':vazio,'@/lib/supabase/privilegiado':stub,'@/lib/supabase/servidor':stub,'@/lib/dados/automacao':stub}});
 const {gravarDiariasComOrigem}=await jiti.import(path.join(process.cwd(),'src/lib/sync/origem.ts'));
 base.vendas_diarias=[{conta_canal_id:'a',data:'2026-10-01',receita:500,visitas:70,investimento_ads:30},{conta_canal_id:'a',data:'2026-10-02',receita:400,visitas:40,investimento_ads:20}];
 await gravarDiariasComOrigem([{conta_canal_id:'a',data:'2026-10-01',visitas:90,origem_visitas:'api'},{conta_canal_id:'a',data:'2026-10-02',investimento_ads:25,origem_ads:'api'}]);
 assert.equal(base.vendas_diarias[0].investimento_ads,30);
 assert.equal(base.vendas_diarias[1].visitas,40);
 assert.equal(base.vendas_diarias[0].receita,500);

 const {consolidarDiarias}=await jiti.import(path.join(process.cwd(),'src/lib/sync/diarias.ts'));
 base.pedidos=[{id:'p1',conta_canal_id:'a',data:'2026-10-01',total:100,cancelado:false,origem:'api'},{id:'p2',conta_canal_id:'a',data:'2026-10-01',total:200,cancelado:true,origem:'planilha'}];
 base.anuncio_desempenho_diario=[{data:'2026-10-02',visitas:5,importacao_id:'imp','anuncios.conta_canal_id':'a'},{data:'2026-10-02',visitas:10,importacao_id:null,'anuncios.conta_canal_id':'a'}];
 await consolidarDiarias({operacaoId:'op',canalId:'ml',contaCanalId:'a'},'2026-10-01','2026-10-02');
 assert.equal(base.vendas_diarias[0].receita,300);
 assert.equal(base.vendas_diarias[0].origem_vendas,'mista');
 assert.equal(base.vendas_diarias[0].valor_cancelado,200);
 assert.equal(base.vendas_diarias[1].receita,400,'visita sem pedido confirmado não apaga receita anterior');
 assert.equal(base.vendas_diarias[1].visitas,15);
 assert.equal(base.vendas_diarias[1].origem_visitas,'mista');
 await consolidarDiarias({operacaoId:'op',canalId:'ml',contaCanalId:'a'},'2026-10-01','2026-10-03',{de:'2026-10-03',ate:'2026-10-03'});
 assert.equal(base.vendas_diarias.find(d=>d.data==='2026-10-03').receita,0,'API confirmou dia sem vendas');

 const {derivarKpisDiarios}=await jiti.import(path.join(process.cwd(),'src/lib/dados/derivar-kpis.ts'));
 base.pedidos=base.pedidos.map(p=>({...p,operacao_id:'op',canal_id:'ml'}));
 await derivarKpisDiarios(sb,'op',[{contaCanalId:'a',canalId:'ml',data:'2026-10-01',total:200,cancelado:true}]);
 assert.equal(base.vendas_diarias[0].receita,300,'arquivo parcial preserva pedidos anteriores da API');
 assert.equal(base.vendas_diarias[0].origem_vendas,'mista');
 assert.equal(base.vendas_diarias[0].investimento_ads,30);
 const {POST}=await jiti.import(path.join(process.cwd(),'src/app/api/lancamentos/route.ts'));
 const enviar=edicoes=>POST(new Request('http://localhost/api/lancamentos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({edicoes})}));
 base.contas_canal=[{id:'a',canal_id:'ml',operacao_id:'op'}];
 globalThis.__automacaoOrigem={a:{vendas:'Mercado Livre',visitas:'Mercado Livre',ads:'Mercado Ads'}};
 let resposta=await enviar([{contaCanalId:'a',data:'2026-10-01',receita:999}]);
 assert.equal(resposta.status,409);assert.equal(base.vendas_diarias[0].receita,300);
 globalThis.__automacaoOrigem={};
 resposta=await enviar([{contaCanalId:'a',data:'2026-10-01',receita:999}]);
 assert.equal(resposta.status,409,'origem mista também contém API e permanece protegida');
 resposta=await enviar([{contaCanalId:'outra-empresa',data:'2026-10-01',receita:999}]);
 assert.equal(resposta.status,403);
 resposta=await enviar([{contaCanalId:'a',data:'2026-02-31',visitas:5}]);
 assert.equal(resposta.status,400);
 globalThis.__sessaoOrigem=false;
 resposta=await enviar([{contaCanalId:'a',data:'2026-10-01',visitas:5}]);
 assert.equal(resposta.status,401);
 console.log('OK: métricas independentes, dia sem coleta versus zero confirmado, origem mista, cancelamento e importação parcial sem apagar pedidos da API.');
}finally{
 delete globalThis.__origensSb;
 delete globalThis.__sessaoOrigem;delete globalThis.__automacaoOrigem;
 if(path.dirname(pasta)===path.resolve(tmpdir())&&path.basename(pasta).startsWith('gerizo-origens-'))await rm(pasta,{recursive:true,force:true});
}
