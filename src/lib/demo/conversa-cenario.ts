import { DEMO_HOJE, produtosDemo, movimentosDemo, moedaDemo } from "./fixtures-base";
import { enviosDemo } from "./fixtures";
import { getDemoState } from "./store";

const moeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function respostaConversarDemo(pergunta: string) {
  const q = pergunta.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/envio|despach|pedido|atras/.test(q)) {
    const hoje = enviosDemo.envios.filter(e => e.dias != null && e.dias <= 0), atrasados = hoje.filter(e => e.dias != null && e.dias < 0);
    return `Hoje, ${hoje.length} pedidos fictícios pedem atenção: ${hoje.length - atrasados.length} com prazo para hoje e ${atrasados.length} atrasado. Um deles ainda depende da nota. Abra Envios para priorizar a rotina, conferir SKU e quantidade e preparar os documentos. Nenhum pedido real será alterado.`;
  }
  if (/ads|midia|margem|custo|lucro/.test(q)) {
    const estado = getDemoState();
    const linhas = produtosDemo.map(p => { const m = movimentosDemo.filter(m => m.sku === p.sku && m.data >= "2026-11-01"), receita = m.reduce((s, m) => s + m.receita, 0), ads = m.reduce((s, m) => s + m.ads, 0), e = estado.custos[p.id] || {}, custo = "custoMercadoria" in e ? e.custoMercadoria : p.custo; return { p, receita, ads, custo }; }).filter(l => l.receita > 0).sort((a, b) => b.ads / b.receita - a.ads / a.receita);
    const pior = linhas[0];
    return `${pior.p.titulo} concentra o maior peso relativo de mídia neste exemplo: ${moeda(pior.ads)} investidos para ${moeda(pior.receita)} de receita em novembro, TACoS de ${(pior.ads / pior.receita * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%. ${pior.custo == null ? "O custo do SKU está incompleto; a margem não deve ser concluída." : "Compare a contribuição depois da mídia em Tráfego pago e os custos do SKU antes de decidir."} É um sinal para investigar preço, conversão e investimento; não uma ordem automática de cortar a campanha.`;
  }
  if (/produto|queda|caiu|venda|perd/.test(q)) {
    const mesa = produtosDemo[0], soma = (inicio: string, fim: string) => movimentosDemo.filter(m => m.sku === mesa.sku && m.data >= inicio && m.data <= fim).reduce((s, m) => ({ receita: s.receita + m.receita, visitas: s.visitas + m.visitas }), { receita: 0, visitas: 0 });
    const antes = soma("2026-11-05", "2026-11-11"), agora = soma("2026-11-12", DEMO_HOJE), variacao = antes.receita ? (agora.receita / antes.receita - 1) * 100 : 0;
    return `${mesa.titulo}: a receita passou de ${moeda(antes.receita)} para ${moeda(agora.receita)} na comparação entre as últimas duas semanas (${variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%). As visitas também recuaram, de ${antes.visitas.toLocaleString("pt-BR")} para ${agora.visitas.toLocaleString("pt-BR")}. Abra Por que caiu para investigar esse sinal junto do preço e da conversão. O exemplo também tem uma luminária com preço maior e um puff que ficou sem estoque.`;
  }
  const total = moedaDemo(movimentosDemo.filter(m => m.data >= "2026-11-01").reduce((s, m) => s + m.receita, 0));
  return `A Atlas Casa deste exemplo tem uma conta do Mercado Livre e seis SKUs. A receita válida de novembro até 18/11 é ${moeda(total)}. Experimente as três perguntas sugeridas para conhecer as leituras de vendas, mídia e envios. São respostas guiadas com dados fictícios, sem consulta a uma IA ou a informações reais.`;
}
