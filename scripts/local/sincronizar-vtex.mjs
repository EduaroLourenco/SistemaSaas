/** Roda a sincronização da VTEX localmente, com a credencial da pasta de APIs. */
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "file:///C:/Users/dudu4/OneDrive/Desktop/plataforma/node_modules/jiti/lib/jiti.mjs";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
const ler = (arquivo) => {
  const env = {};
  for (const l of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return env;
};
Object.assign(process.env, ler(RAIZ + "/.env.local"));
const v = ler("C:/Users/dudu4/OneDrive/Desktop/apis/Vtex Metricas/.env");
process.env.VTEX_ACCOUNT = v.VTEX_ACCOUNT;
process.env.VTEX_APP_KEY = v.VTEX_API_APP_KEY;
process.env.VTEX_APP_TOKEN = v.VTEX_API_APP_TOKEN;

fs.writeFileSync(path.join(process.cwd(), "vazio.cjs"), "");
const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": path.join(process.cwd(), "vazio.cjs") },
});
const { sincronizarVtex } = await jiti.import(RAIZ + "/src/lib/vtex/sincronizar.ts");

const [de, ate] = process.argv.slice(2);
const t0 = Date.now();
const r = await sincronizarVtex({ de, ate });
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)}s)`, JSON.stringify(r, null, 1));
