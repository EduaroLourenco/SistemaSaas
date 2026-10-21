/**
 * O portão de escrita do Mercado Livre.
 *
 * Esta é a peça que impede estrago. A plataforma passou a vida inteira
 * recusando qualquer coisa que não fosse GET; agora existe um caminho
 * que altera a conta de alguém, e o que o separa de um acidente é esta
 * lista.
 *
 * O que o teste trava:
 *
 *   · a lista é de PERMISSÃO, não de proibição — endereço novo nasce
 *     recusado, inclusive endereço novo do próprio Mercado Livre;
 *   · `/items/{id}` continua fora, porque é ele que muda preço e pausa
 *     anúncio, e a aplicação de escrita nem pede essa permissão;
 *   · o portão de leitura não passou a aceitar escrita por tabela.
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
const { autorizarEscrita, autorizarLeitura, MeliBloqueado } = await jiti.import(
  path.join(raiz, "src/lib/meli/limite.ts"),
);

const passa = (fn) => {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof MeliBloqueado) return false;
    throw e;
  }
};

/* ══ 1. O que PODE ══ */
const permitidos = [
  ["POST", "/seller-promotions/items/MLB123456789"],
  ["DELETE", "/seller-promotions/items/MLB123456789"],
  ["PUT", "/marketplace/advertising/MLB/advertisers/123456/product_ads/campaigns/987"],
  ["PUT", "/marketplace/advertising/MLB/advertisers/123456/product_ads/ads/MLB123456789"],
];
for (const [m, c] of permitidos) {
  assert.ok(passa(() => autorizarEscrita(c, m)), `devia permitir ${m} ${c}`);
}

/* ══ 2. O que NÃO pode, e por quê ══ */
const recusados = [
  /* Muda PREÇO e pausa anúncio. A permissão "Publicação e
     sincronização" ficou como "sem acesso" no DevCenter de propósito;
     se um dia alguém ligar lá, aqui continua recusando. */
  ["PUT", "/items/MLB123456789", "mudar o anúncio"],
  ["POST", "/items", "criar anúncio"],
  ["DELETE", "/items/MLB123456789", "apagar anúncio"],
  /* Dinheiro. */
  ["POST", "/orders/123/refund", "estornar pedido"],
  /* Endereço de escrita que ainda não existe: tem de nascer recusado. */
  ["POST", "/seller-promotions/campanhas/novidade", "endpoint novo"],
  /* Quase certo, mas com o verbo errado. */
  ["POST", "/marketplace/advertising/MLB/advertisers/1/product_ads/campaigns/9", "verbo errado"],
  /* Quase certo, mas com o caminho torto. */
  ["POST", "/seller-promotions/items/", "sem o MLB"],
  ["POST", "/seller-promotions/items/MLB123/extra", "caminho a mais"],
];
for (const [m, c, porque] of recusados) {
  assert.ok(!passa(() => autorizarEscrita(c, m)), `devia recusar ${m} ${c} (${porque})`);
}

/* ══ 3. A query string não burla a lista ══ */
assert.ok(passa(() => autorizarEscrita("/seller-promotions/items/MLB1?promotion_id=C-MLB1", "POST")));
assert.ok(!passa(() => autorizarEscrita("/items/MLB1?x=/seller-promotions/items/MLB1", "PUT")));

/* ══ 4. GET não entra pelo portão de escrita ══
   Mandar leitura por aqui pularia a lista de leitura. */
assert.ok(!passa(() => autorizarEscrita("/items", "GET")));

/* ══ 5. O portão de LEITURA continua recusando escrita ══
   É o que protege a aplicação que divide credencial com os agentes. */
for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
  assert.ok(
    !passa(() => autorizarLeitura("/seller-promotions/items/MLB1", m)),
    `o portão de leitura não pode aceitar ${m}`,
  );
}
assert.ok(passa(() => autorizarLeitura("/items", "GET")), "leitura prevista continua passando");

console.log(
  `OK: ${permitidos.length} escritas permitidas, ${recusados.length} recusadas, e a leitura segue só lendo.`,
);
