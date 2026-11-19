import { DEMO_EMPRESA, DEMO_HOJE, DEMO_OPERACAO, DEMO_SINCRONIZADO, canaisDemo, contasDemo, movimentosDemo, produtosDemo, mlbDemo, somarDiasDemo, moedaDemo, precoAtualProdutoDemo } from "./fixtures-base";
import { serieQuedaDemo } from "./fixtures-vendas";
import { corpoDemo, demoJson } from "./http";
import { getDemoState, updateDemoState } from "./store";
import { apiPromocoesDemo } from "./api-promocoes";
import { apiFinanceiroPlanejamento } from "./api-financeiro-planejamento";
import { pedidosCanceladosDemo } from "./fixtures-cancelamentos";
import { respostaConversarDemo } from "./conversa-cenario";
import { apiAnunciosExtraDemo } from "./api-anuncios-extra";
import { apiGestaoFinanceiraDemo } from "./api-gestao-financeira";
import { apiVendasDemo } from "./api-vendas";

/** O transporte local da demonstração não tem caminho de retorno à rede. */
export async function gerizoDemoRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? new Request(input, init) : new Request(new URL(String(input), "https://demo.gerizo.local"), init);
  if (req.signal.aborted) throw new DOMException("Operação cancelada", "AbortError");
  const url = new URL(req.url), path = url.pathname;
  const anuncios = await apiAnunciosExtraDemo(req.clone()); if (anuncios) return anuncios;
  const gestao = await apiGestaoFinanceiraDemo(req.clone()); if (gestao) return gestao;
  const vendas = await apiVendasDemo(req.clone()); if (vendas) return vendas;
  const promocao = await apiPromocoesDemo(req.clone()); if (promocao) return promocao;
  const financeiro = await apiFinanceiroPlanejamento(req.clone()); if (financeiro) return financeiro;
  if (path === "/api/operacao") { const op = { id: DEMO_OPERACAO, nome: "Operação principal", empresa: DEMO_EMPRESA, organizacaoId: "d9000000-0000-4000-8000-000000000001", canais: canaisDemo.length }; return demoJson({ ...op, operacoes: [op] }); }
  if (path === "/api/cancelamentos/pedidos") return demoJson(pedidosCanceladosDemo(url.searchParams));
  if (path === "/api/alertas/resumo") return demoJson({ total: 3, criticos: 1 });
  if (path === "/api/atualizar") return demoJson({ operacao: { id: DEMO_OPERACAO, nome: DEMO_EMPRESA }, pedido: req.method === "POST" ? { id:"atualizacao-demo",ativo:false,estado:"concluido",etapas:[],criadoEm:DEMO_SINCRONIZADO,terminadoEm:DEMO_SINCRONIZADO } : null, ultima: {}, demo: true });
  if (path === "/api/anuncios/fotos") return demoJson({ fotos: {} });
  if (path === "/api/queda") {
    const chave = url.searchParams.get("chave") ?? url.searchParams.get("sku") ?? produtosDemo[0].sku;
    const sku = chave.startsWith("p:") ? chave.slice(2) : produtosDemo.find((p,i)=>chave.includes(mlbDemo(i)) || chave.includes(p.sku))?.sku ?? produtosDemo[0].sku;
    return demoJson({ dias: serieQuedaDemo(sku), anuncios: [] });
  }
  if (path.startsWith("/api/anuncios/sku/")) return demoJson(raioX(decodeURIComponent(path.split("/").at(-1)!)));
  if (path.startsWith("/api/exportar/")) {
    const linhas = [["SKU", "Produto", "Preço"], ...produtosDemo.map(p=>[p.sku,p.titulo,p.preco])];
    const csv = "\uFEFF" + linhas.map(l=>l.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(";")).join("\r\n");
    return new Response(csv,{headers:{"content-type":"text/csv;charset=utf-8","content-disposition":'attachment; filename="gerizo-demonstracao.csv"',"x-gerizo-demo":"local"}});
  }
  if (path === "/api/envios/etiquetas") return etiquetasDemo(await corpoDemo(req));
  if (path === "/api/conversa") {
    const corpo = await corpoDemo(req); const mensagens = Array.isArray(corpo.mensagens) ? corpo.mensagens as { content?: string }[] : [];
    const pergunta = mensagens.at(-1)?.content?.toLocaleLowerCase("pt-BR") ?? "";
    const texto = respostaConversarDemo(pergunta);
    const eventos = [{tipo:"texto",texto},{tipo:"fim"}].map(e=>"data: "+JSON.stringify(e)+"\n\n").join("");
    return new Response(eventos,{headers:{"content-type":"text/event-stream","x-gerizo-demo":"local"}});
  }
  return demoJson({ erro: "Esta ação não está incluída nesta demonstração. Nenhuma informação foi enviada à operação real.", demo: true }, 501);
}

function raioX(sku: string) {
  const p = produtosDemo.find(p=>p.sku===sku) ?? produtosDemo[0];
  const mov = movimentosDemo.filter(m=>m.sku===p.sku);
  const segunda = (data: string) => { const dia = new Date(data + "T12:00:00Z"); return somarDiasDemo(data, -((dia.getUTCDay() + 6) % 7)); };
  const semana = (inicio:string) => { const fim = somarDiasDemo(inicio, 6), linhas=mov.filter(m=>m.data>=inicio&&m.data<=fim),unidades=linhas.reduce((s,m)=>s+m.quantidade,0),receita=moedaDemo(linhas.reduce((s,m)=>s+m.receita,0));return{inicio,fim,rotulo:`${inicio.slice(8)}/${inicio.slice(5,7)} a ${fim.slice(8)}/${fim.slice(5,7)}`,unidades,receita,precoMedio:unidades?moedaDemo(receita/unidades):0}; };
  const semanas = [...new Set(mov.filter(m=>m.quantidade>0).map(m=>segunda(m.data)))].sort().map(semana);
  const ultima = semanas.at(-1) ?? null;
  const recorde = semanas.reduce<typeof ultima>((melhor, atual) => !melhor || atual.unidades > melhor.unidades || (atual.unidades === melhor.unidades && atual.receita > melhor.receita) ? atual : melhor, null);
  const inicioAtual = segunda(DEMO_HOJE), inicioGiro = somarDiasDemo(inicioAtual, -28);
  const giroDiario = mov.filter(m=>m.data>=inicioGiro&&m.data<inicioAtual).reduce((s,m)=>s+m.quantidade,0)/28;
  return {sku:p.sku,titulo:p.titulo,lidoEm:DEMO_SINCRONIZADO,recorde:{sku:p.sku,ultima,recorde,semanasComVenda:semanas.length,desde:mov.find(m=>m.quantidade>0)?.data??null},estoque:{saldo:p.estoque,leituras:[{id:p.id,origem:"Depósito demonstrativo",local:"Principal",disponivel:p.estoque,consultadoEm:DEMO_SINCRONIZADO}],erroLeitura:false,sobEncomenda:0,giroDiario,diasDeCobertura:giroDiario?p.estoque/giroDiario:null,zerados:0},anuncios:contasDemo.map(c=>({mlb:mlbDemo(produtosDemo.indexOf(p)),titulo:p.titulo,tipo:p.tipo,status:"ativo",conta:c.nome,logistica:"cross_docking",estoque:p.estoque,precoCheio:p.preco,precoDeVenda:{preco:precoAtualProdutoDemo(p.sku),data:DEMO_HOJE},catalogo:null}))};
}

async function etiquetasDemo(corpo: Record<string, unknown>) {
  const ids = Array.isArray(corpo.envios) ? corpo.envios.map(String) : [];
  if (!ids.length || corpo.confirmar !== true) return demoJson({erro:"Selecione os pedidos e confirme a geração dos documentos."},400);
  const {PDFDocument,StandardFonts,rgb}=await import("pdf-lib");const pdf=await PDFDocument.create();const fonte=await pdf.embedFont(StandardFonts.Helvetica);
  for(const id of ids){const pagina=pdf.addPage([420,595]);pagina.drawText("GERIZO — DEMONSTRACAO",{x:32,y:550,size:18,font:fonte,color:rgb(.35,.2,.65)});pagina.drawText("EXEMPLO SEM VALIDADE FISCAL",{x:32,y:520,size:12,font:fonte});pagina.drawText("Envio ficticio: "+id,{x:32,y:475,size:13,font:fonte});pagina.drawText("Lista de separacao do cenario Atlas Casa",{x:32,y:445,size:12,font:fonte});produtosDemo.slice(0,2).forEach((p,i)=>pagina.drawText(p.sku+" — "+p.titulo,{x:32,y:400-i*27,size:11,font:fonte}));}
  updateDemoState(s=>{s.enviosImpressos=[...new Set([...s.enviosImpressos,...ids])];});
  return new Response(new Uint8Array(await pdf.save()),{headers:{"content-type":"application/pdf","content-disposition":'inline; filename="gerizo-demonstracao.pdf"',"x-falhas":"%5B%5D","x-gerizo-demo":"local"}});
}
