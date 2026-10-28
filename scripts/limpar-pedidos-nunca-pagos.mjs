/**
 * Acerto de uma vez: apaga os pedidos que entraram como CANCELADOS sem
 * nunca ter sido aprovados, e refaz as diárias das contas afetadas.
 *
 * A listagem do hub marca "Cancelado" o carrinho cujo pagamento nunca
 * passou. Importado como cancelamento, ele virou valor cancelado e taxa de
 * cancelamento de verdade. Medido em 27/10/2026, na Loja própria da Probel:
 *
 *   mês        fonte      pedidos   cancelados
 *   2026-08    API            552    13  (2%)
 *   2026-08    planilha       157   155  (99%)
 *   2026-09    API             26     1  (4%)   ← API parada em setembro
 *   2026-09    planilha     1.299   643  (49%)
 *   2026-10    API            365    18  (5%)
 *   2026-10    planilha       457   267  (58%)
 *
 * A mesma conta, no mesmo mês, por duas fontes: a API diz 2% a 5%, a
 * planilha diz 49% a 99%. O que separa os dois casos é a data de aprovação
 * — dos pedidos de planilha que estão DE PÉ, nenhum está sem ela; dos
 * cancelados da Loja própria, 93% está.
 *
 * `src/lib/planilhas/pedidos.ts` já não deixa isso entrar de novo (e
 * `scripts/testar-pedido-nunca-pago.mjs` cobre a regra). Este script limpa
 * o que ficou para trás.
 *
 * O QUE ELE NÃO APAGA, de propósito:
 *   - pedido de origem `api`: lá a data de aprovação não é preenchida de
 *     forma confiável (90% dos pedidos do Meli vêm sem ela, vigentes), e
 *     usar a mesma regra apagaria venda boa;
 *   - pedido cancelado COM data de aprovação: cancelamento de verdade;
 *   - qualquer coisa que tenha item ligado a pedido de outra fonte.
 *
 * Uso:
 *   node scripts/limpar-pedidos-nunca-pagos.mjs <operacao_id>             (ensaio)
 *   node scripts/limpar-pedidos-nunca-pagos.mjs <operacao_id> --aplicar
 */
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
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

const pasta = mkdtempSync(path.join(tmpdir(), "gerizo-nunca-pagos-"));
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

const canais = await sb.from("canais").select("id,nome").eq("operacao_id", OP);
const nomeCanal = new Map((canais.data ?? []).map((c) => [c.id, c.nome]));
const contas = await sb.from("contas_canal").select("id,canal_id,nome").eq("operacao_id", OP);
const conta = new Map((contas.data ?? []).map((c) => [c.id, c]));

const todos = await paginas(() =>
  sb
    .from("pedidos")
    .select("id,codigo_externo,canal_id,conta_canal_id,data,status,cancelado,total,fechado_em,origem")
    .eq("operacao_id", OP)
    .eq("origem", "planilha")
    .eq("cancelado", true)
    .order("id")
);

const apagar = todos.filter((p) => !p.fechado_em);
const reais = todos.length - apagar.length;

/* Resumo por conta e mês: é como o Eduardo vai reconhecer o número que
   viu na tela. */
const porConta = new Map();
const porMes = new Map();
for (const p of apagar) {
  const chave = `${nomeCanal.get(p.canal_id) ?? p.canal_id} / ${conta.get(p.conta_canal_id)?.nome ?? "?"}`;
  const r = porConta.get(chave) ?? { n: 0, valor: 0, conta: p.conta_canal_id, de: p.data, ate: p.data };
  r.n++;
  r.valor += Number(p.total) || 0;
  if (p.data < r.de) r.de = p.data;
  if (p.data > r.ate) r.ate = p.data;
  porConta.set(chave, r);

  const m = p.data.slice(0, 7);
  const x = porMes.get(m) ?? { n: 0, valor: 0 };
  x.n++;
  x.valor += Number(p.total) || 0;
  porMes.set(m, x);
}

console.log(`cancelados de planilha na operação: ${todos.length}`);
console.log(`  com data de aprovação (cancelamento de verdade, ficam): ${reais}`);
console.log(`  SEM data de aprovação (nunca pagos, a apagar): ${apagar.length}`);
console.log("\npor conta:");
for (const [chave, r] of porConta)
  console.log(`  ${chave}: ${r.n} pedidos · R$ ${r.valor.toFixed(2)} · ${r.de} a ${r.ate}`);
console.log("\npor mês de competência:");
for (const [m, x] of [...porMes.entries()].sort())
  console.log(`  ${m}: ${x.n} pedidos · R$ ${x.valor.toFixed(2)}`);

if (!apagar.length) {
  console.log("\nnada a fazer.");
  process.exit(0);
}
if (!APLICAR) {
  console.log("\nensaio. rode com --aplicar para apagar e refazer as diárias.");
  process.exit(0);
}

/* Os itens vão junto: `pedido_itens` tem on delete cascade. */
for (let i = 0; i < apagar.length; i += 200) {
  const { error } = await sb
    .from("pedidos")
    .delete()
    .in("id", apagar.slice(i, i + 200).map((p) => p.id));
  if (error) throw new Error(`Falha ao apagar: ${error.message}`);
}
console.log(`\napagados: ${apagar.length}`);

/* As diárias foram derivadas COM esses pedidos: sem refazer, a tela
   continua mostrando o cancelado inflado. */
for (const [chave, r] of porConta) {
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
