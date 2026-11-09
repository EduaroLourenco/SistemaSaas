import { precoParaMargem, margemDoPreco, type Componentes, type Decomposicao } from "@/lib/dados/formula-preco";

/**
 * Quanto cada canal cobra, pré-configurado.
 *
 * O usuário digita só o que é dele (custo, embalagem, imposto). O resto vem
 * daqui — ou da API, onde existe: no Mercado Livre o frete do vendedor e a
 * tarifa saem dos pedidos e da cotação por medidas, e esta tabela é só o
 * ponto de partida de um produto que nunca vendeu.
 *
 * Os valores dos canais sem API vêm de guias de terceiros que divergem entre
 * si (pesquisa de 09/11/2026, fontes em `.scratch/precificacao/spec.md`). Por
 * isso cada canal carrega `conferir`: a tela mostra, e o número é trocado
 * aqui quando o painel do canal disser outro.
 *
 * ── A tarifa depende do preço ──
 *
 * Shopee e TikTok mudam percentual e taxa fixa numa faixa de preço. O preço
 * para a margem é resolvido faixa a faixa: calcula com a regra da faixa e só
 * aceita se o preço resultante cair dentro dela.
 */

export type Faixa = {
  /** Vale até este preço, inclusive. Nulo é "daí para cima". */
  ate: number | null;
  comissaoPct: number;
  taxaFixa: number;
};

export type RegraCanal = {
  codigo: string;
  nome: string;
  faixas: Faixa[];
  /** Como o frete do vendedor é conhecido. */
  frete: "api" | "incluso";
  /** Nota curta para a tela: o que ainda não foi confirmado. */
  conferir: string | null;
  vigencia: string;
};

export const REGRAS: RegraCanal[] = [
  {
    codigo: "mercado_livre",
    nome: "Mercado Livre",
    // Clássico. Desde 02/03/2026 não há taxa fixa abaixo de R$ 79 em Coleta,
    // Agência e Full: o custo virou frete por peso, que vem da API.
    faixas: [{ ate: null, comissaoPct: 11.5, taxaFixa: 0 }],
    frete: "api",
    conferir: null,
    vigencia: "2026-03-02",
  },
  {
    codigo: "shopee",
    nome: "Shopee",
    // ponytail: acima de R$ 80 a taxa fixa vai de R$ 16 a R$ 26 por faixa; uso R$ 16 até confirmar as faixas
    faixas: [
      { ate: 79.99, comissaoPct: 20, taxaFixa: 4.5 },
      { ate: null, comissaoPct: 14, taxaFixa: 16 },
    ],
    frete: "incluso",
    conferir: "taxas e frete grátis no painel",
    vigencia: "2026-10-01",
  },
  {
    codigo: "tiktok",
    nome: "TikTok Shop",
    // Comissão + 6% do programa de envio somados.
    // ponytail: o programa tem teto de R$ 50 por item; só pesa acima de R$ 833
    faixas: [
      { ate: 49.99, comissaoPct: 16, taxaFixa: 4 },
      { ate: null, comissaoPct: 12, taxaFixa: 6 },
    ],
    frete: "incluso",
    conferir: "comissão no Seller Center",
    vigencia: "2026-07-15",
  },
  {
    codigo: "magalu",
    nome: "Magalu",
    faixas: [{ ate: null, comissaoPct: 18, taxaFixa: 5 }],
    frete: "incluso",
    conferir: "comissão por categoria e frete acima de R$ 79",
    vigencia: "2026-09-10",
  },
  {
    codigo: "amazon",
    nome: "Amazon",
    // 10% a 15% por categoria: fica o teto, para não prometer margem que não vem.
    faixas: [{ ate: null, comissaoPct: 15, taxaFixa: 0 }],
    frete: "incluso",
    conferir: "comissão da categoria (10% a 15%)",
    vigencia: "2026-01-01",
  },
];

export const regraDoCanal = (codigo: string) => REGRAS.find((r) => r.codigo === codigo) ?? null;

export function faixaDoPreco(regra: RegraCanal, preco: number): Faixa {
  return regra.faixas.find((f) => f.ate == null || preco <= f.ate) ?? regra.faixas[regra.faixas.length - 1];
}

/** O custo que o usuário informa, sem o que é do canal. */
export type CustoProduto = Omit<Componentes, "comissaoPct" | "taxaFixa">;

/** O que o canal desconta e o que sobra, num preço. */
export function contaNoCanal(regra: RegraCanal, custo: CustoProduto, preco: number): Decomposicao & { recebe: number } {
  const f = faixaDoPreco(regra, preco);
  const d = margemDoPreco({ ...custo, comissaoPct: f.comissaoPct, taxaFixa: f.taxaFixa }, preco);
  return { ...d, recebe: +(preco - d.comissao - d.taxaFixa - d.frete).toFixed(2) };
}

/** Preço que fecha a margem no canal, respeitando a faixa de tarifa. */
export function precoNoCanal(
  regra: RegraCanal,
  custo: CustoProduto,
  margemPct: number
): { ok: true; preco: number } | { ok: false; motivo: string } {
  let ultimo: { ok: false; motivo: string } = { ok: false, motivo: "não fecha" };
  let piso = 0;
  for (const f of regra.faixas) {
    const r = precoParaMargem({ ...custo, comissaoPct: f.comissaoPct, taxaFixa: f.taxaFixa }, margemPct);
    if (!r.ok) ultimo = r;
    else if (r.preco > piso && (f.ate == null || r.preco <= f.ate)) return r;
    piso = f.ate ?? piso;
  }
  return ultimo;
}
