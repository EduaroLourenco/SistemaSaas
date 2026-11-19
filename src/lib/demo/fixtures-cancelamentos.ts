import type { DadosCancelamento, CelulaMes } from "@/lib/dados/cancelamentos";
import { DEMO_HOJE, DEMO_INICIO, canaisDemo, contasDemo, produtosDemo, movimentosDemo, cancelamentosCenarioDemo, somarDemo } from "./fixtures-base";

const percentual = (valor: number, base: number) => base > 0 ? valor / base * 100 : 0;
function resumo(mes?: string): CelulaMes {
  const validos = movimentosDemo.filter(m => !mes || m.data.startsWith(mes));
  const cancelados = cancelamentosCenarioDemo.filter(c => !mes || c.data.startsWith(mes));
  const pedidos = somarDemo(validos, m => m.pedidos) + cancelados.length;
  const valorCancelado = somarDemo(cancelados, c => c.total);
  const receitaBruta = somarDemo(validos, m => m.receita) + valorCancelado;
  return { pedidos, cancelados: cancelados.length, valorCancelado, receitaBruta, taxaValor: percentual(valorCancelado, receitaBruta), taxaQuantidade: percentual(cancelados.length, pedidos) };
}

export function dadosCancelamentosDemo(): DadosCancelamento {
  const canal = canaisDemo[0], conta = contasDemo[0], total = resumo();
  const meses = [...new Set(movimentosDemo.map(m => m.data.slice(0, 7)))];
  return {
    exclusoes: [], removidas: 0, totalOriginal: total.pedidos,
    canaisDisponiveis: [{ id: canal.id, nome: canal.nome }],
    porCanal: [{ canalId: canal.id, contaId: conta.id, canal: canal.nome, conta: conta.nome, mostrarConta: false, ...total, ticketCancelado: total.cancelados ? total.valorCancelado / total.cancelados : 0, ticketNormal: (total.receitaBruta - total.valorCancelado) / Math.max(1, total.pedidos - total.cancelados) }],
    porSku: produtosDemo.map(p => { const validos = movimentosDemo.filter(m => m.sku === p.sku), cancelados = cancelamentosCenarioDemo.filter(c => c.produto.sku === p.sku), itensCancelados = somarDemo(cancelados, c => c.quantidade), itens = somarDemo(validos, m => m.quantidade) + itensCancelados; return { sku: p.sku, titulo: p.titulo, itens, itensCancelados, valorCancelado: somarDemo(cancelados, c => c.total), taxaQuantidade: percentual(itensCancelados, itens), canais: [canal.nome] }; }),
    porMes: meses.map(mes => ({ mes, ...resumo(mes) })),
    matriz: [{ chave: conta.id, canalId: canal.id, canal: canal.nome, conta: conta.nome, mostrarConta: false, porMes: Object.fromEntries(meses.map(mes => [mes, resumo(mes)])), total }],
    mesesDisponiveis: meses, totalCancelado: total.valorCancelado, totalBruto: total.receitaBruta, taxaGeral: total.taxaValor,
    periodo: { inicio: DEMO_INICIO, fim: DEMO_HOJE }, vazio: false,
  };
}

export function pedidosCanceladosDemo(query: URLSearchParams) {
  const conta = query.get("conta"), mes = query.get("mes");
  const linhas = conta && conta !== contasDemo[0].id ? [] : cancelamentosCenarioDemo.filter(c => !mes || c.data.startsWith(mes));
  return { pedidos: linhas.map(c => ({ id: c.id, codigo: c.codigo, data: c.data, status: "cancelled", total: c.total, itens: [{ sku: c.produto.sku, titulo: c.produto.titulo, quantidade: c.quantidade }] })), cortado: false };
}
