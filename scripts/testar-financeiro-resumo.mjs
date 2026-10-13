import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createJiti} from '../node_modules/jiti/lib/jiti.mjs';
import {resumirCustosConhecidos,receitasFinanceiras} from '../src/lib/financeiro-resumo.ts';
import {precoDaMargem} from '../src/lib/planilhas/motor-promocoes.ts';
const itens=[{receita:100,comissao:15,frete:0,juros:0,impostos:null,embalagem:null,mercadoria:null},{receita:300,comissao:45,frete:20,juros:0,impostos:30,embalagem:2,mercadoria:100}];
const r=resumirCustosConhecidos(itens);
assert.equal(r.comissao.valor,60);assert.equal(r.comissao.cobertura,100);
assert.equal(r.frete.valor,20);assert.equal(r.frete.cobertura,100,'Frete zero informado continua conhecido');
assert.equal(r.impostos.valor,30);assert.equal(r.impostos.cobertura,75);
assert.equal(resumirCustosConhecidos([itens[0]]).mercadoria.valor,null,'Custo ausente não é zero');
assert.deepEqual(receitasFinanceiras(400,50),{receitaBruta:450,receitaLiquida:400},'Cancelamento deduzido apenas uma vez');
const custo={mercadoria:70,embalagem:0,frete:0,impostoPct:0};
const base={custos:new Map([['A',custo]]),regra:{modo:'margem',comoUsar:'piso',margemMinima:20}};
assert.equal(precoDaMargem(base,'A',0.1),100,'Sem preferência herda a margem da campanha');
custo.margemMinimaPct=0;
assert.equal(precoDaMargem(base,'A',0.1),77.78,'Margem zero é uma escolha válida');
custo.margemMinimaPct=30;
assert.equal(precoDaMargem(base,'A',0.1),116.67,'Preferência por SKU substitui a da campanha');
const pasta=await mkdtemp(path.join(tmpdir(),'gerizo-resumo-financeiro-'));
try {
  const raiz=fileURLToPath(new URL('../',import.meta.url));
  const stub=path.join(pasta,'sem-banco.cjs');
  await writeFile(stub,"exports.clienteServidor=async()=>{throw new Error('Esta regressão não deve consultar o banco')};");
  const jiti=createJiti(import.meta.url,{moduleCache:false,alias:{'@':path.join(raiz,'src'),'server-only':stub,'@/lib/supabase/servidor':stub}});
  const {agregar}=await jiti.import(path.join(raiz,'src/lib/dados/margem.ts'));
  const identificacao={data:'2026-10-01',sku:'A',mlb:'MLA',canalId:'a',contaCanalId:'a',quantidade:1,comissaoOrigem:'praticado',freteOrigem:'praticado'};
  const baseMargem={itens:[
    {...identificacao,...itens[0],completo:false,margem:null},
    {...identificacao,...itens[1],completo:true,margem:103},
    {...identificacao,data:'2026-11-16',sku:'B',mlb:'MLB',canalId:'b',contaCanalId:'b',...itens[0],comissao:null,completo:false,margem:null},
  ],nomeCanal:new Map([['a','Canal A'],['b','Canal B']]),nomeConta:new Map([['a','Conta A'],['b','Conta B']])};
  for(const dimensao of ['mes','semana','canal','conta','sku','anuncio']) {
    const linhas=agregar(baseMargem,dimensao,{incluirCustosConhecidos:true});
    assert.equal(linhas.length,2,`Grupos separados por ${dimensao}`);
    const parcial=linhas.find(l=>l.receita===400);
    assert.equal(parcial.custosConhecidos.comissao.valor,60,'Comissão inclui itens sem custo de mercadoria');
    assert.equal(parcial.custosConhecidos.frete.valor,20);
    assert.equal(parcial.custosConhecidos.mercadoria.cobertura,75);
    assert.equal(parcial.comissao,45,'Cálculo legado da margem só inclui custos de itens completos');
    assert.equal(parcial.margem,103);
    assert.equal(parcial.cobertura,75);
    const ausente=linhas.find(l=>l.receita===100);
    assert.equal(ausente.custosConhecidos.comissao.valor,null);
    assert.equal(ausente.custosConhecidos.frete.valor,0,'Frete zero conhecido não desaparece');
    assert.equal(ausente.margem,null,'Custos conhecidos não inventam margem completa');
  }
  assert.equal(agregar(baseMargem,'sku')[0].custosConhecidos,undefined,'Outras análises preservam seu contrato');
} finally {
  if(path.dirname(pasta)===path.resolve(tmpdir())&&path.basename(pasta).startsWith('gerizo-resumo-financeiro-'))await rm(pasta,{recursive:true,force:true});
}
console.log('OK: custos conhecidos por seis dimensões, cobertura, zero versus ausência, cancelamento único e margem opcional por produto.');
