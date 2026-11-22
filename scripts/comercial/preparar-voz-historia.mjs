// Narração nova em uma pasta separada; preserva os WAVs usados nos vídeos publicados.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const toolsDir = opt('pacote', process.env.GERIZO_VOZ_FERRAMENTAS);
if (!toolsDir) throw new Error('Informe --pacote PASTA com a instalação isolada de @andresaya/edge-tts.');
const require = createRequire(join(resolve(toolsDir), 'package.json'));
const { EdgeTTS } = require('@andresaya/edge-tts');
const input = JSON.parse(await readFile(resolve(opt('roteiros', 'scripts/comercial/narracao-historia.json')), 'utf8'));
const perfil = JSON.parse(await readFile(resolve(opt('perfil', 'scripts/comercial/perfil-voz-ge.json')), 'utf8'));
const output = resolve(opt('out', 'output/comercial-voz/historia'));
const ffmpeg = opt('ffmpeg', process.env.GERIZO_FFMPEG);
const escolhido = opt('video');
const excluir = new Set((opt('excluir', '')).split(',').filter(Boolean));
const concorrencia = Math.min(2, Math.max(1, Number(opt('concorrencia', 2)) || 1));
const hash = value => createHash('sha256').update(value).digest('hex');
let filaConversao = Promise.resolve();

const convert = (src, dest) => new Promise((ok, no) => {
  const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', dest], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let error = '';
  p.stderr.on('data', d => error += d);
  p.on('error', no);
  p.on('close', code => code === 0 ? ok() : no(new Error(error.slice(-1000))));
});

const trabalhos = input.videos.filter(v => (!escolhido || v.id === escolhido) && !excluir.has(v.id)).flatMap(video => video.cenas.map((cena, i) => ({ video, cena, i })));
if (!trabalhos.length) throw new Error('Nenhuma cena corresponde à seleção.');
let indice = 0;
async function preparar({ video, cena, i }) {
  const dir = join(output, video.id, 'voz');
  await mkdir(dir, { recursive: true });
  const base = join(dir, `cena-${String(i + 1).padStart(2, '0')}`);
  const arquivo = base + '.mp3', meta = base + '.json';
  const voz = opt('voz', cena.voz ?? video.voz ?? perfil.voz ?? input.voz);
  const entrega = { ...(perfil.base ?? {}), ...(perfil.tons?.[cena.humor] ?? {}), ...(cena.entrega ?? {}) };
  const options = { rate: entrega.rate ?? '+0%', pitch: entrega.pitch ?? '+0Hz', ...(entrega.volume != null ? { volume: entrega.volume } : {}), ...(entrega.outputFormat ? { outputFormat: entrega.outputFormat } : {}), timeout: 30000 };
  const fala = String(cena.fala ?? '').trim();
  if (!fala || !voz) throw new Error(`${video.id} cena ${i + 1}: fala ou voz vazia.`);
  const chave = hash(JSON.stringify({ versao: 2, fala, voz, options }));
  let anterior = null;
  try { anterior = JSON.parse(await readFile(meta, 'utf8')); } catch {}
  if (!existsSync(arquivo) || anterior?.chave !== chave) {
    const audio = await new EdgeTTS().generate(fala, voz, options);
    if (!audio.audio.length) throw new Error(`${video.id} cena ${i + 1}: serviço não devolveu áudio.`);
    await writeFile(arquivo, audio.audio);
    anterior = { chave, perfil: perfil.nome, voz, entrega: options, fala, duracaoEstimada: audio.duration, wordBoundaries: audio.wordBoundaries, sentenceBoundaries: audio.sentenceBoundaries };
    await writeFile(meta, JSON.stringify(anterior, null, 2) + '\n');
    console.log(`${video.id} cena ${i + 1}: nova voz ${voz}`);
  } else console.log(`${video.id} cena ${i + 1}: áudio em cache`);
  if (ffmpeg) {
    const wavChave = hash(chave + ':wav-48000-mono-pcm_s16le:v1');
    if (!existsSync(base + '.wav') || anterior.wavChave !== wavChave) {
      const vez = filaConversao.then(() => convert(arquivo, base + '.wav'));
      filaConversao = vez.catch(() => {});
      await vez;
      await writeFile(meta, JSON.stringify({ ...anterior, wavChave }, null, 2) + '\n');
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concorrencia, trabalhos.length) }, async () => {
  for (;;) { const trabalho = trabalhos[indice++]; if (!trabalho) break; await preparar(trabalho); }
}));
await filaConversao;
console.log(`${trabalhos.length} falas prontas. O cache distingue texto, voz, intenção, formato e WAV.`);
