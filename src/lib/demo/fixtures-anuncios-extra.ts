import type { DadosCatalogo } from "@/lib/dados/catalogo";
import type { DadosDisputa, LinhaDisputa, SituacaoDisputa } from "@/lib/dados/disputa-catalogo";
import type { DadosPerformancePreco, FaixaPreco, LinhaPreco } from "@/lib/dados/performance-preco";
import type { ComissaoCanal, DadosPrecoAlvo } from "@/lib/dados/preco-alvo";
import type { DadosTipo, ParSku, ResumoTipo } from "@/lib/dados/tipo-anuncio";
import type { DadosPrecos } from "@/lib/dados/precos-praticados";
import type { ItemCatalogo, TipoAnuncio } from "@/mock/catalogo";
import { margemDoPreco } from "@/lib/dados/formula-preco";
import type { DemoState } from "./store";
import { DEMO_HOJE, DEMO_INICIO, DEMO_SINCRONIZADO, canaisDemo, contasDemo, diasDemo, mlbDemo, moedaDemo, movimentosDemo, produtosDemo, somarDiasDemo, type MovimentoDemo } from "./fixtures-base";

export type EstadoAnunciosExtraDemo = DemoState & { anunciosExtras?: { precos?: Record<string, number>; sincronizadoEm?: string; visitasAtualizadas?: string; comissoesConfiguradas?: boolean } };
const canal = canaisDemo[0];
const conta = contasDemo[0];
const soma = (movimentos: MovimentoDemo[], valor: (m: MovimentoDemo) => number) => moedaDemo(movimentos.reduce((s, m) => s + valor(m), 0));
const tipo = (valor: string): TipoAnuncio => valor.toLowerCase() === "premium" ? "Premium" : "Clássico";
const semanas = diasDemo(DEMO_INICIO, DEMO_HOJE).filter(d => new Date(d + "T12:00:00Z").getUTCDay() === 1);
const semanaISO = (data: string) => { const d = new Date(data + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return Math.ceil((((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1) / 7); };

export function janelaAnunciosExtraDemo(q = new URLSearchParams()) {
  const dias = Math.max(0, Math.min(366, Number(q.get("dias")) || 0));
  const inicio = q.get("de") || q.get("inicio") || (dias ? [DEMO_INICIO, somarDiasDemo(DEMO_HOJE, -dias + 1)].sort().at(-1)! : DEMO_INICIO);
  const fim = q.get("ate") || q.get("fim") || DEMO_HOJE;
  return { inicio, fim, dias: Math.max(1, Math.floor((Date.parse(fim + "T12:00:00Z") - Date.parse(inicio + "T12:00:00Z")) / 86400000) + 1) };
}

export function comissoesAnunciosExtraDemo(estado?: DemoState): ComissaoCanal[] {
  const salvas = (estado?.comissoes ?? []).filter((r): r is ComissaoCanal => !!r && typeof r === "object" && typeof (r as ComissaoCanal).comissao === "number");
  return salvas.length || (estado as EstadoAnunciosExtraDemo | undefined)?.anunciosExtras?.comissoesConfiguradas ? salvas : ["classico", "premium"].map((t, i) => ({ id: `d8000000-0000-4000-8000-00000000000${i + 1}`, canalId: canal.id, canalNome: canal.nome, tipo: t as "classico" | "premium", comissao: i ? 16.5 : 11.5, vigenciaInicio: DEMO_INICIO }));
}

export function catalogoAnunciosExtraDemo(estado?: DemoState): DadosCatalogo {
  const extras = (estado as EstadoAnunciosExtraDemo | undefined)?.anunciosExtras;
  const itens: ItemCatalogo[] = produtosDemo.map((p, i) => {
    const linhas = movimentosDemo.filter(m => m.sku === p.sku);
    const ultima = linhas.at(-1);
    const receita = soma(linhas, m => m.receita);
    return { mlb: mlbDemo(i), sku: p.sku, titulo: p.titulo, categoria: p.categoria, tipo: tipo(p.tipo), precoAtual: extras?.precos?.[mlbDemo(i)] ?? ultima?.preco ?? p.preco, comissaoAtual: p.tipo === "premium" ? 16.5 : 11.5, comissaoPraticada: receita ? soma(linhas, m => m.receita * m.comissaoPct / 100) / receita * 100 : null, receitaComissao: receita, status: "ativo", conta: conta.nome, estoque: p.estoque, atualizadoEm: DEMO_HOJE, sincronizadoEm: extras?.sincronizadoEm ?? DEMO_SINCRONIZADO, criadoEm: DEMO_INICIO, freteGratis: p.preco >= 79, historicoPreco: semanas.map(inicio => { const semana = linhas.filter(m => m.data >= inicio && m.data <= somarDiasDemo(inicio, 6)); return { semana: `S${semanaISO(inicio)}`, preco: semana.length ? soma(semana, m => m.preco) / semana.length : p.preco }; }) };
  });
  // Dois formatos dos mesmos SKUs permitem a comparação por produto, sem
  // confundir a comparação de médias entre mixes diferentes.
  itens.push(...itens.slice(0, 2).map((item, i) => ({ ...item, mlb: mlbDemo(6 + i), tipo: item.tipo === "Premium" ? "Clássico" as const : "Premium" as const, comissaoAtual: item.tipo === "Premium" ? 11.5 : 16.5, comissaoPraticada: item.tipo === "Premium" ? 8.5 : 13.5, precoAtual: extras?.precos?.[mlbDemo(6 + i)] ?? item.precoAtual })));
  return { itens, categorias: [...new Set(itens.map(i => i.categoria))], contas: [conta.nome], importacoes: [], sincronizadoEm: extras?.sincronizadoEm ?? DEMO_SINCRONIZADO, comComissaoPraticada: itens.length, vazio: false };
}

export function disputaAnunciosExtraDemo(estado?: DemoState): DadosDisputa {
  const estados: SituacaoDisputa[] = ["competindo", "ganhando", "listado", "dividindo", "competindo", "ganhando"];
  const linhas: LinhaDisputa[] = catalogoAnunciosExtraDemo(estado).itens.slice(0, 6).map((p, i) => {
    const situacao = estados[i]; const falta = situacao === "competindo" ? moedaDemo(p.precoAtual * .025) : null;
    return { mlb: p.mlb, sku: p.sku, titulo: p.titulo, foto: null, conta: conta.nome, tipo: p.tipo, status: p.status, estoque: p.estoque, dia: DEMO_HOJE, situacao, fatia: situacao === "ganhando" ? "maxima" : "media", dividindoCom: situacao === "dividindo" ? 2 : null, meuPreco: p.precoAtual, precoVencedor: falta ? moedaDemo(p.precoAtual - falta) : p.precoAtual, precoParaGanhar: falta ? moedaDemo(p.precoAtual - falta) : null, faltaReais: falta, faltaPct: falta ? 2.5 : null, diasGanhando: situacao === "ganhando" ? 29 : i === 2 ? 0 : 12, diasMedidos: 35, elegivel: true, motivos: [], alavancas: i === 0 ? ["Experiência de compra"] : i === 4 ? ["Frete grátis"] : [], casaJaGanha: i === 0, vencedorDaCasa: i === 0 ? mlbDemo(6) : null };
  });
  return { vazio: false, primeiroDia: "2026-10-15", ultimoDia: DEMO_HOJE, diasNaJanela: 35, linhas, resumo: { ganhando: linhas.filter(l => l.situacao === "ganhando").length, dividindo: linhas.filter(l => l.situacao === "dividindo").length, competindo: linhas.filter(l => l.situacao === "competindo").length, listado: linhas.filter(l => l.situacao === "listado").length, fora: 0, comCaminhoDePreco: linhas.filter(l => l.precoParaGanhar != null).length, semGanharComEstoque: linhas.filter(l => l.situacao !== "ganhando" && (l.estoque ?? 0) > 0).length } };
}

export function performanceAnunciosExtraDemo(q = new URLSearchParams(), estado?: DemoState): DadosPerformancePreco {
  const periodo = janelaAnunciosExtraDemo(q); const mov = movimentosDemo.filter(m => m.data >= periodo.inicio && m.data <= periodo.fim);
  const receitaTotal = soma(mov, m => m.receita);
  const linhas: LinhaPreco[] = produtosDemo.map((p, indice) => {
    const ms = mov.filter(m => m.sku === p.sku); const unidades = soma(ms, m => m.quantidade), receita = soma(ms, m => m.receita);
    const atuais = ms.at(-1)?.preco ?? p.preco;
    const precos = [...new Set(ms.map(m => m.preco))];
    const faixas: FaixaPreco[] = precos.map(preco => { const grupo = ms.filter(m => m.preco === preco), un = soma(grupo, m => m.quantidade), fat = soma(grupo, m => m.receita), dias = new Set(grupo.map(m => m.data)).size; return { preco, unidades: un, dias, unDia: dias ? un / dias : 0, receita: fat, receitaDia: dias ? fat / dias : 0, comissaoPct: fat ? soma(grupo, m => m.receita * m.comissaoPct / 100) / fat * 100 : null, unidadesComComissao: un, melhor: false, atual: preco === atuais }; }).sort((a, b) => a.preco - b.preco);
    const qualificadas = faixas.filter(f => f.dias >= 3 && f.unidades >= 3);
    const melhor = qualificadas.reduce<FaixaPreco | null>((a, f) => !a || f.unDia > a.unDia ? f : a, null);
    const melhorReceita = qualificadas.reduce<FaixaPreco | null>((a, f) => !a || f.receitaDia > a.receitaDia ? f : a, null);
    if (melhor) melhor.melhor = true;
    const ultimos = ms.filter(m => m.data >= somarDiasDemo(periodo.fim, -13)), unRecentes = soma(ultimos, m => m.quantidade), recRecentes = soma(ultimos, m => m.receita);
    const sete = ms.filter(m => m.data >= somarDiasDemo(periodo.fim, -6)), un7 = soma(sete, m => m.quantidade);
    const diasRecentes = Math.max(1, Math.min(14, periodo.dias)), unDiaRecente = unRecentes / diasRecentes;
    const variacao = melhor?.preco ? (atuais / melhor.preco - 1) * 100 : null;
    const atual = faixas.find(f => f.atual);
    return { sku: p.sku, titulo: p.titulo, mlbs: [{ mlb: mlbDemo(indice), tipo: tipo(p.tipo) }], curva: indice < 4 ? "A" : "B", canais: 1, unidades, receita, participacao: receitaTotal ? receita / receitaTotal * 100 : 0, melhor, melhorReceita, ganhoReceitaDia: melhorReceita && atual?.receitaDia ? (melhorReceita.receitaDia / atual.receitaDia - 1) * 100 : null, elasticidade: null, precoVitrine: catalogoAnunciosExtraDemo(estado).itens[indice].precoAtual, precoRecente: unRecentes ? recRecentes / unRecentes : null, precoUltimo: ms.at(-1)?.preco ?? null, dataUltimo: ms.at(-1)?.data ?? null, preco7: un7 ? soma(sete, m => m.receita) / un7 : null, precoPeriodo: unidades ? receita / unidades : null, variacao, unDiaRecente, impacto: melhor?.unDia ? (unDiaRecente / melhor.unDia - 1) * 100 : null, situacao: !melhor ? "sem_evidencia" : (variacao ?? 0) > 2.5 && unDiaRecente < melhor.unDia * .8 ? "subiu_e_caiu" : Math.abs(variacao ?? 0) <= 2.5 ? "no_melhor" : (variacao ?? 0) > 0 ? "subiu" : "abaixo", faixas };
  });
  return { vazio: !mov.length, linhas, canais: [{ id: canal.id, nome: canal.nome }], canalId: q.get("canal") || null, rotuloRecorte: conta.nome, opcoes: [{ opcoes: [{ valor: canal.id, rotulo: canal.nome }] }], dias: periodo.dias, periodo: { inicio: periodo.inicio, fim: periodo.fim }, vitrine: { atualizadoEm: (estado as EstadoAnunciosExtraDemo | undefined)?.anunciosExtras?.sincronizadoEm ?? DEMO_SINCRONIZADO, comPreco: 6, total: 6 }, resumo: { comEvidencia: linhas.filter(l => l.melhor).length, subiuECaiu: linhas.filter(l => l.situacao === "subiu_e_caiu").length, acimaDoMelhor: linhas.filter(l => (l.variacao ?? 0) > 2.5).length, total: linhas.length } };
}

export function tipoAnuncioExtraDemo(q = new URLSearchParams()): DadosTipo {
  const periodo = janelaAnunciosExtraDemo(q); const mov = movimentosDemo.filter(m => m.data >= periodo.inicio && m.data <= periodo.fim);
  const lado = (indice: number, t: "classico" | "premium") => {
    const p = produtosDemo[indice], ms = mov.filter(m => m.sku === p.sku);
    const parte = indice < 2 ? (p.tipo === t ? .62 : .38) : p.tipo === t ? 1 : 0;
    const visitas = Math.round(soma(ms, m => m.visitas) * parte), vendas = Math.round(soma(ms, m => m.quantidade) * parte), receita = moedaDemo(soma(ms, m => m.receita) * parte);
    return { visitas, vendas, receita, conversao: visitas ? vendas / visitas * 100 : 0, tarifa: t === "premium" ? 16.5 : 11.5, tarifaPraticada: t === "premium" ? 13.5 : 8.5 };
  };
  const resumo: ResumoTipo[] = (["classico", "premium"] as const).map(t => {
    const lados = produtosDemo.map((_, i) => lado(i, t));const visitas=lados.reduce((s,l)=>s+l.visitas,0),vendas=lados.reduce((s,l)=>s+l.vendas,0),receita=moedaDemo(lados.reduce((s,l)=>s+l.receita,0)),anuncios=produtosDemo.filter((p,i)=>i<2||p.tipo===t).length;
    return{tipo:t,anuncios,visitas,vendas,receita,conversao:visitas?vendas/visitas*100:0,tarifaMedia:t==="premium"?16.5:11.5,tarifaPraticada:t==="premium"?13.5:8.5,coberturaTarifa:100,custoTarifa:moedaDemo(receita*(t==="premium"?.165:.115)),custoTarifaPraticada:moedaDemo(receita*(t==="premium"?.135:.085)),visitasPorAnuncio:anuncios?visitas/anuncios:0};
  });
  const pares:ParSku[]=produtosDemo.slice(0,2).map((p,i)=>{const classico=lado(i,"classico"),premium=lado(i,"premium");return{sku:p.sku,titulo:p.titulo,classico,premium,custoExtra:moedaDemo(premium.receita*.05),custoExtraPraticado:moedaDemo(premium.receita*.05),ganhoConversao:premium.conversao-classico.conversao,razaoVisitas:classico.visitas?premium.visitas/classico.visitas:0};});
  return{resumo,pares,semanas:Math.max(1,Math.ceil(periodo.dias/7)),periodo:{inicio:periodo.inicio,fim:periodo.fim,semanas:Math.max(1,Math.ceil(periodo.dias/7))},anterior:null,dias:Number(q.get("dias"))||0,opcoes:[{opcoes:[{valor:canal.id,rotulo:canal.nome}]}],canalId:canal.id,rotuloRecorte:conta.nome,vazio:!mov.length};
}

export function alvoAnunciosExtraDemo(q = new URLSearchParams(), estado?: DemoState): DadosPrecoAlvo {
  const comissoes = comissoesAnunciosExtraDemo(estado);
  const linhas = produtosDemo.map(p => {
    const e=estado?.custos[p.id]||{},valor=(campo:string,padrao:number)=>Object.hasOwn(e,campo)?typeof e[campo]==="number"?Number(e[campo]):null:padrao;
    const mercadoria=valor("custoMercadoria",p.custo),embalagem=valor("embalagem",p.embalagem),impostoPct=valor("aliquotaImpostos",6),frete=valor("freteUnitario",p.peso>20?44.9:p.peso>5?28.9:16.9),ms=movimentosDemo.filter(m=>m.sku===p.sku),receita=soma(ms,m=>m.receita);
    const faltando=[mercadoria==null?"mercadoria":null,embalagem==null?"embalagem":null,impostoPct==null?"imposto":null,frete==null?"frete":null].filter((v):v is string=>v!==null);
    return{produtoId:p.id,sku:p.sku,titulo:p.titulo,receita,mercadoria,embalagem,impostoPct,frete,freteOrigem:"produto" as const,cenarios:(["classico","premium"] as const).map(t=>{const taxa=comissoes.filter(c=>c.tipo===t&&c.vigenciaInicio<=DEMO_HOJE).sort((a,b)=>b.vigenciaInicio.localeCompare(a.vigenciaInicio))[0]?.comissao??(t==="premium"?16.5:11.5);const praticada=t==="premium"?13.5:8.5;const unidades=soma(ms,m=>m.quantidade);const precoAtual=unidades?receita/unidades:null;return{tipo:t,comissaoPct:taxa,comissaoCobrada:praticada,precoAtual,unidades,atual:!faltando.length&&precoAtual!=null?margemDoPreco({mercadoria:mercadoria!,embalagem:embalagem!,impostoPct:impostoPct!,frete:frete!,comissaoPct:praticada},precoAtual):null};}),faltando};
  });
  return{linhas,comissoes,canais:[{id:canal.id,nome:canal.nome}],canalId:q.get("canal")||canal.id,tipos:["classico","premium"]};
}

export function precosMonitoramentoExtraDemo(): DadosPrecos {
  return{vazio:false,primeiraData:DEMO_INICIO,ultimaData:DEMO_HOJE,canais:[{id:canal.id,nome:canal.nome,cor:canal.cor}],skus:produtosDemo.map((p,i)=>{const ms=movimentosDemo.filter(m=>m.sku===p.sku&&m.quantidade>0),receita=soma(ms,m=>m.receita),unidades=soma(ms,m=>m.quantidade),precos=ms.map(m=>m.preco),precoMin=Math.min(...precos),precoMax=Math.max(...precos);return{sku:p.sku,titulo:p.titulo,anuncios:[{mlb:mlbDemo(i),tipo:tipo(p.tipo)}],curva:i<4?"A":"B",receita,unidades,precoMedio:unidades?receita/unidades:0,precoMin,precoMax,amplitude:precoMin?(precoMax/precoMin-1)*100:0,vendas:ms.map(m=>({data:m.data,canalId:canal.id,canal:canal.nome,quantidade:m.quantidade,precoUnitario:m.preco}))};})};
}

export function getAnunciosExtraFixture(path: string, query = new URLSearchParams(), estado?: DemoState): Record<string, unknown> | null {
  switch(path){
    case "/anuncios/catalogo": return{dados:catalogoAnunciosExtraDemo(estado),disputa:disputaAnunciosExtraDemo(estado),buscaInicial:query.get("q")||""};
    case "/anuncios/tipo": return{dados:tipoAnuncioExtraDemo(query)};
    case "/anuncios/preco-performance": return{dados:performanceAnunciosExtraDemo(query,estado)};
    case "/anuncios/preco-alvo": return{dados:alvoAnunciosExtraDemo(query,estado)};
    case "/monitoramento/precos": return{dados:precosMonitoramentoExtraDemo()};
    case "/monitoramento/fretes": return{};
    default:return null;
  }
}
