/**
 * O piso do item, a faixa do preço, e o rebate que muda os dois.
 *
 * Estas duas contas saíram de dentro da tela de Automações para
 * `lib/planilhas/piso-promocao.ts` porque a fila de aprovação decide no
 * servidor. Mudar de lugar código que define PREÇO MÍNIMO sem deixar
 * teste atrás é como as duas pontas começam a discordar sobre o mesmo
 * item — e aí o sistema aceita oferta abaixo do piso sem ninguém ver.
 *
 * `.scratch/PENDENTES.md`: "Preço nunca é inventado."
 *
 * Uso: node scripts/testar-piso-promocao.mjs
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { pisoDoItem, faixaDoPreco, precoComFolga } = await jiti.import(
  path.join(raiz, "src/lib/planilhas/piso-promocao.ts")
);

/* As bandas de comissão da promoção, e a linha da Fórmula base alinhada
   com elas: quanto maior a comissão, maior o preço que sustenta a margem. */
const BANDAS = [0.115, 0.145, 0.165];
const item = (extra = {}) => ({
  mlb: "MLB1",
  piso: 1000,
  precos: [1000, 1100, 1200],
  comissaoCheia: 0.165,
  meliPct: null,
  ...extra,
});

/* ══ 1. Sem rebate, o piso é o da comissão cheia ══ */
{
  assert.equal(pisoDoItem(item(), BANDAS), 1200, "comissão 16,5% → o preço da banda 0,165");
  assert.equal(pisoDoItem(item({ comissaoCheia: 0.115 }), BANDAS), 1000);
}

/* ══ 2. Com rebate do canal, a comissão efetiva cai e o piso cai junto ══
   É o ponto da conta: o Meli bancando 2 pontos faz o vendedor pagar
   14,5%, e exigir o piso de 16,5% recusaria oferta que cabe. */
{
  assert.equal(pisoDoItem(item({ meliPct: 2 }), BANDAS), 1100, "16,5% − 2 p.p. = 14,5%");
  assert.equal(pisoDoItem(item({ meliPct: 5 }), BANDAS), 1000, "16,5% − 5 p.p. = 11,5%");
}

/* ══ 3. Falta de dado devolve o piso do item, não zero ══ */
{
  assert.equal(pisoDoItem(item({ comissaoCheia: null }), BANDAS), 1000, "sem comissão, o piso do item");
  assert.equal(pisoDoItem(item({ precos: [] }), BANDAS), 1000, "sem linha de preços, o piso do item");
  assert.equal(pisoDoItem(item(), []), 1000, "sem bandas, o piso do item");
  assert.equal(
    pisoDoItem(item({ piso: null, comissaoCheia: null }), BANDAS),
    null,
    "sem nada, null — que quem recebe trata como 'não sei', nunca como zero",
  );
}

/* ══ 4. Banda sem preço é pulada, não vale zero ══ */
{
  const semMeio = item({ precos: [1000, null, 1200], comissaoCheia: 0.165, meliPct: 2 });
  assert.equal(pisoDoItem(semMeio, BANDAS), 1200,
    "a banda 0,145 não tem preço: vale a próxima mais perto, não um furo");
}

/* ══ 5. A faixa é a última que o preço alcança ══ */
{
  assert.equal(faixaDoPreco(item(), BANDAS, 1250), 0.165);
  assert.equal(faixaDoPreco(item(), BANDAS, 1150), 0.145);
  assert.equal(faixaDoPreco(item(), BANDAS, 1000), 0.115, "preço igual ao da faixa conta como dentro");
  assert.equal(faixaDoPreco(item(), BANDAS, 999.995), 0.115, "o centavo de tolerância pega o arredondamento");
  assert.equal(faixaDoPreco(item(), BANDAS, 900), null, "abaixo de tudo não tem faixa");
  assert.equal(faixaDoPreco(item(), BANDAS, null), null, "sem preço não há faixa");
}

/* ══ 6. A folga arredonda para baixo ══
   Para cima devolveria um preço que o próprio piso recusa no teste
   seguinte, e a tela mostraria "cabe" num item que o canal vai negar. */
{
  assert.equal(precoComFolga(1000, 5), 950);
  assert.equal(precoComFolga(1000, 0), 1000, "folga zero é o piso cheio");
  assert.equal(precoComFolga(999.99, 3), 969.99);
  assert.ok(precoComFolga(1234.56, 7) <= 1234.56 * 0.93 + 0.005);
}

console.log("OK: piso segue o rebate, falta de dado não vira zero, e a faixa pega o preço igual.");
