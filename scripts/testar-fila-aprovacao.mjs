/**
 * O preço que a fila proporia — e as três vezes em que ela se cala.
 *
 * A fila existe para chegar pronta: a regra decide de madrugada e o
 * Eduardo só tira o que não quer. Isso muda o peso de cada decisão —
 * numa tela aberta há alguém olhando item a item; numa fila aprovada em
 * lote, não há. Por isso aqui a regra é mais dura do que na tela:
 *
 *   · sem piso, não decide (a tela mostra "cabe"; a fila não arrisca);
 *   · acima do teto do canal, não decide (já quebrou a planilha da
 *     Imprimil uma vez);
 *   · abaixo do mínimo do canal, sobe para o mínimo.
 *
 * `.scratch/PENDENTES.md`: "Preço nunca é inventado" e "O preço proposto
 * pelo canal é teto".
 *
 * Uso: node scripts/testar-fila-aprovacao.mjs
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const pasta = mkdtempSync(path.join(tmpdir(), "gerizo-fila-"));
const vazio = path.join(pasta, "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
/* A conta do preço mora em piso-promocao.ts, que é puro: a fila só a
   chama. Testar na origem evita arrastar o banco para dentro do teste. */

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { precoProposto } = await jiti.import(path.join(raiz, "src/lib/planilhas/piso-promocao.ts"));

const item = (extra = {}) => ({
  precoCanal: null,
  sugerido: null,
  minimoCanal: null,
  maximoCanal: null,
  ...extra,
});

/* ══ 1. Preço nosso: sai do piso com a folga ══ */
{
  assert.equal(precoProposto(item(), 1000, 5, true), 950);
  assert.equal(precoProposto(item(), 1000, 0, true), 1000, "folga zero é o piso cheio");
}

/* ══ 2. Preço nosso nunca passa do teto do canal ══
   O teto é o MENOR entre o máximo do canal e o que ele propôs: escrever
   acima devolve recusa, e foi o que quebrou a planilha da Imprimil. */
{
  assert.equal(
    precoProposto(item({ maximoCanal: 900 }), 1000, 5, true),
    null,
    "950 passa do máximo de 900: não vai para a fila",
  );
  assert.equal(
    precoProposto(item({ precoCanal: 900 }), 1000, 5, true),
    null,
    "o preço proposto pelo canal também é teto",
  );
  assert.equal(
    precoProposto(item({ maximoCanal: 950 }), 1000, 5, true),
    950,
    "exatamente no teto cabe",
  );
}

/* ══ 3. Preço nosso respeita o mínimo do canal, subindo ══ */
{
  assert.equal(
    precoProposto(item({ minimoCanal: 980, maximoCanal: 1200 }), 1000, 5, true),
    980,
    "950 é menos que o mínimo de 980: sobe para o mínimo",
  );
}

/* ══ 4. Preço do canal: só entra se alcançar o piso com a folga ══ */
{
  assert.equal(precoProposto(item({ precoCanal: 960 }), 1000, 5, false), 960, "960 ≥ 950");
  assert.equal(precoProposto(item({ precoCanal: 950 }), 1000, 5, false), 950, "igual ao limite cabe");
  assert.equal(
    precoProposto(item({ precoCanal: 900 }), 1000, 5, false),
    null,
    "900 está abaixo do piso com folga: fica de fora",
  );
  assert.equal(
    precoProposto(item({ sugerido: 970 }), 1000, 5, false),
    970,
    "sem preço do canal, vale o sugerido",
  );
}

/* ══ 5. Sem piso, a fila não decide — nos dois casos ══
   É a diferença entre esta fila e a tela aberta: lá há alguém olhando. */
{
  assert.equal(precoProposto(item({ precoCanal: 960 }), null, 5, false), null,
    "preço do canal sem piso conhecido não vai para aprovação em lote");
  assert.equal(precoProposto(item(), null, 5, true), null);
}

/* ══ 6. Sem preço nenhum do canal, não há o que propor ══ */
{
  assert.equal(precoProposto(item(), 1000, 5, false), null);
}

console.log(
  "OK: a fila propõe do piso com folga, respeita teto e mínimo do canal, e se cala sem piso.",
);
