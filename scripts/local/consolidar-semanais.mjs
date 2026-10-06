/**
 * Enche `anuncio_desempenho_semanal` com todo o histórico que a diária tem.
 *
 * A sincronização já consolida a semana dentro da própria janela dela — mas
 * só dali para a frente. Este script é a carga de uma vez: varre tudo o que
 * `anuncio_desempenho_diario` guarda e reconstrói as semanas.
 *
 * Roda quantas vezes quiser: a gravação é por `anuncio_id + ano + semana`,
 * então reprocessar sobrescreve em vez de somar.
 *
 * Uso:
 *   node --conditions=react-server scripts/local/consolidar-semanais.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "file:///C:/Users/dudu4/OneDrive/Desktop/plataforma/node_modules/jiti/lib/jiti.mjs";

const RAIZ = "C:/Users/dudu4/OneDrive/Desktop/plataforma";
for (const l of fs.readFileSync(RAIZ + "/.env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) {
    process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}

const SB = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
};
const api = async (caminho) =>
  (await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/" + caminho, { headers: SB })).json();

/* O `server-only` não existe fora do Next; um arquivo vazio no lugar resolve. */
const vazio = path.join(process.cwd(), "vazio.cjs");
fs.writeFileSync(vazio, "");
const jiti = createJiti(RAIZ + "/", { alias: { "@": RAIZ + "/src", "server-only": vazio } });
const { consolidarSemanais } = await jiti.import(RAIZ + "/src/lib/sync/semanais.ts");

const contas = await api("contas_canal?select=id,nome,canal_id,operacao_id");
const canais = await api("canais?select=id,codigo");
const idML = new Set(canais.filter((c) => c.codigo === "mercado_livre").map((c) => c.id));
const doMeli = contas.filter((c) => idML.has(c.canal_id));

if (!doMeli.length) {
  console.log("Nenhuma conta de Mercado Livre cadastrada.");
  process.exit(1);
}

/* A janela é a extensão inteira da diária: é ela que manda, não o calendário. */
const extremos = await api(
  "anuncio_desempenho_diario?select=data&order=data.asc&limit=1"
);
const ultimas = await api(
  "anuncio_desempenho_diario?select=data&order=data.desc&limit=1"
);
const de = extremos[0]?.data;
const ate = ultimas[0]?.data;
if (!de || !ate) {
  console.log("A tabela diária está vazia — nada a consolidar.");
  process.exit(1);
}
console.log(`diária vai de ${de} a ${ate}\n`);

let total = 0;
for (const c of doMeli) {
  const comecou = Date.now();
  try {
    const n = await consolidarSemanais(
      { operacaoId: c.operacao_id, canalId: c.canal_id, contaCanalId: c.id },
      de,
      ate
    );
    total += n;
    console.log(`\u2713 ${c.nome}: ${n} linhas  (${Math.round((Date.now() - comecou) / 1000)}s)`);
  } catch (e) {
    console.log(`\u2717 ${c.nome}: ${e instanceof Error ? e.message : e}`);
  }
}

fs.unlinkSync(vazio);
console.log(`\n${total} linhas de semana gravadas`);
