import { corpoDemo, demoJson } from "./http";
import { getDemoState, updateDemoState } from "./store";
import { produtosDemo, DEMO_OPERACAO, DEMO_SINCRONIZADO } from "./fixtures-base";
import { planejamentoDemo } from "./fixtures-planejamento";
import { faixasFreteDemo, despesasDemo } from "./fixtures-financeiro";

const id = () => crypto.randomUUID();
const registros = (v:unknown):Record<string,unknown>[] => Array.isArray(v) ? v.filter((r):r is Record<string,unknown>=>!!r&&typeof r==="object") : [];

export async function apiFinanceiroPlanejamento(req:Request):Promise<Response|null> {
  const url=new URL(req.url),path=url.pathname;
  if(!path.startsWith("/api/custos")&&path!=="/api/planejamento"&&path!=="/api/precificacao/frete"&&path!=="/api/comissoes-canal")return null;
  if(path==="/api/precificacao/frete") { const p=produtosDemo.find((p,i)=>url.searchParams.get("item")?.endsWith(String(i+1).padStart(2,"0")))??produtosDemo[0];return demoJson({frete:p.peso>20?44.9:p.peso>5?28.9:16.9,origem:"Cenário fictício",demo:true}); }
  if(path==="/api/custos/planilha"&&req.method==="GET") {
    const ExcelJS=await import("exceljs");const livro=new ExcelJS.default.Workbook();const aba=livro.addWorksheet("Custos");aba.addRow(["SKU","Produto","Custo mercadoria","Embalagem","Imposto %","Peso kg"]);produtosDemo.forEach(p=>aba.addRow([p.sku,p.titulo,p.custo,p.embalagem,6,p.peso]));aba.columns.forEach(c=>{c.width=24;});return new Response(new Uint8Array(await livro.xlsx.writeBuffer()),{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":'attachment; filename="custos-gerizo-demonstracao.xlsx"'}});
  }
  const corpo=await corpoDemo(req);
  if(path==="/api/custos") {
    const edicoes=registros(corpo.edicoes);if(!edicoes.length)return demoJson({erro:"Nenhum custo alterado."},400);
    const permitidos=["custoMercadoria","embalagem","freteUnitario","aliquotaImpostos","pesoKg","margemMinimaPct"];
    for(const e of edicoes)if(!produtosDemo.some(p=>p.id===e.produtoId)||permitidos.some(k=>k in e&&e[k]!==null&&(typeof e[k]!=="number"||!Number.isFinite(e[k])||Number(e[k])<0)))return demoJson({erro:"Confira os valores dos custos do exemplo."},400);
    updateDemoState(s=>{for(const e of edicoes){const chave=String(e.produtoId);s.custos[chave]={...s.custos[chave],...Object.fromEntries(permitidos.filter(k=>k in e).map(k=>[k,e[k]]))};}});return demoJson({ok:true,gravados:edicoes.length});
  }
  if(path==="/api/custos/faixas") { const faixas=registros(corpo.faixas);if(faixas.some(f=>Number(f.pesoMax)<=Number(f.pesoMin)||Number(f.valor)<0))return demoJson({erro:"Confira os pesos e valores das faixas."},400);const apagar=Array.isArray(corpo.apagar)?corpo.apagar:[];updateDemoState(s=>{s.faixasFrete=faixas.filter(f=>!apagar.includes(f.id)).map(f=>({...f,id:f.id||id()}));});return demoJson({ok:true}); }
  if(path==="/api/custos/canal") { const apagar=Array.isArray(corpo.apagar)?corpo.apagar:[];const novas=registros(corpo.despesas).map(d=>({...d,id:d.id||id()}));updateDemoState(s=>{s.despesasCanal=[...(s.despesasCanal??despesasDemo).filter(d=>!apagar.includes((d as {id:string}).id)),...novas];});return demoJson({ok:true}); }
  if(path==="/api/custos/produto"&&corpo.acao==="abastecer")return demoJson({criados:0,ligados:0});
  if(path==="/api/custos/planilha"&&req.method==="POST") {
    const arquivo=corpo.arquivo;if(!(arquivo instanceof File))return demoJson({erro:"Selecione uma planilha XLSX."},400);
    try { const ExcelJS=await import("exceljs");const livro=new ExcelJS.default.Workbook();await livro.xlsx.load(await arquivo.arrayBuffer());const aba=livro.worksheets[0];if(!aba)return demoJson({erro:"Planilha vazia."},400);const edicoes:Record<string,unknown>[]=[];aba.eachRow((row,n)=>{if(n===1)return;const p=produtosDemo.find(p=>p.sku===String(row.getCell(1).text).trim());if(!p)return;const custo=Number(row.getCell(3).value),embalagem=Number(row.getCell(4).value),imposto=Number(row.getCell(5).value),peso=Number(row.getCell(6).value);if([custo,embalagem,imposto,peso].every(Number.isFinite)&&[custo,embalagem,imposto,peso].every(v=>v>=0))edicoes.push({produtoId:p.id,custoMercadoria:custo,embalagem,aliquotaImpostos:imposto,pesoKg:peso});});if(!edicoes.length)return demoJson({erro:"Use a planilha do exemplo e os SKUs do cenário fictício."},400);updateDemoState(s=>{edicoes.forEach(e=>{const k=String(e.produtoId);s.custos[k]={...s.custos[k],...e};});});return demoJson({gravados:edicoes.length,atualizados:edicoes.length,criados:0,lidos:edicoes.length}); }catch{return demoJson({erro:"Não foi possível ler a planilha. Use um arquivo XLSX do exemplo."},400);}
  }
  if(path==="/api/comissoes-canal") {if(req.method==="GET")return demoJson(getDemoState().comissoes);updateDemoState(s=>{s.comissoes=registros(corpo.taxas??corpo.comissoes??corpo.linhas);});return demoJson({ok:true});}
  if(path==="/api/planejamento") {
    const entidade=String(corpo.entidade);if(!["item","grupo","tipo"].includes(entidade)||!corpo.registro||typeof corpo.registro!=="object")return demoJson({erro:"Registro inválido."},400);
    const chave=entidade==="item"?"itens":entidade==="grupo"?"grupos":"tipos";const recebido=corpo.registro as Record<string,unknown>;const registro={...recebido,id:recebido.id||id(),operacao_id:DEMO_OPERACAO,atualizado_em:DEMO_SINCRONIZADO,revisao:Number(recebido.revisao??0)+1};
    updateDemoState(s=>{const atuais=(s.planejamento[chave]??planejamentoDemo[chave]) as Record<string,unknown>[];s.planejamento[chave]=req.method==="DELETE"?atuais.filter(r=>r.id!==recebido.id&&(entidade!=="item"||r.campanha_id!==recebido.id)):[...atuais.filter(r=>r.id!==registro.id),registro];});return demoJson(req.method==="DELETE"?{ok:true}:{registro});
  }
  return demoJson({erro:"Esta ação de cadastro está fora do cenário deste tour."},400);
}
