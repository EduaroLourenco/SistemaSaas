/**
 * Procura controle que não controla nada.
 *
 * Padrão do defeito: um `useState` cujo valor só aparece pintando o próprio
 * botão. Clica, muda de cor, o número não muda. Achei um desses por acaso
 * num print do usuário; este script procura os outros.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function tsx(dir) {
  const s = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) s.push(...tsx(p));
    else if (n.endsWith(".tsx")) s.push(p);
  }
  return s;
}

/** Ocorrências da palavra inteira, sem regex montado por string. */
function conta(texto, palavra) {
  let n = 0, i = 0;
  const limite = (c) => !c || !/[\w$]/.test(c);
  for (;;) {
    const p = texto.indexOf(palavra, i);
    if (p === -1) return n;
    if (limite(texto[p - 1]) && limite(texto[p + palavra.length])) n++;
    i = p + palavra.length;
  }
}

/** Estados que existem para abrir/fechar/selecionar — não filtram por design. */
const ESTRUTURAL =
  /^(aberto|open|filtros|selecion|detalhe|marcad|expandid|import|sheet|menu|confirmando|processando|erro|enviando|rascunho|salvos|aviso|estreito|emTelaCheia|novoAberto|mapaAberto|comparando|decisoes|ultimo)/i;

const achados = [];

for (const arq of tsx("src/app")) {
  const s = readFileSync(arq, "utf8");
  for (const m of s.matchAll(/const \[(\w+), (set\w+)\] = React\.useState/g)) {
    const [, valor] = m;
    if (ESTRUTURAL.test(valor)) continue;

    const total = conta(s, valor);
    // Quantas vezes aparece numa comparação de igualdade (típico de classe CSS).
    const comparacoes = [...s.matchAll(new RegExp(valor + "\s*===", "g"))].length;
    // Aparece dentro de filter/useMemo/sort/slice? Então filtra de verdade.
    const trabalha =
      /filter\(|useMemo\(|\.sort\(|\.slice\(|\.reduce\(/.test(s) &&
      s.split(/useMemo\(|filter\(/).slice(1).some((bloco) => conta(bloco.slice(0, 900), valor) > 0);

    // 1 = declaração. Sobrando só comparações, o controle é enfeite.
    if (total - 1 - comparacoes <= 1 && !trabalha) {
      achados.push({
        tela: arq.split("\\").join("/").replace("src/app/", ""),
        estado: valor,
        total,
        comparacoes,
      });
    }
  }
}

if (!achados.length) console.log("nenhum controle inerte encontrado");
else {
  console.log(`${achados.length} controle(s) provavelmente inertes:\n`);
  for (const a of achados)
    console.log(`  ${a.tela.padEnd(48)} "${a.estado}"  ${a.total} usos, ${a.comparacoes} comparações`);
}
