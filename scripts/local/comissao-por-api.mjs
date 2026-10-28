/**
 * Preenche a comissão PRATICADA dos pedidos antigos do Mercado Livre,
 * pedindo a tarifa à API do canal.
 *
 * ── Por que existe ──
 *
 * `order_items[].sale_fee` é o extrato de quem cobrou: a API devolve a
 * tarifa de cada item, e o cliente já soma isso em `pedido.comissao` com
 * origem `canal`. Medido em 28/10/2026, nos pedidos do Meli de 2026:
 *
 *   origem da linha     pedidos    com comissão
 *   api                     774        774 (100%)
 *   planilha              3.190      1.444 (45%)
 *
 * A listagem do hub preenche a coluna de comissão em parte dos pedidos, e
 * no resto a plataforma reconstrói por subtração — conta que não sustenta
 * o nível do pedido e por isso é descartada na leitura. Resultado: a
 * comissão praticada por SKU sai apurada sobre 16% a 32% da receita.
 *
 * Este script fecha esse buraco com o número do próprio canal.
 *
 * ── O que ele NÃO faz ──
 *
 * Não cria pedido. Só atualiza a comissão de pedido que já existe, casado
 * pelo código. Pedido que a API traz e nós não temos é contado e
 * mostrado, porque é sintoma de outra coisa — não se resolve aqui.
 *
 * Não toca em quem já tem `comissao_origem = 'canal'`: esse já veio do
 * extrato, pela API ou pelo relatório de tarifas.
 *
 * O token vem do cofre do sistema — a integração do app que o Eduardo
 * criou no Meli —, e o cliente renova sozinho se precisar. Os token.json
 * dos CLIs antigos não entram aqui: são outra credencial, vencem em 6
 * horas e só o CLI dono renova.
 *
 * ── Alternativa sem API ──
 *
 * O relatório de vendas do Meli importado em /importar faz o mesmo pela
 * planilha (tipo `vendas_ml`, grava com origem `canal`). Nunca foi usado
 * nesta base: nenhuma importação desse tipo nas últimas 40.
 *
 * Uso:
 *   node scripts/local/comissao-por-api.mjs 2026-01-01 2026-06-30
 *   node scripts/local/comissao-por-api.mjs 2026-01-01 2026-06-30 --aplicar
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

const argumentos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const DE = argumentos[0] ?? "2026-01-01";
const ATE = argumentos[1] ?? "2026-06-30";
const APLICAR = process.argv.includes("--aplicar");

const SB = {
  apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
  "content-type": "application/json",
};
const rest = (caminho) => process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/" + caminho;

const contasCanal = await (await fetch(rest("contas_canal?select=id,nome,canal_id"), { headers: SB })).json();
const achar = (parte) => contasCanal.find((c) => c.nome.toLowerCase().includes(parte));

/*
 * O token sai do COFRE do sistema, não de arquivo.
 *
 * Esta era a parte errada da primeira versão: ela lia os token.json dos
 * dois CLIs antigos do Eduardo, que vencem em 6 horas e só o CLI dono
 * renova. Só que o sistema tem integração própria — o app que ele criou
 * no Meli —, com refresh no cofre, e o cliente (`accessToken` em
 * cliente.ts) renova sozinho quando precisa. É o mesmo caminho que a
 * sincronização usa, e por isso funciona fora de uma requisição.
 */
const integracoes = await (
  await fetch(rest("integracoes?select=conta_canal_id,status&provedor=eq.mercado_livre"), { headers: SB })
).json();
const conectadas = new Set(
  (Array.isArray(integracoes) ? integracoes : [])
    .filter((i) => i.status === "conectada")
    .map((i) => i.conta_canal_id)
);

const contasMeli = contasCanal.filter((c) => conectadas.has(c.id));
const prontas = contasMeli.map((conta) => ({ apelido: conta.nome, conta }));
for (const { conta } of prontas) console.log(`• ${conta.nome}`);
if (!prontas.length) {
  console.log("Nenhuma conta do Mercado Livre conectada. Nada foi consultado.");
  process.exit(1);
}

fs.writeFileSync(path.join(process.cwd(), "vazio.cjs"), "");
const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": path.join(process.cwd(), "vazio.cjs") },
});
const { pedidos: pedidosDaApi } = await jiti.import(RAIZ + "/src/lib/meli/cliente.ts");

console.log(`\nperíodo: ${DE} a ${ATE}\n`);

let totalCasados = 0;
let totalAtualizar = 0;
let totalSemPedido = 0;

for (const { apelido, conta } of prontas) {
  /* Os nossos pedidos do período, dessa conta. */
  const nossos = [];
  for (let de = 0; ; de += 1000) {
    const url = rest(
      `pedidos?select=id,codigo_externo,codigo_secundario,comissao,comissao_origem,total` +
        `&conta_canal_id=eq.${conta.id}&data=gte.${DE}&data=lte.${ATE}&order=id&offset=${de}&limit=1000`
    );
    const pagina = await (await fetch(url, { headers: SB })).json();
    if (!Array.isArray(pagina)) throw new Error("Supabase: " + JSON.stringify(pagina).slice(0, 200));
    nossos.push(...pagina);
    if (pagina.length < 1000) break;
  }

  const porCodigo = new Map();
  for (const p of nossos) {
    porCodigo.set(String(p.codigo_externo), p);
    if (p.codigo_secundario) porCodigo.set(String(p.codigo_secundario), p);
  }

  const daApi = await pedidosDaApi({ de: DE, ate: ATE, conta: conta.id });

  const atualizar = [];
  let semPedido = 0;
  let jaDoCanal = 0;
  let semTarifa = 0;
  for (const p of daApi) {
    const nosso = porCodigo.get(String(p.id));
    if (!nosso) {
      semPedido += 1;
      continue;
    }
    if (p.comissao == null) {
      semTarifa += 1;
      continue;
    }
    /* Já veio do extrato (API ou relatório de tarifas): não se sobrescreve
       extrato com extrato. */
    if (nosso.comissao_origem === "canal") {
      jaDoCanal += 1;
      continue;
    }
    atualizar.push({ id: nosso.id, comissao: p.comissao, antes: nosso.comissao, total: nosso.total });
  }

  const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(0)}%` : "—");
  console.log(`${apelido} (${conta.nome})`);
  console.log(`  nossos no período: ${nossos.length} · a API devolveu: ${daApi.length}`);
  console.log(`  casados: ${daApi.length - semPedido} (${pct(daApi.length - semPedido, daApi.length)})`);
  console.log(`  já com tarifa do canal: ${jaDoCanal} · sem tarifa na API: ${semTarifa}`);
  console.log(`  A PREENCHER: ${atualizar.length}`);
  if (semPedido) console.log(`  ⚠ ${semPedido} pedidos da API sem par aqui — não são criados por este script`);

  /*
   * Quanto disto é número novo e quanto é só a origem subindo de "hub"
   * para "canal"? A diferença importa: onde o valor bate, a gravação só
   * carimba a procedência; onde não bate, ela CORRIGE a tarifa, e é bom
   * ver o tamanho da correção antes de aplicar em dois mil pedidos.
   */
  const vazios = atualizar.filter((a) => a.antes == null).length;
  const iguais = atualizar.filter((a) => a.antes != null && Math.abs(Number(a.antes) - a.comissao) < 0.01).length;
  const diferentes = atualizar.filter((a) => a.antes != null && Math.abs(Number(a.antes) - a.comissao) >= 0.01);
  console.log(`    sem comissão antes: ${vazios} · mesmo valor (só a origem muda): ${iguais} · valor diferente: ${diferentes.length}`);

  if (diferentes.length) {
    const porTamanho = [...diferentes].sort(
      (x, y) => Math.abs(y.comissao - Number(y.antes)) - Math.abs(x.comissao - Number(x.antes))
    );
    const soma = diferentes.reduce((t, a) => t + (a.comissao - Number(a.antes)), 0);
    console.log(`    efeito das diferenças: R$ ${soma.toFixed(2)} em comissão`);
    for (const a of porTamanho.slice(0, 3)) {
      const taxaAntes = a.total > 0 ? ((Number(a.antes) / a.total) * 100).toFixed(2) : "—";
      const taxaDepois = a.total > 0 ? ((a.comissao / a.total) * 100).toFixed(2) : "—";
      console.log(`      maior: ${Number(a.antes).toFixed(2)} (${taxaAntes}%) → ${a.comissao.toFixed(2)} (${taxaDepois}%)`);
    }
  }

  totalCasados += daApi.length - semPedido;
  totalAtualizar += atualizar.length;
  totalSemPedido += semPedido;

  if (APLICAR && atualizar.length) {
    for (let i = 0; i < atualizar.length; i += 200) {
      const lote = atualizar.slice(i, i + 200);
      for (const a of lote) {
        /*
         * Repete a linha que a rede derrubou.
         *
         * São milhares de PATCH em sequência, e um ECONNRESET no meio
         * derrubava a execução inteira — rodar de novo funciona, porque
         * quem já gravou vira `origem: canal` e é pulado, mas perder
         * vinte minutos por um soluço de rede não precisa acontecer.
         */
        let ultima;
        let feito = false;
        for (let tentativa = 1; tentativa <= 3 && !feito; tentativa += 1) {
          try {
            const r = await fetch(rest(`pedidos?id=eq.${a.id}`), {
              method: "PATCH",
              headers: { ...SB, Prefer: "return=minimal" },
              body: JSON.stringify({
                comissao: a.comissao,
                comissao_origem: "canal",
                comissao_derivada: false,
                atualizado_em: new Date().toISOString(),
              }),
            });
            if (r.ok) { feito = true; break; }
            ultima = `${r.status} ${(await r.text()).slice(0, 120)}`;
          } catch (e) {
            ultima = e?.cause?.code ?? e?.message ?? String(e);
          }
          await new Promise((ok) => setTimeout(ok, 400 * tentativa));
        }
        if (!feito) throw new Error(`PATCH ${a.id}: ${ultima}`);
      }
      console.log(`  gravados ${Math.min(i + 200, atualizar.length)} de ${atualizar.length}`);
    }
  }
}

console.log(
  `\ntotal · casados ${totalCasados} · a preencher ${totalAtualizar}` +
    (totalSemPedido ? ` · ${totalSemPedido} da API sem par aqui` : "")
);
if (!APLICAR) console.log("ensaio. rode com --aplicar para gravar.");
