import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import assert from 'node:assert/strict';

class NextResponse extends Response {
 static next(){return new NextResponse(null,{status:200});}
 static redirect(url){return new NextResponse(null,{status:307,headers:{location:String(url)}});}
}
let usuario=null,admin=false,salvos=[],falha=false,leituras=0,autenticacoes=0;
const carregar=(arquivo,imports)=>{
 const source=ts.transpileModule(fs.readFileSync(arquivo,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};vm.runInNewContext(source,{exports,require:n=>{if(n in imports)return imports[n];throw Error('Import não isolado: '+n);},Response,Request,URL,Map,Date,process:{env:{}},Buffer});return exports;
};
const sb={auth:{getUser:async()=>{autenticacoes++;return{data:{user:usuario}};}},rpc:async()=>({data:admin})};
const route=carregar('src/app/api/interesse/route.ts',{'next/server':{NextResponse},'node:crypto':crypto,'@/lib/interesses':{
 registrarInteresse:async(...dados)=>{if(falha)throw Error('indisponível');salvos.push(dados);},
 listarInteresses:async()=>{leituras++;return[{nome:'=Teste',telefone:'11987654321',criadoEm:'2026-11-18T12:00:00Z'}];}
},'@/lib/supabase/servidor':{clienteServidor:async()=>sb}});
let ip=0;const req=(corpo,headers={})=>new Request('https://gerizo.test/api/interesse',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':`192.0.2.${++ip}`,...headers},body:typeof corpo==='string'?corpo:JSON.stringify(corpo)});
const resultados=[];
async function caso(nome,fn){await fn();resultados.push({nome,passou:true});}
await caso('recusa origem externa',async()=>assert.equal((await route.POST(req({nome:'Pessoa',telefone:'11987654321'},{origin:'https://outro.test'}))).status,403));
await caso('valida campos e tamanho',async()=>{for(const corpo of ['{',{},[],{nome:'A',telefone:'11111111111'}])assert.equal((await route.POST(req(corpo))).status,400);assert.equal((await route.POST(req(' '.repeat(4001)))).status,413);assert.equal(salvos.length,0);});
await caso('normaliza e persiste apenas nome e telefone',async()=>{assert.equal((await route.POST(req({nome:'  Pessoa   Teste ',telefone:'(11) 98765-4321',website:''}))).status,200);assert.deepEqual(salvos[0],['Pessoa Teste','11987654321']);});
await caso('falha não vira sucesso',async()=>{falha=true;assert.equal((await route.POST(req({nome:'Pessoa',telefone:'11987654321'}))).status,503);falha=false;});
await caso('honeypot não grava',async()=>{assert.equal((await route.POST(req({website:'spam'}))).status,200);assert.equal(salvos.length,1);});
await caso('limita repetição',async()=>{for(let i=0;i<9;i++){const resposta=await route.POST(req({}, {'x-forwarded-for':'192.0.2.250'}));assert.equal(resposta.status,i<8?400:429);}});
await caso('leitura exige sessão e administrador',async()=>{const get=new Request('https://gerizo.test/api/interesse');assert.equal((await route.GET(get)).status,401);usuario={id:'teste'};assert.equal((await route.GET(get)).status,403);assert.equal(leituras,0);admin=true;assert.equal((await route.GET(get)).status,200);assert.equal(leituras,1);});
await caso('CSV privado neutraliza fórmulas',async()=>{const resposta=await route.GET(new Request('https://gerizo.test/api/interesse?formato=csv'));assert.equal(resposta.headers.get('cache-control'),'private, no-store');assert((await resposta.text()).includes('"\'=Teste"'));});
const proxy=carregar('src/proxy.ts',{'@supabase/ssr':{createServerClient:()=>sb},'next/server':{NextResponse},'@/lib/acesso-expedicao-proxy':{barrarForaDaExpedicao:async()=>null},'@/lib/rotas-publicas':carregar('src/lib/rotas-publicas.ts',{})});
usuario=null;
const request=(pathname,method='GET')=>({method,nextUrl:{pathname,clone:()=>new URL('https://gerizo.test'+pathname)},cookies:{getAll:()=>[]}});
await caso('demo e comercial não instanciam sessão',async()=>{autenticacoes=0;for(const p of ['/','/conheca','/demonstracao','/demonstracao/financeiro'])assert.equal((await proxy.proxy(request(p))).status,200);assert.equal((await proxy.proxy(request('/api/interesse','POST'))).status,200);assert.equal(autenticacoes,0);});
await caso('não libera leitura de contatos nem dados internos',async()=>{assert.equal((await proxy.proxy(request('/api/interesse'))).status,401);assert.equal((await proxy.proxy(request('/api/operacao'))).status,401);assert.equal((await proxy.proxy(request('/financeiro'))).status,307);assert.equal(autenticacoes,3);});
fs.mkdirSync('output/revisao-2026-11-18',{recursive:true});fs.writeFileSync('output/revisao-2026-11-18/qa-captacao.json',JSON.stringify({isolamento:'módulos reais executados com autenticação e persistência substituídas; nenhum contato real enviado',resultados},null,2));
console.log(JSON.stringify({passaram:resultados.length,resultados}));
