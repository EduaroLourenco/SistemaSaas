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

/** Tipo de anúncio (ou plano) que muda a tarifa dentro do mesmo canal. */
export type TipoAnuncio = {
  id: string;
  nome: string;
  faixas: Faixa[];
  /** Mínimo e máximo da comissão por categoria, para a tela sugerir e limitar. */
  faixaCategoria: [number, number] | null;
};

export type RegraCanal = {
  codigo: string;
  nome: string;
  /** O primeiro é o padrão. */
  tipos: TipoAnuncio[];
  /** = tipos[0].faixas, para quem não escolhe tipo. */
  faixas: Faixa[];
  /** Como o frete do vendedor é conhecido. */
  frete: "api" | "incluso";
  /** Nota curta para a tela: o que ainda não foi confirmado. */
  conferir: string | null;
  vigencia: string;
};

const canal = (r: Omit<RegraCanal, "faixas">): RegraCanal => ({ ...r, faixas: r.tipos[0].faixas });

export const REGRAS: RegraCanal[] = [
  canal({
    codigo: "mercado_livre",
    nome: "Mercado Livre",
    // A comissão varia por categoria (clássico 10% a 14%, premium 15% a 19%).
    // Desde 02/03/2026 não há taxa fixa abaixo de R$ 79 em Coleta, Agência e
    // Full: virou custo de envio por peso e preço (`freteMeliEstimado`).
    tipos: [
      { id: "classico", nome: "Clássico", faixas: [{ ate: null, comissaoPct: 11.5, taxaFixa: 0 }], faixaCategoria: [10, 14] },
      { id: "premium", nome: "Premium", faixas: [{ ate: null, comissaoPct: 16.5, taxaFixa: 0 }], faixaCategoria: [15, 19] },
    ],
    frete: "api",
    conferir: null,
    vigencia: "2026-03-02",
  }),
  canal({
    codigo: "shopee",
    nome: "Shopee",
    // Vendedor CNPJ, com o Frete Grátis (obrigatório desde 03/2026) já dentro do percentual.
    // ponytail: acima de R$ 80 a taxa fixa vai de R$ 16 a R$ 26 por faixa; uso R$ 16 até confirmar as faixas
    tipos: [
      {
        id: "cnpj", nome: "CNPJ",
        faixas: [
          { ate: 79.99, comissaoPct: 20, taxaFixa: 4.5 },
          { ate: null, comissaoPct: 14, taxaFixa: 16 },
        ],
        faixaCategoria: null,
      },
    ],
    frete: "incluso",
    conferir: "taxas e frete grátis no painel",
    vigencia: "2026-10-01",
  }),
  canal({
    codigo: "tiktok",
    nome: "TikTok Shop",
    // ponytail: o programa de envio tem teto de R$ 50 por item; só pesa acima de R$ 833
    tipos: [
      {
        id: "com_envio", nome: "Com programa de envio (+6%)",
        faixas: [
          { ate: 49.99, comissaoPct: 16, taxaFixa: 4 },
          { ate: null, comissaoPct: 12, taxaFixa: 6 },
        ],
        faixaCategoria: null,
      },
      {
        id: "sem_envio", nome: "Sem programa de envio",
        faixas: [
          { ate: 49.99, comissaoPct: 10, taxaFixa: 4 },
          { ate: null, comissaoPct: 6, taxaFixa: 6 },
        ],
        faixaCategoria: null,
      },
    ],
    frete: "incluso",
    conferir: "comissão no Seller Center",
    vigencia: "2026-07-15",
  }),
  canal({
    codigo: "magalu",
    nome: "Magalu",
    tipos: [{ id: "padrao", nome: "Padrão", faixas: [{ ate: null, comissaoPct: 18, taxaFixa: 5 }], faixaCategoria: [10, 19] }],
    frete: "incluso",
    conferir: "comissão por categoria e frete acima de R$ 79",
    vigencia: "2026-09-10",
  }),
  canal({
    codigo: "amazon",
    nome: "Amazon",
    // 10% a 15% por categoria: fica o teto, para não prometer margem que não vem.
    tipos: [{ id: "padrao", nome: "Profissional", faixas: [{ ate: null, comissaoPct: 15, taxaFixa: 0 }], faixaCategoria: [10, 15] }],
    frete: "incluso",
    conferir: "comissão da categoria (10% a 15%)",
    vigencia: "2026-01-01",
  }),
];

export const regraDoCanal = (codigo: string) => REGRAS.find((r) => r.codigo === codigo) ?? null;

/**
 * A regra com o tipo escolhido e, se informada, a comissão da categoria.
 *
 * A comissão da categoria troca o percentual de todas as faixas: no Meli,
 * Magalu e Amazon há uma faixa só, e é ali que a categoria muda a tarifa.
 */
export function regraEfetiva(regra: RegraCanal, tipoId?: string | null, comissaoPct?: number | null): RegraCanal {
  const tipo = regra.tipos.find((t) => t.id === tipoId) ?? regra.tipos[0];
  const faixas = comissaoPct == null ? tipo.faixas : tipo.faixas.map((f) => ({ ...f, comissaoPct }));
  return { ...regra, tipos: [tipo], faixas };
}

export type Logistica = "coleta" | "flex";

/**
 * Custo do Meli abaixo de R$ 79, quando a API ainda não cotou.
 *
 * Coleta, Agência e Full: custo de envio por peso e preço, cobrado do
 * vendedor mesmo com frete grátis para o comprador. Os valores são os
 * medidos nos pedidos da Imprimil (pacote até 0,3 kg, reputação verde) e
 * batem com os guias: R$ 5,65 abaixo de R$ 19, R$ 6,85 até R$ 48,99,
 * R$ 8,15 até R$ 78,99. Mais pesado que isso, a tabela muda e só a API sabe.
 *
 * Flex e envio próprio: taxa fixa por unidade (R$ 6,25 / 6,65 / 7,75) e o
 * frete é seu, à parte.
 *
 * A partir de R$ 79 o frete grátis é do vendedor e depende de peso,
 * medida e reputação: devolve nulo, para a tela pedir a cotação.
 */
export function custoMeliEstimado(
  preco: number,
  pesoCobradoKg: number | null,
  logistica: Logistica
): { frete: number; taxaFixa: number } | null {
  if (preco >= 79) return null;
  if (logistica === "flex") {
    return { frete: 0, taxaFixa: preco < 19 ? 6.25 : preco < 49 ? 6.65 : 7.75 };
  }
  if (pesoCobradoKg == null || pesoCobradoKg > 0.3) return null;
  return { frete: preco < 19 ? 5.65 : preco < 49 ? 6.85 : 8.15, taxaFixa: 0 };
}

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
