// Render offline de telas reais + motion vetorial. Não abre navegador, não altera dados.
// node scripts/comercial/render-motion.mjs --manifest manifesto.json --ffmpeg C:/caminho/ffmpeg.exe
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import sharp from 'sharp';

const args=process.argv.slice(2);
const opt=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:fallback;};
const manifestPath=opt('manifest');
if(!manifestPath)throw new Error('Informe --manifest CAMINHO_JSON. Consulte scripts/comercial/README.md.');
const sourceDir=dirname(resolve(manifestPath));
const input=JSON.parse(await readFile(manifestPath,'utf8'));
if(!/^v\d{2}[a-z-]*$/.test(input.id??'')||!Array.isArray(input.cenas)||!input.cenas.length)throw new Error('Manifesto sem id ou cenas válidas.');
const W=1080,H=1920,FPS=24;
const ffmpeg=opt('ffmpeg',process.env.GERIZO_FFMPEG??'ffmpeg');
const ffprobe=opt('ffprobe',ffmpeg.includes('/')||ffmpeg.includes('\\')?join(dirname(ffmpeg),'ffprobe'+extname(ffmpeg)):'ffprobe');
const outputDir=resolve(opt('out',input.saida??'output/motions/renderizados'));
await mkdir(outputDir,{recursive:true});
const output=join(outputDir,input.id+'-motion.mp4');
if(existsSync(output)&&!args.includes('--substituir'))throw new Error('Saída existente. Use outra pasta ou --substituir para esta versão gerada.');
const resource=p=>resolve(sourceDir,p);
const run=(program,argv)=>new Promise((ok,no)=>{const p=spawn(program,argv,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',no);p.on('close',code=>code===0?ok(out):no(new Error(err.slice(-3000))));});
const duration=async path=>Number(await run(ffprobe,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path]));
const encoders=await run(ffmpeg,['-hide_banner','-encoders']);
const codec=opt('encoder',encoders.includes('libx264')?'libx264':'h264_mf');
const codecArgs=codec==='libx264'?['-preset','fast','-crf','20']:codec==='h264_mf'?['-rate_control','quality','-quality','90','-b:v','3500k']:['-b:v','3500k'];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function lines(text,max=35){const words=String(text??'').split(/\s+/),out=[];let line='';for(const word of words){if(line&&(line+' '+word).length>max){out.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)out.push(line);return out;}
function textBlock(text,x,y,size,color,max=35){return lines(text,max).map((l,i)=>`<text x="${x}" y="${y+i*size*1.23}" font-size="${size}" fill="${color}">${escape(l)}</text>`).join('');}
const scenes=[];let total=0;
for(const item of input.cenas){
  if(!item.imagem||(!item.voz&&!args.includes('--sem-voz')))throw new Error('Cada cena final precisa de imagem real e voz; --sem-voz só para prévia.');
  const path=resource(item.imagem),voice=item.voz?resource(item.voz):null;
  let photo=sharp(path),meta=await photo.metadata();
  if(!meta.width||!meta.height)throw new Error('Imagem inválida: '+path);
  if(item.recorte){
    const r=item.recorte;
    if(![r.x,r.y,r.w,r.h].every(Number.isInteger)||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>meta.width||r.y+r.h>meta.height)throw new Error('Recorte fora da imagem: '+path);
    photo=photo.extract({left:r.x,top:r.y,width:r.w,height:r.h});meta={...meta,width:r.w,height:r.h};
  }
  if(item.legenda&&lines(item.legenda,33).length>3)throw new Error('Legenda longa: divida a cena, até três linhas curtas por vez.');
  if(String(item.nuvem??'').length>40)throw new Error('A pergunta do balão precisa ter até 40 caracteres.');
  const resize=Math.min(992/meta.width,1348/meta.height),width=Math.round(meta.width*resize),height=Math.round(meta.height*resize);
  const image=await photo.resize(width,height).png().toBuffer();
  const voiceDuration=voice?await duration(voice):0;
  const seconds=Math.max(Number(item.duracao)||0,voiceDuration+.75,2.6);
  scenes.push({...item,image:`data:image/png;base64,${image.toString('base64')}`,voice,width,height,resize,begin:total,duration:seconds});total+=seconds;
}
const frameCount=Math.ceil(total*FPS);
function character(x,y,time,mood){
  const dy=Math.sin(time*3.1)*4,blink=time%4.2>4.04,curious=mood!=='feliz';
  return `<g transform="translate(${x},${y+dy})"><ellipse cx="0" cy="86" rx="55" ry="8" fill="#dedbe8"/><g stroke="#393144" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M-24 58l-6 20M24 58l7 20M-43 13l-20 ${curious?-15:30}M43 13l18 -21" fill="none"/><rect x="-45" y="-36" width="90" height="94" rx="12" fill="#dfbd8b"/><path d="M-45-36l17-21h56l17 21" fill="#ebcc9d"/><path d="M-9-57h18v32H-9z" fill="#f8e8c9" stroke="none"/>${blink?'<path d="M-26 0h14M12 0h14"/>':'<ellipse cx="-19" cy="0" rx="5" ry="7" fill="#393144"/><ellipse cx="19" cy="0" rx="5" ry="7" fill="#393144"/>'}<path d="M-12 22q12 ${curious?8:17} 25 -1" fill="none"/>${curious?'<path d="M8-17l18-5"/>':''}</g></g>`;
}
function svg(scene,t,index,semPersonagem=false){
  const ix=(W-scene.width)/2,iy=144+(1348-scene.height)/2;
  const reveal=Math.min(1,t/.4),caption=scene.legenda??'',question=scene.nuvem??'';
  const target=scene.alvo;
  const outline=target?`<rect x="${ix+target.x*scene.resize-6}" y="${iy+target.y*scene.resize-6}" width="${target.w*scene.resize+12}" height="${target.h*scene.resize+12}" rx="14" fill="#7657b50b" stroke="#7657b5" stroke-width="5" stroke-dasharray="${2*(target.w+target.h)*scene.resize}" stroke-dashoffset="${(1-reveal)*2*(target.w+target.h)*scene.resize}"/>`:'';
  const bubbleOpacity=Math.min(1,t/.24),entry=Math.min(1,t/.5);
  const screenOpacity=Math.min(1,t/.32),screenOffset=(1-Math.min(1,t/.38))*10;
  const ease=1+2.7*Math.pow(entry-1,3)+1.7*Math.pow(entry-1,2),bubbleOffset=(1-ease)*12;
  const captionArea=question?`<g opacity="${bubbleOpacity}" transform="translate(0,${bubbleOffset})"><path d="M70 1546h820q18 0 18 18v38q0 18-18 18h-20l14 20-40-20H70q-18 0-18-18v-38q0-18 18-18" fill="#f1edfc" stroke="#e1d8f4" stroke-width="2"/>${textBlock(question,76,1594,36,'#7657b5',40)}</g>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><clipPath id="screen"><rect x="${ix}" y="${iy}" width="${scene.width}" height="${scene.height}" rx="22"/></clipPath></defs><rect width="1080" height="1920" fill="#f7f6fa"/><g font-family="Segoe UI,Arial,sans-serif" font-weight="600"><text x="54" y="64" fill="#7045d1" font-size="29" letter-spacing="3">GERIZO</text><text x="54" y="111" fill="#262330" font-size="34">${escape(input.titulo??'Veja na prática')}</text><text x="1026" y="66" text-anchor="end" fill="#777181" font-size="24">${index+1}/${scenes.length}</text><g opacity="${screenOpacity}" transform="translate(0,${screenOffset})"><rect x="${ix-1}" y="${iy-1}" width="${scene.width+2}" height="${scene.height+2}" fill="#fff" stroke="#dedbe6" stroke-width="2" rx="23"/><image href="${scene.image}" x="${ix}" y="${iy}" width="${scene.width}" height="${scene.height}" clip-path="url(#screen)"/>${outline}</g><rect x="0" y="1520" width="1080" height="400" fill="#fff"/><path d="M48 1520H1032" stroke="#e5e2eb" stroke-width="2"/>${captionArea}${textBlock(caption,72,question?1690:1615,44,'#292534',33)}${semPersonagem?'':character(956,1736,t,scene.humor??'curioso')}<text x="72" y="1868" font-size="23" fill="#888090">Loja de exemplo · dados fictícios</text></g></svg>`;
}
const voices=scenes.filter(s=>s.voice);
const mixArgs=voices.flatMap(s=>['-i',s.voice]);
let audioArgs=[];
if(voices.length){
  const filters=voices.map((s,i)=>`[${i+1}:a]adelay=${Math.round(s.begin*1000)}:all=1[a${i}]`).join(';')+';'+voices.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${voices.length}:normalize=0,apad,atrim=duration=${total}[audio]`;
  audioArgs=[...mixArgs,'-filter_complex',filters,'-map','0:v:0','-map','[audio]','-c:a','aac','-b:a','160k'];
}
const processVideo=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',`${W}x${H}`,'-r',String(FPS),'-i','pipe:0',...audioArgs,'-c:v',codec,...codecArgs,'-pix_fmt','yuv420p','-t',String(total),'-movflags','+faststart',output],{windowsHide:true,stdio:['pipe','ignore','pipe']});
let errors='';processVideo.stderr.on('data',d=>errors+=d);processVideo.on('error',e=>processVideo.stdin.destroy(e));
const done=new Promise((ok,no)=>processVideo.on('close',code=>code===0?ok():no(new Error(errors.slice(-3000)))));
let sceneIndex=0,cachedIndex=-1,cachedBase=null,cachedFrame=null;
try{
  for(let frame=0;frame<frameCount;frame++){
    const t=frame/FPS;while(sceneIndex<scenes.length-1&&t>=scenes[sceneIndex+1].begin)sceneIndex++;
    const scene=scenes[sceneIndex],localTime=t-scene.begin;
    const poster=frame===Math.min(24,frameCount-1);
    const buffer=(localTime<=.5||poster)?Buffer.from(svg(scene,localTime,sceneIndex)):null;
    if(poster)await sharp(buffer).resize(720,1280).webp({quality:84}).toFile(join(outputDir,input.id+'-motion.webp'));
    let rgb;
    if(localTime<=.5)rgb=await sharp(buffer).removeAlpha().raw().toBuffer();
    else{
      if(cachedIndex!==sceneIndex){cachedBase=await sharp(Buffer.from(svg(scene,.6,sceneIndex,true))).removeAlpha().raw().toBuffer();cachedFrame=Buffer.from(cachedBase);cachedIndex=sceneIndex;}
      const personagem=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="180">'+character(80,68,localTime,scene.humor??'curioso')+'</svg>');
      const rgba=await sharp(personagem).ensureAlpha().raw().toBuffer();
      for(let py=0;py<180;py++){
        let dst=((1668+py)*W+876)*3,src=py*160*4;
        for(let px=0;px<160;px++,dst+=3,src+=4){
          const alpha=rgba[src+3],rest=255-alpha;
          cachedFrame[dst]=Math.round((rgba[src]*alpha+cachedBase[dst]*rest)/255);
          cachedFrame[dst+1]=Math.round((rgba[src+1]*alpha+cachedBase[dst+1]*rest)/255);
          cachedFrame[dst+2]=Math.round((rgba[src+2]*alpha+cachedBase[dst+2]*rest)/255);
        }
      }
      rgb=cachedFrame;
    }
    if(!processVideo.stdin.write(rgb))await once(processVideo.stdin,'drain');
    if(frame%(FPS*5)===0)console.log(`${input.id}: ${Math.round(t)} / ${Math.round(total)} segundos`);
  }
  processVideo.stdin.end();await done;
}catch(error){processVideo.kill();throw error;}
console.log('Render concluído:',output,'Duração:',total.toFixed(1),'segundos. Áudio sem aceleração.');
