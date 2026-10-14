/**
 * Acerto de uma vez: apaga as cópias de pedido do Bling que ficaram numa
 * conta antiga depois de a loja ser remapeada, e refaz as diárias da conta
 * que ficou sem elas.
 *
 * A chave única de `pedidos` é (canal_id, codigo_externo): quando a loja do
 * Bling passa a apontar para uma conta de outro canal, o canal_id muda e o
 * upsert insere em vez de atualizar. `src/lib/bling/sincronizar.ts` já não
 * deixa isso acontecer de novo; este script limpa o que ficou para trás.
 *
 * Fica a cópia MAIS NOVA — a que a sincronização gravou com o mapeamento
 * atual. Confere antes que as cópias são o mesmo pedido (valor e data
 * iguais) e não grava nada se não forem.
 *
 * Uso: node scripts/limpar-pedidos-duplicados.mjs <operacao_id> [--aplicar]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
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

const OP = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");
if (!OP) throw new Error("Informe o id da operação.");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const pasta = mkdtempSync(path.join(tmpdir(), "gerizo-limpeza-"));
const vazio = path.join(pasta, "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { consolidarDiarias } = await jiti.import("../src/lib/sync/diarias.ts");

async function paginas(montar) {
  const tudo = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await montar().range(i, i + 999);
    if (error) throw new Error(error.message);
    tudo.push(...data);
    if (data.length < 1000) break;
  }
  return tudo;
}

const canais = await sb.from("canais").select("id,codigo");
const nomeCanal = new Map(canais.data.map((c) => [c.id, c.codigo]));
const contas = await sb.from("contas_canal").select("id,canal_id,nome").eq("operacao_id", OP);
const conta = new Map(contas.data.map((c) => [c.id, c]));

const pedidos = await paginas(() =>
  sb
    .from("pedidos")
    .select("id,codigo_externo,canal_id,conta_canal_id,total,data,cancelado,criado_em")
    .eq("operacao_id", OP)
    .like("codigo_externo", "bling-%")
);

const porCodigo = new Map();
for (const p of pedidos) {
  if (!porCodigo.has(p.codigo_externo)) porCodigo.set(p.codigo_externo, []);
  porCodigo.get(p.codigo_externo).push(p);
}

const apagar = [];
const divergentes = [];
for (const [codigo, copias] of porCodigo) {
  if (copias.length < 2) continue;
  const mesmoPedido = copias.every(
    (c) => Number(c.total) === Number(copias[0].total) && String(c.data) === String(copias[0].data)
  );
  if (!mesmoPedido) {
    divergentes.push(codigo);
    continue;
  }
  copias.sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
  apagar.push(...copias.slice(0, -1));
}

const resumo = new Map();
for (const p of apagar) {
  const chave = `${nomeCanal.get(p.canal_id)} / ${conta.get(p.conta_canal_id)?.nome ?? p.conta_canal_id}`;
  const r = resumo.get(chave) ?? { n: 0, valor: 0, conta: p.conta_canal_id, de: p.data, ate: p.data };
  r.n++;
  if (!p.cancelado) r.valor += Number(p.total) || 0;
  if (p.data < r.de) r.de = p.data;
  if (p.data > r.ate) r.ate = p.data;
  resumo.set(chave, r);
}

console.log(`pedidos do Bling na operação: ${pedidos.length}`);
console.log(`códigos com mais de uma cópia: ${[...porCodigo.values()].filter((c) => c.length > 1).length}`);
console.log(`cópias velhas a apagar: ${apagar.length}`);
for (const [chave, r] of resumo) {
  console.log(`  ${chave}: ${r.n} pedidos · R$ ${r.valor.toFixed(2)} · ${r.de} a ${r.ate}`);
}
if (divergentes.length) {
  console.log(`\nATENÇÃO — ${divergentes.length} códigos com cópias DIFERENTES, não mexi neles:`);
  console.log(`  ${divergentes.slice(0, 5).join(", ")}`);
}

if (!APLICAR) {
  console.log("\nensaio. rode com --aplicar para gravar.");
  process.exit(0);
}

for (let i = 0; i < apagar.length; i += 200) {
  const { error } = await sb
    .from("pedidos")
    .delete()
    .in(
      "id",
      apagar.slice(i, i + 200).map((p) => p.id)
    );
  if (error) throw new Error(`Falha ao apagar: ${error.message}`);
}
console.log(`\napagados: ${apagar.length}`);

/* Refaz as diárias da conta que perdeu os pedidos: a receita dela foi
   somada com eles. Reconsolidar preserva as visitas da linha. */
for (const [chave, r] of resumo) {
  const c = conta.get(r.conta);
  if (!c) continue;
  const linhas = await consolidarDiarias(
    { operacaoId: OP, canalId: c.canal_id, contaCanalId: r.conta },
    r.de,
    r.ate,
    { de: r.de, ate: r.ate }
  );
  console.log(`diárias refeitas em ${chave}: ${linhas} linhas (${r.de} a ${r.ate})`);
}
