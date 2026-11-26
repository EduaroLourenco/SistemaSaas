import type { DadosSugestoes, SugestoesDaConta } from "@/lib/dados/sugestoes";
import { PARAMETROS_PADRAO, type DiaDoAnuncio, type ItemBruto, type PromoDoItem } from "@/lib/planilhas/sugestoes-promocao";
import { contasDemo, produtosDemo, mlbDemo, moedaDemo, DEMO_HOJE } from "./fixtures-base";

/**
 * Promoções sugeridas na demonstração — produtos fictícios.
 *
 * Um caso de cada situação que o motor sabe tratar: co-participada que
 * ganha de baixar sozinho, baixar a campanha própria, entrar com o
 * mínimo, relâmpago com unidades, preço já abaixo do mínimo, item sem
 * mínimo e estoque acabando.
 */

const conta = contasDemo[0];
const dias = (n: number) => new Date(new Date(`${DEMO_HOJE}T12:00:00-03:00`).getTime() - n * 86_400_000).toISOString();
const promo = (o: Partial<PromoDoItem> & Pick<PromoDoItem, "codigo" | "tipo">): PromoDoItem => ({
  nome: null, status: "candidate", preco: null, precoCheio: null, minimo: null, maximo: null, sugerido: null,
  meliPct: null, sellerPct: null, oferta: null, inicio: null, fim: null, prazo: null, estoqueMin: null, estoqueMax: null,
  boost: null, ...o,
});
const black = (o: Partial<PromoDoItem>) =>
  promo({ codigo: "C-DEMO-BLACK", tipo: "SELLER_CAMPAIGN", nome: "Black interna", inicio: "2026-11-15T03:00:00Z", fim: "2026-12-01T02:59:00Z", prazo: "2026-11-30T23:59:00-03:00", ...o });

function item(i: number, o: Partial<ItemBruto>): ItemBruto {
  const p = produtosDemo[i];
  return {
    contaId: conta.id, contaNome: conta.nome, mlb: mlbDemo(i), sku: p.sku, titulo: p.titulo, foto: null,
    tipoAnuncio: p.tipo, statusAnuncio: "ativo", estoque: p.estoque, precoCheio: p.preco,
    minimo: { valor: moedaDemo(p.preco * 0.8), fonte: "tabela", vigencia: "2026-11-17" },
    custo: { mercadoria: p.custo, embalagem: p.embalagem, frete: p.peso > 5 ? 24.9 : 13.9, impostoPct: 6 },
    comissaoPct: p.tipo === "premium" ? 16.5 : 11.5,
    vendas: { u7: 3, u30: 12, u90: 40, ultimaVenda: dias(1) },
    catalogo: null,
    promos: [],
    ...o,
  };
}

const p = produtosDemo;
export const itensSugestoesDemo: ItemBruto[] = [
  /* Co-participada: o comprador paga menos e a loja recebe mais que baixando sozinha. */
  item(0, {
    vendas: { u7: 0, u30: 2, u90: 9, ultimaVenda: dias(20) },
    promos: [
      promo({ codigo: "P-DEMO-CASA", tipo: "SMART", nome: "Casa em festa", preco: moedaDemo(p[0].preco * 0.78), precoCheio: p[0].preco, meliPct: 4, sellerPct: 18, oferta: "CANDIDATE-DEMO-1" }),
      black({ status: "started", preco: moedaDemo(p[0].preco * 0.86), precoCheio: p[0].preco }),
    ],
  }),
  /* Baixar a campanha própria até o mínimo. */
  item(1, {
    promos: [black({ status: "started", preco: moedaDemo(p[1].preco * 0.93), precoCheio: p[1].preco })],
  }),
  /* Convite de preço nosso: entra no mínimo. */
  item(2, {
    vendas: { u7: 0, u30: 0, u90: 3, ultimaVenda: dias(40) },
    promos: [black({ preco: null, precoCheio: p[2].preco, minimo: moedaDemo(p[2].preco * 0.2), maximo: moedaDemo(p[2].preco * 0.95) })],
  }),
  /* Relâmpago co-participado, com faixa de unidades. */
  item(5, {
    estoque: 240,
    vendas: { u7: 6, u30: 24, u90: 70, ultimaVenda: dias(1) },
    promos: [promo({ codigo: "P-DEMO-RELAMPAGO", tipo: "SMART_LIGHTNING", nome: "Relâmpago da semana", preco: moedaDemo(p[5].preco * 0.79), precoCheio: p[5].preco, meliPct: 6, sellerPct: 15, oferta: "CANDIDATE-DEMO-6", estoqueMin: 5, estoqueMax: 120 })],
  }),
  /* Já vendendo abaixo do mínimo. */
  item(3, {
    promos: [black({ status: "started", preco: moedaDemo(p[3].preco * 0.72), precoCheio: p[3].preco })],
  }),
  /* Sem mínimo cadastrado. */
  item(4, {
    minimo: null, custo: null,
    promos: [promo({ codigo: "P-DEMO-CASA", tipo: "SMART", nome: "Casa em festa", preco: moedaDemo(p[4].preco * 0.85), precoCheio: p[4].preco, meliPct: 3, sellerPct: 12, oferta: "CANDIDATE-DEMO-5" })],
  }),
];

export const contextoSugestoesDemo: Omit<DadosSugestoes, "itens" | "falhas" | "lidoEm"> = {
  parametros: PARAMETROS_PADRAO,
  contas: [{ id: conta.id, nome: conta.nome, escrita: true }],
  faltaMigracao: null,
  fonteMinimo: { tabela: "2026-11-17", formulaBase: null },
};

export const contaSugestoesDemo = (): SugestoesDaConta => ({
  itens: itensSugestoesDemo, lidos: 48, naoLidos: 0, lidoEm: `${DEMO_HOJE}T09:00:00-03:00`,
});

/** 90 dias de um anúncio fictício: preço mais baixo vende mais por dia. */
export function diasSimulacaoDemo(mlb: string): DiaDoAnuncio[] {
  const i = Math.max(0, produtosDemo.findIndex((_, k) => mlbDemo(k) === mlb));
  const base = produtosDemo[i].preco;
  return Array.from({ length: 90 }, (_, k) => {
    const faixa = k < 30 ? 1 : k < 60 ? 0.9 : 0.84;
    return {
      data: dias(90 - k).slice(0, 10),
      preco: moedaDemo(base * faixa),
      unidades: (k * 7) % (faixa === 1 ? 3 : faixa === 0.9 ? 2 : 1) === 0 ? (faixa === 1 ? 0 : 1) : faixa === 0.84 ? 1 : 0,
      visitas: 40 + (k % 9),
      estoque: 30,
    };
  });
}
