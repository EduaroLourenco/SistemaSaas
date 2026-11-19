// Junta roteiros, capturas autorizadas e narrações locais. Nenhuma ação no navegador.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const raiz=resolve(process.argv[2]??'output/comercial-motion');
const roteiros=JSON.parse(await readFile('scripts/comercial/roteiros-profundos.json','utf8'));
const recortes={
 'luz-preco':{x:16,y:110,w:358,h:310},
 'luz-volume':{x:16,y:56,w:358,h:449},
 'luz-conversao':{x:16,y:162,w:358,h:343},
 'mesa-visitas':{x:16,y:56,w:358,h:449},
 'mesa-conversao':{x:16,y:162,w:358,h:343},
 'mesa-preco':{x:16,y:64,w:358,h:308},
 'kit-evolucao':{x:16,y:174,w:358,h:229},
 'relampago-precos':{x:16,y:218,w:358,h:290},
 'relampago-comparacao':{x:16,y:280,w:358,h:222},
 'relampago-grafico':{x:16,y:274,w:358,h:230},
 'relampago-custos':{x:16,y:122,w:358,h:175},
};
const alvos={
 'luz-preco':{x:58,y:95,w:270,h:193},
 'luz-volume':{x:8,y:118,w:328,h:116},
 'luz-conversao':{x:8,y:8,w:328,h:115},
 'mesa-visitas':{x:116,y:115,w:104,h:116},
 'mesa-conversao':{x:232,y:8,w:106,h:111},
 'mesa-preco':{x:165,y:95,w:165,h:190},
 'kit-evolucao':{x:38,y:50,w:293,h:160},
 'relampago-precos':{x:8,y:85,w:326,h:116},
 'relampago-comparacao':{x:114,y:171,w:215,h:42},
 'relampago-grafico':{x:176,y:45,w:54,h:159},
 'relampago-custos':{x:179,y:93,w:150,h:48},
};
for(const video of roteiros.videos){
 const dir=join(raiz,video.id);await mkdir(dir,{recursive:true});
 const cenas=video.cenas.map((cena,i)=>{
  const nome=cena.captura==='relampago-resultado'?'relampago-comparacao':cena.captura;
  const alvo=video.id==='v13'&&i===4?{x:8,y:7,w:328,h:94}:video.id==='v13'&&i===3?{x:227,y:118,w:106,h:116}:video.id==='v15'&&i===3?{x:112,y:61,w:220,h:62}:alvos[nome];
  return{imagem:`../capturas/${nome}.png`,voz:`voz/cena-${String(i+1).padStart(2,'0')}.wav`,nuvem:cena.nuvem,legenda:cena.legenda,duracao:5,humor:cena.humor,recorte:recortes[nome],alvo};
 });
 await writeFile(join(dir,'manifesto.json'),JSON.stringify({id:video.id,titulo:video.titulo,fontes:video.fonte,nota:roteiros.nota,cenas},null,2)+'\n');
 console.log(video.id,': cenas prontas');
}
