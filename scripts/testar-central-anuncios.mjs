import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

// Executa os módulos de produção; não copia a regra para dentro do teste.
const pasta=mkdtempSync(join(tmpdir(),'gerizo-central-'));
try {
  for (const nome of ['analise','central-anuncios']) writeFileSync(join(pasta,`${nome}.js`),ts.transpileModule(readFileSync(new URL(`../src/lib/${nome}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
  const {prepararAnuncios,pertenceFila,resumoAnuncios,sinalAnuncio}=createRequire(import.meta.url)(join(pasta,'central-anuncios.js'));
  const semana={semana:'S44/26',intervalo:'26/10 – 01/11',visitas:100,vendas:4,receita:400,precoAnunciado:null,precoRealizado:100,precoIdeal:120,comissao:16,tarifaCobrada:null,dias:[],campanhas:[]};
  const anuncio=(mlb,semanas=[],extra={})=>({mlb,sku:'SKU',titulo:'Produto',tipo:'Clássico',status:'ativo',conta:'A',categoria:'Produto',estoque:null,precoAtual:110,semanas,...extra});
  const entrada=[anuncio('MLB1',[semana]),anuncio('MLB2',[{...semana,visitas:200,vendas:0,receita:0,precoRealizado:null}],{estoque:0}),anuncio('MLB3',[],{precoReferencia:120}),anuncio('MLB4',[],{status:'pausado',estoque:0}),anuncio('MLB5',[{...semana,semana:'S1/25'}])];
  const antes=structuredClone(entrada);
  const itens=prepararAnuncios(entrada,['S44/26']);
  const porId=new Map(itens.map(a=>[a.mlb,a]));
  assert.equal(itens.length,5,'Cadastro sem histórico permanece pesquisável');
  assert.equal(porId.get('MLB3').semanas.length,0);
  assert.equal(porId.get('MLB5').semanas.length,0,'Dado de outro período não entra no recorte');
  assert.equal(porId.get('MLB1').metricas.precoVitrine,null,'Preço pago não vira preço de vitrine');
  assert.equal(porId.get('MLB1').metricas.precoPraticado,100);
  assert.equal(pertenceFila(porId.get('MLB3'),'sem_tabela'),false,'Referência do cadastro é válida sem histórico');
  assert.equal(pertenceFila(porId.get('MLB3'),'sem_historico'),true);
  assert.equal(pertenceFila(porId.get('MLB2'),'estoque'),true);
  assert.equal(pertenceFila(porId.get('MLB4'),'estoque'),false,'Fila de ruptura é só para ativos');
  assert.equal(sinalAnuncio(porId.get('MLB4')).texto,'Pausado');
  assert.equal(sinalAnuncio(porId.get('MLB3')).texto,'Sem histórico');
  const semAusentes=prepararAnuncios(entrada.slice(0,2),['S44/26']);
  assert.deepEqual(porId.get('MLB1').lentes,semAusentes[0].lentes,'Ausência de coleta não dilui a média da carteira');
  assert.deepEqual(resumoAnuncios(itens),{receita:400,vendas:4,visitas:300,medidos:2,conversao:4/300*100});
  assert.equal(resumoAnuncios([porId.get('MLB3')]).conversao,null);
  assert.equal(resumoAnuncios(prepararAnuncios(entrada,[])).medidos,0);
  assert.deepEqual(entrada,antes,'Análise não altera os dados de entrada');
  console.log('Central de anúncios: cadastro, período, ausências, preços, filtros e totais aprovados.');
} finally {
  if (resolve(pasta).startsWith(resolve(tmpdir())+sep) && pasta.includes('gerizo-central-')) rmSync(pasta,{recursive:true,force:true});
}
