/**
 * As visitas de jan a mai/2026 da conta de São Paulo, do painel do Meli.
 *
 * ── Por que só visitas ──
 *
 * Conferido contra a base em 28/10/2026: receita, pedidos e cancelados
 * desses meses JÁ existem, e no grão do pedido, que é melhor. A contagem
 * de vendas do painel bate com a nossa com diferença de 0 a 2 pedidos:
 *
 *   mês   painel   base      painel R$    base R$   (base − painel)
 *   jan     545     545       676.066     712.828      +5,4%
 *   fev     374     373       406.210     429.340      +5,7%
 *   mar     309     309       390.274     411.257      +5,4%
 *   abr     259     259       331.821     348.203      +4,9%
 *   mai     376     378       444.192     465.683      +4,8%
 *
 * A diferença constante de ~5% é o frete: a nossa receita é produto +
 * frete cobrado (convenção da plataforma), e "Vendas brutas" do painel é
 * só produto. Não é erro de um dos dois — são duas definições.
 *
 * O que a base NÃO tem é visita antes de junho/2026: a coleta diária por
 * anúncio começou ali. Com visita zerada, a tela Anual mostrava conversão
 * de 0,00% em cinco meses, que se lê como "não converteu" e não como
 * "não medimos".
 *
 * ── Por que mês, e não dia ──
 *
 * O painel dá o total do mês. Espalhar pelos dias inventaria um pico que
 * ninguém mediu — a mesma razão pela qual o leitor de pedidos não
 * espalha a venda da semana pelos sete dias. Fica no grão em que o dado
 * existe, em `visitas_mensais`, e a tela Anual usa isso no mês em que não
 * houver visita diária.
 *
 * Uso: node scripts/local/visitas-mensais-meli.mjs [--aplicar]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const raiz = fileURLToPath(new URL("../../", import.meta.url));
for (const linha of readFileSync(path.join(raiz, ".env.local"), "utf8").split(/\r?\n/)) {
  const i = linha.indexOf("=");
  if (i > 0 && !linha.startsWith("#") && !process.env[linha.slice(0, i)]) {
    process.env[linha.slice(0, i)] = linha.slice(i + 1).trim();
  }
}

const APLICAR = process.argv.includes("--aplicar");
const OPERACAO = "00000000-0000-0000-0000-000000000101";

/*
 * Do "Resumo de desempenho" do painel do vendedor, uma conta por bloco.
 * Lido em 28/10/2026.
 *
 * A contagem de vendas do painel bate com a nossa nos dois casos — São
 * Paulo com diferença de 0 a 2 pedidos, a 2ª conta exata nos cinco meses
 * (95, 138, 193, 18, 22). A receita fica acima da do painel porque a
 * nossa é produto + frete cobrado e a dele é só produto.
 */
const CONTAS = [
  {
    nome: "São Paulo — pronta entrega",
    id: "a37f9d9b-5bc7-4a94-a569-578942a93c81",
    visitas: [
      { ano: 2026, mes: 1, visitas: 46211 },
      { ano: 2026, mes: 2, visitas: 36040 },
      { ano: 2026, mes: 3, visitas: 38895 },
      { ano: 2026, mes: 4, visitas: 30796 },
      { ano: 2026, mes: 5, visitas: 26687 },
    ],
  },
  {
    nome: "2ª conta — venda a prazo",
    id: "a730ac84-4352-4b10-92f7-14b3ff47f186",
    /* Abril e maio são pequenos de verdade: a conta caiu 93% em abril,
       de 28.312 visitas para 1.829, e não recuperou em maio. */
    visitas: [
      { ano: 2026, mes: 1, visitas: 12837 },
      { ano: 2026, mes: 2, visitas: 24703 },
      { ano: 2026, mes: 3, visitas: 28312 },
      { ano: 2026, mes: 4, visitas: 1829 },
      { ano: 2026, mes: 5, visitas: 3642 },
    ],
  },
];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/*
 * Onde já existe visita diária, a mensal não entra.
 *
 * De junho em diante a coleta por anúncio funciona, e o diário é melhor:
 * ele atribui pedido a dia com visita medida, que é como a conversão da
 * plataforma é calculada. Gravar o mês por cima seria trocar dado fino
 * por dado grosso.
 */
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const entram = [];

for (const conta of CONTAS) {
  console.log(`\n${conta.nome}`);
  let diarias = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb
      .from("vendas_diarias")
      .select("data,visitas")
      .eq("conta_canal_id", conta.id)
      .gte("data", "2026-01-01")
      .lte("data", "2026-12-31")
      .order("data")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    diarias = diarias.concat(data);
    if (data.length < 1000) break;
  }
  const porMes = new Map();
  for (const d of diarias) {
    const m = Number(d.data.slice(5, 7));
    porMes.set(m, (porMes.get(m) ?? 0) + (d.visitas ?? 0));
  }

  for (const v of conta.visitas) {
    const jaTem = porMes.get(v.mes) ?? 0;
    const linha = `  ${MES[v.mes - 1]}/${v.ano}: ${v.visitas.toLocaleString("pt-BR")} visitas`;
    if (jaTem > 0) {
      console.log(`${linha} — IGNORADO, o diário já tem ${jaTem.toLocaleString("pt-BR")}`);
      continue;
    }
    console.log(linha);
    entram.push({ ...v, conta: conta.id });
  }
}

if (!entram.length) {
  console.log("\nnada a gravar.");
  process.exit(0);
}
if (!APLICAR) {
  console.log(`\nensaio. ${entram.length} meses entrariam. rode com --aplicar para gravar.`);
  process.exit(0);
}

const { error } = await sb.from("visitas_mensais").upsert(
  entram.map((v) => ({
    operacao_id: OPERACAO,
    conta_canal_id: v.conta,
    ano: v.ano,
    mes: v.mes,
    visitas: v.visitas,
    /* `manual` porque veio de leitura de tela, não de API nem de planilha
       importada: quem olhar depois precisa saber que foi digitado. */
    origem: "manual",
    atualizado_em: new Date().toISOString(),
  })),
  { onConflict: "conta_canal_id,ano,mes" }
);
if (error) throw new Error(error.message);
console.log(`\ngravados: ${entram.length} meses`);
