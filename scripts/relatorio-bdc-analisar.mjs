import fs from 'node:fs';
import {analisar,soma,variacao,round} from './relatorios/analisar.mjs';
const dir='output/relatorio-bom-de-compras';
const d=analisar(JSON.parse(fs.readFileSync(dir+'/dados-restritos.json')),JSON.parse(fs.readFileSync(dir+'/consulta-api.json')));
fs.writeFileSync(dir+'/relatorio.json',JSON.stringify(d));
const p=d.periodos[60];
const produtos=p.produtos.map(x=>({sku:x.sku,titulo:x.titulo,atual:soma(x.canais,c=>c.atual.receita),anterior:soma(x.canais,c=>c.anterior.receita),qAtual:soma(x.canais,c=>c.atual.unidades),qAnterior:soma(x.canais,c=>c.anterior.unidades),canais:x.canais}));
console.log(JSON.stringify({geral:p.geral,canais:p.canais.map(c=>({nome:c.nome,atual:c.atual,anterior:c.anterior,variacao:variacao(c.atual.receita,c.anterior.receita)})),quedas:produtos.sort((a,b)=>(a.atual-a.anterior)-(b.atual-b.anterior)).slice(0,10),crescimentos:produtos.sort((a,b)=>(b.atual-b.anterior)-(a.atual-a.anterior)).slice(0,6),catalogo:d.catalogo.filter(x=>['winning','competing'].includes(x.situacao)).map(x=>({sku:x.sku,mlb:x.mlb,situacao:x.situacao,preco:x.precoAtual,alvo:x.precoParaGanhar,status:x.status})),verificacao:d.verificacao,limites:d.limites},null,2));
