import { corpoDemo, demoJson } from "./http";
import { updateDemoState, type DemoState } from "./store";
import { canaisDemo } from "./fixtures-base";
import { registrosGestaoFinanceiraDemo, contextoGestaoFinanceiraDemo, type RecursoGestaoFinanceiraDemo, type RegistroGestaoFinanceiraDemo } from "./fixtures-gestao-financeira";

type Campo = { tipo:"texto"|"numero"|"inteiro"|"data"|"booleano"|"uuid"|"enum"; obrigatorio?:boolean; max?:number; valores?:readonly string[] };
const texto:Campo={tipo:"texto"},data:Campo={tipo:"data"},uuid:Campo={tipo:"uuid"},booleano:Campo={tipo:"booleano"},dinheiro:Campo={tipo:"numero",max:1_000_000};
const tipo:Campo={tipo:"enum",valores:["entrada","saida"],obrigatorio:true};
const periodicidade:Campo={tipo:"enum",valores:["unica","mensal","bimestral","trimestral","semestral","anual"]};
const status:Campo={tipo:"enum",valores:["previsto","em_aberto","pago","atrasado","cancelado"]};
const CAMPOS:Record<RecursoGestaoFinanceiraDemo,Record<string,Campo>>={
  categorias:{nome:{...texto,obrigatorio:true},tipo,grupo:texto,variavel:booleano,ordem:{tipo:"inteiro",max:999},descricao:texto,ativa:booleano,corSerie:{tipo:"inteiro",max:10}},
  fornecedores:{razaoSocial:{...texto,obrigatorio:true},nomeFantasia:texto,cnpj:texto,categoriaId:uuid,contatoNome:texto,contatoEmail:texto,contatoTelefone:texto,condicaoPagamento:texto,diaVencimento:{tipo:"inteiro",max:31},observacao:texto,ativo:booleano},
  funcionarios:{nome:{...texto,obrigatorio:true},cargo:texto,setor:texto,admissao:data,demissao:data,salarioBase:dinheiro,salarioLiquido:dinheiro,beneficios:dinheiro,encargos:dinheiro,diaPagamento:{tipo:"inteiro",max:31},periodicidade,categoriaId:uuid,observacao:texto,ativo:booleano},
  contas:{tipo,categoriaId:uuid,fornecedorId:uuid,funcionarioId:uuid,canalId:uuid,descricao:{...texto,obrigatorio:true},documento:texto,valor:{tipo:"numero",max:100_000_000,obrigatorio:true},competencia:{...data,obrigatorio:true},vencimento:data,pagamento:data,status,formaPagamento:texto,periodicidade,recorrenciaFim:data,observacao:texto},
  folha:{funcionarioId:{...uuid,obrigatorio:true},competencia:{...data,obrigatorio:true},salarioBase:dinheiro,salarioLiquido:dinheiro,beneficios:dinheiro,encargos:dinheiro,descontos:dinheiro,vencimento:data,pagamento:data,status,observacao:texto},
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type EstadoGestao=DemoState&{cadastros?:Record<string,unknown[]>};
const numero=(v:unknown)=>Number(v)||0;

function normalizar(recurso:RecursoGestaoFinanceiraDemo,dados:Record<string,unknown>,parcial:boolean) {
  const registro:Record<string,unknown>={},erros:{campo:string;motivo:string}[]=[];
  for(const [chave,campo] of Object.entries(CAMPOS[recurso])) {
    if(!(chave in dados)){if(campo.obrigatorio&&!parcial)erros.push({campo:chave,motivo:"obrigatório"});continue;}
    let v=dados[chave];if(typeof v==="string")v=v.trim();if(v===""||v===undefined)v=null;
    if(v===null){if(campo.obrigatorio)erros.push({campo:chave,motivo:"não pode ficar vazio"});else registro[chave]=null;continue;}
    if(campo.tipo==="texto"){registro[chave]=String(v).slice(0,4000);continue;}
    if(campo.tipo==="numero"||campo.tipo==="inteiro") {const n=typeof v==="number"?v:Number(String(v).replace(",","."));if(!Number.isFinite(n)||n<0||(campo.max!=null&&n>campo.max))erros.push({campo:chave,motivo:"número inválido ou fora do limite"});else registro[chave]=campo.tipo==="inteiro"?Math.round(n):n;continue;}
    if(campo.tipo==="booleano"){registro[chave]=v===true||v==="true"||v===1;continue;}
    if(campo.tipo==="uuid"){if(!UUID.test(String(v)))erros.push({campo:chave,motivo:"referência inválida"});else registro[chave]=String(v);continue;}
    if(campo.tipo==="enum"){if(!campo.valores?.includes(String(v)))erros.push({campo:chave,motivo:"valor não permitido"});else registro[chave]=String(v);continue;}
    const s=String(v).slice(0,10),[a,m,d]=s.split("-").map(Number),dia=new Date(Date.UTC(a,m-1,d));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||dia.getUTCFullYear()!==a||dia.getUTCMonth()!==m-1||dia.getUTCDate()!==d)erros.push({campo:chave,motivo:"data inválida"});else registro[chave]=s;
  }
  return{registro,erros};
}

function completar(recurso:RecursoGestaoFinanceiraDemo,r:RegistroGestaoFinanceiraDemo):RegistroGestaoFinanceiraDemo {
  const n=(chave:string)=>numero(r[chave]);
  if(recurso==="categorias")return{grupo:null,descricao:null,corSerie:null,ordem:100,ativa:true,variavel:false,...r};
  if(recurso==="fornecedores")return{nomeFantasia:null,cnpj:null,categoriaId:null,contatoNome:null,contatoEmail:null,contatoTelefone:null,condicaoPagamento:null,diaVencimento:null,observacao:null,ativo:true,totalLancado:0,contasAbertas:0,...r};
  if(recurso==="funcionarios")return{cargo:null,setor:null,admissao:null,demissao:null,salarioBase:0,salarioLiquido:null,beneficios:0,encargos:0,diaPagamento:null,periodicidade:"mensal",categoriaId:null,observacao:null,ativo:true,...r,custoMensal:n("salarioBase")+n("beneficios")+n("encargos")};
  if(recurso==="folha")return{salarioBase:0,salarioLiquido:null,beneficios:0,encargos:0,descontos:0,vencimento:null,pagamento:null,status:"em_aberto",observacao:null,...r,custoTotal:n("salarioBase")+n("beneficios")+n("encargos")};
  return{categoriaId:null,fornecedorId:null,funcionarioId:null,canalId:null,documento:null,vencimento:null,pagamento:null,status:"em_aberto",formaPagamento:null,periodicidade:"unica",recorrenciaFim:null,origemRecorrenciaId:null,observacao:null,...r};
}

function dadosDaResposta(recurso:RecursoGestaoFinanceiraDemo,r:RegistroGestaoFinanceiraDemo) {
  const custom:Record<string,string>={beneficios:recurso==="funcionarios"?"beneficios_padrao":"beneficios",encargos:recurso==="funcionarios"?"encargos_padrao":"encargos"};
  return Object.fromEntries(Object.entries(r).filter(([k])=>k==="id"||k in CAMPOS[recurso]||k==="origemRecorrenciaId").map(([k,v])=>[custom[k]??k.replace(/[A-Z]/g,l=>"_"+l.toLowerCase()),v]));
}

function futuras(conta:RegistroGestaoFinanceiraDemo) {
  const passo:Record<string,number>={mensal:1,bimestral:2,trimestral:3,semestral:6,anual:12};
  const meses=passo[String(conta.periodicidade)];if(!meses)return[];
  const [a0,m0]=String(conta.competencia).split("-").map(Number),diaVenc=conta.vencimento?Number(String(conta.vencimento).slice(8,10)):null;
  const out:RegistroGestaoFinanceiraDemo[]=[];
  for(let i=1;i<=36;i++) {
    const total=m0-1+meses*i,ano=a0+Math.floor(total/12),mes=total%12+1,competencia=`${ano}-${String(mes).padStart(2,"0")}-01`;
    if(conta.recorrenciaFim&&competencia>String(conta.recorrenciaFim))break;
    const vencimento=diaVenc?`${ano}-${String(mes).padStart(2,"0")}-${String(Math.min(diaVenc,new Date(Date.UTC(ano,mes,0)).getUTCDate())).padStart(2,"0")}`:null;
    out.push({...conta,id:crypto.randomUUID(),competencia,vencimento,status:"previsto",pagamento:null,periodicidade:"unica",recorrenciaFim:null,origemRecorrenciaId:conta.id});
  }
  return out;
}

/** Contrato dos formulários reais, com gravação apenas no cenário desta aba. */
export async function apiGestaoFinanceiraDemo(req:Request):Promise<Response|null> {
  const url=new URL(req.url);if(!url.pathname.startsWith("/api/cadastros/"))return null;
  const nome=url.pathname.slice("/api/cadastros/".length);if(!(nome in CAMPOS))return null;
  const recurso=nome as RecursoGestaoFinanceiraDemo;
  const atuais=registrosGestaoFinanceiraDemo(recurso);
  if(req.method==="GET")return demoJson({linhas:atuais});
  if(req.method==="DELETE") {
    const id=url.searchParams.get("id");if(!id)return demoJson({erro:"Informe o registro."},400);
    if(!atuais.some(r=>r.id===id))return demoJson({erro:"Registro do exemplo não encontrado."},404);
    updateDemoState((original)=>{
      const s=original as EstadoGestao;s.cadastros??={};s.cadastros[recurso]=atuais.filter(r=>r.id!==id);
      const mudar=(r:RecursoGestaoFinanceiraDemo,fn:(linha:RegistroGestaoFinanceiraDemo)=>RegistroGestaoFinanceiraDemo|null)=>{s.cadastros![r]=registrosGestaoFinanceiraDemo(r,s).map(fn).filter(Boolean);};
      if(recurso==="categorias")for(const r of ["fornecedores","funcionarios","contas"] as const)mudar(r,l=>l.categoriaId===id?{...l,categoriaId:null}:l);
      if(recurso==="fornecedores")mudar("contas",l=>l.fornecedorId===id?{...l,fornecedorId:null}:l);
      if(recurso==="funcionarios"){mudar("contas",l=>l.funcionarioId===id?{...l,funcionarioId:null}:l);mudar("folha",l=>l.funcionarioId===id?null:l);}
      if(recurso==="contas")mudar("contas",l=>l.origemRecorrenciaId!==id?l:url.searchParams.get("filhas")==="1"&&l.status!=="pago"?null:{...l,origemRecorrenciaId:null});
    });
    return demoJson({apagado:id});
  }
  if(req.method!=="POST")return demoJson({erro:"Método não disponível neste cadastro."},405);
  const corpo=await corpoDemo(req);const editando=typeof corpo.id==="string"&&!!corpo.id;
  const anterior=editando?atuais.find(r=>r.id===corpo.id):undefined;
  if(editando&&!anterior)return demoJson({erro:"Registro do exemplo não encontrado."},404);
  if(!corpo.dados||typeof corpo.dados!=="object"||Array.isArray(corpo.dados))return demoJson({erro:"Dados inválidos."},400);
  const {registro,erros}=normalizar(recurso,corpo.dados as Record<string,unknown>,editando);
  if(erros.length)return demoJson({erro:"Confira os campos indicados.",campos:erros},400);
  if(!Object.keys(registro).length)return demoJson({erro:"Nada para gravar."},400);
  const gravado=completar(recurso,{...anterior,...registro,id:anterior?.id??crypto.randomUUID()});
  const contexto=contextoGestaoFinanceiraDemo();
  const referencias:Record<string,readonly {id:string}[]>={categoriaId:contexto.categorias,fornecedorId:contexto.fornecedores,funcionarioId:contexto.funcionarios,canalId:canaisDemo};
  for(const [campo,linhas]of Object.entries(referencias))if(gravado[campo]&&!linhas.some(l=>l.id===gravado[campo]))return demoJson({erro:"Escolha uma referência disponível no cenário fictício.",campos:[{campo,motivo:"referência do exemplo não encontrada"}]},400);
  if(["contas","folha"].includes(recurso)&&gravado.status==="pago"&&!gravado.pagamento)return demoJson({erro:"Informe a data do pagamento.",campos:[{campo:"pagamento",motivo:"obrigatório para uma conta paga"}]},400);
  if(recurso==="categorias"&&atuais.some(r=>r.id!==gravado.id&&String(r.nome).toLocaleLowerCase("pt-BR")===String(gravado.nome).toLocaleLowerCase("pt-BR")))return demoJson({erro:"Já existe uma categoria com esse nome no exemplo."},409);
  const filhas=recurso==="contas"&&corpo.replicar===true&&!editando?futuras(gravado):[];
  updateDemoState(original=>{const s=original as EstadoGestao;s.cadastros??={};s.cadastros[recurso]=[...atuais.filter(r=>r.id!==gravado.id),gravado,...filhas];});
  return demoJson({registro:dadosDaResposta(recurso,gravado),replicadas:filhas.length});
}
