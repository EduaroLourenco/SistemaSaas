/**
 * Roda a sincronização da plataforma localmente, com os access tokens que
 * os CLIs donos (Meli+ e apis/Mercado Livre Principal) acabaram de renovar.
 *
 * Os tokens entram só no cache em memória do cliente (`__meliToken`), sem
 * refresh token: se vencerem no meio, a execução falha em vez de renovar —
 * renovar daqui rotacionaria o refresh e quebraria as automações do Eduardo.
 */
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "file:///C:/Users/dudu4/OneDrive/Desktop/plataforma/node_modules/jiti/lib/jiti.mjs";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}

const token = (p) => {
  const t = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  const criado = Date.parse(t.createdAt ?? t.created_at ?? 0);
  return { valor: t.access_token, expiraEm: criado + (t.expires_in ?? 21600) * 1000 };
};
globalThis.__meliToken = {
  principal: token("C:/Users/dudu4/OneDrive/Desktop/Meli+/.meli/token.json"),
  segunda: token("C:/Users/dudu4/OneDrive/Desktop/apis/Mercado Livre Principal/.meli/token.json"),
};
for (const [k, v] of Object.entries(globalThis.__meliToken))
  console.log(k, "token vale até", new Date(v.expiraEm).toLocaleString("pt-BR"));

fs.writeFileSync(path.join(process.cwd(), "vazio.cjs"), "");
const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": path.join(process.cwd(), "vazio.cjs") },
});
const { sincronizarMeli } = await jiti.import(RAIZ + "/src/lib/meli/sincronizar.ts");

const de = process.env.SYNC_DE ?? "2026-08-15";
for (const conta of process.argv.slice(2).length ? process.argv.slice(2) : ["principal", "segunda"]) {
  const t0 = Date.now();
  try {
    const r = await sincronizarMeli({ conta, de, diasVisitas: 45, registro: { origem: "manual" } });
    console.log(`\n✓ ${r.conta} (${((Date.now() - t0) / 1000).toFixed(0)}s)`, JSON.stringify({ ...r, avisos: r.avisos.slice(0, 5) }));
  } catch (e) {
    console.log(`\n✗ ${conta}:`, e?.message ?? e);
  }
}
