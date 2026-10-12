import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const op='01b057f3-4541-4423-ada4-288cfbbc6dd7',bucket='relatorios-privados',dir='output/relatorio-bom-de-compras';
const {data:existing,error:readError}=await sb.storage.getBucket(bucket);
if(readError){const {error}=await sb.storage.createBucket(bucket,{public:false,fileSizeLimit:5000000,allowedMimeTypes:['text/html']});if(error)throw Error(error.message);}
else if(existing.public)throw Error('O relatório exige armazenamento privado.');
const html=fs.readFileSync(dir+'/Relatorio-Bom-de-Compras.html');
for(const name of ['analise-2026-10-12.html','analise.html']){
 const target=op+'/'+name;
 const {data:old}=await sb.storage.from(bucket).download(target);
 if(old)fs.writeFileSync(dir+'/backup-'+name,Buffer.from(await old.arrayBuffer()));
 const {error}=await sb.storage.from(bucket).upload(target,html,{contentType:'text/html',upsert:true,cacheControl:'0'});
 if(error)throw Error(error.message);
}
const {data:check,error:checkError}=await sb.storage.from(bucket).download(op+'/analise.html');
if(checkError||Buffer.compare(Buffer.from(await check.arrayBuffer()),html)!==0)throw Error('Falha ao verificar o relatório armazenado.');
console.log('Relatório armazenado e conferido em área privada da operação.');
