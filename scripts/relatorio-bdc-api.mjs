import fs from 'node:fs';
import path from 'node:path';
import {createJiti} from '../node_modules/jiti/lib/jiti.mjs';
process.loadEnvFile('.env.local');
const dir=path.resolve('output/relatorio-bom-de-compras');
const jiti=createJiti(import.meta.url,{alias:{'@':path.resolve('src'),'server-only':path.resolve('output/vazio-atualizacao.cjs')}});
const {meliGet,catalogoCompleto,visitasDaConta}=await jiti.import(path.resolve('src/lib/meli/cliente.ts'));
const conta='ea75acaa-ff6f-4c96-a653-2e9e1321edcc';
const out={consultadoEm:new Date().toISOString(),erros:[],catalogo:[],disputas:[],visitas:[],ads:[]};
const save=()=>fs.writeFileSync(path.join(dir,'consulta-api.json'),JSON.stringify(out));
try{out.catalogo=await catalogoCompleto({conta,incluirPausados:true}); console.log('Catálogo lido',out.catalogo.length);save();}catch(e){out.erros.push({etapa:'catalogo',erro:e.message});}
for(const a of out.catalogo.filter(a=>a.catalogo)){
  try{const r=await meliGet(`/items/${a.mlb}/price_to_win?version=v2`,conta);out.disputas.push({mlb:a.mlb,...r});}
  catch(e){out.erros.push({etapa:'disputa',mlb:a.mlb,erro:e.message});}
}
console.log('Disputas lidas',out.disputas.length,'falhas',out.erros.length);save();
try{const r=await meliGet('/users/107536120/items/search?tags=catalog_listing_eligible&limit=100',conta);out.elegiveis=r.results??[];out.totalElegiveis=r.paging?.total??null;}catch(e){out.erros.push({etapa:'elegiveis',erro:e.message});}
for(const [de,ate]of[['2026-08-13','2026-10-11'],['2026-06-14','2026-08-12'],['2026-09-12','2026-10-11'],['2026-08-13','2026-09-11']]){
  try{out.visitas.push({de,ate,visitas:await visitasDaConta({de,ate,conta})});}catch(e){out.erros.push({etapa:'visitas',de,ate,erro:e.message});}
}
save();
try {
  const {anunciante,campanhas,anuncios}=await jiti.import(path.resolve('src/lib/meli/ads.ts'));
  const adv=await anunciante(conta);
  if(adv)for(const[de,ate]of[['2026-08-13','2026-10-11'],['2026-09-12','2026-10-11'],['2026-08-13','2026-09-11']]){
    try{out.ads.push({de,ate,campanhas:await campanhas(conta,adv,de,ate),anuncios:await anuncios(conta,adv,de,ate)});}
    catch(e){out.erros.push({etapa:'ads',de,ate,erro:e.message});}
  }
}catch(e){out.erros.push({etapa:'ads',erro:e.message});}
save();console.log(JSON.stringify({catalogo:out.catalogo.length,disputas:out.disputas.length,elegiveis:out.elegiveis?.length,visitas:out.visitas,ads:out.ads.map(x=>({de:x.de,ate:x.ate,campanhas:x.campanhas.length,anuncios:x.anuncios.length})),erros:out.erros}));
