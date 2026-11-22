// Reaproveita os MP4: troca só a trilha quando cabe; estende cenas sem acelerar fala.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf('--'+n);return i<0?d:args[i+1];};
const ffmpeg=opt('ffmpeg',process.env.GERIZO_FFMPEG);
if(!ffmpeg)throw new Error('Informe --ffmpeg.');
const ffprobe=join(dirname(ffmpeg),'ffprobe.exe');
const out=resolve(opt('out','output/comercial-voz/historia/finais'));
const roteiro=JSON.parse(await readFile('scripts/comercial/narracao-historia.json','utf8'));
const escolhidos=new Set((opt('videos','')||'').split(',').filter(Boolean));
const atualizados=args.includes('--atualizados');
const corrigidos=new Set(['v02','v03','v06','v08']);
const vendas=new Set(['v01','v02','v03','v04','v05','v07','v09','v12','v14','v15']);
const run=(program,argv)=>new Promise((ok,no)=>{const p=spawn(program,argv,{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',d=>stdout+=d);p.stderr.on('data',d=>stderr+=d);p.on('error',no);p.on('close',c=>c===0?ok(stdout):no(new Error(stderr.slice(-3500))));});
const duracao=async p=>Number(await run(ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',p]));
await mkdir(out,{recursive:true});

for(const video of roteiro.videos.filter(v=>!['v00','v13'].includes(v.id)&&(!escolhidos.size||escolhidos.has(v.id)))){
  const novaFonte=atualizados&&corrigidos.has(video.id);
  const caminhoManifesto=novaFonte?`output/comercial-historia-visuais/${video.id}/manifesto.json`:`output/${vendas.has(video.id)?'comercial-motion':'comercial-motion-base'}/${video.id}/manifesto.json`;
  const manifesto=JSON.parse(await readFile(caminhoManifesto,'utf8'));
  if(manifesto.cenas.length!==video.cenas.length)throw new Error(`${video.id}: quantidade de cenas diferente.`);
  const pastaFonte=novaFonte?'output/comercial-historia-visuais/finais':'public/site/videos';
  const fonte=resolve(pastaFonte,video.id+'-motion.mp4');
  const fonteDuracao=await duracao(fonte);
  let acumulado=0;
  const cenas=[];
  for(const [i,cena] of manifesto.cenas.entries()){
    const antiga=await duracao(resolve(dirname(caminhoManifesto),cena.voz));
    const janela=Math.max(cena.duracao||0,antiga+.75,2.6);
    const voz=resolve(`output/comercial-voz/historia/${video.id}/voz/cena-${String(i+1).padStart(2,'0')}.wav`);
    const fala=await duracao(voz);
    cenas.push({inicio:acumulado,fim:acumulado+janela,janela,voz,fala});
    acumulado+=janela;
  }
  if(Math.abs(acumulado-fonteDuracao)>.15)throw new Error(`${video.id}: linha do tempo da fonte diverge (${acumulado} / ${fonteDuracao}).`);
  cenas.at(-1).fim=fonteDuracao;
  cenas.at(-1).janela=fonteDuracao-cenas.at(-1).inicio;
  const cabe=cenas.every(c=>c.fala+.25<=c.janela);
  const destino=join(out,video.id+'-motion.mp4');
  const entradas=['-i',fonte,...cenas.flatMap(c=>['-i',c.voz])];
  let filtro,mapa,codec;
  if(cabe){
    filtro=cenas.map((c,i)=>`[${i+1}:a]adelay=${Math.round(c.inicio*1000)}:all=1[a${i}]`).join(';')+';'+cenas.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${cenas.length}:normalize=0,apad,atrim=duration=${fonteDuracao},loudnorm=I=-16:TP=-1.5:LRA=11[audio]`;
    mapa=['-map','0:v:0','-map','[audio]'];codec=['-c:v','copy'];
  }else{
    // Reencoda apenas o MP4 existente; não reconstrói telas ou ilustrações.
    const split=cenas.map((_,i)=>`[s${i}]`).join('');
    const filtros=[`[0:v]split=${cenas.length}${split}`];
    for(const [i,c] of cenas.entries()){
      c.novaDuracao=Math.max(3.2,c.fala+.65);
      filtros.push(`[s${i}]trim=start=${c.inicio}:end=${c.fim},setpts=${c.novaDuracao/c.janela}*(PTS-STARTPTS),fps=24,setsar=1[v${i}]`);
      filtros.push(`[${i+1}:a]apad,atrim=duration=${c.novaDuracao},asetpts=PTS-STARTPTS[a${i}]`);
    }
    filtros.push(cenas.map((_,i)=>`[v${i}][a${i}]`).join('')+`concat=n=${cenas.length}:v=1:a=1[video][mix]`);
    filtros.push('[mix]loudnorm=I=-16:TP=-1.5:LRA=11[audio]');
    filtro=filtros.join(';');mapa=['-map','[video]','-map','[audio]'];
    codec=['-c:v','h264_mf','-rate_control','quality','-quality','90','-b:v','3500k','-pix_fmt','yuv420p'];
  }
  console.log(`${video.id}: ${cabe?'copiando imagem, trocando voz':'ajustando tempos das cenas existentes'}…`);
  await run(ffmpeg,['-hide_banner','-loglevel','error','-y',...entradas,'-filter_complex',filtro,...mapa,...codec,'-c:a','aac','-b:a','160k','-ar','48000','-ac','1','-movflags','+faststart',destino]);
  await copyFile(resolve(pastaFonte,video.id+'-motion.webp'),join(out,video.id+'-motion.webp'));
  const tempo=await duracao(destino);
  await writeFile(join(out,video.id+'-timing.json'),JSON.stringify({id:video.id,voz:roteiro.voz,fonte,modo:cabe?'remux':'cenas-retimadas',duracao:tempo,cenas},null,2)+'\n');
  console.log(`${video.id}: pronto, ${tempo.toFixed(2)}s.`);
}
