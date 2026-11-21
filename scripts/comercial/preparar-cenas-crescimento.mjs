// Monta os quatro motions de crescimento com capturas locais e voz direta.
// Não abre navegador, consulta contas ou altera o cenário demonstrativo.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const raiz = resolve(process.argv[2]?.startsWith('--') ? 'output/comercial-motion-base' : process.argv[2] ?? 'output/comercial-motion-base');
const indiceVideo = process.argv.indexOf('--video');
const escolhido = indiceVideo >= 0 ? process.argv[indiceVideo + 1] : null;
const roteiros = JSON.parse(await readFile('scripts/comercial/roteiros-base-crescimento.json', 'utf8'));
const enquadramentos = JSON.parse(await readFile(join(raiz, 'enquadramentos-crescimento.json'), 'utf8'));
const recurso = (pasta, arquivo) => relative(pasta, resolve(arquivo)).replaceAll('\\', '/');

for (const video of roteiros.videos.filter(v => !escolhido || v.id === escolhido)) {
  const dir = join(raiz, video.id);
  await mkdir(dir, { recursive: true });
  const cenas = video.cenas.map((cena, i) => {
    const fonte = {
      ...enquadramentos.capturas[cena.captura],
      ...enquadramentos.cenas?.[`${video.id}:${i + 1}`],
    };
    if (!fonte.imagem || !existsSync(resolve(fonte.imagem))) throw new Error(`Captura ausente: ${cena.captura}`);
    const voz = `voz/cena-${String(i + 1).padStart(2, '0')}.wav`;
    if (!existsSync(join(dir, voz))) throw new Error(`Narração ausente: ${video.id} ${voz}`);
    return {
      imagem: recurso(dir, fonte.imagem), voz,
      nuvem: cena.nuvem, legenda: cena.legenda, humor: cena.humor,
      duracao: 2.6,
      ...(fonte.recorte ? { recorte: fonte.recorte } : {}),
      ...(fonte.alvo ? { alvo: fonte.alvo } : {}),
    };
  });
  await writeFile(join(dir, 'manifesto.json'), JSON.stringify({
    id: video.id, titulo: video.titulo, fontes: video.fonte, nota: roteiros.nota, cenas,
  }, null, 2) + '\n');
  console.log(`${video.id}: ${cenas.length} cenas, capturas locais e voz direta prontas`);
}
