import type { DadosAnual, DadosCanais } from "@/lib/dados/vendas";
import type { DadosMtd } from "@/lib/dados/mtd";
import { montarProdutosPrecos } from "@/lib/produtos-precos";
import { DEMO_HOJE, DEMO_INICIO, DEMO_OPERACAO, canaisDemo, contasDemo, produtosDemo, movimentosDemo, diasDemo, mlbDemo, filtrarMovimentosDemo } from "./fixtures-base";
import { dadosSemanalDemo } from "./fixtures-vendas";
const total=(linhas:typeof movimentosDemo)=>({receita:linhas.reduce((s,m)=>s+m.receita,0),pedidos:linhas.reduce((s,m)=>s+m.pedidos,0),visitas:linhas.reduce((s,m)=>s+m.visitas,0),ads:linhas.reduce((s,m)=>s+m.ads,0)});
export function canaisVendasDemo(q=new URLSearchParams()):DadosCanais { return{canais:canaisDemo,linhas:dadosSemanalDemo(q).linhas,ultimaData:DEMO_HOJE,vazio:false}; }
export function anualDemo():DadosAnual {
 const serie=(canal="")=>Array.from({length:12},(_,mes)=>{const m=movimentosDemo.filter(m=>Number(m.data.slice(5,7))===mes+1&&(!canal||m.canalId===canal));return{mes,rotulo:["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][mes],rotuloLongo:new Date(Date.UTC(2026,mes,1)).toLocaleDateString("pt-BR",{month:"long",timeZone:"UTC"}),...total(m),pedidosCancelados:0,valorCancelado:0,meta:mes>=8&&mes<=10?300000:0};});
 return{ano:2026,canais:canaisDemo,series:Object.fromEntries(["todos",...canaisDemo.map(c=>c.id)].map(c=>[c,serie(c==="todos"?"":c)])),anoAnterior:{},vazio:false};
}
export function mtdDemo(q=new URLSearchParams()):DadosMtd {
 const mes=q.get("mes")||"11",ano=Number(q.get("ano")||2026),prefixo=`${ano}-${mes.padStart(2,"0")}`,fim=new Date(Date.UTC(ano,Number(mes),0)).toISOString().slice(0,10),ate=prefixo===DEMO_HOJE.slice(0,7)?DEMO_HOJE:fim;
 const selecionados=(q.get("canal")||"").split(",").filter(Boolean),m=filtrarMovimentosDemo(prefixo+"-01",ate,selecionados.join(",")),t=total(m),decorridos=Number(ate.slice(8)),diasMes=Number(fim.slice(8)),metaMes=selecionados.length===1?150000:300000,metaAteAqui=metaMes*decorridos/diasMes,falta=Math.max(0,metaMes-t.receita),ticket=t.pedidos?t.receita/t.pedidos:null,conversao=t.visitas?t.pedidos/t.visitas*100:null;
 const alvo=(atual:number,necessario:number|null)=>({atual,necessario,variacao:atual&&necessario!=null?(necessario/atual-1)*100:null});
 return{vazio:!m.length,ano,mes:Number(mes),ate,diasDecorridos:decorridos,diasRestantes:diasMes-decorridos,canais:canaisDemo.map(c=>({...c,canalId:c.id})),selecionados,canaisComMeta:selecionados.length?selecionados:canaisDemo.map(c=>c.id),metaIncompleta:[],receitaBruta:t.receita,receitaCancelada:0,receitaPaga:t.receita,pedidos:t.pedidos,pedidosCancelados:0,visitas:t.visitas,ticket,conversao,metaMes,metaAteAqui,gap:metaAteAqui-t.receita,faltaNoMes:falta,porDiaRestante:diasMes>decorridos?falta/(diasMes-decorridos):null,projecao:decorridos?t.receita/decorridos*diasMes:null,visitasAlavanca:alvo(t.visitas,ticket&&conversao?metaMes/ticket/(conversao/100):null),conversaoAlavanca:alvo(conversao??0,t.visitas&&ticket?metaMes/t.visitas/ticket*100:null),ticketAlavanca:alvo(ticket??0,t.pedidos?metaMes/t.pedidos:null),diasLivres:diasMes-decorridos};
}
export function produtosPrecosDemo(q=new URLSearchParams()) {
 const de=q.get("de")||"2026-11-01",ate=q.get("ate")||DEMO_HOJE;
 return montarProdutosPrecos({operacaoId:DEMO_OPERACAO,de,ate,hoje:DEMO_HOJE,recorte:(q.get("canal")||"").split(",").filter(Boolean),canais:canaisDemo,contas:contasDemo,produtos:[...produtosDemo],anuncios:produtosDemo.flatMap((p,i)=>canaisDemo.map(c=>({id:p.id+c.id,codigo_externo:mlbDemo(i),sku_canal:p.sku,titulo:p.titulo,produto_id:p.id,canal_id:c.id,conta_canal_id:c.contaCanalId,status:"ativo"}))),itens:movimentosDemo.filter(m=>m.data>=de&&m.data<=ate&&m.quantidade>0).map((m,i)=>({id:"demo-item-"+i,sku:m.sku,titulo:m.titulo,anuncio_id:m.produtoId+m.canalId,codigo_externo:mlbDemo(produtosDemo.findIndex(p=>p.id===m.produtoId)),quantidade:m.quantidade,preco_unitario:m.preco,total:m.receita,pedidos:{data:m.data,canal_id:m.canalId,conta_canal_id:m.contaId,cancelado:false}})),leituras:produtosDemo.flatMap(p=>canaisDemo.flatMap(c=>diasDemo(de,ate).map(data=>({anuncio_id:p.id+c.id,data,preco:p.preco}))))});
}
