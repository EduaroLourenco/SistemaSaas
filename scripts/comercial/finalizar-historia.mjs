// Promove somente mídias finais locais e sincroniza o catálogo com medições reais.
import { readFile, writeFile, rename, stat, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as aguardar } from 'node:timers/promises';

const args=process.argv.slice(2),i=args.indexOf('--ffmpeg');
const ffmpeg=i>=0?args[i+1]:process.env.GERIZO_FFMPEG;
if(!ffmpeg)throw new Error('Informe --ffmpeg.');
const ffprobe=join(dirname(ffmpeg),'ffprobe.exe');
const run=(argv)=>new Promise((ok,no)=>{const p=spawn(ffprobe,argv,{windowsHide:true,stdio:['ignore','pipe','pipe']});let s='',e='';p.stdout.on('data',d=>s+=d);p.stderr.on('data',d=>e+=d);p.on('error',no);p.on('close',c=>c===0?ok(s):no(new Error(e)));});
const roteiro=JSON.parse(await readFile('scripts/comercial/narracao-historia.json','utf8'));
const registros=[];
let medidasAnteriores=[];
if(args.includes('--reusar-medidas'))try{medidasAnteriores=JSON.parse(await readFile('output/comercial-historia/metadados-finais.json','utf8'));}catch{}
for(const id of roteiro.ordem){
  const pasta=['v00','v13'].includes(id)?'output/comercial-historia-visuais/finais':'output/comercial-voz/historia/finais';
  const arquivo=resolve(pasta,id+'-motion.mp4');
  const anterior=medidasAnteriores.find(r=>r.id===id&&r.voz===roteiro.voz);
  if(anterior&&(await stat(arquivo)).size===anterior.bytes){
    registros.push({...anterior,titulo:roteiro.videos.find(v=>v.id===id).titulo});continue;
  }
  const info=JSON.parse(await run(['-v','error','-show_entries','format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate','-of','json',arquivo]));
  const v=info.streams.find(s=>s.codec_type==='video'),a=info.streams.find(s=>s.codec_type==='audio');
  if(v?.codec_name!=='h264'||v.width!==1080||v.height!==1920||v.r_frame_rate!=='24/1'||a?.codec_name!=='aac')throw new Error('Mídia inválida: '+id);
  registros.push({id,titulo:roteiro.videos.find(v=>v.id===id).titulo,duracao:Number(info.format.duration),bytes:Number(info.format.size),voz:roteiro.voz});
}
async function promover(origem,destino){
  const temporario=destino+'.gerizo-tmp';
  await writeFile(temporario,await readFile(origem));
  for(let tentativa=0;;tentativa++){
    try{await rename(temporario,destino);return;}
    catch(erro){if(tentativa>=8)throw erro;await aguardar(250);}
  }
}
// Confere todos antes da promoção; cada arquivo é substituído sem truncar o atual.
for(const {id} of registros){
  const pasta=['v00','v13'].includes(id)?'output/comercial-historia-visuais/finais':'output/comercial-voz/historia/finais';
  for(const ext of ['mp4','webp'])await promover(resolve(pasta,id+'-motion.'+ext),resolve('public/site/videos',id+'-motion.'+ext));
}
let catalogo=await readFile('src/lib/comercial/funcionalidades.ts','utf8');
for(const {id,duracao} of registros){
  if(id==='v00')catalogo=catalogo.replace(/id:\s*"v00",\s*(?:duracaoSegundos:\s*[\d.]+,\s*)?titulo:/,`id: "v00", duracaoSegundos: ${duracao}, titulo:`);
  else catalogo=catalogo.replace(new RegExp(`(id:\\s*"${id}"[\\s\\S]*?duracaoSegundos:\\s*)[\\d.]+`),(_,p)=>p+duracao);
}
await writeFile('src/lib/comercial/funcionalidades.ts',catalogo);
const txt=[
  'GERIZO — HISTÓRIA GUIADA EM 16 CAPÍTULOS','Atualização: 22/11/2026','',
  'Uma pergunta leva à próxima tela. A abertura apresenta o Gerizo e o guia Gê.',
  'A sequência parte das vendas, investiga os sinais, confere contribuição e resultado,',
  'passa à precificação e às promoções e termina na rotina da loja.','',
  'ORDEM E MÍDIAS FINAIS','',
  ...registros.map((r,i)=>`${String(i+1).padStart(2,'0')}. ${r.id} | ${r.titulo} | ${r.duracao.toFixed(2)}s | /site/videos/${r.id}-motion.mp4`),'',
  'GÊ — PERFIL DA NARRAÇÃO','',
  'Voz pt-BR-ThalitaMultilingualNeural. Texto conversado, perguntas e pausas naturais.',
  'As 79 falas têm identidade de texto/voz/perfil no cache. O áudio é sintetizado',
  'diretamente, sem microfone ou gravação do som do computador.',
  'O provedor atual não aplica estilos expressivos SSML: a intenção vem da voz,',
  'do texto, da pontuação e de pequenas variações de entrega.','',
  'REAPROVEITAMENTO','',
  'Foram mantidas as cenas boas. Os 14 vídeos existentes receberam nova narração:',
  'a imagem foi copiada quando coube na janela; as demais cenas foram retimadas',
  'sem acelerar a fala. Quatro aberturas tiveram quadros antigos substituídos.',
  'V00 é a abertura de contexto. V13 acrescenta uma cena de rentabilidade.','',
  'PREÇO, VOLUME E RENTABILIDADE','',
  'Luminária, 05–11/11 contra 12–18/11/2026: preço 239,90 → 259,09;',
  'unidades 19 → 11; visitas 952 → 952; conversão 2,00% → 1,16%.',
  'Contribuição após Ads por unidade 83,01 → 93,58; no total 1.577,17 → 1.029,34.',
  'Contribuição ainda paga despesas fixas. O dia 18/11 é parcial.',
  'O movimento observado é uma pista de investigação, sem provar causalidade.','',
  'CENÁRIO E LIMITES','',
  'Atlas Casa: seis SKUs, um canal Mercado Livre, histórico 05/10–18/11/2026.',
  'Shopee e TikTok são simulações identificadas. Conversar tem respostas guiadas.',
  'Todas as 16 mídias foram conferidas como H.264 1080×1920, 24 fps e áudio AAC.','',
  'ROTEIROS E PRODUÇÃO','',
  'scripts/comercial/narracao-historia.json: falas e ordem finais.',
  'scripts/comercial/perfil-voz-ge.json: identidade do narrador.',
  'scripts/comercial/preparar-contexto-historia.mjs: abertura e quadros corrigidos.',
  'scripts/comercial/preparar-rentabilidade-v13.mjs: dados e cartão da contribuição.',
  'scripts/comercial/aplicar-narracao-historia.mjs: troca de trilha/retiming.',
  'scripts/comercial/finalizar-historia.mjs: medições e promoção local.','',
].join('\n');
await writeFile('docs/comercial/INVENTARIO_MOTIONS.txt',txt);
await mkdir('output/comercial-historia',{recursive:true});
await writeFile('output/comercial-historia/metadados-finais.json',JSON.stringify(registros,null,2)+'\n');
console.log(JSON.stringify(registros,null,2));
