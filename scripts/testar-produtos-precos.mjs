import assert from 'node:assert/strict';
import {montarProdutosPrecos, periodoProdutos, csvProdutosPrecos, filtrarCurvaProdutos, ordenar} from '../src/lib/produtos-precos.ts';

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
assert.equal(x.canais.ml.receita,60,'Receita do canal: unidades × preço, a mesma base da curva');
assert.equal(x.canais['conta:sp'].receita+x.canais['conta:full'].receita,x.canais.ml.receita,'As contas somam o canal');
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
assert.equal(porSku.get('ZERO').canais.ml.receita,0,'Receita zero medida é zero, não ausência');
assert.equal(porSku.get('ZERO').canais.ml.vitrine.min,0);
assert.equal(porSku.get('ZERO').canais.ml.curva,null,'Receita zero não gera uma classificação de faturamento');
assert.equal(porSku.get('INCOMPLETO').canais.ml.vendido,null,'Preço parcialmente ausente não produz média artificial');
assert.equal(porSku.get('INCOMPLETO').canais.ml.receita,null,'Receita parcial não é receita: somaria meia venda como venda inteira');
assert.equal(porSku.get('INCOMPLETO').canais.ml.curva,null,'Receita incompleta não gera uma curva artificial');
assert.equal(porSku.has('OUTRA'),false);
assert.deepEqual(d.recorte,['ml','site']);

const semVenda = montarProdutosPrecos({...entrada,de:'2026-10-04',ate:'2026-10-05'}).linhas.find(l=>l.sku==='001');
assert.equal(semVenda.canais.ml.vendido,null);
assert.equal(semVenda.canais.ml.unidades,null);
assert.equal(semVenda.canais.ml.receita,null);
assert.equal(semVenda.canais.ml.curva,null,'Sem venda no período, sem curva');
assert.equal(semVenda.canais.ml.vitrine.min,90,'Última vitrine é explicitamente independente do período das vendas');
assert.equal(montarProdutosPrecos({...entrada,sku:' 001 '}).linhas.length,1);

const datas = periodoProdutos({de:'2026-02-31',ate:'inválida'},'2026-10-14');
assert.deepEqual(datas,{de:'2026-09-15',ate:'2026-10-14'});
assert.deepEqual(periodoProdutos({de:'2026-10-01',ate:'2026-10-10'},'2026-10-14'),{de:'2026-10-01',ate:'2026-10-10'});

const csv = csvProdutosPrecos([x,porSku.get('002')],d.colunas.filter(c=>c.id==='site'));
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('Site próprio — Vendido médio'));
assert.ok(csv.includes('Site próprio — Curva ABC'));
assert.ok(!csv.includes('Mercado Livre'));
assert.ok(csv.includes('Sem dado'));
assert.equal(csv.split('\r\n').length,3);
const perigoso = csvProdutosPrecos([{...x,sku:'=1+1',titulo:'+texto'}],[]);
assert.ok(perigoso.includes('"\'=1+1"'));
assert.ok(perigoso.includes('"\'+texto"'));

const baseAbc={...entrada,produtos:['DOM','SEG','TER','FINAL','SEM'].map(produto),anuncios:[],leituras:[],itens:[
  venda('DOM',1,800),venda('SEG',1,150,'ml','full'),venda('TER',1,40),venda('FINAL',1,10,'ml','full'),
  venda('DOM',1,10,'site','site-a'),venda('SEG',1,40,'site','site-a'),venda('TER',1,150,'site','site-a'),venda('FINAL',1,800,'site','site-a'),
]};
const abc=montarProdutosPrecos(baseAbc);
const linha=(sku)=>abc.linhas.find(l=>l.sku===sku);
assert.equal(linha('DOM').canais.ml.curva,'A');
assert.equal(linha('DOM').canais.site.curva,'C','Mesmo SKU pode ser A em um canal e C em outro');
assert.equal(linha('SEG').canais.ml.curva,'B','O produto seguinte aos 80% passa à curva B');
assert.equal(linha('TER').canais.ml.curva,'C','O produto seguinte aos 95% passa à curva C');
assert.equal(linha('SEG').canais['conta:full'].curva,'A','Contas do mesmo canal têm classificação independente');
assert.deepEqual(filtrarCurvaProdutos(abc.linhas,'A',['ml']).map(l=>l.sku),['DOM']);
assert.deepEqual(filtrarCurvaProdutos(abc.linhas,'A',['site']).map(l=>l.sku),['FINAL']);
assert.deepEqual(filtrarCurvaProdutos(abc.linhas,'A',['ml','site']).map(l=>l.sku),['DOM','FINAL']);
assert.equal(filtrarCurvaProdutos(abc.linhas,'A',['sem-vendas']).length,0);
assert.equal(filtrarCurvaProdutos(abc.linhas,'',[]).length,5);
assert.equal(montarProdutosPrecos({...baseAbc,sku:'SEG'}).linhas[0].canais.ml.curva,'B','Busca por SKU não deve recalcular sua curva contra ele mesmo');
assert.equal(linha('DOM').canais.site.curva,'C','Filtrar curva A no ML conserva a curva C do site');
const mudouPeriodo=montarProdutosPrecos({...baseAbc,de:'2026-10-10',itens:[...baseAbc.itens,
  venda('SEG',1,2000,'ml','full',{pedidos:{data:'2026-10-12',canal_id:'ml',conta_canal_id:'full',cancelado:false}}),
]});
assert.equal(mudouPeriodo.linhas.find(l=>l.sku==='SEG').canais.ml.curva,'A','Período novo recalcula a curva; um único SKU vendido é A');
const exata=montarProdutosPrecos({...baseAbc,itens:[venda('DOM',3,null,'ml','sp',{total:1000}),venda('SEG',1,250)]});
assert.equal(exata.linhas.find(l=>l.sku==='SEG').canais.ml.curva,'B','A curva usa o faturamento exato, sem multiplicar o preço médio arredondado');
const exportadoAbc=csvProdutosPrecos(filtrarCurvaProdutos(abc.linhas,'A',['ml']),abc.colunas.filter(c=>!c.contaId));
assert.equal(exportadoAbc.split('\r\n').length,2);
assert.ok(exportadoAbc.includes('"A";800'));
assert.ok(exportadoAbc.includes('"C";10'));
console.log('OK: preços e curva ABC por canal/conta, faturamento exato, cortes 80/95, período, busca sem reclassificar, ausência de dados e CSV filtrado.');

/* ── Ordenação por coluna, numa tabela que é matriz ──

   Coluna aqui é um campo DENTRO de um canal: o mesmo SKU pode ser o que
   mais fatura no Meli e o que menos fatura no site. Ordenar por "receita"
   sem dizer o canal não significa nada, e o que se tranca aqui é isso mais
   a regra da ausência: "Sem dado" vai para o fim nos DOIS sentidos, porque
   quem não tem número não é quem mais fatura nem quem menos. */
const cel = (receita, unidades, vendido, vitrine) => ({receita, unidades, vendido, curva:null, vitrine: vitrine==null?null:{min:vitrine,max:vitrine,de:'2026-10-01',ate:'2026-10-01',anuncios:1}});
const linhasOrd = [
  {chave:'a', sku:'AAA', titulo:'A', codigos:[], canais:{ml:cel(100,2,50,60), site:cel(900,9,100,null)}},
  {chave:'b', sku:'BBB', titulo:'B', codigos:[], canais:{ml:cel(900,1,900,10), site:cel(100,1,100,null)}},
  {chave:'c', sku:'CCC', titulo:'C', codigos:[], canais:{site:cel(500,5,100,null)}},
];
const ordem = (coluna, metrica, desc) => ordenar(linhasOrd, {coluna, metrica, desc}).map(l=>l.sku);

assert.deepEqual(ordem('ml','receita',true), ['BBB','AAA','CCC'], 'Receita do Meli: CCC não vende lá e vai para o fim');
assert.deepEqual(ordem('ml','receita',false), ['AAA','BBB','CCC'], 'Crescente inverte os que têm dado e NÃO traz o sem dado para o topo');
assert.deepEqual(ordem('site','receita',true), ['AAA','CCC','BBB'], 'Trocar o canal muda a ordem: é a mesma métrica em outro canal');
assert.deepEqual(ordem('ml','unidades',true), ['AAA','BBB','CCC']);
assert.deepEqual(ordem('ml','vendido',true), ['BBB','AAA','CCC']);
assert.deepEqual(ordem('ml','vitrine',false), ['BBB','AAA','CCC'], 'Vitrine ordena pelo menor preço da faixa');
assert.deepEqual(ordem('site','vitrine',true), ['AAA','BBB','CCC'], 'Canal sem vitrine: nenhum tem dado, cai no desempate por SKU');
assert.deepEqual(ordem('','sku',false), ['AAA','BBB','CCC']);
assert.deepEqual(ordem('','sku',true), ['CCC','BBB','AAA']);
assert.equal(ordenar(linhasOrd,{coluna:'ml',metrica:'receita',desc:true}).length, linhasOrd.length, 'Ordenar não perde nem duplica linha');
assert.deepEqual(linhasOrd.map(l=>l.sku), ['AAA','BBB','CCC'], 'Ordenar devolve cópia e não mexe na lista original');
console.log('OK: ordenação por coluna e canal, ausência sempre no fim, cópia preservada.');
