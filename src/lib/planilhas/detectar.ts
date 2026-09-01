import { abrirPlanilha } from "./abrir";

/**
 * Descobre que planilha é esta.
 *
 * Pela ESTRUTURA, nunca pelo nome do arquivo. Nome é a primeira coisa que
 * alguém muda — "Relatorio (1).xlsx", "copia de pedidos.xlsx" — e uma
 * detecção que depende dele falha justamente no uso real, meses depois,
 * quando ninguém lembra que a regra existia.
 *
 * Cada formato tem uma marca própria e barata de verificar: o nome da aba
 * mais um punhado de cabeçalhos. Se nada casar, a resposta é "não sei" —
 * e é bem melhor recusar do que adivinhar e gravar pedido no lugar de
 * anúncio.
 */

export type TipoPlanilha =
  | "desempenho"
  | "pedidos"
  | "catalogo"
  | "vendas_ml"
  | "desconhecido";

export type Deteccao = {
  tipo: TipoPlanilha;
  /** O que fez a decisão — aparece na tela quando dá errado. */
  evidencia: string;
  abas: string[];
};

/** Marcas de cada formato: aba esperada e cabeçalhos que precisam existir. */
const ASSINATURAS: {
  tipo: Exclude<TipoPlanilha, "desconhecido">;
  aba: RegExp;
  /** Linhas onde procurar cabeçalho — cada export usa uma. */
  linhas: number[];
  exigidos: string[];
  rotulo: string;
}[] = [
  {
    tipo: "catalogo",
    aba: /an[úu]ncios/i,
    linhas: [1],
    // Nomes técnicos, não os rótulos em português: eles não mudam com o
    // idioma da conta nem com a versão do export.
    exigidos: ["item_id", "sku", "price"],
    rotulo: "Catálogo do Mercado Livre",
  },
  {
    tipo: "desempenho",
    aba: /relat[óo]rio/i,
    linhas: [5, 6, 7],
    exigidos: ["id do anúncio", "visitas únicas"],
    rotulo: "Desempenho de anúncios do Mercado Livre",
  },
  {
    /*
     * O relatório de vendas do próprio Meli. Vem antes de "pedidos" na
     * lista porque os dois falam de pedido, e este tem a marca mais
     * específica — se ficasse depois, um empate de aba decidiria por
     * ordem de chegada.
     */
    tipo: "vendas_ml",
    aba: /vendas/i,
    // O cabeçalho fica na linha 6; as cinco primeiras são apresentação.
    // As vizinhas entram porque o Meli já mudou esse offset antes.
    linhas: [5, 6, 7],
    exigidos: ["n.º de venda", "tarifa de venda e impostos"],
    rotulo: "Relatório de vendas do Mercado Livre",
  },
  {
    tipo: "pedidos",
    aba: /pedidos/i,
    linhas: [1],
    exigidos: ["id_pedido_marketplace", "marketplace", "data_criacao"],
    rotulo: "Listagem de pedidos do hub",
  },
];

function textoDe(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text) return o.text;
    if (o.result !== undefined) return String(o.result);
    return "";
  }
  return String(v);
}

export async function detectar(buffer: Buffer): Promise<Deteccao> {
  const wb = await abrirPlanilha(buffer);
  const abas = wb.worksheets.map((w) => w.name);

  for (const a of ASSINATURAS) {
    const ws =
      wb.worksheets.find((w) => a.aba.test(w.name)) ?? wb.worksheets[0];
    if (!ws) continue;

    // Junta as linhas candidatas num texto só: alguns exports quebram o
    // cabeçalho em duas linhas (grupo em cima, coluna embaixo), e exigir
    // que tudo esteja na mesma faria a detecção falhar por formatação.
    const alvo = a.linhas
      .flatMap((n) => {
        const vals = ws.getRow(n).values;
        return Array.isArray(vals) ? vals.map(textoDe) : [];
      })
      .join(" | ")
      .toLowerCase();

    const achados = a.exigidos.filter((e) => alvo.includes(e));
    if (achados.length === a.exigidos.length) {
      return {
        tipo: a.tipo,
        evidencia: `${a.rotulo} — aba "${ws.name}", com ${achados.join(", ")}`,
        abas,
      };
    }
  }

  return {
    tipo: "desconhecido",
    evidencia: `Nenhum formato conhecido. Abas encontradas: ${abas.join(", ")}`,
    abas,
  };
}

export const NOME_TIPO: Record<TipoPlanilha, string> = {
  desempenho: "Desempenho de anúncios",
  vendas_ml: "Vendas e tarifas do Mercado Livre",
  pedidos: "Pedidos",
  catalogo: "Catálogo de anúncios",
  desconhecido: "Formato não reconhecido",
};
