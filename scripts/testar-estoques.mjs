import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJiti} from '../node_modules/jiti/lib/jiti.mjs';
import {saldoBling,quantidade} from '../src/lib/estoques/tipos.ts';
import {autorizarLeitura} from '../src/lib/meli/limite.ts';
const pasta=await mkdtemp(path.join(tmpdir(),'gerizo-estoques-'));
try {
 const stub=path.join(pasta,'stub.cjs');
 await writeFile(stub,`module.exports={};`);
 const jiti=createJiti(import.meta.url,{moduleCache:false,alias:{'server-only':stub,'@':path.join(process.cwd(),'src')}});
 const {normalizarLocaisMeli}=await jiti.import(path.join(process.cwd(),'src/lib/meli/estoque.ts'));
 const itens=[{mlb:'MLB1',sku:'SKU',titulo:'Teste'},{mlb:'MLB2',sku:'SKU',titulo:'Teste'}];
 const linhas=normalizarLocaisMeli('MLBU1',itens,{locations:[{type:'seller_warehouse',store_id:'1',quantity:1},{type:'meli_facility',availability_type:'in_stock',quantity:0}]},new Map([['1','CD Cotia']]));
 assert.equal(linhas.length,2); assert.equal(linhas[0].local_nome,'CD Cotia');
 assert.equal(linhas[0].disponivel,1); assert.deepEqual(linhas[0].anuncios,['MLB1','MLB2']);
 assert.equal(linhas[1].disponivel,0); assert.equal(linhas[1].reservado,null);
 assert.equal(normalizarLocaisMeli('UP',[...itens,{mlb:'MLB3',sku:'OUTRO',titulo:'Teste'}],{locations:[{type:'selling_address',quantity:0}]},new Map())[0].sku,null);
 assert.equal(normalizarLocaisMeli('UP',itens,{locations:[{type:'meli_facility',quantity:10,availability_type:'in_transit'}]},new Map())[0].disponivel,null);
 const produto={id:8,codigo:'S8',nome:'Teste'},local={id:'2',nome:'Loja · Ribeirão',tipo:'deposito_erp'};
 assert.deepEqual([saldoBling(produto,local,{saldoFisicoTotal:4,saldoVirtualTotal:0}).disponivel,saldoBling(produto,local,{saldoFisicoTotal:4,saldoVirtualTotal:0}).reservado],[0,4]);
 assert.equal(saldoBling(produto,local).disponivel,null);
 assert.equal(quantidade(-2),-2); assert.equal(quantidade(undefined),null); assert.equal(quantidade('0'),0);
 for(const endpoint of ['/users/123/stores/search','/user-products/MLBU123/stock','/inventories/ABC123/stock/fulfillment']){
   assert.doesNotThrow(()=>autorizarLeitura(endpoint));
   assert.throws(()=>autorizarLeitura(endpoint,'PUT'));
 }
 const chamadas=[],salvos=[];
 globalThis.__blingEstoqueMock=async(_integ,endpoint,parametros)=>{
   chamadas.push({endpoint,parametros});
   if(endpoint==='/depositos')return {data:parametros.situacao===1?[{id:1,descricao:'Geral original',situacao:1}]:[{id:2,descricao:'Full original',situacao:0}]};
   if(endpoint==='/produtos')return {data:[{id:10,codigo:'ZERO',nome:'Produto zerado',tipo:'P',formato:'S'},{id:11,codigo:'SEM',nome:'Sem retorno',tipo:'P',formato:'S'},{id:12,nome:'Pai de variações',tipo:'P',formato:'V'},{id:13,nome:'Serviço',tipo:'S',formato:'S'}]};
   if(endpoint.startsWith('/estoques/saldos/'))return {data:parametros.filtroSaldoEstoque===0?[{produto:{id:10},saldoFisicoTotal:2,saldoVirtualTotal:0}]:[]};
   throw Error('Rota inesperada');
 };
 globalThis.__gravarEstoqueMock=(...args)=>salvos.push(args);
 const cliente=path.join(pasta,'bling.cjs'),gravar=path.join(pasta,'gravar.cjs');
 await writeFile(cliente,'module.exports={bling:(...a)=>globalThis.__blingEstoqueMock(...a)};');
 await writeFile(gravar,'module.exports={gravarEstoques:(...a)=>globalThis.__gravarEstoqueMock(...a),registrarFalhaEstoque:async()=>{}};');
 const testeBling=createJiti(import.meta.url,{moduleCache:false,alias:{'server-only':stub,'@':path.join(process.cwd(),'src'),'./cliente':cliente,'@/lib/estoques/gravar':gravar}});
 const {estoqueBling}=await testeBling.import(path.join(process.cwd(),'src/lib/bling/estoque.ts'));
 const resultado=await estoqueBling({id:'i',operacaoId:'op',contaCanalId:'',canalId:null},0);
 assert.equal(resultado.continuacao,undefined);
 assert.equal(salvos[0][3].length,4,'dois produtos em dois depósitos, inclusive zeros e não informados');
 assert.deepEqual(salvos[0][4].map(l=>l.nome),['Geral original','Full original']);
 assert.equal(salvos[0][3].find(s=>s.sku==='ZERO').disponivel,0);
 assert.equal(salvos[0][3].find(s=>s.sku==='SEM').disponivel,null);
 for(const id of [1,2])assert.deepEqual(chamadas.filter(c=>c.endpoint===`/estoques/saldos/${id}`).map(c=>c.parametros.filtroSaldoEstoque),[0,1,2]);
 assert.deepEqual(chamadas.find(c=>c.endpoint==='/estoques/saldos/1').parametros['idsProdutos[]'],[10,11]);
 console.log('OK: estoques zero e desconhecido, depósitos com nome original, estoque compartilhado, SKUs conflitantes e API somente leitura.');
} finally {
 delete globalThis.__blingEstoqueMock;delete globalThis.__gravarEstoqueMock;
 if(path.dirname(pasta)===path.resolve(tmpdir())&&path.basename(pasta).startsWith('gerizo-estoques-')) await rm(pasta,{recursive:true,force:true});
}
