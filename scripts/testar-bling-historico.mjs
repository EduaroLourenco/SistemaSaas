/**
 * A rota de histórico do Bling, com a sincronização dublada.
 *
 * O que está em teste é o fatiamento: um dia pulado entre duas fatias some
 * sem erro nenhum, e só apareceria como receita faltando num mês antigo.
 * Confere que as fatias cobrem o intervalo pedido inteiro, sem buraco, e que
 * `continuar` retoma exatamente onde parou.
 */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const pasta = await mkdtemp(path.join(tmpdir(), "gerizo-historico-"));
async function stub(nome, codigo) {
  const arquivo = path.join(pasta, nome + ".cjs");
  await writeFile(arquivo, codigo);
  return arquivo;
}

const dia = (d, passo) => new Date(Date.parse(d + "T12:00:00Z") + passo * 86400000).toISOString().slice(0, 10);

try {
  globalThis.__hist = { usuario: true, edita: true, op: "op-1", integracao: true, fatias: [], demorar: 0, falhar: 0 };
  const vazio = await stub("vazio", "module.exports={}");
  const banco = await stub(
    "banco",
    `exports.clienteServidor=async()=>({auth:{getUser:async()=>({data:{user:globalThis.__hist.usuario?{id:'u'}:null}})},rpc:async()=>({data:globalThis.__hist.edita})});`
  );
  const operacao = await stub("operacao", `exports.operacaoPadrao=async()=>globalThis.__hist.op?{id:globalThis.__hist.op}:null;`);
  const cofre = await stub(
    "cofre",
    `exports.integracaoDaOperacao=async()=>globalThis.__hist.integracao?{id:'i',operacaoId:globalThis.__hist.op,config:{}}:null;`
  );
  const cliente = await stub("cliente", `exports.PROVEDOR='bling';`);
  const sync = await stub(
    "sync",
    `exports.sincronizarBling=async(_i,de,ate)=>{
       const e=globalThis.__hist;
       e.fatias.push([de,ate]);
       if(e.falhar && e.fatias.length===e.falhar) throw new Error('limite do Bling');
       if(e.demorar) Date.now=((base)=>()=>base+e.fatias.length*e.demorar)(Date.now());
       return {pedidos:1,itens:2,pulados:0,pendentes:{}};
     };`
  );

  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    alias: {
      "@/lib/supabase/servidor": banco,
      "@/lib/dados/operacao": operacao,
      "@/lib/integracoes/cofre": cofre,
      "@/lib/bling/cliente": cliente,
      "@/lib/bling/sincronizar": sync,
      "server-only": vazio,
      "@": path.join(raiz, "src"),
    },
  });
  const { POST } = await jiti.import(path.join(raiz, "src/app/api/bling/historico/route.ts"));
  const relogioReal = Date.now;
  const post = (corpo) => {
    Date.now = relogioReal;
    return POST(new Request("http://teste/api/bling/historico", { method: "POST", body: JSON.stringify(corpo) }));
  };

  /* Cobertura: as fatias, juntas, são o intervalo pedido — sem buraco e sem
     dia a mais nas pontas. */
  function conferirCobertura(fatias, de, ate) {
    const ordenadas = [...fatias].sort((a, b) => a[0].localeCompare(b[0]));
    assert.equal(ordenadas[0][0], de, "a leitura começa no primeiro dia pedido");
    assert.equal(ordenadas.at(-1)[1], ate, "a leitura termina no último dia pedido");
    for (let i = 1; i < ordenadas.length; i++) {
      assert.equal(ordenadas[i][0], dia(ordenadas[i - 1][1], 1), `buraco entre ${ordenadas[i - 1][1]} e ${ordenadas[i][0]}`);
    }
    for (const [d, a] of ordenadas) assert.ok(d <= a, `fatia invertida: ${d} a ${a}`);
  }

  /* 1. Intervalo que não é múltiplo da fatia: a última tem de ser curta, e
     não passar do dia pedido. */
  globalThis.__hist.fatias = [];
  let j = await (await post({ de: "2026-01-01", ate: "2026-02-04" })).json();
  conferirCobertura(globalThis.__hist.fatias, "2026-01-01", "2026-02-04");
  assert.equal(j.continuar, null, "intervalo inteiro lido numa chamada");
  assert.equal(j.pedidos, globalThis.__hist.fatias.length);

  /* 2. Um dia só. */
  globalThis.__hist.fatias = [];
  j = await (await post({ de: "2026-03-10", ate: "2026-03-10" })).json();
  assert.deepEqual(globalThis.__hist.fatias, [["2026-03-10", "2026-03-10"]]);
  assert.equal(j.continuar, null);

  /* 3. Tempo acabando: para, devolve o dia onde parou, e a continuação
     retoma dali sem buraco nem repetição. */
  globalThis.__hist.fatias = [];
  globalThis.__hist.demorar = 120_000;
  const primeira = await (await post({ de: "2026-01-01", ate: "2026-06-30" })).json();
  const fatias1 = [...globalThis.__hist.fatias];
  assert.ok(primeira.continuar, "sobrou intervalo para continuar");
  assert.ok(fatias1.length < 18, `parou cedo: ${fatias1.length} fatias`);
  globalThis.__hist.demorar = 0;
  globalThis.__hist.fatias = [];
  const segunda = await (await post({ de: "2026-01-01", ate: primeira.continuar })).json();
  assert.equal(segunda.continuar, null);
  conferirCobertura([...fatias1, ...globalThis.__hist.fatias], "2026-01-01", "2026-06-30");

  /* 4. Fatia que falha não perde o que já entrou, e diz onde continuar. */
  globalThis.__hist.fatias = [];
  globalThis.__hist.falhar = 2;
  j = await (await post({ de: "2026-01-01", ate: "2026-03-31" })).json();
  assert.equal(j.pedidos, 1, "o que entrou antes da falha é contado");
  assert.match(j.aviso, /limite do Bling/);
  assert.equal(j.continuar, dia(globalThis.__hist.fatias[0][0], -1), "continua do dia seguinte ao que já leu");
  globalThis.__hist.falhar = 0;

  /* 5. Guardas. */
  assert.equal((await post({ de: "2026-01-01" })).status, 400);
  assert.equal((await post({ de: "01/01/2026", ate: "2026-01-02" })).status, 400);
  assert.equal((await post({ de: "2026-02-10", ate: "2026-02-01" })).status, 400, "data inicial depois da final");
  globalThis.__hist.fatias = [];
  globalThis.__hist.edita = false;
  assert.equal((await post({ de: "2026-01-01", ate: "2026-01-05" })).status, 403, "leitor não puxa histórico");
  globalThis.__hist.edita = true;
  globalThis.__hist.usuario = false;
  assert.equal((await post({ de: "2026-01-01", ate: "2026-01-05" })).status, 401);
  globalThis.__hist.usuario = true;
  globalThis.__hist.integracao = false;
  assert.equal((await post({ de: "2026-01-01", ate: "2026-01-05" })).status, 404, "sem Bling conectado");
  globalThis.__hist.integracao = true;
  assert.equal(globalThis.__hist.fatias.length, 0, "nenhuma leitura disparada nos casos recusados");

  Date.now = relogioReal;
  console.log("ok");
} finally {
  await rm(pasta, { recursive: true, force: true });
}
