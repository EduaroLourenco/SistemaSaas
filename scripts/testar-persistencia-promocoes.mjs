import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJiti} from '../node_modules/jiti/lib/jiti.mjs';

const pasta=await mkdtemp(path.join(tmpdir(),'gerizo-promocoes-'));
let base={},falhar='',contador=0,escritas=0;
const sb={auth:{getUser:async()=>({data:{user:globalThis.__promoUser?{id:'user'}:null}})},rpc:async()=>({data:globalThis.__promoEdita}),from(tabela){
 const filtros=[];let modo='select',carga;
 const q={select(){return q},eq(k,v){filtros.push(r=>r[k]===v);return q},in(k,v){filtros.push(r=>v.includes(r[k]));return q},lt(k,v){filtros.push(r=>r[k]<v);return q},insert(v){modo='insert';carga=v;return q},update(v){modo='update';carga=v;return q},delete(){modo='delete';return q},single(){return resultado(true)},maybeSingle(){return resultado(true)},then(a,b){return resultado().then(a,b)}};
 async function resultado(single=false){
  base[tabela]??=[];
  if(modo==='insert'&&falhar===tabela)return {data:null,error:{message:'falha simulada'}};
  let data=base[tabela].filter(r=>filtros.every(f=>f(r)));
  if(modo==='insert') {escritas++;data=(Array.isArray(carga)?carga:[carga]).map(r=>({id:'n'+(++contador),executado_em:'2026-10-12T12:00:00Z',criado_em:'2026-10-12T12:00:01Z',...r}));base[tabela].push(...data);}
  if(modo==='update') {escritas++;data.forEach(r=>Object.assign(r,carga));}
  if(modo==='delete') {escritas++;base[tabela]=base[tabela].filter(r=>!data.includes(r));}
  return {data:single?data[0]??null:data,error:single&&data.length!==1?{message:'quantidade inesperada'}:null};
 }
 return q;
}};
globalThis.__promoSb=sb;globalThis.__promoUser=true;globalThis.__promoEdita=true;
try {
 const stub=path.join(pasta,'sb.cjs'),vazio=path.join(pasta,'vazio.cjs');
 await writeFile(stub,"exports.clienteServidor=async()=>globalThis.__promoSb;exports.clientePrivilegiado=()=>globalThis.__promoSb;exports.operacaoPadrao=async()=>({id:'a'});");
 await writeFile(vazio,'module.exports={};');
 const jiti=createJiti(import.meta.url,{moduleCache:false,alias:{'@':path.join(process.cwd(),'src'),'server-only':vazio,'@/lib/supabase/servidor':stub,'@/lib/supabase/privilegiado':stub,'@/lib/dados/operacao':stub}});
 const {gravarProcessamento}=await jiti.import(path.join(process.cwd(),'src/lib/dados/gravar-promocoes.ts'));
 const {POST}=await jiti.import(path.join(process.cwd(),'src/app/api/promocoes/piso/route.ts'));
 base={canais:[{id:'ca',operacao_id:'a',codigo:'mercado_livre'},{id:'cb',operacao_id:'b',codigo:'mercado_livre'}],anuncios:[{id:'aa',operacao_id:'a',canal_id:'ca',codigo_externo:'MLB1'},{id:'ab',operacao_id:'b',canal_id:'cb',codigo_externo:'MLB2'}],operacoes:[{id:'a',promo_tolerancia_pct:5},{id:'b',promo_tolerancia_pct:5}]};
 const linha={mlb:'MLB1',sku:'s',campanha:'Campanha',aprovado:true,tipoAnuncio:'Clássico',tipoCampanha:'Com Redução',tags:[],precoTabela:100,precoOferta:110,precoPiso:100,precoComExtra:100,precoPropostoML:110,arquivo:'teste.xlsx',linha:8};
 const enviar=linhas=>gravarProcessamento({operacaoId:'a',linhas,arquivos:['teste.xlsx'],descontoExtra:0,usuarioId:'user'});
 let r=await enviar([linha,{...linha,mlb:'MLB2',linha:9}]);
 assert.equal(r.itens,2);assert.equal(r.ofertas,1);assert.equal(r.semAnuncio,1);
 assert.equal(base.campanhas[0].canal_id,'ca');assert.equal(base.campanha_itens[0].anuncio_id,'aa');
 assert.equal(base.historico_promocoes[1].anuncio_id,null,'Não vincula anúncio de outra empresa');
 base.campanha_itens[0].criado_em='2026-10-11T00:00:00Z';
 falhar='historico_promocoes';
 await assert.rejects(()=>enviar([linha]),/falha simulada/);
 assert.equal(base.campanha_itens.length,1,'Falha não apaga ofertas anteriores');
 assert.equal(base.processamentos_promocao.at(-1).status,'falhou');
 falhar='';r=await enviar([linha]);
 assert.equal(base.campanha_itens.length,1,'Substitui ofertas só depois de gravar');
 assert.equal(base.processamentos_promocao.at(-1).status,'concluida');
 const post=body=>POST(new Request('http://teste/api/promocoes/piso',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await post({usarComoPiso:true,toleranciaPct:0})).status,200);
 assert.equal(base.operacoes[0].promo_tolerancia_pct,0);assert.equal(base.operacoes[1].promo_tolerancia_pct,5);
 assert.equal((await post(null)).status,400);assert.equal((await post({usarComoPiso:'false',toleranciaPct:5})).status,400);
 globalThis.__promoEdita=false;const antes=escritas;
 assert.equal((await post({usarComoPiso:true,toleranciaPct:5})).status,403);assert.equal(escritas,antes);
 globalThis.__promoUser=false;assert.equal((await post({usarComoPiso:true,toleranciaPct:5})).status,401);
 console.log('OK: canais por empresa, vínculo de anúncios isolado, falha preserva rodada anterior, status real e regra salva apenas por editor na empresa da sessão.');
} finally {
 delete globalThis.__promoSb;delete globalThis.__promoUser;delete globalThis.__promoEdita;
 if(path.dirname(pasta)===path.resolve(tmpdir())&&path.basename(pasta).startsWith('gerizo-promocoes-'))await rm(pasta,{recursive:true,force:true});
}
