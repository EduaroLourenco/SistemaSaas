/**
 * Refaz `vendas_diarias` a partir dos pedidos, conta por conta.
 *
 * Serve quando pedido foi apagado ou movido por fora da sincronização (uma
 * migração, uma limpeza de duplicata): as diárias são derivadas, e nada as
 * recalcula sozinhas. Usa a mesma função da sincronização, então as visitas
 * já medidas sobrevivem — a reconsolidação omite a coluna nos dias sem
 * coleta em vez de zerar.
 *
 * Uso: node scripts/refazer-diarias.mjs <operacao_id> <de> <ate>
 */
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";
import { createClient } from "@supabase/supabase-js";

const raiz = fileURLToPath(new URL("../", import.meta.url));
for (const linha of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#") && !process.env[linha.slice(0, i)]) {
    process.env[linha.slice(0, i)] = linha.slice(i + 1).trim();
  }
}

const [OP, DE, ATE] = process.argv.slice(2);
if (!OP || !DE || !ATE) throw new Error("Uso: node scripts/refazer-diarias.mjs <operacao_id> <de> <ate>");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const pasta = mkdtempSync(path.join(tmpdir(), "gerizo-diarias-"));
const vazio = path.join(pasta, "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { consolidarDiarias } = await jiti.import("../src/lib/sync/diarias.ts");

const canais = await sb.from("canais").select("id,codigo");
const nomeCanal = new Map(canais.data.map((c) => [c.id, c.codigo]));
const { data: contas, error } = await sb.from("contas_canal").select("id,canal_id,nome").eq("operacao_id", OP);
if (error) throw new Error(error.message);

for (const c of contas) {
  const linhas = await consolidarDiarias({ operacaoId: OP, canalId: c.canal_id, contaCanalId: c.id }, DE, ATE, {
    de: DE,
    ate: ATE,
  });
  console.log(`${nomeCanal.get(c.canal_id)} / ${c.nome}: ${linhas} linhas`);
}
