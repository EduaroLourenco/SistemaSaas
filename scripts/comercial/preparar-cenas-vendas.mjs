// Manifestos do lote de vendas. Lê capturas autorizadas e cria quadros próprios
// de leitura, identificados como exemplo; não abre navegador nem altera a base.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const raiz=resolve(process.argv[2]??'output/comercial-motion');
const roteiros=JSON.parse(await readFile('scripts/comercial/roteiros-base-vendas.json','utf8'));
const pastaQuadros=join(raiz,'quadros');await mkdir(pastaQuadros,{recursive:true});
const e=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const texto=(t,x,y,tam=22,cor='#282333',peso=600)=>`<text x="${x}" y="${y}" fill="${cor}" font-size="${tam}" font-weight="${peso}">${e(t)}</text>`;
const bloco=(rotulo,valor,y,extra='',cor='#7045d1')=>`<rect x="22" y="${y}" width="361" height="125" rx="18" fill="#fff" stroke="#dfd7ee"/>${texto(rotulo,42,y+31,15,'#746b80')}${texto(valor,42,y+75,34,cor)}${texto(extra,42,y+103,13,'#746b80',400)}`;
const base=(titulo,sub,miolo,rodape='Dados fictícios · Atlas Casa')=>`<svg xmlns="http://www.w3.org/2000/svg" width="405" height="500" viewBox="0 0 405 500"><rect width="405" height="500" rx="22" fill="#f1edf9"/><g font-family="Segoe UI,Arial,sans-serif">${texto('LEITURA DO EXEMPLO',24,35,11,'#7045d1',700)}${texto(titulo,24,77,24)}${texto(sub,24,105,13,'#746b80',400)}${miolo}${texto(rodape,24,475,12,'#746b80',400)}</g></svg>`;
const quadros={
 'quadro-hoje-semana':base('Do dia para a semana','Mesmo histórico, perguntas diferentes',bloco('18/11 · DIA EM ANDAMENTO','R$ 6.778,96',138,'Receita líquida do dia')+bloco('16–22/11 · EM CURSO','R$ 22.527,92',280,'Acumulado registrado até 18/11')),
 'quadro-cancelamentos':base('O cancelamento tem valor','05/10 a 18/11/2026',bloco('PEDIDOS CANCELADOS','3 pedidos',138,'Um pedido pode ter vários itens')+bloco('VALOR CANCELADO','R$ 1.988,79',280,'A taxa exibida sobre o valor é 0,5%')),
 'quadro-pedidos':base('O rastro dos pedidos','Linha do tempo do exemplo',bloco('14/10 · MESA AURORA','R$ 749,90',126,'1 unidade')+bloco('04/11 · PUFF LINHO','R$ 979,80',263,'2 unidades')+texto('14/11 · Luminária Arco · R$ 259,09',24,433,17)),
 'quadro-mesa-conversao':base('Uma pista na Mesa Aurora','05–11/11 → 12–18/11/2026',bloco('VISITAS','833 → 518',138,'Menos visitas no período')+bloco('CONVERSÃO','2,04% → 2,51%',280,'Unidades vendidas ÷ visitas','#138265')),
 'quadro-investigacao':base('A próxima pergunta','Sinais do período · 12 a 18/11',`<rect x="22" y="140" width="361" height="258" rx="20" fill="#fff" stroke="#dfd7ee"/>${texto('MESA AURORA',44,179,14,'#7045d1')}${texto('Conferir a exposição',44,214,23)}<path d="M44 242H361" stroke="#e5deef"/>${texto('PUFF LINHO',44,278,14,'#7045d1')}${texto('Conferir a disponibilidade',44,314,21)}${texto('Sinais orientam; não provam causa.',24,435,17)}`),
 'quadro-sku-medidas':base('A Luminária Arco, por inteiro','AT-LUZ-02 · 05/10 a 18/11/2026',bloco('QUANTAS SAÍRAM?','122 unidades',138,'Volume vendido no recorte')+bloco('QUANTO ENTROU?','R$ 28.802,56',280,'Receita das mesmas vendas')),
 'quadro-sku-decisao':base('A pergunta guia a leitura','Mesmo SKU, mesmo período',`<rect x="22" y="140" width="361" height="258" rx="20" fill="#fff" stroke="#dfd7ee"/>${texto('PARA CONFERIR O VOLUME',44,179,13,'#7045d1')}${texto('Leia as unidades',44,214,26)}<path d="M44 242H361" stroke="#e5deef"/>${texto('PARA ACOMPANHAR O FATURAMENTO',44,278,12,'#7045d1')}${texto('Leia a receita',44,314,26)}${texto('Uma medida por pergunta.',24,435,18)}`),
};
for(const [nome,svg] of Object.entries(quadros))await writeFile(join(pastaQuadros,nome+'.svg'),svg);

const existentes={
 'hoje-visao':{imagem:'../../../public/site/telas/v01.webp',recorte:{x:16,y:100,w:568,h:580},alvo:{x:8,y:275,w:550,h:230}},
 'hoje-valor':{imagem:'../../../public/site/telas/v01.webp',recorte:{x:16,y:684,w:568,h:280},alvo:{x:8,y:85,w:440,h:120}},
 'cancelamentos-valor':{imagem:'../../../public/site/telas/v02.webp',recorte:{x:16,y:314,w:568,h:286},alvo:{x:8,y:110,w:505,h:110}},
 'cancelamentos-taxa':{imagem:'../../../public/site/telas/v02.webp',recorte:{x:16,y:610,w:568,h:182},alvo:{x:8,y:10,w:538,h:155}},
 'queda-geral':{imagem:'../../../public/site/telas/v03.webp',recorte:{x:16,y:320,w:568,h:435},alvo:{x:8,y:90,w:540,h:115}},
};
// Cada entrada local pode receber recorte/alvo depois da conferência visual.
let enquadramentos={};try{enquadramentos=JSON.parse(await readFile(join(raiz,'enquadramentos-vendas.json'),'utf8'));}catch{}
for(const video of roteiros.videos){
 const dir=join(raiz,video.id);await mkdir(dir,{recursive:true});
 const cenas=video.cenas.map((cena,i)=>{
  const chave=cena.captura;
  let fonte=existentes[chave]??(quadros[chave]?{imagem:`../quadros/${chave}.svg`}:{imagem:`../capturas/${chave}.png`});
  fonte={...fonte,...enquadramentos[chave]};
  if(chave==='v02-pedidos'&&!existsSync(join(raiz,'capturas','v02-pedidos.png'))&&!enquadramentos[chave])fonte={imagem:'../quadros/quadro-pedidos.svg'};
  if(chave==='v01-semanal-fechadas'&&!existsSync(join(raiz,'capturas','v01-semanal-fechadas.png'))&&!enquadramentos[chave])fonte={imagem:'../capturas/v01-semanal-resumo.png'};
  return{...fonte,voz:`voz/cena-${String(i+1).padStart(2,'0')}.wav`,nuvem:cena.nuvem,legenda:cena.legenda,duracao:5,humor:cena.humor};
 });
 await writeFile(join(dir,'manifesto.json'),JSON.stringify({id:video.id,titulo:video.titulo,fontes:video.fonte,nota:roteiros.nota,cenas},null,2)+'\n');
 console.log(video.id,': manifesto pronto');
}
