// Cálculos reutilizáveis: nenhuma chave, credencial ou dado de cliente neste módulo.
export const n=x=>Number(x??0), round=x=>Math.round((x+Number.EPSILON)*100)/100;
export const soma=(xs,key)=>xs.reduce((s,x)=>s+n(typeof key==='function'?key(x):x[key]),0);
export const dividir=(a,b)=>b? a/b:null;
export const variacao=(a,b)=>b? a/b-1:null;
export function dia(iso,delta=0){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
const dentro=(dt,r)=>dt>=r.de&&dt<=r.ate;
const semSku=t=>'sem-sku:'+String(t??'Item não identificado').trim().toLowerCase();
function vazio(){return {receita:0,pedidos:0,unidades:0,cancelados:0,valorCancelado:0,valorItens:0,diasComVenda:0,visitas:null,ticket:null,conversao:null,precoMedio:null};}
function fechar(x){x.receita=round(x.receita);x.ticket=dividir(x.receita,x.pedidos);x.conversao=dividir(x.pedidos,x.visitas);x.precoMedio=dividir(x.valorItens,x.unidades);return x;}

export function analisar(raw,api){
 const canais=raw.contas.map(c=>({id:c.id,nome:c.nome==='Meli'?'Mercado Livre':c.nome,codigo:c.canais?.codigo??'',direto:c.nome==='Venda direta',fonte:c.nome==='Meli'?'Mercado Livre API':'Bling API'}));
 const meli=canais.find(c=>c.nome==='Mercado Livre')?.id;
 const ordens=new Map(raw.pedidos.map(p=>[p.id,p]));
 const itensPorPedido=new Map();for(const i of raw.itens){if(!ordens.has(i.pedido_id))continue;const list=itensPorPedido.get(i.pedido_id)??[];list.push(i);itensPorPedido.set(i.pedido_id,list);}
 const produtoId=new Map(raw.produtos.map(p=>[p.id,p]));
 const anunciosId=new Map(raw.anuncios.map(a=>[a.id,a]));
 const anunciosMlb=new Map(raw.anuncios.map(a=>[a.codigo_externo,a]));
 const vivos=new Map((api.catalogo??[]).map(a=>[a.mlb,a]));
 const disputas=new Map((api.disputas??[]).map(a=>[a.mlb,a]));
 const skusHistoricos=new Map();
 for(const i of raw.itens){if(!i.sku||!i.codigo_externo)continue;const set=skusHistoricos.get(i.codigo_externo)??new Set();set.add(String(i.sku).trim());skusHistoricos.set(i.codigo_externo,set);}
 const skuAnuncio=a=>{const candidatos=skusHistoricos.get(a?.codigo_externo);return(a?.sku_canal||produtoId.get(a?.produto_id)?.sku||(candidatos?.size===1?[...candidatos][0]:'')||'').trim();};
 const skuItem=i=>String(i.sku||skuAnuncio(anunciosId.get(i.anuncio_id))||'').trim();
 const catalogo=(api.catalogo??[]).map(a=>{
   const d=disputas.get(a.mlb), antigo=anunciosMlb.get(a.mlb);
   const historico=raw.catalogo.filter(x=>x.anuncio_id===antigo?.id).sort((a,b)=>a.data.localeCompare(b.data));
   return {mlb:a.mlb,sku:skuAnuncio(antigo)||a.sku,titulo:a.titulo,status:a.status,estoqueAnunciado:a.estoque,preco:a.preco,logistica:a.logistica,freteGratis:a.freteGratis,catalogo:a.catalogo,elegivel:(api.elegiveis??[]).includes(a.mlb),motivoPausa:a.motivoPausa,situacao:d?.status??null,precoAtual:d?.current_price??a.preco,precoParaGanhar:d?.price_to_win??null,vencedorPreco:d?.winner?.price??null,alavancas:(d?.boosts??[]).filter(b=>b.status==='opportunity').map(b=>({id:b.id,descricao:b.description})),motivos:d?.reason??[],historico:historico.map(x=>({data:x.data,situacao:x.situacao,preco:x.preco_atual,precoParaGanhar:x.preco_para_ganhar})),estoques:raw.estoques.filter(x=>(x.anuncios??[]).includes(a.mlb)).map(x=>({origem:x.origem,local:x.local_nome,quantidade:x.disponivel,consultadoEm:x.consultado_em,compartilhado:(x.anuncios??[]).length>1}))};
 });
 const linhas=[];let semItens=0;
 for(const p of raw.pedidos){
   const its=itensPorPedido.get(p.id)??[];
   if(!its.length){semItens++;linhas.push({data:p.data,canal:p.conta_canal_id,pedido:p.id,cancelado:p.cancelado,sku:null,chave:'sem-itens',titulo:'Pedido sem detalhamento de itens',mlb:null,quantidade:0,preco:null,valorItem:0,receita:n(p.total)});continue;}
   const totalItens=soma(its,i=>Math.max(0,n(i.total??n(i.quantidade)*n(i.preco_unitario))));
   let rateado=0;
   its.forEach((i,ix)=>{
     const peso=totalItens?Math.max(0,n(i.total??n(i.quantidade)*n(i.preco_unitario)))/totalItens:1/its.length;
     const receita=ix===its.length-1?round(n(p.total)-rateado):round(n(p.total)*peso);rateado+=receita;
     const sku=skuItem(i),a=anunciosId.get(i.anuncio_id)||anunciosMlb.get(i.codigo_externo);
     linhas.push({data:p.data,canal:p.conta_canal_id,pedido:p.id,cancelado:p.cancelado,sku:sku||null,chave:sku||semSku(i.titulo),titulo:i.titulo||produtoId.get(a?.produto_id)?.titulo||a?.titulo||sku||'Sem descrição',mlb:/^MLB\d+$/.test(i.codigo_externo??'')?i.codigo_externo:a?.codigo_externo??null,quantidade:n(i.quantidade),preco:n(i.preco_unitario),valorItem:n(i.preco_unitario)*n(i.quantidade),receita});
   });
 }
 function metricas(r,canal){
   const ps=raw.pedidos.filter(p=>dentro(p.data,r)&&(!canal||p.conta_canal_id===canal)), ok=ps.filter(p=>!p.cancelado);
   const ls=linhas.filter(i=>dentro(i.data,r)&&!i.cancelado&&(!canal||i.canal===canal));
   const x=vazio();x.receita=soma(ok,'total');x.pedidos=ok.length;x.unidades=soma(ls,'quantidade');x.valorItens=soma(ls,'valorItem');x.cancelados=ps.length-ok.length;x.valorCancelado=soma(ps.filter(p=>p.cancelado),'total');x.diasComVenda=new Set(ok.map(p=>p.data)).size;
   if(canal===meli){const v=api.visitas?.find(v=>v.de===r.de&&v.ate===r.ate);x.visitas=v?.visitas??null;}
   return fechar(x);
 }
 const series=[];
 for(let dt=dia(raw.fim,-119);dt<=raw.fim;dt=dia(dt,1))for(const c of canais){
   const m=metricas({de:dt,ate:dt},c.id), diaria=raw.diarias.find(x=>x.conta_canal_id===c.id&&x.data===dt);
   series.push({dia:dt,canal:c.id,receita:m.receita,pedidos:m.pedidos,unidades:m.unidades,cancelados:m.cancelados,visitas:c.id===meli?soma(raw.visitas.filter(x=>x.data===dt),'visitas'):null,ads:c.id===meli&&diaria?.origem_ads==='api'?n(diaria.investimento_ads):null,registro:Boolean(diaria)});
 }
 const periodos={};
 for(const dias of [30,60]){
   const atual={de:dia(raw.fim,-dias+1),ate:raw.fim},anterior={de:dia(raw.fim,-dias*2+1),ate:dia(raw.fim,-dias)};
   const porCanal=canais.map(c=>({...c,atual:metricas(atual,c.id),anterior:metricas(anterior,c.id)}));
   const agrupamentos=new Map();
   for(const l of linhas){if(l.cancelado||!dentro(l.data,{de:anterior.de,ate:atual.ate}))continue;const k=l.chave;let p=agrupamentos.get(k);if(!p){p={chave:k,sku:l.sku,titulo:l.titulo,canais:{},serie:[],anuncios:[]};agrupamentos.set(k,p);}let c=p.canais[l.canal];if(!c){c={id:l.canal,atual:vazio(),anterior:vazio(),idsAtual:new Set(),idsAnterior:new Set()};p.canais[l.canal]=c;}const recente=dentro(l.data,atual),m=recente?c.atual:c.anterior;m.receita+=l.receita;m.unidades+=l.quantidade;m.valorItens+=l.valorItem;(recente?c.idsAtual:c.idsAnterior).add(l.pedido);p.serie.push({dia:l.data,canal:l.canal,receita:l.receita,unidades:l.quantidade});}
   const adsDetalhes=[];
   for(const a of raw.anuncios){
     const ls=linhas.filter(l=>l.mlb===a.codigo_externo&&!l.cancelado);
     const met=r=>{const its=ls.filter(l=>dentro(l.data,r));const vs=raw.visitas.filter(v=>v.anuncio_id===a.id&&dentro(v.data,r));const x=vazio();x.receita=soma(its,'receita');x.unidades=soma(its,'quantidade');x.valorItens=soma(its,'valorItem');x.pedidos=new Set(its.map(i=>i.pedido)).size;x.visitas=soma(vs,'visitas');return fechar(x);};
     const ad={mlb:a.codigo_externo,sku:skuAnuncio(a),titulo:a.titulo,atual:met(atual),anterior:met(anterior),status:vivos.get(a.codigo_externo)?.status??a.status};
     adsDetalhes.push(ad);const p=agrupamentos.get(skuAnuncio(a));if(p)p.anuncios.push(ad);
   }
   const produtos=[...agrupamentos.values()].map(p=>{p.canais=Object.values(p.canais).map(c=>{c.atual.pedidos=c.idsAtual.size;c.anterior.pedidos=c.idsAnterior.size;delete c.idsAtual;delete c.idsAnterior;return{...c,atual:fechar(c.atual),anterior:fechar(c.anterior)};});return p;});
   const adsAtuais=api.ads?.find(x=>x.de===atual.de&&x.ate===atual.ate)??null;
   const adsAnteriores=api.ads?.find(x=>x.de===anterior.de&&x.ate===anterior.ate)??null;
   periodos[dias]={dias,atual,anterior,geral:{atual:metricas(atual),anterior:metricas(anterior)},canais:porCanal,produtos,anuncios:adsDetalhes,adsAtuais,adsAnteriores};
 }
 const verificacao=[];
 for(const p of Object.values(periodos))for(const j of ['atual','anterior']){
   const total=soma(p.canais,c=>c[j].receita),prod=soma(p.produtos,x=>soma(x.canais,c=>c[j].receita));
   if(Math.abs(total-p.geral[j].receita)>.03||Math.abs(total-prod)>.03)throw Error('Receita não reconciliada '+p.dias+'/'+j);
   verificacao.push({dias:p.dias,janela:j,receitaPedidos:round(total),receitaProdutos:round(prod),diferenca:round(total-prod)});
 }
 return {versao:1,operacaoId:raw.operacaoId,empresa:raw.empresa,extraidoEm:raw.extraidoEm,consultadoEm:api.consultadoEm,fim:raw.fim,canais,meli,periodos,series,catalogo,verificacao,limites:{semItens,semSku:linhas.filter(l=>!l.sku&&!l.cancelado&&l.data>=periodos[60].atual.de).length,visitasAnuncios60:soma(raw.visitas.filter(x=>dentro(x.data,periodos[60].atual)),'visitas'),estoqueBling:raw.fontesEstoque.find(x=>x.provedor==='bling')?.estado??'ausente',catalogoHistoricoDe:raw.catalogo.map(x=>x.data).sort()[0]??null,estoqueHistoricoDe:raw.estoquesHistoricos.map(x=>x.data).sort()[0]??null},fontesEstoque:raw.fontesEstoque.map(x=>({provedor:x.provedor,estado:x.estado,atualizadaEm:x.atualizada_em})),errosAPI:api.erros??[]};
}
