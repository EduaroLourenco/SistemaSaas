/**
 * Confere toda consulta do código contra o banco.
 *
 * Pedir uma coluna que não existe faz o PostgREST recusar a consulta
 * INTEIRA com 42703. Num componente de servidor isso vira "Minified React
 * error #441" no navegador, sem dizer qual coluna nem qual tela — e só
 * aparece quando alguém abre aquela página.
 *
 * Foi assim que `anuncios.sku` (que se chama `sku_canal`) passou pela
 * revisão, pelo TypeScript e pelo build: nada disso conhece o schema.
 *
 * Roda todas as consultas com `limit=0`, então lê nada e custa pouco.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const U = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_KEY;
if (!U || !K) {
  console.error("faltam SUPABASE_URL/SUPABASE_KEY");
  process.exit(2);
}
const h = { apikey: K, authorization: `Bearer ${K}` };

function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/*
 * O select raramente é um literal só: o código quebra listas longas em
 * strings concatenadas ("a,b," + "c,d"). Pegar só o primeiro literal
 * deixa uma vírgula solta no fim, e o PostgREST recusa — falso positivo
 * em metade das consultas.
 *
 * E o trecho entre `.from` e `.select` não pode conter outro `.from`,
 * senão a checagem casa a tabela de uma consulta com as colunas da
 * seguinte.
 */
const RE_FROM = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
const RE_LITERAL = /["'`]([^"'`]*)["'`]/g;

function selects(texto) {
  const saida = [];
  for (const m of texto.matchAll(RE_FROM)) {
    const tabela = m[1];
    const depois = m.index + m[0].length;
    const resto = texto.slice(depois, depois + 600);

    const sel = resto.indexOf(".select(");
    if (sel < 0) continue;

    const outro = resto.indexOf(".from(");
    if (outro >= 0 && outro < sel) continue;

    // Até o parêntese que fecha o select.
    let nivel = 0;
    let fim = -1;
    for (let k = sel + ".select".length; k < resto.length; k++) {
      if (resto[k] === "(") nivel++;
      else if (resto[k] === ")") {
        nivel--;
        if (nivel === 0) {
          fim = k;
          break;
        }
      }
    }
    if (fim < 0) continue;

    const arg = resto.slice(sel + ".select(".length, fim);
    // Com interpolação não dá para saber as colunas sem executar.
    if (arg.includes("${")) continue;

    const partes = [...arg.matchAll(RE_LITERAL)].map((x) => x[1]);
    if (!partes.length) continue;

    saida.push({
      tabela,
      colunas: partes.join(""),
      linha: texto.slice(0, m.index).split("\n").length,
    });
  }
  return saida;
}

const achados = new Map();
for (const arq of arquivos("src")) {
  for (const c of selects(readFileSync(arq, "utf8"))) {
    const chave = `${c.tabela}|${c.colunas}`;
    if (!achados.has(chave)) achados.set(chave, { ...c, onde: `${arq}:${c.linha}` });
  }
}

console.log(`${achados.size} consultas distintas\n`);

let ruins = 0;
for (const { tabela, colunas, onde } of achados.values()) {
  const r = await fetch(
    `${U}/rest/v1/${tabela}?select=${encodeURIComponent(colunas)}&limit=0`,
    { headers: h }
  );
  if (r.ok) continue;
  ruins++;
  const corpo = await r.json().catch(() => ({}));
  console.log(`FALHA  ${onde}`);
  console.log(`       ${tabela} → ${colunas.slice(0, 100)}`);
  console.log(`       ${corpo.message ?? r.status}${corpo.hint ? ` — ${corpo.hint}` : ""}\n`);
}

console.log(ruins ? `${ruins} consultas quebradas.` : "Todas as consultas batem com o schema.");
process.exit(ruins ? 1 : 0);
