/**
 * A campanha criada por nós ajusta a porcentagem nos DOIS sentidos.
 *
 * O que isto trava, e por que importa em dinheiro:
 *
 *   · o preço aplicado NUNCA fica abaixo do preço de tabela. É a margem;
 *   · a porcentagem é INTEIRA, porque a coluna do canal não aceita decimal
 *     e uma planilha com 43,5% volta recusada inteira;
 *   · o preço é a TRUNCAGEM do canal, não o arredondamento. Arredondar
 *     deixaria o preço um centavo abaixo da tabela em metade dos casos;
 *   · quando nem o desconto mínimo do canal cabe, recusa em vez de
 *     inventar um preço que fura a margem.
 *
 *   node scripts/testar-campanha-propria.mjs
 */
import path from "node:path";
import fs from "node:fs";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const vazio = path.join(RAIZ, "node_modules", ".cache", "vazio.cjs");
fs.mkdirSync(path.dirname(vazio), { recursive: true });
fs.writeFileSync(vazio, "module.exports = {};\n");

const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": vazio },
});
const { melhorPorcentagem, precoDaPorcentagem, processItem, PISO } = await jiti.import(
  RAIZ + "/src/lib/planilhas/motor-promocoes.ts"
);

let falhas = 0;
const ok = (certo, titulo, detalhe = "") => {
  console.log(`  ${certo ? "ok " : "FALHOU"}  ${titulo.padEnd(54)} ${detalhe}`);
  if (!certo) falhas++;
};

/* ── O preço que o canal calcula ───────────────────────────── */

console.log("\nO PREÇO VEM DA PORCENTAGEM, E O CANAL TRUNCA O CENTAVO:\n");

ok(precoDaPorcentagem(2773.9, 59) === 1137.29, "2.773,90 a 59% = 1.137,29 (não 1.137,30)", String(precoDaPorcentagem(2773.9, 59)));
ok(precoDaPorcentagem(4253.9, 38) === 2637.41, "4.253,90 a 38% = 2.637,41", String(precoDaPorcentagem(4253.9, 38)));
ok(precoDaPorcentagem(4755.9, 45) === 2615.74, "4.755,90 a 45% = 2.615,74", String(precoDaPorcentagem(4755.9, 45)));

/* ── A melhor porcentagem ──────────────────────────────────── */

console.log("\nA PORCENTAGEM ESCOLHIDA É A MAIS AGRESSIVA QUE A TABELA AGUENTA:\n");

{
  /* O caso real do primeiro item da planilha de outubro. */
  const m = melhorPorcentagem(4253.9, 2415);
  ok(m?.pct === 43, "4.253,90 com mínimo 2.415,00 -> 43%", JSON.stringify(m));
  ok((m?.preco ?? 0) >= 2415, "e o preço fica acima do mínimo", String(m?.preco));
  ok(
    precoDaPorcentagem(4253.9, (m?.pct ?? 0) + 1) < 2415,
    "um ponto a mais já furaria a tabela",
    String(precoDaPorcentagem(4253.9, 44))
  );
}

{
  /* Mínimo acima do praticado: nem o desconto mínimo cabe. */
  const m = melhorPorcentagem(1000, 990);
  ok(m === null, "mínimo a 1% do praticado -> recusa", JSON.stringify(m));
}

{
  /* Exatamente no limite do desconto mínimo do canal. */
  const m = melhorPorcentagem(1000, 950);
  ok(m?.pct === 5, "mínimo exatamente 5% abaixo -> aceita com 5%", JSON.stringify(m));
}

{
  /* Mínimo acima do preço publicado: não há desconto possível. */
  const m = melhorPorcentagem(1000, 1200);
  ok(m === null, "mínimo acima do preço publicado -> recusa", JSON.stringify(m));
}

{
  /*
   * Varredura: em nenhuma combinação o preço escolhido pode ficar abaixo do
   * mínimo, e um ponto a mais tem sempre de furá-lo. É o invariante que
   * protege a margem.
   */
  let erros = 0;
  let apertados = 0;
  for (let original = 100; original <= 9000; original += 37) {
    for (let frac = 0.3; frac <= 0.96; frac += 0.017) {
      const alvo = Math.round(original * frac * 100) / 100;
      const m = melhorPorcentagem(original, alvo);
      if (!m) continue;
      if (m.preco < alvo - 1e-9) erros++;
      if (precoDaPorcentagem(original, m.pct + 1) >= alvo) apertados++;
      if (!Number.isInteger(m.pct)) erros++;
    }
  }
  ok(erros === 0, "varredura: nenhum preço abaixo do mínimo", `${erros} violações`);
  ok(apertados === 0, "varredura: sempre a porcentagem máxima possível", `${apertados} frouxas`);
}

/* ── O item completo ───────────────────────────────────────── */

console.log("\nO ITEM COMPLETO, COM A COMISSÃO CHEIA DO TIPO:\n");

const FAIXAS = [0.045, 0.055, 0.065, 0.075, 0.085, 0.095, 0.105, 0.115, 0.125, 0.135, 0.145, 0.155, 0.165];
const base = (tabelaPorComissao) => ({
  baseMlb: new Map([
    ["MLB1", { tipo: "Clássico", padrao: 0.115 }],
    ["MLB2", { tipo: "Premium", padrao: 0.165 }],
  ]),
  precosSKU: new Map([
    ["SKU1", Object.fromEntries(FAIXAS.map((f) => [f, tabelaPorComissao(f)]))],
  ]),
  precosMLB: new Map(),
});

{
  /* Clássico: a faixa usada tem de ser 11,5%. */
  const dados = base((f) => (f === 0.115 ? 2415 : 9999));
  const r = processItem("MLB1", "SKU1", null, null, 4253.9, dados, "Participar", "Não participar", 0, undefined, true);
  ok(r.action === "Participar", "clássico participa", r.pendencia);
  ok(r.newPercentage === 43, "e usa a faixa de 11,5% (43%)", JSON.stringify(r));
  ok(r.newPrice === 2424.72, "preço 2.424,72", String(r.newPrice));
}

{
  /* Premium: a faixa usada tem de ser 16,5%. */
  const dados = base((f) => (f === 0.165 ? 3000 : 9999));
  const r = processItem("MLB2", "SKU1", null, null, 5000, dados, "Participar", "Não participar", 0, undefined, true);
  ok(r.action === "Participar", "premium participa", r.pendencia);
  ok(r.newPrice !== null && r.newPrice >= 3000, "usa a faixa de 16,5%", String(r.newPrice));
}

{
  /* Sem tipo cadastrado, recusa — adivinhar erraria por 5 pontos. */
  const dados = base(() => 2415);
  dados.baseMlb = new Map();
  const r = processItem("MLB9", "SKU1", null, null, 4253.9, dados, "Participar", "Não participar", 0, undefined, true);
  ok(r.action === "Não participar", "sem tipo cadastrado recusa", r.pendencia.slice(0, 40));
  ok(r.newPercentage == null, "e não escreve porcentagem nenhuma", String(r.newPercentage));
}

{
  /* O desconto extra parte do piso, como no Caso B. */
  const dados = base((f) => (f === 0.115 ? 2415 : 9999));
  const semExtra = processItem("MLB1", "SKU1", null, null, 4253.9, dados, "Participar", "Não participar", 0, undefined, true);
  const comExtra = processItem("MLB1", "SKU1", null, null, 4253.9, dados, "Participar", "Não participar", 0.05, undefined, true);
  ok(
    (comExtra.newPercentage ?? 0) > (semExtra.newPercentage ?? 0),
    "desconto extra deixa a porcentagem mais agressiva",
    `${semExtra.newPercentage}% -> ${comExtra.newPercentage}%`
  );
  const piso = 2415 * PISO;
  ok(
    (comExtra.newPrice ?? 0) >= piso * 0.95 - 0.01,
    "e ainda respeita o piso com o extra",
    `${comExtra.newPrice} vs ${(piso * 0.95).toFixed(2)}`
  );
}

{
  /* A campanha do canal NÃO ganha porcentagem nova — nada mudou lá. */
  const dados = base((f) => (f === 0.115 ? 2415 : 9999));
  const canal = processItem("MLB1", "SKU1", null, null, 4253.9, dados, "Participar", "Não participar", 0);
  ok(canal.newPercentage == null, "campanha do canal segue sem mexer na porcentagem", String(canal.newPercentage));
  ok(canal.newPrice === 2415, "e continua escrevendo o preço de tabela", String(canal.newPrice));
}

console.log(falhas === 0 ? "\nTodos os casos passaram.\n" : `\n${falhas} caso(s) FALHARAM.\n`);
process.exit(falhas === 0 ? 0 : 1);
