import { abrirPlanilha } from "./abrir";

/**
 * Leitor do export "Modifique seus anúncios" do Mercado Livre.
 *
 * É a planilha que preenche os buracos que o relatório de desempenho
 * deixa: preço da vitrine, tarifa de venda, tipo de anúncio e estoque.
 * Sem ela, o preço de uma semana SEM venda não existe — e é justamente a
 * semana que se quer explicar.
 *
 * A primeira linha traz nomes técnicos (ITEM_ID, PRICE, FEE_PER_SALE) e as
 * seguintes repetem rótulos em português. O mapeamento usa os técnicos: são
 * estáveis entre exports, enquanto os rótulos mudam com o idioma da conta.
 */

export type ItemCatalogo = {
  mlb: string;
  sku: string;
  titulo: string;
  variacao: string;
  preco: number | null;
  /** Alíquota da tarifa de venda, em porcentagem (11.5 = 11,5%). */
  tarifa: number | null;
  tipo: "classico" | "premium" | "outro";
  status: "ativo" | "pausado" | "finalizado" | "sob_revisao";
  estoque: number | null;
  estoqueFull: number | null;
};

export type LeituraCatalogo = {
  itens: ItemCatalogo[];
  linhasLidas: number;
  semCodigo: number;
};

function texto(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text) return o.text;
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
}

function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = texto(v)
    .replace(/R\$\s?/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Alíquota da tarifa de venda, em porcentagem.
 *
 * O Mercado Livre exporta essa coluna como FÓRMULA e sem resultado salvo:
 *
 *   IF(Y6="Clássico","11.5%", IF(Y6="Premium","16.5%","-"))
 *
 * Ler a célula devolve vazio. Mas a fórmula declara as duas alíquotas em
 * texto, e elas mudam de linha para linha conforme a faixa de preço — então
 * o valor certo está ali, basta escolher pelo tipo do anúncio.
 *
 * Recalcular por conta própria seria pior: exigiria manter aqui a tabela de
 * faixas do Mercado Livre, que muda sem aviso.
 */
export function tarifaDaFormula(
  formula: string,
  tipo: "classico" | "premium" | "outro"
): number | null {
  if (!formula || tipo === "outro") return null;

  const alvo = tipo === "premium" ? /premium/i : /cl[áa]ssico/i;
  // Cada ramo do IF é  ="Rótulo","N%"  — pega o percentual do ramo certo.
  const ramos = [...formula.matchAll(/"([^"]*)"\s*,\s*"([\d.,]+)\s*%"/g)];
  for (const [, rotulo, valor] of ramos) {
    if (alvo.test(rotulo)) {
      const n = parseFloat(valor.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/** Código do anúncio sempre com o prefixo MLB, como no resto do sistema. */
function normalizarMlb(bruto: string): string {
  const limpo = bruto.trim().toUpperCase().replace(/\s+/g, "");
  if (!limpo) return "";
  return /^MLB/.test(limpo) ? limpo : `MLB${limpo}`;
}

export async function lerCatalogo(buffer: Buffer): Promise<LeituraCatalogo> {
  const wb = await abrirPlanilha(buffer);
  const ws =
    wb.getWorksheet("Anúncios") ??
    wb.worksheets.find((w) => /an[úu]ncios/i.test(w.name)) ??
    wb.worksheets[0];
  if (!ws) throw new Error("A planilha não tem aba de anúncios.");

  // Coluna por nome técnico da primeira linha.
  const col = new Map<string, number>();
  for (let c = 1; c <= ws.columnCount; c++) {
    const nome = texto(ws.getRow(1).getCell(c).value).trim().toUpperCase();
    if (nome && !col.has(nome)) col.set(nome, c);
  }
  // O estoque vem com o id do depósito no nome: STORE_STOCK_QUANTITY_1234#...
  let colEstoque = col.get("STORE_STOCK_QUANTITY") ?? 0;
  if (!colEstoque) {
    for (const [nome, c] of col) {
      if (nome.startsWith("STORE_STOCK_QUANTITY")) { colEstoque = c; break; }
    }
  }

  const pega = (linha: number, nome: string) => {
    const c = col.get(nome);
    return c ? ws.getRow(linha).getCell(c).value : null;
  };

  const itens: ItemCatalogo[] = [];
  let linhasLidas = 0;
  let semCodigo = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const bruto = texto(pega(r, "ITEM_ID")).trim();
    if (!bruto) continue;

    // As linhas 2 a 4 repetem rótulos em português; só interessa o que
    // parece código de anúncio.
    if (!/^(MLB)?\d{6,}$/i.test(bruto.replace(/\s+/g, ""))) {
      semCodigo += 1;
      continue;
    }
    linhasLidas += 1;

    const tipoBruto = texto(pega(r, "LISTING_TYPE")).toLowerCase();
    const tipo: ItemCatalogo["tipo"] = /premium/.test(tipoBruto)
      ? "premium"
      : /cl[áa]ssico/.test(tipoBruto)
        ? "classico"
        : "outro";

    const celulaTarifa = pega(r, "FEE_PER_SALE");
    const formula =
      celulaTarifa && typeof celulaTarifa === "object" && "formula" in celulaTarifa
        ? String((celulaTarifa as { formula: string }).formula)
        : "";
    const statusBruto = texto(pega(r, "STATUS")).toLowerCase();

    itens.push({
      mlb: normalizarMlb(bruto),
      sku: texto(pega(r, "SKU")).trim(),
      titulo: texto(pega(r, "TITLE")).trim(),
      variacao: texto(pega(r, "VARIATIONS")).trim(),
      preco: numero(pega(r, "PRICE")),
      tarifa: tarifaDaFormula(formula, tipo) ?? numero(celulaTarifa),
      tipo,
      // "Inativo" no export cobre pausado e encerrado sem distinguir. Mapeia
      // para `pausado`: dizer `finalizado` afirmaria um encerramento que a
      // planilha não confirma.
      status: /ativo/.test(statusBruto) && !/inativo/.test(statusBruto)
        ? "ativo"
        : "pausado",
      estoque: colEstoque ? numero(ws.getRow(r).getCell(colEstoque).value) : null,
      estoqueFull: numero(pega(r, "STOCK_FULL")),
    });
  }

  return { itens, linhasLidas, semCodigo };
}
