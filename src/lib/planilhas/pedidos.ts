import { abrirPlanilha } from "./abrir";

/**
 * Leitor da listagem de pedidos do hub.
 *
 * O arquivo traz 123 colunas, e boa parte é dado pessoal do comprador:
 * nome, telefone, e-mail, endereço, CPF/CNPJ e chave de nota fiscal.
 *
 * Este leitor NÃO lê nenhuma delas. A lista de colunas aceitas é explícita
 * e fechada — o que não está nela nunca sai da planilha. É lista de
 * permissão e não de exclusão de propósito: numa lista de exclusão, basta
 * o hub acrescentar uma coluna nova para dado pessoal entrar sozinho, sem
 * ninguém decidir isso.
 *
 * O que o sistema precisa é o que está aqui: quando, por qual canal,
 * quanto, de quê, e se cancelou.
 */

export type ItemPedido = {
  codigoExterno: string;
  sku: string;
  titulo: string;
  quantidade: number;
  precoUnitario: number;
};

export type Pedido = {
  codigoExterno: string;
  marketplace: string;
  conta: string;
  data: string;
  fechadoEm: string | null;
  status: string;
  cancelado: boolean;
  total: number;
  frete: number;
  comissao: number | null;
  /** Frete bancado pelo vendedor, quando o canal informa. */
  freteVendedor: number | null;
  /** O que sobra depois de tudo que o canal retém. */
  liquidoRecebido: number | null;
  itens: ItemPedido[];
};

export type LeituraPedidos = {
  pedidos: Pedido[];
  inicio: string | null;
  fim: string | null;
  linhasLidas: number;
  ignoradas: number;
  marketplaces: Record<string, number>;
  /** Colunas do arquivo que este leitor deliberadamente não leu. */
  colunasDescartadas: number;
};

/** Cabeçalhos aceitos. Nada fora desta lista é lido. */
const ACEITOS = [
  "id_pedido_marketplace",
  "marketplace",
  "conta",
  "data_criacao",
  "data_aprovacao",
  "status",
  "total",
  "total_frete",
  "envio_total",
  "dados_financeiros_comissão mercado livre",
  "dados_financeiros_custo de frete (vendedor)",
  "dados_financeiros_valor a receber (vendedor)",
  "campo_extra_razão de cancelamento ml",
];

/** Item N: os sufixos aceitos dentro de cada bloco item_pedido_N_*. */
const ITEM_ACEITOS = ["sku", "id_produto", "id_item_pedido_marketplace", "nome", "quantidade", "preco", "total"];

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

function numero(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = texto(v).replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = texto(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

/**
 * "Cancelado" é decidido pelo status, não pela presença de valor cancelado.
 * O hub usa vários rótulos ao longo do fluxo; o que importa para o número
 * é se a venda deixou de valer.
 */
function ehCancelado(status: string): boolean {
  return /cancel|devolv|estornad/i.test(status);
}

export async function lerPedidos(buffer: Buffer): Promise<LeituraPedidos> {
  const wb = await abrirPlanilha(buffer);
  const ws =
    wb.getWorksheet("Pedidos") ??
    wb.worksheets.find((w) => /pedidos/i.test(w.name)) ??
    wb.worksheets[0];
  if (!ws) throw new Error('A planilha não tem a aba "Pedidos".');

  const cabecalho = new Map<string, number>();
  const itemCols = new Map<number, Map<string, number>>();
  let descartadas = 0;

  for (let c = 1; c <= ws.columnCount; c++) {
    const bruto = texto(ws.getRow(1).getCell(c).value).trim();
    if (!bruto) continue;
    const nome = bruto.toLowerCase();

    const item = nome.match(/^item_pedido_(\d+)_(.+)$/);
    if (item) {
      const [, idx, campo] = item;
      if (!ITEM_ACEITOS.includes(campo)) { descartadas += 1; continue; }
      const n = Number(idx);
      if (!itemCols.has(n)) itemCols.set(n, new Map());
      itemCols.get(n)!.set(campo, c);
      continue;
    }

    if (ACEITOS.includes(nome)) cabecalho.set(nome, c);
    else descartadas += 1;
  }

  const pega = (linha: number, nome: string) => {
    const c = cabecalho.get(nome);
    return c ? ws.getRow(linha).getCell(c).value : null;
  };

  const pedidos: Pedido[] = [];
  const marketplaces: Record<string, number> = {};
  const datas: string[] = [];
  let linhasLidas = 0;
  let ignoradas = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const codigo = texto(pega(r, "id_pedido_marketplace")).trim();
    if (!codigo) continue;
    linhasLidas += 1;

    const criacao = data(pega(r, "data_criacao"));
    if (!criacao) { ignoradas += 1; continue; }
    datas.push(criacao);

    const marketplace = texto(pega(r, "marketplace")).trim() || "Outros";
    marketplaces[marketplace] = (marketplaces[marketplace] ?? 0) + 1;

    const status = texto(pega(r, "status")).trim();

    const itens: ItemPedido[] = [];
    for (const [, cols] of [...itemCols.entries()].sort((a, b) => a[0] - b[0])) {
      const ler = (campo: string) => {
        const c = cols.get(campo);
        return c ? ws.getRow(r).getCell(c).value : null;
      };
      const sku = texto(ler("sku")).trim();
      const nome = texto(ler("nome")).trim();
      const qtd = numero(ler("quantidade"));
      if (!sku && !nome) continue;
      if (qtd <= 0) continue;

      // O preço unitário do hub já vem por unidade; quando falta, deriva do
      // total do item para não perder a linha.
      const unit = numero(ler("preco")) || numero(ler("total")) / qtd;

      itens.push({
        codigoExterno:
          texto(ler("id_item_pedido_marketplace")).trim() ||
          texto(ler("id_produto")).trim() ||
          sku,
        sku,
        titulo: nome,
        quantidade: Math.round(qtd),
        precoUnitario: Number(unit.toFixed(2)),
      });
    }

    const comissao = numero(pega(r, "dados_financeiros_comissão mercado livre"));
    const freteVendedor = numero(pega(r, "dados_financeiros_custo de frete (vendedor)"));
    const liquido = numero(pega(r, "dados_financeiros_valor a receber (vendedor)"));

    pedidos.push({
      codigoExterno: codigo,
      marketplace,
      conta: texto(pega(r, "conta")).trim(),
      data: criacao,
      fechadoEm: data(pega(r, "data_aprovacao")),
      status,
      cancelado: ehCancelado(status),
      total: numero(pega(r, "total")),
      frete: numero(pega(r, "total_frete")) || numero(pega(r, "envio_total")),
      comissao: comissao || null,
      freteVendedor: freteVendedor || null,
      liquidoRecebido: liquido || null,
      itens,
    });
  }

  datas.sort();
  return {
    pedidos,
    inicio: datas[0] ?? null,
    fim: datas[datas.length - 1] ?? null,
    linhasLidas,
    ignoradas,
    marketplaces,
    colunasDescartadas: descartadas,
  };
}
