import fs from 'node:fs';
const d=JSON.parse(fs.readFileSync('output/relatorio-bom-de-compras/dados-restritos.json','utf8'));
const sum=(a,k)=>a.reduce((s,x)=>s+Number(x[k]??0),0), hist=(a,k)=>Object.fromEntries([...new Set(a.map(x=>x[k]))].map(v=>[v,a.filter(x=>x[k]===v).length]));
const ord=new Map(d.pedidos.map(x=>[x.id,x]));
for(const c of d.contas){
 const ps=d.pedidos.filter(x=>x.conta_canal_id===c.id);
 const stats=(de,ate)=>{const a=ps.filter(x=>x.data>=de&&x.data<=ate),ok=a.filter(x=>!x.cancelado),ids=new Set(ok.map(x=>x.id));const its=d.itens.filter(x=>ids.has(x.pedido_id));return{pedidos:ok.length,receita:sum(ok,'total'),cancelados:a.length-ok.length,unidades:sum(its,'quantidade'),itens:its.length,valorItens:sum(its,'total'),skus:new Set(its.map(x=>x.sku)).size,dias:new Set(ok.map(x=>x.data)).size,freteCompradorInformado:ok.filter(x=>x.frete_comprador!=null).length}};
 console.log(c.nome,JSON.stringify({atual:stats('2026-08-13','2026-10-11'),anterior:stats('2026-06-14','2026-08-12')}));
}
console.log('visitasMes',hist(d.visitas.map(x=>({...x,mes:x.data.slice(0,7)})),'mes'));
console.log('diariasMeli',hist(d.diarias.filter(x=>x.conta_canal_id==='ea75acaa-ff6f-4c96-a653-2e9e1321edcc').map(x=>({...x,mes:x.data.slice(0,7),chave:x.data.slice(0,7)+'/'+x.origem_visitas+'/'+x.origem_ads})),'chave'));
console.log('catalogoDatas',hist(d.catalogo,'data'),'catalogoStatus',hist(d.catalogo,'situacao'));
console.log('anuncios',hist(d.anuncios,'status'),'precosHistoricosDatas',hist(d.estoquesHistoricos,'data'));
console.log('exemploItens',JSON.stringify(d.itens.filter(x=>ord.has(x.pedido_id)).slice(0,8)));
console.log('adsJanelas',hist(d.ads.map(x=>({...x,janela:x.inicio+'|'+x.fim})),'janela'));
