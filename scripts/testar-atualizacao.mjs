/** Executa a rota e o controlador reais, com conectores de teste sem acesso externo. */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";
import { criarAtualizador } from "../src/lib/atualizacao-cliente.ts";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const pasta = await mkdtemp(path.join(tmpdir(), "gerizo-atualizacao-"));
async function stub(nome, codigo) {
  const arquivo = path.join(pasta, nome + ".cjs");
  await writeFile(arquivo, codigo);
  return arquivo;
}
try {
  globalThis.__atualizacao = { usuario: true, edita: true, op: "a", chamadas: [], falhar: null };
  const vazio = await stub("vazio", "module.exports={}");
  const banco = await stub("banco", `exports.clienteServidor=async()=>({auth:{getUser:async()=>({data:{user:globalThis.__atualizacao.usuario?{id:'teste'}:null}})},rpc:async()=>({data:globalThis.__atualizacao.edita})});`);
  const operacao = await stub("operacao", `exports.operacaoPadrao=async()=>({id:globalThis.__atualizacao.op,nome:globalThis.__atualizacao.op});`);
  const catalogo = await stub("catalogo", `
    const lista=['a','b'];
    const filtrar=op=>lista.filter(id=>!op||id===op);
    exports.contasMeli=async(op)=>filtrar(op).map(id=>({id:'meli-'+id,nome:id,conectada:false}));
    exports.lojasVtex=async(op)=>filtrar(op).map(id=>({id:'vtex-'+id,operacaoId:id,nome:id}));
    exports.vtexConectada=async()=>true;
    exports.appConfigurado=()=>true; exports.contaConectada=async()=>true;
    exports.integracaoDaOperacao=async(p,op)=>({id:p+'-'+op,operacaoId:op,ref:'cofre',config:{}});
    exports.integracaoDaConta=async(p,c)=>({id:p+'-'+c,operacaoId:c.slice(-1),contaCanalId:c,ref:'cofre',config:{}});
    exports.integracoesDoProvedor=async(p,op)=>filtrar(op).map(id=>({id:p+'-'+id,operacaoId:id,ref:'cofre',nome:id,config:{propriedade:'teste'}}));
    exports.PROVEDOR='teste';
  `);
  const sync = await stub("sync", `
    const gravar=(tipo,...args)=>{globalThis.__atualizacao.chamadas.push({tipo,args});if(globalThis.__atualizacao.falhar===tipo)throw new Error('Falha simulada');};
    exports.sincronizarMeli=async(o)=>{gravar('meli',o);return {pedidos:{gravados:3},anuncios:{gravados:4},visitas:{linhas:8,falharam:1},avisos:[]}};
    exports.sincronizarVtex=async(o)=>{gravar('vtex',o);return {pedidos:{gravados:2}}};
    exports.sincronizarBling=async(...o)=>{gravar('bling',...o);return {pedidos:2,pendentes:{loja:{pedidos:1}}}};
    exports.sincronizarGa4=async(...o)=>{gravar('ga4',...o);return {dias:3,avisos:[]}};
    exports.sincronizarAds=async(...o)=>{gravar('ads',...o);return {campanhas:1,gravados:2,diasGravados:8}};
    exports.estoqueMeli=exports.estoqueBling=async(i,p)=>{gravar('estoque',i,p);return {detalhe:'lote '+p,avisos:p===0?['aviso inicial']:[],continuacao:p===0?1:undefined}};
  `);
  const alias = { "@/lib/supabase/servidor": banco, "@/lib/dados/operacao": operacao, "server-only": vazio, "@": path.join(raiz, "src") };
  for (const arquivo of ["meli/rota", "meli/cliente", "vtex/cliente", "integracoes/cofre", "bling/cliente", "ga4/cliente"]) alias["@/lib/" + arquivo] = catalogo;
  for (const arquivo of ["meli/sincronizar", "meli/ads", "meli/estoque", "bling/estoque", "vtex/sincronizar", "bling/sincronizar", "ga4/sincronizar"]) alias["@/lib/" + arquivo] = sync;
  const jiti = createJiti(import.meta.url, { moduleCache: false, alias });
  const { GET, POST } = await jiti.import(path.join(raiz, "src/app/api/atualizar/route.ts"));
  const post = (corpo) => POST(new Request("http://teste/api/atualizar", { method: "POST", body: JSON.stringify(corpo) }));
  let plano = await (await GET()).json();
  assert.equal(plano.etapas.length, 8);
  assert.ok(plano.etapas.every(e=>!e.id.endsWith('-b')));
  assert.ok(plano.etapas.every(e=>!('executar' in e)));
  assert.equal(globalThis.__atualizacao.chamadas.length, 0, "GET não sincroniza nenhuma fonte");
  assert.equal((await post({ operacaoId: "b", etapa: "meli-dados:meli-b" })).status, 409);
  assert.equal((await post({ operacaoId: "a", etapa: "meli-dados:meli-b" })).status, 404);
  assert.equal((await post(null)).status, 400);
  assert.equal((await post({ operacaoId: "a", etapa: "meli-estoque:meli-a", pagina: -1 })).status, 400);
  assert.equal(globalThis.__atualizacao.chamadas.length, 0, "Conta alheia nunca dispara API");
  globalThis.__atualizacao.edita = false;
  assert.equal((await GET()).status, 403);
  assert.equal((await post({ operacaoId: "a", etapa: "meli-dados:meli-a" })).status, 403);
  globalThis.__atualizacao.edita = true;
  globalThis.__atualizacao.usuario = false;
  assert.equal((await GET()).status, 401);
  globalThis.__atualizacao.usuario = true;

  let gets = 0;
  globalThis.__atualizacao.falhar = "vtex";
  const atualizador = criarAtualizador(async (_url, opcoes) => {
    if (opcoes?.method !== "POST") { gets++; return GET(); }
    return post(JSON.parse(opcoes.body));
  });
  const primeiro = atualizador.executar();
  assert.equal(atualizador.executar(), primeiro, "Dois botões não criam duas execuções");
  await primeiro;
  assert.equal(gets, 1);
  assert.equal(atualizador.ler().rodando, false);
  assert.equal(atualizador.ler().etapas.filter(e=>e.estado==='concluida').length, 7);
  assert.equal(globalThis.__atualizacao.chamadas.filter(c=>c.tipo==='estoque').length, 4, 'Retoma os dois lotes de cada origem');
  assert.deepEqual(atualizador.ler().etapas.find(e=>e.id==='meli-estoque:meli-a').avisos, ['aviso inicial']);
  assert.equal(atualizador.ler().etapas.find(e=>e.id==='vtex:vtex-a').estado, 'falhou');
  const ads = globalThis.__atualizacao.chamadas.find(c=>c.tipo==='ads');
  assert.equal(ads.args[0], 'meli-a');
  assert.equal(ads.args[1].operacaoId, 'a');
  const visitas = globalThis.__atualizacao.chamadas.find(c=>c.tipo==='meli' && c.args[0].etapas.visitas);
  assert.equal(visitas.args[0].etapas.catalogo, false, "Visitas não releem estoque nem catálogo");
  assert.equal(visitas.args[0].etapas.pedidos, false);
  assert.equal(atualizador.ler().etapas.find(e=>e.id==='meli-visitas:meli-a').avisos.length, 1);

  let posts = 0;
  const troca = criarAtualizador(async (_url, opcoes) => {
    if (opcoes?.method !== 'POST') return GET();
    posts++;
    globalThis.__atualizacao.op = 'b';
    return post(JSON.parse(opcoes.body));
  });
  await troca.executar();
  assert.equal(posts, 1, "Troca de empresa interrompe as próximas etapas");
  assert.equal(troca.ler().etapas.filter(e=>e.estado==='interrompida').length, 7);
  plano = await (await GET()).json();
  assert.ok(plano.etapas.every(e=>!e.id.endsWith('-a')));
  console.log("OK: rota autenticada, escopo por empresa, GET sem escrita, publicidade, visitas, avisos, falha parcial, execução única e troca de empresa.");
} finally {
  delete globalThis.__atualizacao;
  if (path.dirname(pasta) === path.resolve(tmpdir()) && path.basename(pasta).startsWith("gerizo-atualizacao-")) await rm(pasta, { recursive: true, force: true });
}
