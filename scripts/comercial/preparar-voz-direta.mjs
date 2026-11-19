// Síntese de narração do cenário fictício, sem microfone, loopback ou sessão de navegador.
// A dependência fica numa pasta de ferramentas separada: --pacote PASTA_COM_PACKAGE_JSON.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const args=process.argv.slice(2);
const opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:fallback;};
const toolsDir=opt('pacote',process.env.GERIZO_VOZ_FERRAMENTAS);
if(!toolsDir)throw new Error('Informe --pacote PASTA de instalação isolada de @andresaya/edge-tts.');
const require=createRequire(join(resolve(toolsDir),'package.json'));
const {EdgeTTS}=require('@andresaya/edge-tts');
const input=JSON.parse(await readFile(resolve(opt('roteiros','scripts/comercial/roteiros-profundos.json')),'utf8'));
const output=resolve(opt('out','output/comercial-motion'));
const ffmpeg=opt('ffmpeg',process.env.GERIZO_FFMPEG);
const escolhido=opt('video');
const convert=(src,dest)=>new Promise((ok,no)=>{const p=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',src,'-ar','48000','-ac','1','-c:a','pcm_s16le',dest],{windowsHide:true});let error='';p.stderr.on('data',d=>error+=d);p.on('error',no);p.on('close',code=>code===0?ok():no(new Error(error.slice(-1000))));});
for(const video of input.videos.filter(v=>!escolhido||v.id===escolhido)){
 const dir=join(output,video.id,'voz');await mkdir(dir,{recursive:true});
 for(const [i,cena] of video.cenas.entries()){
  const base=join(dir,`cena-${String(i+1).padStart(2,'0')}`),arquivo=base+'.mp3',meta=base+'.json';
  const chave=JSON.stringify({fala:cena.fala,voz:input.voz,rate:'+3%',pitch:'+0Hz'});
  let anterior=null;try{anterior=JSON.parse(await readFile(meta,'utf8'));}catch{}
  if(!existsSync(arquivo)||anterior?.chave!==chave){
   const tts=new EdgeTTS();
   const audio=await tts.generate(cena.fala,input.voz,{rate:'+3%',pitch:'+0Hz',timeout:30000});
   await writeFile(arquivo,audio.audio);
   await writeFile(meta,JSON.stringify({chave,voz:input.voz,duracao:audio.duration,wordBoundaries:audio.wordBoundaries},null,2));
   console.log(video.id,`cena ${i+1}: narração criada`,audio.audio.length,'bytes');
  }else console.log(video.id,`cena ${i+1}: narração existente`);
  if(ffmpeg)await convert(arquivo,base+'.wav');
 }
}
