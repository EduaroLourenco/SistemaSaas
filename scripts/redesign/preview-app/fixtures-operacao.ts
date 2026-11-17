/** Dados sintéticos locais. Nenhum carregador de banco ou serviço é importado. */
import { CATALOGO } from "@/mock/catalogo";
import type { DadosAnalise } from "@/lib/dados/analise";
import type { DadosCatalogo } from "@/lib/dados/catalogo";
import type { DadosDisputa } from "@/lib/dados/disputa-catalogo";
import type { DadosPrecoIdeal } from "@/lib/dados/preco-ideal";
import type { DadosPrecoAlvo } from "@/lib/dados/preco-alvo";
import type { DadosPerformancePreco, FaixaPreco } from "@/lib/dados/performance-preco";
import type { DadosTipo } from "@/lib/dados/tipo-anuncio";
import type { DadosPromocoes } from "@/lib/dados/promocoes";
import type { DadosComparacao, Oferta } from "@/lib/dados/comparar-ofertas";
import type { DadosPrecos } from "@/lib/dados/precos-praticados";
import type { DadosAutomacoes, ItensDaPromocao } from "@/lib/dados/automacoes";
import type { DadosTrafegoPago } from "@/lib/dados/trafego-pago";
import type { Regra } from "@/lib/planilhas/avaliar-regras";
import type { Fila } from "@/lib/dados/fila-aprovacao";

export const DATA_OPERACAO = "2026-11-17";
const SINCRONIZADO = "2026-11-17T10:00:00-03:00";
const CANAL = "fixture-mercado-livre";
const CONTA = "Conta de demonstração";
export const itensOperacao = CATALOGO.slice(0, 8).map((item, index) => ({ ...item,
  mlb: `MLBDEMO${String(index + 1).padStart(4, "0")}`, sku: `DEMO-${String(index + 1).padStart(3, "0")}`,
  titulo: index === 0 ? "Colchão de demonstração casal com molas ensacadas e camada de conforto 138 × 188 × 30 cm" : `Produto de demonstração ${index + 1} · ${item.titulo}`,
  conta: CONTA, atualizadoEm: DATA_OPERACAO, sincronizadoEm: SINCRONIZADO,
}));

export const catalogoOperacao: DadosCatalogo = {
  itens: itensOperacao, categorias: [...new Set(itensOperacao.map(i => i.categoria))], contas: [CONTA],
  importacoes: [{ id: "fixture-carga", arquivo: "catalogo-demonstracao.xlsx", enviadoEm: "17/11/2026", linhas: itensOperacao.length, novos: 2, atualizados: 6 }],
  sincronizadoEm: SINCRONIZADO, comComissaoPraticada: 0, vazio: false,
};
export const disputaOperacao: DadosDisputa = {
  vazio: false, primeiroDia: "2026-11-01", ultimoDia: DATA_OPERACAO, diasNaJanela: 17,
  linhas: itensOperacao.slice(0, 4).map((i, n) => ({ mlb: i.mlb, sku: i.sku, titulo: i.titulo, foto: null, conta: CONTA, tipo: i.tipo, status: "ativo", estoque: i.estoque,
    dia: DATA_OPERACAO, situacao: n === 0 ? "competindo" : n === 1 ? "ganhando" : n === 2 ? "dividindo" : "listado", fatia: n === 1 ? "maxima" : "media",
    dividindoCom: n === 2 ? 2 : null, meuPreco: i.precoAtual, precoVencedor: i.precoAtual - 15, precoParaGanhar: n === 0 ? i.precoAtual - 20 : null,
    faltaReais: n === 0 ? 20 : null, faltaPct: n === 0 ? 1.5 : null, diasGanhando: n === 1 ? 15 : 5, diasMedidos: 17,
    elegivel: true, motivos: [], alavancas: n === 0 ? ["Preço"] : [], casaJaGanha: false, vencedorDaCasa: null })),
  resumo: { ganhando: 1, dividindo: 1, competindo: 1, listado: 1, fora: 0, comCaminhoDePreco: 1, semGanharComEstoque: 1 },
};
const dias = Array.from({ length: 61 }, (_, index) => new Date(Date.UTC(2026, 8, 17 + index, 12)).toISOString().slice(0, 10));
export const analiseOperacao: DadosAnalise = {
  hoje: DATA_OPERACAO, primeiraData: dias[0], anuncios: itensOperacao.map((i, n) => ({ mlb: i.mlb, sku: i.sku, titulo: i.titulo, tipo: i.tipo, status: i.status,
    conta: CONTA, contaId: "fixture-conta", categoria: i.categoria, estoque: i.estoque, precoAtual: i.precoAtual, sincronizadoEm: SINCRONIZADO, precoReferencia: i.precoAtual * .95, semanas: [],
    movimento: dias.map((dia, d) => [dia, 80 + d % 11 + n * 8, 2 + (d + n) % 4, (2 + (d + n) % 4) * i.precoAtual] as [string, number, number, number]),
  })),
};
const relatorio = { id: "fixture-relatorio", fileName: "precos-demonstracao.xlsx", dataBase: DATA_OPERACAO, uploadedAt: "17/11/2026", linhas: itensOperacao.map(i => ({ mlb: i.mlb, precoIdeal: i.precoAtual * .96, comissaoNegociada: 10 })) };
export const idealOperacao: DadosPrecoIdeal = {
  relatorios: [relatorio], categorias: catalogoOperacao.categorias, contas: [CONTA], vazio: false,
  cruzamentos: { [relatorio.id]: itensOperacao.map((i,n) => ({ mlb: i.mlb, sku: i.sku, titulo: i.titulo, categoria: i.categoria, conta: CONTA, tipo: i.tipo, status: i.status,
    precoPraticado: i.precoAtual, precoIdeal: i.precoAtual * (n % 3 === 0 ? 1.08 : n % 3 === 1 ? .93 : 1), desvio: n % 3 === 0 ? -7.41 : n % 3 === 1 ? 7.53 : 0, comissaoAtual: i.comissaoAtual, comissaoNegociada: 10 })) },
};
export const alvoOperacao: DadosPrecoAlvo = {
  canalId: CANAL, canais: [{ id: CANAL, nome: "Mercado Livre · demonstração" }], tipos: ["classico", "premium"],
  comissoes: ["classico", "premium"].map((tipo, n) => ({ id: "fixture-comissao-" + n, canalId: CANAL, canalNome: "Mercado Livre", tipo: tipo as "classico" | "premium", comissao: n ? 16.5 : 11.5, vigenciaInicio: "2026-01-01" })),
  linhas: itensOperacao.map(i => ({ produtoId: i.sku, sku: i.sku, titulo: i.titulo, receita: i.precoAtual * 20, mercadoria: i.precoAtual * .45, embalagem: 12, impostoPct: 8, frete: 45, freteOrigem: "tabela",
    cenarios: ["classico", "premium"].map((tipo, n) => ({ tipo: tipo as "classico" | "premium", comissaoPct: n ? 16.5 : 11.5, comissaoCobrada: null, precoAtual: i.precoAtual, unidades: 20, atual: null })), faltando: [] })),
};
const faixa = (p: number, n: number): FaixaPreco => ({ preco: p, unidades: 30 + n * 4, dias: 10, unDia: 3 + n * .4, receita: p * (30 + n * 4), receitaDia: p * (3 + n * .4), comissaoPct: 10, unidadesComComissao: 20, melhor: n === 1, atual: n === 2 });
export const performanceOperacao: DadosPerformancePreco = {
  vazio: false, canais: alvoOperacao.canais, canalId: null, rotuloRecorte: null, opcoes: [{ opcoes: [{valor: "", rotulo: "Todos os canais"}, {valor: CANAL, rotulo: "Mercado Livre"}] }], dias: 30,
  periodo: { inicio: "2026-10-18", fim: DATA_OPERACAO }, vitrine: { atualizadoEm: SINCRONIZADO, comPreco: itensOperacao.length, total: itensOperacao.length },
  resumo: { comEvidencia: 8, subiuECaiu: 2, acimaDoMelhor: 3, total: 8 },
  linhas: itensOperacao.map((i,n) => ({ sku: i.sku, titulo: i.titulo, mlbs: [{mlb: i.mlb, tipo: i.tipo}], curva: n < 3 ? "A" : "B", canais: 1, unidades: 90, receita: i.precoAtual * 90, participacao: 12.5,
    melhor: faixa(i.precoAtual * .95, 1), melhorReceita: faixa(i.precoAtual, 2), ganhoReceitaDia: 10, elasticidade: 1.3, precoVitrine: i.precoAtual, precoRecente: i.precoAtual * .98,
    precoUltimo: i.precoAtual, dataUltimo: DATA_OPERACAO, preco7: i.precoAtual * .99, precoPeriodo: i.precoAtual * .96, variacao: 5, unDiaRecente: 3.1, impacto: -8,
    situacao: n < 2 ? "subiu_e_caiu" : "estavel", faixas: [faixa(i.precoAtual * .9,0), faixa(i.precoAtual * .95,1), faixa(i.precoAtual,2)] })),
};
const resumoTipos: DadosTipo["resumo"] = ["classico", "premium"].map((tipo,n) => ({ tipo: tipo as "classico" | "premium", anuncios: 4, visitas: 4000 + n * 1200, vendas: 120 + n * 18,
  receita: 180000 + n * 26000, conversao: 3 - n * .35, tarifaMedia: 11.5 + n * 5, tarifaPraticada: 9 + n * 2, coberturaTarifa: 85, custoTarifa: 20700 + n * 9500, custoTarifaPraticada: 16200 + n * 6460, visitasPorAnuncio: 1000 + n * 300 }));
export const tipoOperacao: DadosTipo = { resumo: resumoTipos, pares: itensOperacao.slice(0,4).map(i => ({ sku: i.sku, titulo: i.titulo,
  classico: { visitas: 1000, vendas: 30, receita: 45000, conversao: 3, tarifa: 11.5, tarifaPraticada: 9 }, premium: { visitas: 1300, vendas: 34, receita: 51000, conversao: 2.62, tarifa: 16.5, tarifaPraticada: 11 },
  custoExtra: 2550, custoExtraPraticado: 1020, ganhoConversao: -.38, razaoVisitas: 1.3 })), semanas: 4, periodo: { inicio: "2026-10-18", fim: DATA_OPERACAO, semanas: 4 }, anterior: null,
  dias: 30, opcoes: performanceOperacao.opcoes, canalId: "", rotuloRecorte: "Todos os canais", vazio: false };
export const promocoesOperacao: DadosPromocoes = {
  vazio: false, campanhas: [{ id: "fixture-campanha", nome: "Campanha de demonstração · Novembro", temReducao: true, ativa: true, inicio: "2026-11-01", fim: "2026-11-30", itens: 8, participam: 5, fora: 3, ultimoProcessamento: DATA_OPERACAO }],
  historico: itensOperacao.map((i,n) => ({ id: "fixture-historico-" + n, processamentoId: "fixture-processamento", mlb: i.mlb, sku: i.sku, titulo: i.titulo, campanha: "Campanha de demonstração · Novembro", tipoAnuncio: i.tipo, tipoCampanha: "Com Redução", precoOfertadoML: i.precoAtual * .93, precoTabela: i.precoAtual * .97, precoPiso: i.precoAtual * .92, precoComExtra: null, reducaoTarifa: "2,5%", aprovado: n < 5, motivo: n < 5 ? null : "Oferta abaixo do piso da regra", tags: n >= 5 ? ["quase"] : [], data: DATA_OPERACAO, curva: n < 3 ? "A" : "B", precoPraticado: i.precoAtual })),
  processamentos: [{ id: "fixture-processamento", quando: DATA_OPERACAO, lidos: 8, aprovados: 5, reprovados: 3, descontoExtra: 0, arquivos: ["campanha-demonstracao.xlsx"], status: "concluido" }],
};
const oferta = (n: number, passa: boolean): Oferta => ({ id: "fixture-oferta-" + n, campanhaId: "fixture-campanha", campanha: "Campanha de demonstração · Novembro", temReducao: true, precoCanal: 1400 - n * 10, precoOferta: 1400 - n * 10, precoTabela: 1500, precoPiso: 1380, pisoEfetivo: 1380, descontoExtra: 0, reducaoTarifa: 35, reducaoPercentual: 2.5, participa: passa, motivo: passa ? null : "Preço abaixo do piso", arquivo: "campanha-demonstracao.xlsx", linhaPlanilha: n + 2, comissaoResultante: 9, descontoSobreTabela: 6.67, folgaAtePiso: 1.45 });
export const compararOperacao: DadosComparacao = { vazio: false, semOrigem: false, campanhasDisponiveis: promocoesOperacao.campanhas.map(c=>({ id:c.id,nome:c.nome,temReducao:c.temReducao })), anuncios: itensOperacao.slice(0,4).map((i,n) => ({ anuncioId: i.mlb, mlb:i.mlb, sku:i.sku, titulo:i.titulo, tipo:i.tipo, comissaoTabela:i.comissaoAtual, tabelaDe:1450,tabelaAte:1500,ofertas:[oferta(n*2,true),oferta(n*2+1,false)],campanhas:1,participam:1,melhorAceitavel:oferta(n*2,true),recusadaMaisProxima:oferta(n*2+1,false) })) };
export const precosOperacao: DadosPrecos = { vazio:false,primeiraData:"2026-01-01",ultimaData:DATA_OPERACAO,canais:[{id:CANAL,nome:"Mercado Livre",cor:"#168679"}],skus:itensOperacao.map((i,n)=>({sku:i.sku,titulo:i.titulo,anuncios:[{mlb:i.mlb,tipo:i.tipo}],curva:n<3?"A":"B",receita:i.precoAtual*60,unidades:60,precoMedio:i.precoAtual,precoMin:i.precoAtual*.9,precoMax:i.precoAtual*1.05,amplitude:16.67,vendas:dias.map((data,d)=>({data,canalId:CANAL,canal:"Mercado Livre",quantidade:1,precoUnitario:i.precoAtual*(.94+(d%6)*.01)}))})) };
export const automacoesOperacao: DadosAutomacoes = { semConexao:false,contas:[{id:"fixture-conta",nome:CONTA,escrita:false}],falhas:[],promocoes:[{codigo:"fixture-campanha",tipo:"DEAL",subTipo:null,nome:"Campanha de demonstração · Novembro",status:"started",inicio:"2026-11-01T00:00:00-03:00",fim:"2026-11-30T23:59:59-03:00",prazo:"2026-11-22T23:59:59-03:00",meliPct:null,sellerPct:null,contaId:"fixture-conta",contaNome:CONTA}] };
export const adsOperacao: DadosTrafegoPago = { vazio:true,janela:"",recorte:"",opcoes:[],serie:[],periodo:{de:"2026-10-18",ate:DATA_OPERACAO},periodos:[],linhas:[],campanhas:[],totais:{investimento:0,receitaAtribuida:0,receitaReal:0,receitaIndireta:0,margem:null,sobraAposMidia:null,atribuicao:null,coberturaMargem:0,tacos:null,receitaTotalConta:0},conferencia:null,oportunidades:[],referencias:null };
export const regrasOperacao: Regra[] = [{id:"fixture-regra",nome:"Conferir itens com estoque baixo",ativa:true,ordem:0,contaCanalId:null,condicoes:[{campo:"anuncio.estoque",operador:"menor",valor:5}],acao:{tipo:"conferir"},quandoNaoSei:"conferir"},{id:"fixture-regra-geral",nome:"Revisar demais convites",ativa:true,ordem:1,contaCanalId:null,condicoes:[],acao:{tipo:"conferir"},quandoNaoSei:"conferir"}];
export const filaOperacao: Fila = {linhas:[],faltaMigracao:null};
export const itensPromocaoOperacao: ItensDaPromocao = {bandas:[.05,.08,.115,.165],truncado:false,itens:itensOperacao.slice(0,4).map((i,n)=>({mlb:i.mlb,sku:i.sku,titulo:i.titulo,foto:null,statusAnuncio:"ativo",estoque:20,tipoAnuncio:i.tipo,status:n===1?"started":n===2?"pending":"candidate",precoCanal:1100,precoCheio:1500,minimoCanal:900,maximoCanal:1200,sugerido:1100,meliPct:null,sellerPct:null,oferta:"fixture-oferta-"+n,inicio:null,fim:null,estoqueMin:null,estoqueMax:null,piso:1000,precos:[900,950,1000,1100],comissaoCheia:.115}))};
