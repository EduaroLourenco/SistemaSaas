/**
 * A família do anúncio: o que o canal diz, e o que é palpite.
 *
 * O agrupamento decide se a tela manda desligar a mídia de um anúncio
 * cujo irmão vende, e se uma oferta aparece como acerto ou fracasso.
 * Errar para mais é pior que não agrupar: soma venda de produto que
 * não tem relação e inventa um resultado que não houve.
 *
 * Por isso o encaixe por título é opcional e desligado por padrão, e
 * por isso ele só encaixa quando aponta para UMA família.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { resolverFamilias, modeloDoTitulo } = await jiti.import(
  path.join(raiz, "src/lib/dados/familia-anuncio.ts"),
);

const an = (codigo, sku, titulo, familiaId, familiaNome) => ({
  codigoExterno: codigo, sku, titulo, familiaId, familiaNome,
});

/* ══ 1. O canal manda. Os três tamanhos do Turim viram uma família ══
   Caso real: MLB5382536864, MLB5406599970 e MLB4076885631 têm
   parent_id MLB28677351, "Colchão Probel Guarda Costas Turim Springs". */
{
  const F = resolverFamilias([
    an("MLB5382536864", "PA85361", "Colchão Queen Mola Ensacada Probel Turim", "MLB28677351", "Turim Springs"),
    an("MLB5406599970", "PA85357", "Colchão Solteiro Mola Ensacada Probel Turim Branco", "MLB28677351", "Turim Springs"),
    an("MLB4076885631", "PA85359", "Colchão Viúva Mola Ensacada Probel Turim (128x188x28cm)", "MLB28677351", "Turim Springs"),
  ]);
  assert.equal(new Set(F.porAnuncio.values()).size, 1, "os três tamanhos são uma família só");
  assert.equal(F.porSku.get("PA85361"), "MLB28677351");
  assert.equal(F.nome.get("MLB28677351"), "Turim Springs");
  assert.equal(F.origem.get("MLB5382536864"), "canal");
}

/* ══ 2. Sem o encaixe ligado, quem não tem catálogo fica sozinho ══ */
{
  const lista = [
    an("MLB1", "PA1", "Colchão Casal Mola Probel Siena", "FAM_SIENA", "Siena"),
    an("MLB2", "PA2", "Colchão Queen Mola Probel Siena", null, null),
  ];
  const padrao = resolverFamilias(lista);
  assert.ok(!padrao.porAnuncio.has("MLB2"), "por padrão não encaixa pelo título");

  const ligado = resolverFamilias(lista, { agruparPorModelo: true });
  assert.equal(ligado.porAnuncio.get("MLB2"), "FAM_SIENA", "ligado, encaixa");
  assert.equal(ligado.origem.get("MLB2"), "titulo", "e diz que foi palpite");
}

/* ══ 3. Modelo ambíguo não encaixa, nem com a opção ligada ══
   "Siena" aponta para três famílias no catálogo real da Probel.
   Encaixar somaria venda de produtos que não são o mesmo. */
{
  const F = resolverFamilias(
    [
      an("MLB1", "PA1", "Colchão Casal Mola Probel Siena", "FAM_A", "Siena A"),
      an("MLB2", "PA2", "Colchão Queen Mola Probel Siena", "FAM_B", "Siena B"),
      an("MLB3", "PA3", "Colchão King Mola Probel Siena", null, null),
    ],
    { agruparPorModelo: true },
  );
  assert.ok(!F.porAnuncio.has("MLB3"), "modelo que aponta para duas famílias não serve de ponte");
}

/* ══ 4. SKU com um anúncio dentro e outro fora do catálogo ══
   O de fora herda do SKU, e isso NÃO é palpite: é o mesmo produto. */
{
  const F = resolverFamilias([
    an("MLB_EM", "PA9", "Colchão Casal Probel Bari", "FAM_BARI", "Bari"),
    an("MLB_FORA", "PA9", "Colchão Casal Probel Bari", null, null),
  ]);
  assert.equal(F.porAnuncio.get("MLB_FORA"), "FAM_BARI", "mesmo SKU, mesma família");
  assert.equal(F.origem.get("MLB_FORA"), "canal", "herdar pelo SKU não é palpite de título");
}

/* ══ 5. O modelo, extraído do título ══ */
{
  const casos = [
    ["Colchão Queen Mola Ensacada Probel Turim  (158x198x28cm)", "turim"],
    ["Colchão Solteiro Mola Ensacada Probel Turim Branco", "turim"],
    ["Colchão Viúva Mola Ensacada Probel Turim (128x188x28cm) Branco", "turim"],
    ["Colchão Queen Mola Ensacada Probel Cairo Ultra Gel", "cairo ultra"],
    ["Colchão King Mola Ensacada Probel Elegancy Springs", "elegancy springs"],
  ];
  for (const [titulo, esperado] of casos)
    assert.equal(modeloDoTitulo(titulo), esperado, `modelo de ${JSON.stringify(titulo)}`);

  /* Os três tamanhos do Turim dão o MESMO modelo: é o que faz a ponte
     funcionar quando ela está ligada. */
  const tres = casos.slice(0, 3).map(([t]) => modeloDoTitulo(t));
  assert.equal(new Set(tres).size, 1);
}

/* ══ 6. Sem título e sem catálogo, nada quebra ══ */
{
  const F = resolverFamilias([an("MLB_X", null, "", null, null)], { agruparPorModelo: true });
  assert.equal(F.porAnuncio.size, 0);
}

console.log(
  "OK: o canal manda, o encaixe por título é opcional, modelo ambíguo não encaixa, e SKU repetido herda sem palpite.",
);
