import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false}});
const op='00000000-0000-0000-0000-000000000101';
const dir='.scratch/diagnostico-commerce'; mkdirSync(dir,{recursive:true});
const special={integracoes:'id,operacao_id,provedor,canal_id,status,expira_em,ultima_sincronizacao,ultimo_erro',importacoes:'id,tipo,nome_arquivo,periodo_inicio,periodo_fim,data_base,linhas_lidas,linhas_validas,status,criado_em',lancamentos_financeiros:'id,tipo,categoria_id,canal_id,valor,competencia,vencimento,pagamento,status,natureza',folha_pagamento:'id,competencia,salario_base,beneficios,encargos,descontos,custo_total'};
const tables=['canais','contas_canal','integracoes','sincronizacoes','importacoes','exclusoes_analise','produtos','anuncios','vendas_diarias','pedidos','pedido_itens','anuncio_desempenho_semanal','anuncio_desempenho_diario','anuncio_precos_vitrine','anuncio_ads','visitas_mensais','precos_ideais','formula_base_precos','campanhas','campanha_itens','historico_promocoes','precos_coletados','fretes_coletados','lancamentos_financeiros','folha_pagamento','lotes_compra','categorias_financeiras','metas','comissoes_canal','faixas_frete','anotacoes_anuncio','alertas'];
const manifest={extraidoEm:new Date().toISOString(),operacao:op,tabelas:{}};
async function read(t){
 let rows=[],expected=null;
 for(let from=0;;from+=1000){
  const {data,error,count}=await sb.from(t).select(special[t]??'*',{count:'exact'}).eq('operacao_id',op).order('id').range(from,from+999);
  if(error)throw new Error(t+': '+error.message);
  expected=count; rows.push(...data); if(rows.length>=count||data.length===0)break;
 }
 if(rows.length!==expected)throw new Error(t+': paginação incompleta');
 writeFileSync(`${dir}/${t}.json`,JSON.stringify(rows));
 manifest.tabelas[t]={linhas:rows.length};console.log(t,rows.length);
}
for(let i=0;i<tables.length;i+=4){const rs=await Promise.allSettled(tables.slice(i,i+4).map(read));for(const r of rs)if(r.status==='rejected')throw r.reason;}
writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2));
