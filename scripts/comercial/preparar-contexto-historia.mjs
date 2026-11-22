// Reaproveita as cenas publicadas e atualiza apenas os quadros que perderam coerência.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';

const raiz = resolve('output/comercial-historia-visuais');
const capturas = resolve('output/comercial-historia/capturas');
const bases = {
  v02: 'output/comercial-motion/v02/manifesto.json',
  v03: 'output/comercial-motion/v03/manifesto.json',
  v06: 'output/comercial-motion-base/v06/manifesto.json',
  v08: 'output/comercial-motion-base/v08/manifesto.json',
};
for (const [id, origem] of Object.entries(bases)) {
  const manifesto = JSON.parse(await readFile(origem, 'utf8'));
  manifesto.cenas = manifesto.cenas.map(cena => ({ ...cena,
    imagem: resolve(dirname(origem), cena.imagem), voz: resolve(dirname(origem), cena.voz) }));
  const primeira = manifesto.cenas[0];
  if (id === 'v02') Object.assign(primeira, { imagem: join(capturas, 'cancelamentos-atual.png'),
    recorte: { x: 16, y: 55, w: 372, h: 168 }, alvo: { x: 0, y: 53, w: 320, h: 72 } });
  if (id === 'v03') {
    Object.assign(primeira, { imagem: join(capturas, 'contexto-queda.png'),
      recorte: { x: 16, y: 56, w: 372, h: 280 }, alvo: { x: 0, y: 67, w: 350, h: 98 },
      legenda: 'Receita caiu 23,3%. Qual é a pista?' });
    manifesto.fontes = manifesto.fontes.replace('68.619,20', '69.252,29').replace('22,6%', '23,3%');
  }
  if (id === 'v06') Object.assign(primeira, { imagem: resolve('output/comercial-motion/capturas-base/trafego-anuncios.png'),
    recorte: { x: 17, y: 277, w: 354, h: 207 }, alvo: { x: 175, y: 91, w: 152, h: 56 } });
  if (id === 'v08') Object.assign(primeira, { imagem: resolve('output/comercial-motion/capturas-base/financeiro-resultado.png'),
    recorte: { x: 17, y: 99, w: 354, h: 307 }, alvo: { x: 10, y: 236, w: 331, h: 57 } });
  const pasta = join(raiz, id); await mkdir(pasta, { recursive: true });
  await writeFile(join(pasta, 'manifesto.json'), JSON.stringify(manifesto, null, 2) + '\n');
}

const voz = i => resolve(`output/comercial-voz/historia/v00/voz/cena-${String(i).padStart(2, '0')}.wav`);
const abertura = { id: 'v00', titulo: 'Sua operação, por dentro',
  nota: 'Telas reais do cenário fictício Atlas Casa. Gê é o guia narrador; as ações continuam nas mãos da pessoa.',
  cenas: [
    { imagem: join(capturas, 'contexto-areas.png'), voz: voz(1), duracao: 3,
      recorte: { x: 12, y: 215, w: 380, h: 337 },
      nuvem: 'Oi, eu sou o Gê.', legenda: 'Vendas, custos e decisões conectados.', humor: 'feliz' },
    { imagem: join(capturas, 'contexto-hoje.png'), voz: voz(2), duracao: 3,
      recorte: { x: 16, y: 55, w: 372, h: 480 }, alvo: { x: 0, y: 190, w: 354, h: 185 },
      nuvem: 'Primeiro: o que mudou?', legenda: 'Dia, semana e produto.', humor: 'curioso' },
    { imagem: join(capturas, 'contexto-queda.png'), voz: voz(3), duracao: 3,
      recorte: { x: 16, y: 56, w: 372, h: 520 }, alvo: { x: 0, y: 300, w: 354, h: 200 },
      nuvem: 'Depois: por que mudou?', legenda: 'Preço, visitas ou estoque?', humor: 'curioso' },
    { imagem: resolve('output/comercial-motion/capturas-base/financeiro-dre.png'), voz: voz(4), duracao: 3,
      recorte: { x: 17, y: 74, w: 354, h: 464 }, alvo: { x: 0, y: 372, w: 342, h: 65 },
      nuvem: 'E no fim, sobrou quanto?', legenda: 'Da investigação à próxima ação.', humor: 'feliz' },
  ] };
await mkdir(join(raiz, 'v00'), { recursive: true });
await writeFile(join(raiz, 'v00', 'manifesto.json'), JSON.stringify(abertura, null, 2) + '\n');

const profundoOrigem = 'output/comercial-motion/v13/manifesto.json';
const profundo = JSON.parse(await readFile(profundoOrigem, 'utf8'));
if (profundo.cenas.length !== 7) throw new Error('V13 precisa das sete cenas, incluindo rentabilidade. Prepare as cenas antes.');
profundo.cenas = profundo.cenas.map((cena, i) => ({ ...cena,
  imagem: resolve(dirname(profundoOrigem), cena.imagem),
  voz: resolve(`output/comercial-voz/historia/v13/voz/cena-${String(i + 1).padStart(2, '0')}.wav`) }));
await mkdir(join(raiz, 'v13'), { recursive: true });
await writeFile(join(raiz, 'v13', 'manifesto.json'), JSON.stringify(profundo, null, 2) + '\n');
console.log('Abertura, rentabilidade e quatro ajustes visuais preparados. Restante preservado.');
