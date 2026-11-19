import type { ComponentProps } from "react";
import type FinanceiroCliente from "@/app/financeiro/financeiro-cliente";
import type CustosCliente from "@/app/financeiro/custos/custos-cliente";
import type { CustoSku, FaixaFrete, DespesaCanal } from "@/lib/dados/custos";
import type { LinhaMargem, Resultado } from "@/lib/dados/margem";
import type { DadosPrecificacao } from "@/lib/dados/precificacao";
import { DEMO_HOJE, DEMO_INICIO, DEMO_EMPRESA, canaisDemo, produtosDemo, opcoesDemo, filtrarMovimentosDemo, moedaDemo, somarDemo, mlbDemo, type MovimentoDemo } from "./fixtures-base";

export type CustosEditadosDemo = Record<string, Record<string, unknown>>;
const numero = (o: Record<string, unknown>, k: string, padrao: number): number | null => Object.hasOwn(o, k) ? typeof o[k] === "number" && Number.isFinite(o[k]) ? Number(o[k]) : null : padrao;
export const faixasFreteDemo: FaixaFrete[] = [
  { id: "d4100000-0000-4000-8000-000000000001", canalId: canaisDemo[0].id, canalNome: "Mercado Livre", pesoMin: 0, pesoMax: 5, valor: 16.9, vigenciaInicio: DEMO_INICIO },
  { id: "d4100000-0000-4000-8000-000000000002", canalId: canaisDemo[0].id, canalNome: "Mercado Livre", pesoMin: 5, pesoMax: 15, valor: 28.9, vigenciaInicio: DEMO_INICIO },
  { id: "d4100000-0000-4000-8000-000000000003", canalId: canaisDemo[0].id, canalNome: "Mercado Livre", pesoMin: 15, pesoMax: 30, valor: 44.9, vigenciaInicio: DEMO_INICIO },
];
export const despesasDemo: DespesaCanal[] = [
  { id: "d4200000-0000-4000-8000-000000000001", canalId: null, canalNome: null, natureza: "fixa_recorrente", descricao: "Estrutura e equipe", valor: 4800, competencia: "2026-11-01" },
  { id: "d4200000-0000-4000-8000-000000000002", canalId: canaisDemo[0].id, canalNome: "Mercado Livre", natureza: "variavel_recorrente", descricao: "Apoio à operação comercial", valor: 650, competencia: "2026-11-01" },
  { id: "d4200000-0000-4000-8000-000000000003", canalId: null, canalNome: null, natureza: "variavel_avulsa", descricao: "Produção da campanha de novembro", valor: 900, competencia: "2026-11-01" },
];
function medidas(mov: MovimentoDemo[], custos: CustosEditadosDemo = {}) {
  const receita = somarDemo(mov, m => m.receita), unidades = somarDemo(mov, m => m.quantidade);
  let receitaApurada = 0, mercadoria = 0, embalagem = 0, impostos = 0, margem = 0;
  const comissao = somarDemo(mov, m => m.receita * m.comissaoPct / 100);
  const frete = somarDemo(mov, m => { const o = custos[m.produtoId] || {}; return (numero(o, "freteUnitario", m.freteUnidade) ?? 0) * m.quantidade; });
  for (const m of mov) {
    const p = produtosDemo.find(p => p.id === m.produtoId)!;
    const o = custos[p.id] || {}, c = numero(o, "custoMercadoria", p.custo), e = numero(o, "embalagem", p.embalagem), imposto = numero(o, "aliquotaImpostos", 6), f = numero(o, "freteUnitario", m.freteUnidade);
    if (c != null) mercadoria += c * m.quantidade;
    if (e != null) embalagem += e * m.quantidade;
    if (imposto != null) impostos += m.receita * imposto / 100;
    if (c != null && e != null && imposto != null && f != null) {
      receitaApurada += m.receita;
      margem += m.receita - m.receita * (m.comissaoPct + imposto) / 100 - (c + e + f) * m.quantidade;
    }
  }
  return { receita, unidades, receitaApurada: moedaDemo(receitaApurada), comissao, frete, juros: 0, impostos: moedaDemo(impostos), embalagem: moedaDemo(embalagem), mercadoria: moedaDemo(mercadoria), margem: receitaApurada ? moedaDemo(margem) : null, margemPct: receitaApurada ? margem / receitaApurada * 100 : null, cobertura: receita ? receitaApurada / receita * 100 : 0, receitaMedida: receita };
}
const filtros = (q: URLSearchParams) => ({ inicio: q.get("inicio") || "2026-11-01", fim: q.get("fim") || DEMO_HOJE, canalId: q.get("canal") || "" });
function resultado(mov: MovimentoDemo[], inicio: string, fim: string, custos: CustosEditadosDemo): Resultado {
  const m = medidas(mov, custos), ads = somarDemo(mov, l => l.ads), competencia = inicio.slice(0, 7), despesas = despesasDemo.filter(d => d.competencia.startsWith(competencia));
  const fixaRecorrente = somarDemo(despesas.filter(d => d.natureza === "fixa_recorrente"), d => d.valor), variavelRecorrente = somarDemo(despesas.filter(d => d.natureza === "variavel_recorrente"), d => d.valor), variavelAvulsa = somarDemo(despesas.filter(d => d.natureza === "variavel_avulsa"), d => d.valor);
  const res = m.cobertura >= 99.5 ? moedaDemo((m.margem || 0) - ads - fixaRecorrente - variavelRecorrente - variavelAvulsa) : null;
  return { inicio, fim, receitaBruta: m.receita, cancelamentos: 0, receitaLiquida: m.receita, comissao: m.comissao, frete: m.frete, juros: 0, impostos: m.impostos, embalagem: m.embalagem, mercadoria: m.mercadoria, margemContribuicao: m.margem || 0, margemPct: m.margemPct, ads, fixaRecorrente, variavelRecorrente, variavelAvulsa, resultado: res, resultadoPct: res != null && m.receita ? res / m.receita * 100 : null, cobertura: m.cobertura, receitaSemCusto: moedaDemo(m.receita - m.receitaApurada), cadaCoberturaDe: { comissaoPraticada: mov.filter(l => l.quantidade).length, fretePraticado: mov.filter(l => l.quantidade).length, jurosInformado: mov.filter(l => l.quantidade).length, pedidos: mov.filter(l => l.quantidade).length } };
}
export function dadosFinanceiroDemo(q = new URLSearchParams(), custos: CustosEditadosDemo = {}): ComponentProps<typeof FinanceiroCliente> {
  const { inicio, fim, canalId } = filtros(q), mov = filtrarMovimentosDemo(inicio, fim, canalId), meses = [...new Set(mov.map(m => m.data.slice(0, 7)))];
  const grupo = (chave: string, rotulo: string, ms: MovimentoDemo[]): LinhaMargem => ({ chave, rotulo, ordem: chave, ...medidas(ms, custos) });
  const por = (chave: (m: MovimentoDemo) => string, rotulo: (id: string) => string) => [...new Set(mov.map(chave))].map(id => grupo(id, rotulo(id), mov.filter(m => chave(m) === id)));
  return { resultado: resultado(mov, inicio, fim, custos), mensal: meses.map(mes => { const ms = mov.filter(m => m.data.startsWith(mes)); return resultado(ms, ms[0].data, ms.at(-1)!.data, custos); }), visoes: { mes: por(m => m.data.slice(0, 7), id => new Date(id + "-01T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })), semana: por(m => { const d = new Date(m.data + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }, id => `Semana de ${id.slice(8, 10)}/${id.slice(5, 7)}`), canal: por(m => m.canalId, id => canaisDemo.find(c => c.id === id)!.nome), conta: por(m => m.contaId, id => `${DEMO_EMPRESA} · ${canaisDemo.find(c => c.contaCanalId === id)!.nome}`), sku: por(m => m.sku, id => produtosDemo.find(p => p.sku === id)!.titulo), anuncio: por(m => m.produtoId, id => mlbDemo(produtosDemo.findIndex(p => p.id === id))) }, opcoes: opcoesDemo, inicio, fim, canalId };
}
export function dadosCustosDemo(q = new URLSearchParams(), custos: CustosEditadosDemo = {}): ComponentProps<typeof CustosCliente> {
  const { inicio, fim, canalId } = filtros(q), mov = filtrarMovimentosDemo(inicio, fim, canalId);
  const linhas: CustoSku[] = produtosDemo.map((p, i) => {
    const ms = mov.filter(m => m.sku === p.sku), m = medidas(ms, custos), e = custos[p.id] || {};
    const custoMercadoria = numero(e, "custoMercadoria", p.custo), embalagem = numero(e, "embalagem", p.embalagem), aliquotaImpostos = numero(e, "aliquotaImpostos", 6), pesoKg = numero(e, "pesoKg", p.peso);
    const investimento = somarDemo(ms, l => l.ads), receitaAds = moedaDemo(m.receita * .65);
    return { produtoId: p.id, sku: p.sku, titulo: p.titulo, anuncios: 2, unidades: m.unidades, receita: m.receita, precoMedio: m.unidades ? m.receita / m.unidades : null, comissao: { tabela: p.tipo === "premium" ? 16.5 : 11.5, praticado: m.receita ? m.comissao / m.receita * 100 : null, origem: "praticado", valor: m.receita ? m.comissao / m.receita * 100 : null }, comissaoCanal: p.tipo === "premium" ? 16.5 : 11.5, frete: { tabela: p.peso > 20 ? 44.9 : p.peso > 5 ? 28.9 : 16.9, praticado: i === 5 ? null : m.unidades ? m.frete / m.unidades : null, origem: i === 5 ? "tabela" : "praticado", valor: m.unidades ? m.frete / m.unidades : null }, jurosUnidade: 0, custoMercadoria, embalagem, aliquotaImpostos, pesoKg, margemMinimaPct: numero(e, "margemMinimaPct", 18), ads: { investimento, receitaAds, vendido: m.receita, tacosPct: m.receita ? investimento / m.receita * 100 : null }, margemUnidade: m.margem != null && m.unidades ? m.margem / m.unidades : null, margemPct: m.margemPct, faltando: [custoMercadoria == null ? "mercadoria" : null, embalagem == null ? "embalagem" : null, aliquotaImpostos == null ? "impostos" : null].filter((x): x is string => Boolean(x)) };
  });
  return { linhas, faixas: faixasFreteDemo, completos: linhas.filter(l => !l.faltando.length).length, despesas: despesasDemo, canais: canaisDemo, opcoes: opcoesDemo, adsPorMes: [{ competencia: "2026-11-01", canalNome: "Mercado Livre", valor: somarDemo(mov, l => l.ads) }], inicio, fim, canalId, margemConfiguravel: true };
}
export const precificacaoDemo: DadosPrecificacao = { empresa: DEMO_EMPRESA, de: "2026-11-01", ate: DEMO_HOJE, canais: canaisDemo.map(c => ({ codigo: c.codigo, nome: c.nome, temVenda: true })), produtos: produtosDemo.map((p, i) => ({ id: p.id, sku: p.sku, titulo: p.titulo, custo: p.custo, embalagem: p.embalagem, impostoPct: 6, margemMinimaPct: 18, pesoKg: p.peso, freteSalvo: p.peso > 5 ? 24.9 : 13.9, mlbMeli: mlbDemo(i), medidas: { altura: 40, largura: 45, comprimento: 60 }, porCanal: Object.fromEntries(canaisDemo.map(c => { const ms = filtrarMovimentosDemo("2026-11-01", DEMO_HOJE, c.id).filter(l => l.sku === p.sku), m = medidas(ms); return [c.codigo, { vitrine: p.preco, unidades: m.unidades, vendido: m.receita, unidadesComRecebido: m.unidades, vendidoComRecebido: m.receita, recebido: m.receita - m.comissao - m.frete, comissao: m.comissao, freteVendedor: m.frete, semRecebido: 0 }]; })), adsMeli: 200 + i * 40, adsMeliPct: 4.5 })), tacosMeliPct: 4.5, adsJanela: { inicio: "2026-10-20", fim: DEMO_HOJE }, contaMeli: canaisDemo[0].contaCanalId };
