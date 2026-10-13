import type { LinhaQueda } from "./dados/queda";
const variacao = (a: number | null, b: number | null) => a != null && b != null && b > 0 ? (a / b - 1) * 100 : null;
export const COLUNAS_QUEDA = [
  ["codigo", "SKU / anúncio"], ["titulo", "Produto"], ["onde", "Canal / conta"], ["curva", "Curva"], ["causa", "Sinal principal"],
  ["delta", "Variação de receita R$"], ["deltaPct", "Variação de receita %"],
  ["receitaAntes", "Receita anterior"], ["receita", "Receita atual"], ["unidadesAntes", "Unidades anteriores"], ["unidades", "Unidades atuais"],
  ["visitasAntes", "Visitas anteriores"], ["visitas", "Visitas atuais"], ["varVisitas", "Variação de visitas %"],
  ["conversaoAntes", "Conversão anterior %"], ["conversao", "Conversão atual %"],
  ["vendidoAntes", "Preço vendido anterior"], ["vendido", "Preço vendido atual"], ["vitrineAntes", "Vitrine média anterior"], ["vitrine", "Vitrine média atual"],
  ["varPreco", "Variação do preço vendido %"], ["precoAtual", "Último preço anunciado"], ["estoqueAtual", "Disponível no anúncio"],
] as const;
export type ColunaQueda = typeof COLUNAS_QUEDA[number][0];
export const colunaTexto = (c: ColunaQueda) => ["codigo", "titulo", "onde", "curva", "causa"].includes(c);
export function valorQueda(l: LinhaQueda, c: ColunaQueda): number | string | null {
  const valores: Record<ColunaQueda, number | string | null> = {
    codigo: l.codigo, titulo: l.titulo, onde: l.onde, curva: l.curva, causa: l.causa, delta: l.delta, deltaPct: l.deltaPct,
    receitaAntes: l.antes.receita, receita: l.agora.receita, unidadesAntes: l.antes.unidades, unidades: l.agora.unidades,
    visitasAntes: l.antes.visitas, visitas: l.agora.visitas, varVisitas: variacao(l.agora.visitas,l.antes.visitas),
    conversaoAntes: l.antes.conversao, conversao: l.agora.conversao, vendidoAntes: l.antes.precoVendido, vendido: l.agora.precoVendido,
    vitrineAntes: l.antes.precoVitrine, vitrine: l.agora.precoVitrine, varPreco: variacao(l.agora.precoVendido,l.antes.precoVendido),
    precoAtual: l.precoAtual, estoqueAtual: l.estoqueAtual,
  };
  return valores[c];
}
export function ordenarFiltrarQueda(linhas: LinhaQueda[], f: { coluna: ColunaQueda; crescente: boolean; minimo: string; maximo: string; texto: string; presenca: string }) {
  const numero = (s: string) => s.trim() ? Number(s.replace(",", ".")) : null;
  const min = numero(f.minimo), max = numero(f.maximo);
  return linhas.filter((l) => {
    const v = valorQueda(l,f.coluna);
    if (f.presenca === "sem") return v == null;
    if (f.presenca === "com" && v == null) return false;
    if (colunaTexto(f.coluna)) return String(v ?? "").toLocaleLowerCase("pt-BR").includes(f.texto.toLocaleLowerCase("pt-BR"));
    if (min == null && max == null) return true;
    return typeof v === "number" && (min == null || v >= min) && (max == null || v <= max);
  }).sort((a,b) => {
    const x = valorQueda(a,f.coluna), y = valorQueda(b,f.coluna);
    if (x == null) return y == null ? 0 : 1;
    if (y == null) return -1;
    const d = typeof x === "number" && typeof y === "number" ? x-y : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
    return f.crescente ? d : -d;
  });
}
