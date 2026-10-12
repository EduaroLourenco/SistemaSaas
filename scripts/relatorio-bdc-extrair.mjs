import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const op = '01b057f3-4541-4423-ada4-288cfbbc6dd7';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const dir = path.resolve('output/relatorio-bom-de-compras');
fs.mkdirSync(dir, {recursive:true});
const tabelas = ['pedidos','pedido_itens','anuncios','produtos','vendas_diarias','anuncio_desempenho_diario','anuncio_catalogo_diario','anuncio_estoque_diario','anuncio_ads','conta_reputacao_diaria','estoque_saldos','estoque_fontes'];
if (process.argv.includes('--schema')) {
  for (const t of tabelas) { const {data,error} = await sb.from(t).select('*').eq('operacao_id',op).limit(1); console.log(t, error?.message ?? Object.keys(data?.[0]??{}).join(',')); }
  process.exit(0);
}
async function all(table,columns,filter) {
  const rows=[];
  for(let p=0;;p+=1000) {
    let q=sb.from(table).select(columns).eq('operacao_id',op).order(table==='estoque_fontes'?'integracao_id':'id');
    if(filter) q=filter(q);
    const {data,error}=await q.range(p,p+999); if(error) throw Error(table+': '+error.message);
    rows.push(...data); if(data.length<1000) return rows;
  }
}
const specs={
  contas:['contas_canal','id,nome,identificador,canal_id,canais(nome,codigo)'],
  pedidos:['pedidos','id,conta_canal_id,data,total,cancelado,origem,logistica,frete,frete_comprador,frete_lista,uf_destino',q=>q.gte('data','2026-02-14').lte('data','2026-10-11')],
  itens:['pedido_itens','pedido_id,anuncio_id,codigo_externo,sku,titulo,quantidade,preco_unitario,total,desconto'],
  anuncios:['anuncios','id,codigo_externo,titulo,tipo,conta_canal_id,sku_canal,produto_id,sincronizado_em,status,estoque,preco_atual,frete_gratis,logistica,vendidos_total'],
  produtos:['produtos','id,sku,titulo,curva'],
  diarias:['vendas_diarias','id,conta_canal_id,data,receita,pedidos,visitas,investimento_ads,receita_ads,cliques_ads,origem_vendas,origem_visitas,origem_ads,vendas_atualizadas_em,visitas_atualizadas_em,ads_atualizados_em',q=>q.gte('data','2026-02-14').lte('data','2026-10-11')],
  visitas:['anuncio_desempenho_diario','id,anuncio_id,data,visitas,importacao_id',q=>q.gte('data','2026-02-14').lte('data','2026-10-11')],
  catalogo:['anuncio_catalogo_diario','*',q=>q.gte('data','2026-02-14')],
  estoquesHistoricos:['anuncio_estoque_diario','*',q=>q.gte('data','2026-02-14')],
  ads:['anuncio_ads','*',q=>q.gte('inicio','2026-02-14').lte('fim','2026-10-11')],
  reputacao:['conta_reputacao_diaria','*',q=>q.gte('data','2026-02-14')],
  estoques:['estoque_saldos','*'],
  fontesEstoque:['estoque_fontes','*'],
};
const out={operacaoId:op,empresa:'Bom de Compras',extraidoEm:new Date().toISOString(),fim:'2026-10-11'};
for(const[k,[table,columns,filter]] of Object.entries(specs)) {
  out[k]=await all(table,columns,filter);
  console.log(k,out[k].length);
}
fs.writeFileSync(path.join(dir,'dados-restritos.json'),JSON.stringify(out));
const coverage={};
for(const c of out.contas) {
  const ps=out.pedidos.filter(p=>p.conta_canal_id===c.id);
  const ds=out.diarias.filter(d=>d.conta_canal_id===c.id);
  coverage[c.nome]={pedidos:ps.length,primeiro:ps.map(p=>p.data).sort()[0],ultimo:ps.map(p=>p.data).sort().at(-1),origens:Object.fromEntries([...new Set(ps.map(p=>p.origem))].map(o=>[o,ps.filter(p=>p.origem===o).length])),dias:ds.length,primeiroDia:ds.map(d=>d.data).sort()[0],ultimoDia:ds.map(d=>d.data).sort().at(-1)};
}
console.log(JSON.stringify(coverage,null,2));
