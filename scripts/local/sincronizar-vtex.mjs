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
const { lojasVtex } = await jiti.import(RAIZ + "/src/lib/vtex/cliente.ts");

/*
 * A loja agora é dita por id, e a credencial do ambiente só vale para a
 * loja que `VTEX_CONTA_CANAL_ID` nomear — sem isso ela atenderia a loja de
 * qualquer empresa.
 */
const lojas = await lojasVtex();
if (lojas.length === 0) {
  console.log("✗ nenhuma loja VTEX cadastrada em contas_canal");
  process.exit(1);
}
if (lojas.length > 1) {
  console.log("✗ mais de uma loja VTEX; diga qual em VTEX_CONTA_CANAL_ID:");
  for (const l of lojas) console.log(`    ${l.id}  ${l.nome}`);
  process.exit(1);
}
const loja = lojas[0];
process.env.VTEX_CONTA_CANAL_ID = process.env.VTEX_CONTA_CANAL_ID ?? loja.id;

const [de, ate] = process.argv.slice(2);
const t0 = Date.now();
const r = await sincronizarVtex({ de, ate, conta: loja.id });
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)}s)`, JSON.stringify(r, null, 1));
