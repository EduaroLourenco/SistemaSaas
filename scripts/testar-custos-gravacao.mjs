import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJiti} from '../node_modules/jiti/lib/jiti.mjs';
const pasta=await mkdtemp(path.join(tmpdir(),'gerizo-custos-'));
const produtos=[{id:'1',operacao_id:'a',custo_unitario:10,embalagem:5},{id:'2',operacao_id:'a',custo_unitario:20,embalagem:8},{id:'3',operacao_id:'b',custo_unitario:30}];
let usuario=true,editor=true;
globalThis.__custos={auth:{getUser:async()=>({data:{user:usuario?{id:'u'}:null}})},rpc:async()=>({data:editor}),from(){
 const filtros=[];let carga;
 const q={select(){return q},in(k,v){filtros.push(r=>v.includes(r[k]));return q},eq(k,v){filtros.push(r=>r[k]===v);return q},update(v){carga=v;return q},single(){return executar(true)},then(a,b){return executar(false).then(a,b)}};
 async function executar(single){const data=produtos.filter(p=>filtros.every(f=>f(p)));if(carga)data.forEach(p=>Object.assign(p,carga));return {data:single?data[0]:data,error:null};}
 return q;
}};
try {
 const stub=path.join(pasta,'stub.cjs'),vazio=path.join(pasta,'vazio.cjs');
 await writeFile(stub,"exports.clienteServidor=async()=>globalThis.__custos;exports.operacaoPadrao=async()=>({id:'a'});");
 await writeFile(vazio,'module.exports={};');
 const jiti=createJiti(import.meta.url,{moduleCache:false,alias:{'@':path.join(process.cwd(),'src'),'server-only':vazio,'@/lib/supabase/servidor':stub,'@/lib/dados/operacao':stub}});
 const {POST}=await jiti.import(path.join(process.cwd(),'src/app/api/custos/route.ts'));
 const post=body=>POST(new Request('http://teste',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await post({edicoes:[{produtoId:'1',embalagem:0,margemMinimaPct:0},{produtoId:'2',custoMercadoria:25}]})).status,200);
 assert.equal(produtos[0].custo_unitario,10);assert.equal(produtos[0].embalagem,0);assert.equal(produtos[0].margem_minima_pct,0);assert.equal(produtos[1].embalagem,8);
 assert.equal((await post({edicoes:[{produtoId:'1',margemMinimaPct:null}]})).status,200);assert.equal(produtos[0].margem_minima_pct,null);
 assert.equal((await post({edicoes:[{produtoId:'3',custoMercadoria:99}]})).status,403);assert.equal(produtos[2].custo_unitario,30);
 assert.equal((await post({edicoes:[{produtoId:'1',margemMinimaPct:61}]})).status,400);
 assert.equal((await post(null)).status,400);
 editor=false;assert.equal((await post({edicoes:[{produtoId:'1',embalagem:2}]})).status,403);
 usuario=false;assert.equal((await post({edicoes:[]})).status,401);
 console.log('OK: custos preservados em edições distintas, zero e vazio válidos, limites e isolamento de empresa/permissão.');
} finally {
 delete globalThis.__custos;
 if(path.dirname(pasta)===path.resolve(tmpdir())&&path.basename(pasta).startsWith('gerizo-custos-'))await rm(pasta,{recursive:true,force:true});
}
