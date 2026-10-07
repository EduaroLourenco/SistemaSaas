import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const dir = new URL('../output/planejamento-testes/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const nome of ['modelo', 'sazonal', 'estrategia', 'prioridades', 'resultados', 'estudio']) {
  const fonte = readFileSync(new URL(`../src/lib/planejamento/${nome}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  writeFileSync(new URL(`${nome}.js`, dir), outputText);
}
const require = createRequire(import.meta.url);
const m = require(new URL('modelo.js', dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const { oportunidades } = require(new URL('sazonal.js', dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const estrategia = require(new URL('estrategia.js', dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const foco = require(new URL('prioridades.js', dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const resultados = require(new URL('resultados.js', dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const estudio = require(new URL('estudio.js', dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
let total = 0;
function teste(nome, fn) { fn(); total++; console.log(`OK ${nome}`); }
teste('datas de calendário, anos bissextos e período inclusivo', () => {
  assert.equal(m.dataValida('2026-02-29'), false);
  assert.equal(m.dataValida('2028-02-29'), true);
  assert.equal(m.dataValida('2026-13-01'), false);
  assert.equal(m.somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(m.segunda('2026-10-04'), '2026-09-28');
  assert.equal(m.sobrepoe('2026-10-01', '2026-10-05', '2026-10-05', '2026-10-06'), true);
});
teste('datas móveis confirmadas em 2026', () => {
  const datas = oportunidades(2026);
  for (const [nome, data] of [['Carnaval', '2026-02-17'], ['Páscoa', '2026-04-05'], ['Dia das Mães', '2026-05-10'], ['Dia dos Pais', '2026-08-09'], ['Black Friday', '2026-11-27'], ['Cyber Monday', '2026-11-30'], ['Dia Mundial do Sono', '2026-03-13']]) assert.equal(datas.find(o => o.nome === nome)?.data, data);
  assert.equal(datas.find(o => o.nome === 'Dia do Estagiário')?.data, '2026-08-18');
});
teste('recorrências mudam de ano; não inventa data do organizador', () => {
  const datas = oportunidades(2027);
  assert.equal(datas.find(o => o.nome === 'Páscoa')?.data, '2027-03-28');
  assert.equal(datas.find(o => o.nome === 'Dia das Mães')?.data, '2027-05-09');
  assert.equal(datas.find(o => o.nome === 'Black Friday')?.data, '2027-11-26');
  assert.equal(datas.some(o => o.nome === 'Dia Mundial do Sono'), false);
  for (let ano = 2000; ano <= 2100; ano++) {
    const ds = oportunidades(ano);
    assert.equal(new Set(ds.map(d => d.id)).size, ds.length);
    ds.forEach(d => assert.equal(m.dataValida(d.data), true));
    assert.equal(m.dataUTC(ds.find(d => d.nome === 'Black Friday').data).getUTCDay(), 5);
  }
});
teste('ações sem produto, CRM e tipos personalizados', () => {
  const i = m.novoItem('2026-10-05');
  i.titulo = 'Banner institucional';
  assert.equal(m.validarItem(i), null);
  i.tipo = 'Parceria criativa';
  assert.equal(m.validarItem(i), null);
  i.detalhes.publico = 'Clientes recorrentes';
  i.tipo = 'CRM';
  assert.equal(m.validarItem(i), null);
});
teste('validação de datas, orçamento e links', () => {
  const i = m.novoItem('2026-10-05'); i.titulo = 'Teste';
  i.fim = '2026-10-04'; assert.ok(m.validarItem(i));
  i.fim = i.inicio; i.detalhes.orcamento = -1; assert.ok(m.validarItem(i));
  i.detalhes.orcamento = null; i.detalhes.link = 'javascript:alert(1)'; assert.ok(m.validarItem(i));
  i.detalhes.link = 'https://example.com/arte'; assert.equal(m.validarItem(i), null);
  i.detalhes.porProduto = { inexistente: 'Exceção' }; assert.ok(m.validarItem(i));
});
teste('estratégia mantém registros antigos e exige fonte para resultado manual', () => {
  const i = m.novoItem('2026-10-01'); i.titulo = 'Product Ads';
  delete i.detalhes.estrategia;
  assert.equal(m.validarItem(i), null);
  i.detalhes.estrategia = estrategia.estrategiaDe(i);
  const e = i.detalhes.estrategia;
  e.indicador = 'roas'; e.alvo = 4; e.medicao.valor = 3;
  assert.ok(m.validarItem(i));
  e.medicao.fonte = 'Painel de Product Ads, conta A'; e.medicao.data = '2026-10-05';
  assert.equal(m.validarItem(i), null);
  e.alvo = NaN; assert.ok(m.validarItem(i)); e.alvo = 4;
  e.execucoes = [{ ...estrategia.execucaoVazia('geral'), situacao: 'Executada' }];
  assert.ok(m.validarItem(i));
  Object.assign(e.execucoes[0], { inicio: '2026-10-01', fim: '2026-10-02', evidencia: 'https://example.com/registro' });
  assert.equal(m.validarItem(i), null);
  e.execucoes[0].evidencia = 'javascript:alert(1)'; assert.ok(m.validarItem(i));
});
teste('prioridades distinguem contas e explicam sobreposições', () => {
  const a = { ...m.novoItem('2026-10-06'), id: 'a', titulo: 'Oferta A', skus: ['SKU1'], contas: ['conta-a'] };
  const b = { ...m.novoItem('2026-10-06'), id: 'b', titulo: 'Oferta B', skus: ['sku1'], contas: ['conta-b'] };
  const dados = { itens: [a, b], contas: [{ id: 'conta-a', canal_id: 'ml', nome: 'A' }, { id: 'conta-b', canal_id: 'ml', nome: 'B' }], canais: [{ id: 'ml', nome: 'ML' }] };
  assert.equal(foco.prioridades(dados, '2026-10-06').some(p => p.grupo === 'Coordenar'), false);
  b.contas = ['conta-a'];
  assert.equal(foco.prioridades(dados, '2026-10-06').filter(p => p.grupo === 'Coordenar').length, 1);
  b.contas = []; b.canais = ['ml'];
  assert.equal(foco.mesmoDestino(a, b, dados.contas), true);
  b.status = 'Cancelada';
  assert.equal(foco.prioridades(dados, '2026-10-06').some(p => p.item.id === 'b' || p.grupo === 'Coordenar'), false);
  a.detalhes.estrategia.execucoes = [{ ...estrategia.execucaoVazia('conta:conta-a'), situacao: 'Executada', inicio: a.inicio, fim: a.fim }];
  assert.equal(foco.prioridades(dados, '2026-10-06').some(p => p.grupo === 'Executar'), false);
});
teste('aprendizados são anteriores, do mesmo produto e destino', () => {
  const antigo = { ...m.novoItem('2026-09-01'), id: 'antigo', fim: '2026-09-07', skus: ['ABC'], contas: ['a'] };
  antigo.detalhes.estrategia.fechamento.proximoPasso = 'Revisar fotos antes';
  const novo = { ...m.novoItem('2026-10-01'), id: 'novo', skus: ['abc'], contas: ['a'] };
  const dados = { itens: [antigo, novo], contas: [] };
  assert.equal(foco.aprendizadosPara(novo, dados).length, 1);
  novo.contas = ['b']; assert.equal(foco.aprendizadosPara(novo, dados).length, 0);
});
teste('vendas respeitam SKU, conta, exclusões e cancelamento sem duplicar pedidos', () => {
  const i = { ...m.novoItem('2026-10-01'), fim: '2026-10-06', skus: ['sku-a'], contas: ['a'] };
  const base = { pedido: 'p1', data: '2026-10-02', canal: 'ml', conta: 'a', cancelado: false, sku: 'SKU-A', anuncio: 'ad1', quantidade: 2, receita: 100, atualizado: '2026-10-03T12:00:00Z' };
  const linhas = [base, { ...base, quantidade: 1, receita: 50 }, { ...base, sku: 'SKU-B', receita: 600 }, { ...base, pedido: 'p2', conta: 'b' }, { ...base, pedido: 'p3', cancelado: true }, { ...base, pedido: 'p4', data: '2026-10-05' }];
  const exclusoes = [{ data_inicio: '2026-10-05', data_fim: '2026-10-05', canal_id: 'ml', conta_canal_id: 'a' }];
  const r = resultados.resumirVendas(linhas, i, i.inicio, i.fim, exclusoes);
  assert.equal(r.receita, 150); assert.equal(r.unidades, 3); assert.equal(r.pedidos, 1); assert.equal(r.cancelados, 1); assert.equal(r.excluidos, 1);
  i.detalhes.estrategia.anuncios = ['ad2'];
  assert.equal(resultados.resumirVendas(linhas, i, i.inicio, i.fim, exclusoes).encontrados, 0);
  i.detalhes.estrategia.anuncios = ['ad1']; i.skus = [];
  assert.equal(resultados.resumirVendas([base], i, i.inicio, i.fim, []).receita, 100);
});
teste('comparação usa período decorrido e intervalo anterior de igual duração', () => {
  const i = { ...m.novoItem('2026-10-01'), fim: '2026-10-31' };
  assert.equal(resultados.periodosDoResultado(i, '2026-09-30'), null);
  assert.deepEqual(resultados.periodosDoResultado(i, '2026-10-06'), { inicio: '2026-10-01', fim: '2026-10-06', anteriorInicio: '2026-09-25', anteriorFim: '2026-09-30' });
  assert.equal(resultados.temRecorte(i), false); i.contas = ['a']; assert.equal(resultados.temRecorte(i), true);
});
teste('arrastar datas preserva duração, produtos, execução e registro original', () => {
  const i = { ...m.novoItem('2026-12-29'), fim: '2027-01-02', titulo: 'Banner de virada', skus: ['A'] };
  i.detalhes.estrategia.execucoes = [{ ...estrategia.execucaoVazia('geral'), situacao: 'Executada', inicio: '2026-12-29', fim: '2027-01-02' }];
  const original = structuredClone(i);
  const movido = estudio.reagendar(i, '2028-02-27');
  assert.equal(movido.fim, '2028-03-02');
  assert.equal(m.diasEntre(movido.inicio, movido.fim), 4);
  assert.deepEqual(movido.detalhes, i.detalhes);
  assert.deepEqual(movido.skus, ['A']);
  assert.deepEqual(i, original);
  assert.equal(estudio.reagendar(i, '2026-02-29'), null);
  assert.equal(estudio.reagendar(i, '2100-12-30'), null);
  assert.equal(estudio.reagendar(m.novoItem('2026-10-01'), '2026-10-31').fim, '2026-10-31');
});
teste('nova ideia herda seleção da campanha sem copiar sua execução ou resultado', () => {
  const pai = { ...m.novoItem('2026-10-01', 'campanha'), id: 'pai', skus: ['SKU1'], canais: ['ml'], contas: ['conta-a'] };
  pai.detalhes.grupos = ['grupo-a'];
  pai.detalhes.estrategia.anuncios = ['anuncio-a'];
  pai.detalhes.estrategia.execucoes = [{ ...estrategia.execucaoVazia('geral') }];
  pai.detalhes.estrategia.medicao.valor = 42;
  const filha = estudio.acaoDaCampanha('2026-10-07', pai);
  assert.equal(filha.campanha_id, 'pai');
  assert.deepEqual(filha.skus, ['SKU1']);
  assert.deepEqual(filha.detalhes.estrategia.anuncios, ['anuncio-a']);
  assert.equal(filha.detalhes.estrategia.execucoes.length, 0);
  assert.equal(filha.detalhes.estrategia.medicao.valor, null);
  filha.skus.push('SKU2'); filha.detalhes.estrategia.anuncios.push('anuncio-b');
  assert.deepEqual(pai.skus, ['SKU1']);
  assert.deepEqual(pai.detalhes.estrategia.anuncios, ['anuncio-a']);
  assert.equal(estudio.acaoDaCampanha('2026-10-07', null).campanha_id, null);
});
teste('posições do mapa são opcionais e rejeitam coordenadas inválidas', () => {
  const i = m.novoItem('2026-10-01'); i.titulo = 'Posição salva';
  assert.equal(m.validarItem(i), null);
  i.detalhes.visual = { x: 490, y: 210, contexto: 'campanha-a' };
  i.detalhes.ordem = 1791330000000;
  assert.equal(m.validarItem(i), null);
  assert.deepEqual(JSON.parse(JSON.stringify(i)).detalhes.visual, i.detalhes.visual);
  for (const valor of [NaN, Infinity, -1, 6001]) {
    i.detalhes.visual.x = valor;
    assert.ok(m.validarItem(i));
  }
  i.detalhes.visual.x = 490; i.detalhes.ordem = Infinity;
  assert.ok(m.validarItem(i));
});
teste('roteiros de campanha mantêm as ações dentro do período, inclusive no fim do ano', () => {
  for (const modelo of estudio.MODELOS) {
    const fim = m.somarDias('2026-12-27', modelo.dias - 1);
    for (const acao of modelo.acoes) {
      const inicioAcao = m.somarDias('2026-12-27', acao.dia);
      const fimAcao = m.somarDias(inicioAcao, acao.dias - 1);
      assert.ok(inicioAcao >= '2026-12-27' && fimAcao <= fim);
      const i = { ...m.novoItem(inicioAcao), fim: fimAcao, titulo: acao.titulo, tipo: acao.tipo, etapa: acao.etapa };
      assert.equal(m.validarItem(i), null);
    }
  }
});
console.log(`${total} cenários de domínio aprovados.`);

// Opcional: Postgres local, sem acesso à base real.
if (process.argv.includes('--banco')) {
  const { PGlite } = await import('../output/planejamento-verificacao/node_modules/@electric-sql/pglite/dist/index.js');
  const db = new PGlite();
  const opA = '00000000-0000-0000-0000-000000000001', opB = '00000000-0000-0000-0000-000000000002';
  await db.exec(`create role authenticated; create table operacoes(id uuid primary key); insert into operacoes values ('${opA}'),('${opB}'); create function pode_ver_operacao(op uuid) returns boolean language sql stable as $$ select op::text = current_setting('test.operacao',true) $$; grant usage on schema public to authenticated;`);
  const sql = readFileSync(new URL('../db/26_planejamento.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql); // Reexecução não quebra a instalação.
  await db.exec(`set role authenticated; set test.operacao = '${opA}';`);
  const result = await db.query(`insert into planejamento_itens (operacao_id,natureza,titulo,inicio,fim,tipo) values ($1,'campanha','Teste isolado','2026-10-01','2026-10-30','Campanha') returning id,revisao`, [opA]);
  const id = result.rows[0].id;
  assert.equal(result.rows[0].revisao, 1);
  const editado = await db.query(`update planejamento_itens set titulo='Editado' where id=$1 and revisao=1 returning revisao`, [id]);
  assert.equal(editado.rows[0].revisao, 2);
  assert.equal((await db.query(`update planejamento_itens set titulo='Edição obsoleta' where id=$1 and revisao=1 returning id`, [id])).rows.length, 0);
  const detalheNovo = m.detalhesVazios();
  detalheNovo.estrategia.foco = 'Melhorar conversão';
  detalheNovo.estrategia.indicador = 'pedidos';
  detalheNovo.estrategia.alvo = 20;
  detalheNovo.estrategia.execucoes = [{ ...estrategia.execucaoVazia('geral'), situacao: 'Executada', inicio: '2026-10-01', fim: '2026-10-02' }];
  detalheNovo.estrategia.fechamento.proximoPasso = 'Preparar antes';
  detalheNovo.visual = { x: 720, y: 280, contexto: id };
  detalheNovo.ordem = 1791330000000;
  await db.query('update planejamento_itens set detalhes=$1::jsonb where id=$2', [JSON.stringify(detalheNovo), id]);
  assert.deepEqual((await db.query('select detalhes from planejamento_itens where id=$1', [id])).rows[0].detalhes, detalheNovo);
  await db.query(`insert into planejamento_itens (operacao_id,natureza,campanha_id,titulo,inicio,fim,tipo) values ($1,'acao',$2,'Banner','2026-10-02','2026-10-03','Banner')`, [opA,id]);
  await assert.rejects(db.query(`insert into planejamento_itens (operacao_id,natureza,titulo,inicio,fim,tipo) values ($1,'acao','Invasão','2026-10-02','2026-10-03','CRM')`,[opB]));
  await db.exec(`set test.operacao = '${opB}';`);
  assert.equal((await db.query('select * from planejamento_itens')).rows.length,0);
  assert.equal((await db.query(`update planejamento_itens set titulo='Invasão' where id=$1 returning id`,[id])).rows.length,0);
  await assert.rejects(db.query(`insert into planejamento_itens (operacao_id,natureza,campanha_id,titulo,inicio,fim,tipo) values ($1,'acao',$2,'Vínculo externo','2026-10-02','2026-10-03','CRM')`,[opB,id]));
  await db.exec(`set test.operacao = '${opA}';`);
  await assert.rejects(db.query(`update planejamento_itens set natureza='acao' where id=$1`,[id]));
  await assert.rejects(db.query(`update planejamento_itens set fim='2026-09-01' where id=$1`,[id]));
  await db.query(`delete from planejamento_itens where id=$1`,[id]);
  assert.equal((await db.query('select * from planejamento_itens')).rows.length,0);
  await db.close();
  console.log('OK Postgres: instalação idempotente, CRUD, revisões, datas, exclusão em cascata e isolamento entre operações.');
}
