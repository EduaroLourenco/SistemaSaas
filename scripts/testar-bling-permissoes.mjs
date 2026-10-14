import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createJiti} from '../node_modules/jiti/lib/jiti.mjs';

const pasta = await mkdtemp(path.join(tmpdir(), 'gerizo-bling-permissoes-'));
const fetchOriginal = globalThis.fetch;
const estado = {chamadas: [], falhas: [], escritas: 0, status: 403, corpo: {}};
globalThis.__testeBlingPermissoes = estado;
const integ = {id: 'bling-a', operacaoId: 'empresa-a', provedor: 'bling'};
const descricao = 'The request requires higher privileges than provided by the access token';

try {
  const vazio = path.join(pasta, 'vazio.cjs');
  const cofre = path.join(pasta, 'cofre.cjs');
  const gravar = path.join(pasta, 'gravar.cjs');
  await writeFile(vazio, 'module.exports={};');
  await writeFile(cofre, `
    exports.lerSegredo=async()=>({access_token:'teste',refresh_token:'teste-refresh',expira_em:new Date(Date.now()+3600000).toISOString()});
    exports.gravarSegredo=async()=>{throw new Error('Não deveria renovar nem regravar a autorização em um erro de escopo');};
  `);
  await writeFile(gravar, `
    exports.gravarEstoques=async()=>{globalThis.__testeBlingPermissoes.escritas++;};
    exports.registrarFalhaEstoque=async(...args)=>{globalThis.__testeBlingPermissoes.falhas.push(args);};
  `);
  const jiti = createJiti(import.meta.url, {moduleCache: false, alias: {
    '@': path.join(process.cwd(), 'src'), 'server-only': vazio,
    '@/lib/integracoes/cofre': cofre, '@/lib/estoques/gravar': gravar,
  }});
  globalThis.fetch = async (url, opcoes) => {
    const endereco = new URL(url);
    assert.equal(endereco.host, 'api.bling.com.br');
    assert.ok(!endereco.pathname.includes('/oauth/'), 'Erro de escopo não deve renovar o token');
    assert.equal(opcoes.headers.Authorization, 'Bearer teste');
    estado.chamadas.push(endereco);
    return Response.json(estado.corpo, {status: estado.status});
  };
  const {bling} = await jiti.import(path.join(process.cwd(), 'src/lib/bling/cliente.ts'));
  const {estoqueBling} = await jiti.import(path.join(process.cwd(), 'src/lib/bling/estoque.ts'));

  estado.corpo = {error: {type: 'insufficient_scope', description: descricao}};
  await assert.rejects(() => estoqueBling(integ), /sem permissão para consultar depósitos.*reconecte/);
  assert.equal(estado.chamadas.length, 1, 'Para na primeira recusa, sem repetir a chamada ou consultar saldos');
  assert.equal(estado.escritas, 0, 'Falha não grava saldo zero nem substitui estoques anteriores');
  assert.equal(estado.falhas.length, 1);
  assert.equal(estado.falhas[0][0], integ, 'Registra a falha na integração consultada');
  assert.equal(estado.falhas[0][1], 'bling');
  assert.match(estado.falhas[0][2], /Canais e contas → ERP/);

  estado.corpo = {error: {type: 'FORBIDDEN', description: descricao}};
  await assert.rejects(() => bling(integ, '/produtos'), /sem permissão para consultar produtos/);
  estado.corpo = {error: {message: 'insufficient_scope'}};
  await assert.rejects(() => bling(integ, '/estoques/saldos/12'), /sem permissão para consultar estoques/);

  estado.corpo = {error: {description: 'Acesso bloqueado por outro motivo'}};
  await assert.rejects(() => bling(integ, '/depositos'), {
    message: 'Bling respondeu 403 em /depositos: Acesso bloqueado por outro motivo',
  });
  estado.status = 401;
  estado.corpo = {error: {type: 'invalid_token', description: 'Token expirou'}};
  await assert.rejects(() => bling(integ, '/depositos'), {
    message: 'Bling respondeu 401 em /depositos: Token expirou',
  });

  estado.status = 200;
  estado.corpo = {data: [{produto: {id: 12}, saldoFisicoTotal: 0, saldoVirtualTotal: 0}]};
  const saldos = await bling(integ, '/estoques/saldos/1', {'idsProdutos[]': [12, 13], filtroSaldoEstoque: 1});
  assert.deepEqual(saldos, estado.corpo);
  assert.deepEqual(estado.chamadas.at(-1).searchParams.getAll('idsProdutos[]'), ['12', '13']);
  assert.equal(saldos.data[0].saldoVirtualTotal, 0, 'Resposta válida preserva saldo zero');
  console.log('OK: permissão insuficiente explicada, outros erros preservados, sem renovação indevida nem alteração de saldos em falha.');
} finally {
  globalThis.fetch = fetchOriginal;
  delete globalThis.__testeBlingPermissoes;
  if (path.dirname(pasta) === path.resolve(tmpdir()) && path.basename(pasta).startsWith('gerizo-bling-permissoes-')) {
    await rm(pasta, {recursive: true, force: true});
  }
}
