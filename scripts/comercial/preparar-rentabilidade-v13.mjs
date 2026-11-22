// Quadro editorial derivado da mesma base fictícia que alimenta as telas.
// Não representa uma nova tela do produto e não consulta contas ou serviços.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';

const saida = resolve(process.argv[2] ?? 'output/comercial-motion/quadros');
const fixture = {};
const arquivo = 'src/lib/demo/fixtures-base.ts';
const compilado = ts.transpileModule(await readFile(arquivo, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
}).outputText;
runInNewContext(compilado, { exports: fixture });
const produto = fixture.produtosDemo.find(p => p.sku === 'AT-LUZ-02');
const moeda = fixture.moedaDemo;
const dinheiro = valor => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const apurar = (inicio, fim) => {
  const linhas = fixture.movimentosDemo.filter(m => m.sku === produto.sku && m.data >= inicio && m.data <= fim);
  const somar = campo => moeda(linhas.reduce((s, m) => s + campo(m), 0));
  const receita = somar(m => m.receita);
  const unidades = somar(m => m.quantidade);
  const ads = somar(m => m.ads);
  const contribuicao = somar(m => m.receita - m.receita * (m.comissaoPct + 6) / 100 - (produto.custo + produto.embalagem + m.freteUnidade) * m.quantidade);
  const aposAds = moeda(contribuicao - ads);
  return { inicio, fim, receita, unidades, visitas: somar(m => m.visitas), ads, contribuicao, aposAds, aposAdsPorUnidade: moeda(aposAds / unidades) };
};
const antes = apurar('2026-11-05', '2026-11-11');
const depois = apurar('2026-11-12', '2026-11-18');
const dados = { fonte: arquivo, sku: produto.sku, antes, depois, variacaoTotal: moeda(depois.aposAds - antes.aposAds), observacao: 'Contribuição após Ads, antes das despesas fixas. 18/11 parcial. Dados fictícios.' };

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700" viewBox="0 0 600 700">
<rect width="600" height="700" rx="22" fill="#fff"/>
<g font-family="Segoe UI,Arial,sans-serif">
<text x="32" y="43" font-size="16" font-weight="600" letter-spacing="2" fill="#777181">LEITURA DO EXEMPLO</text>
<text x="32" y="88" font-size="28" font-weight="600" fill="#292534">O que sobrou da luminária</text>
<text x="32" y="120" font-size="19" fill="#777181">Depois dos custos da venda e dos Ads</text>
<text x="166" y="173" text-anchor="middle" font-size="20" fill="#777181">05–11/11</text>
<text x="430" y="173" text-anchor="middle" font-size="20" fill="#777181">12–18/11*</text>
<rect x="28" y="197" width="544" height="149" rx="14" fill="#f7f6fa" stroke="#e8e5ed"/>
<text x="48" y="234" font-size="22" fill="#514b5d">Por unidade</text>
<text x="164" y="289" text-anchor="middle" font-size="42" font-weight="600" fill="#292534">${dinheiro(antes.aposAdsPorUnidade)}</text>
<text x="300" y="286" text-anchor="middle" font-size="30" fill="#a59aaf">→</text>
<text x="430" y="289" text-anchor="middle" font-size="42" font-weight="600" fill="#357e6d">${dinheiro(depois.aposAdsPorUnidade)}</text>
<rect x="28" y="374" width="544" height="149" rx="14" fill="#f7f6fa" stroke="#e8e5ed"/>
<text x="48" y="410" font-size="22" fill="#514b5d">No período</text>
<text x="164" y="462" text-anchor="middle" font-size="37" font-weight="600" fill="#292534">${dinheiro(antes.aposAds)}</text>
<text x="300" y="458" text-anchor="middle" font-size="30" fill="#a59aaf">→</text>
<text x="430" y="462" text-anchor="middle" font-size="37" font-weight="600" fill="#a56642">${dinheiro(depois.aposAds)}</text>
<text x="164" y="497" text-anchor="middle" font-size="18" fill="#777181">${antes.unidades} unidades</text>
<text x="430" y="497" text-anchor="middle" font-size="18" fill="#777181">${depois.unidades} unidades</text>
<path d="M32 567H568" stroke="#e8e5ed"/>
<text x="32" y="607" font-size="19" fill="#514b5d">Contribuição antes das despesas fixas.</text>
<text x="32" y="640" font-size="18" fill="#777181">*18/11 ainda em andamento · dados fictícios.</text>
</g></svg>`;

await mkdir(saida, { recursive: true });
await writeFile(join(saida, 'luz-rentabilidade.svg'), svg);
await sharp(Buffer.from(svg)).png().toFile(join(saida, 'luz-rentabilidade.png'));
await writeFile(join(saida, 'luz-rentabilidade-dados.json'), JSON.stringify(dados, null, 2) + '\n');
console.log(JSON.stringify(dados, null, 2));
