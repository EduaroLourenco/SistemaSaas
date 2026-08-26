/**
 * Lança agosto do Mercado Livre São Paulo, com os números medidos.
 *
 *   node scripts/lancar-agosto-ml.mjs
 *
 * Substitui as visitas que eu havia repartido do total semanal por medição
 * real, dia a dia. Confere o resultado contra o total que veio junto: se a
 * soma não bater, nada é gravado — transcrição de tabela é onde um dígito
 * se perde, e um número errado gravado em silêncio é pior que erro na cara.
 */

const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_KEY;
const OPERACAO = "00000000-0000-0000-0000-000000000101";
if (!URL_BASE || !CHAVE) {
  console.error("faltam SUPABASE_URL/SUPABASE_KEY");
  process.exit(1);
}

const cab = {
  apikey: CHAVE,
  authorization: `Bearer ${CHAVE}`,
  "content-type": "application/json",
};

async function api(caminho, opc = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1${caminho}`, {
    ...opc,
    headers: { ...cab, ...(opc.headers ?? {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} em ${caminho}: ${t.slice(0, 250)}`);
  return t ? JSON.parse(t) : null;
}

/* dia, visitas, receita, pedidos, ads, pedidosCancelados, valorCancelado */
const DIAS = [
  [1, 1266, 4324.0, 5, 579.0, 0, 0],
  [2, 1216, 8088.0, 9, 586.0, 1, 674.9],
  [3, 1344, 5552.0, 6, 775.0, 0, 0],
  [4, 1272, 9544.0, 12, 986.0, 1, 279.12],
  [5, 1463, 4893.0, 9, 830.0, 1, 1319.29],
  [6, 1418, 11140.0, 10, 455.0, 0, 0],
  [7, 1358, 6650.0, 6, 486.0, 0, 0],
  [8, 2278, 24766.0, 26, 616.0, 0, 0],
  [9, 1223, 5249.0, 9, 488.0, 0, 0],
  [10, 1498, 22018.0, 19, 562.0, 0, 0],
  [11, 1396, 5154.0, 6, 466.0, 0, 0],
  [12, 1291, 13238.0, 13, 458.0, 0, 0],
  [13, 1102, 3361.0, 5, 426.0, 0, 0],
  [14, 1001, 7311.0, 8, 556.0, 0, 0],
  [15, 1112, 1888.0, 1, 527.0, 0, 0],
  [16, 1032, 11389.0, 9, 602.0, 0, 0],
];

/** O rodapé da tabela de origem, usado como prova. */
const ESPERADO = {
  visitas: 21270,
  receita: 144565,
  pedidos: 153,
  ads: 9398,
  pedidosCancelados: 3,
  valorCancelado: 2273,
};

const soma = DIAS.reduce(
  (t, [, v, r, p, a, pc, vc]) => ({
    visitas: t.visitas + v,
    receita: t.receita + r,
    pedidos: t.pedidos + p,
    ads: t.ads + a,
    pedidosCancelados: t.pedidosCancelados + pc,
    valorCancelado: t.valorCancelado + vc,
  }),
  { visitas: 0, receita: 0, pedidos: 0, ads: 0, pedidosCancelados: 0, valorCancelado: 0 }
);

console.log("campo               lançado      esperado   diferença");
let erro = false;
for (const [campo, esperado] of Object.entries(ESPERADO)) {
  const obtido = Math.round(soma[campo]);
  const dif = obtido - Math.round(esperado);
  // Um real de folga cobre o arredondamento do rodapé da planilha.
  const ok = Math.abs(dif) <= 1;
  if (!ok) erro = true;
  console.log(
    `${campo.padEnd(20)} ${String(obtido).padStart(8)}  ${String(esperado).padStart(12)}  ${
      ok ? "ok" : `NÃO BATE (${dif > 0 ? "+" : ""}${dif})`
    }`
  );
}

if (erro) {
  console.error("\nA soma não bate com o total de origem. Nada foi gravado.");
  process.exit(1);
}

const contas = await api("/contas_canal?select=id,nome,canal_id,canais(nome)");
const sp = contas.find(
  (c) => c.canais.nome === "Mercado Livre" && c.nome.startsWith("São Paulo")
);
if (!sp) throw new Error("conta São Paulo não encontrada");

const linhas = DIAS.map(([dia, v, r, p, a, pc, vc]) => ({
  operacao_id: OPERACAO,
  canal_id: sp.canal_id,
  conta_canal_id: sp.id,
  data: `2026-08-${String(dia).padStart(2, "0")}`,
  visitas: v,
  receita: r,
  pedidos: p,
  investimento_ads: a,
  pedidos_cancelados: pc,
  valor_cancelado: vc,
  origem: "manual",
  // Limpa a observação de "visitas repartidas": agora são medidas.
  observacao: null,
}));

await api("/vendas_diarias?on_conflict=conta_canal_id,data", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(linhas),
});

console.log(`\n${linhas.length} dias gravados (01 a 16/08), Mercado Livre São Paulo.`);
