import assert from 'node:assert/strict';
import {montarProdutosPrecos, periodoProdutos, csvProdutosPrecos} from '../src/lib/produtos-precos.ts';

const produto = (sku) => ({id:sku,sku,titulo:'Produto '+sku});
const anuncio = (id,sku,conta='sp',canal='ml',status='ativo') => ({id,sku_canal:sku,produto_id:sku,codigo_externo:id,titulo:'Anúncio '+sku,canal_id:canal,conta_canal_id:conta,status});
let numero = 0;
const venda = (sku,qtd,preco,canal='ml',conta='sp',extra={}) => ({
  id:String(++numero),sku,titulo:'Produto '+sku,anuncio_id:null,codigo_externo:null,
  quantidade:qtd,preco_unitario:preco,total:null,
  pedidos:{data:'2026-10-03',canal_id:canal,conta_canal_id:conta,cancelado:false},...extra,
});
const entrada = {
  operacaoId:'a',de:'2026-10-01',ate:'2026-10-14',hoje:'2026-10-14',
  canais:[{id:'ml',nome:'Mercado Livre'},{id:'site',nome:'Site próprio'},{id:'shopee',nome:'Shopee'}],
  contas:[{id:'sp',nome:'São Paulo',canal_id:'ml'},{id:'full',nome:'Full',canal_id:'ml'},{id:'site-a',nome:'Principal',canal_id:'site'}],
  produtos:['001','002','PAI','VAR','ZERO','INCOMPLETO'].map(produto),
  anuncios:[anuncio('ML1','001'),anuncio('ML2','001','full'),{...anuncio('SITE1','001','site-a','site'),preco_atual:999},anuncio('PAI1','PAI'),anuncio('PAUSA','001','sp','ml','pausado'),anuncio('Z','ZERO')],
  itens:[
    venda('001',2,10),venda(' 001 ',1,40,'ml','full'),venda('001',2,80,'site','site-a'),
    venda('001',1,70,'shopee','shopee-a'),
    venda('VAR',1,50,'ml','sp',{anuncio_id:'PAI1'}),
    venda('ZERO',1,0),venda('INCOMPLETO',1,10),venda('INCOMPLETO',1,null),
    venda('001',2,9999,'ml','sp',{pedidos:{data:'2026-09-30',canal_id:'ml',conta_canal_id:'sp',cancelado:false}}),
    venda('001',3,9999,'ml','sp',{pedidos:{data:'2026-10-03',canal_id:'ml',conta_canal_id:'sp',cancelado:true}}),
    venda('OUTRA',1,9999,'canal-outra-empresa','outro'),
  ],
  leituras:[{anuncio_id:'ML1',data:'2026-10-14',preco:90},{anuncio_id:'ML1',data:'2026-10-01',preco:50},
    {anuncio_id:'ML2',data:'2026-10-14',preco:120},{anuncio_id:'PAUSA',data:'2026-10-14',preco:1},{anuncio_id:'Z',data:'2026-10-14',preco:0}],
  recorte:['ml','site','canal-outra-empresa','ml'],
};
const d = montarProdutosPrecos(entrada), porSku = new Map(d.linhas.map(l=>[l.sku,l]));
const x = porSku.get('001');
assert.equal(d.linhas.filter(l=>l.sku==='001').length,1,'Uma linha por SKU, incluindo anúncios de contas distintas');
assert.equal(x.canais.ml.unidades,3);
assert.equal(x.canais.ml.vendido,20,'Média ponderada, sem cancelados nem dias fora do período');
assert.equal(x.canais['conta:sp'].vendido,10);
assert.equal(x.canais['conta:full'].vendido,40);
assert.deepEqual(x.canais.ml.vitrine,{min:90,max:120,de:'2026-10-14',ate:'2026-10-14',anuncios:2});
assert.equal(x.canais.site.vendido,80,'Canal sem API de vitrine continua tendo preço vendido');
assert.equal(x.canais.site.vitrine,null,'Não usar preço cadastrado/importado como vitrine de API');
assert.equal(x.canais.shopee.vendido,70);
assert.equal(x.canais.shopee.vitrine,null);
assert.equal(porSku.get('002').canais.ml,undefined,'SKU sem vendas continua na tabela, sem inventar preço ou quantidade');
assert.equal(porSku.get('PAI').canais.ml,undefined,'Vendas da variação não vão para o SKU pai');
assert.equal(porSku.get('VAR').canais.ml.vendido,50);
assert.equal(porSku.get('ZERO').canais.ml.vendido,0,'Zero medido não é ausência de dado');
assert.equal(porSku.get('ZERO').canais.ml.vitrine.min,0);
assert.equal(porSku.get('INCOMPLETO').canais.ml.vendido,null,'Preço parcialmente ausente não produz média artificial');
assert.equal(porSku.has('OUTRA'),false);
assert.deepEqual(d.recorte,['ml','site']);

const semVenda = montarProdutosPrecos({...entrada,de:'2026-10-04',ate:'2026-10-05'}).linhas.find(l=>l.sku==='001');
assert.equal(semVenda.canais.ml.vendido,null);
assert.equal(semVenda.canais.ml.unidades,null);
assert.equal(semVenda.canais.ml.vitrine.min,90,'Última vitrine é explicitamente independente do período das vendas');
assert.equal(montarProdutosPrecos({...entrada,sku:' 001 '}).linhas.length,1);

const datas = periodoProdutos({de:'2026-02-31',ate:'inválida'},'2026-10-14');
assert.deepEqual(datas,{de:'2026-09-15',ate:'2026-10-14'});
assert.deepEqual(periodoProdutos({de:'2026-10-01',ate:'2026-10-10'},'2026-10-14'),{de:'2026-10-01',ate:'2026-10-10'});

const csv = csvProdutosPrecos([x,porSku.get('002')],d.colunas.filter(c=>c.id==='site'));
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('Site próprio — Vendido médio'));
assert.ok(!csv.includes('Mercado Livre'));
assert.ok(csv.includes('Sem dado'));
assert.equal(csv.split('\r\n').length,3);
const perigoso = csvProdutosPrecos([{...x,sku:'=1+1',titulo:'+texto'}],[]);
assert.ok(perigoso.includes('"\'=1+1"'));
assert.ok(perigoso.includes('"\'+texto"'));
console.log('OK: SKU único, média ponderada por canal/conta, datas, cancelados, variações, vitrine de API, faixa, nulos, zero e exportação.');
