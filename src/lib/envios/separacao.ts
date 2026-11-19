import type { EnvioMeli } from "@/lib/dados/envios-meli";

/**
 * Separação em lote: primeiro junta o que pegar por produto, depois
 * distribui nos pedidos. Pedidos iguais ficam juntos para montar em série.
 */

export type RecorteSeparacao = "hoje" | "amanha" | "todos";

/* No Full o estoque é do Meli; sem pagamento ainda não há o que separar. */
const FORA_DA_SEPARACAO = new Set(["in_warehouse", "waiting_for_payment"]);

export type PedidoSeparacao = {
  id: string;
  venda: number;
  conta: string;
  dias: number | null;
  situacao: string;
  itens: { chave: string; sku: string | null; titulo: string; quantidade: number }[];
};

export type ProdutoSeparacao = {
  chave: string;
  sku: string | null;
  titulo: string;
  unidades: number;
  pedidos: { id: string; venda: number; conta: string; quantidade: number; dias: number | null }[];
};

export type GrupoMontagem = {
  chave: string;
  itens: PedidoSeparacao["itens"];
  pedidos: PedidoSeparacao[];
};

export type Separacao = {
  produtos: ProdutoSeparacao[];
  grupos: GrupoMontagem[];
  pedidos: number;
  unidades: number;
};

export function entraNaSeparacao(e: EnvioMeli, recorte: RecorteSeparacao) {
  if (e.saiu || FORA_DA_SEPARACAO.has(e.substatus ?? "")) return false;
  if (recorte === "todos") return true;
  return e.dias != null && e.dias <= (recorte === "hoje" ? 0 : 1);
}

const chaveDoItem = (sku: string | null, titulo: string) =>
  sku?.trim().toUpperCase() || `T:${titulo.trim().toLocaleLowerCase("pt-BR")}`;

/* Sem prazo vai para o fim: não pode passar na frente de quem tem data. */
const urgencia = (d: number | null) => d ?? Number.POSITIVE_INFINITY;

export function montarSeparacao(envios: EnvioMeli[]): Separacao {
  /* Um pacote do Meli traz vários pedidos e sai numa caixa só. */
  const porVenda = new Map<string, PedidoSeparacao>();
  for (const e of envios) {
    const venda = e.venda ?? e.pedido;
    const id = `${e.contaId ?? e.conta}:${venda}`;
    const p = porVenda.get(id) ?? { id, venda, conta: e.conta, dias: e.dias, situacao: e.situacao, itens: [] };
    if (urgencia(e.dias) < urgencia(p.dias)) p.dias = e.dias;
    for (const i of e.itens) {
      const chave = chaveDoItem(i.sku, i.titulo);
      const atual = p.itens.find((x) => x.chave === chave);
      if (atual) atual.quantidade += i.quantidade;
      else p.itens.push({ chave, sku: i.sku, titulo: i.titulo, quantidade: i.quantidade });
    }
    porVenda.set(id, p);
  }

  const pedidos = [...porVenda.values()].sort((a, b) => urgencia(a.dias) - urgencia(b.dias) || a.venda - b.venda);
  const produtos = new Map<string, ProdutoSeparacao>();
  const grupos = new Map<string, GrupoMontagem>();

  for (const p of pedidos) {
    p.itens.sort((a, b) => a.chave.localeCompare(b.chave));
    for (const i of p.itens) {
      const produto = produtos.get(i.chave) ?? { chave: i.chave, sku: i.sku, titulo: i.titulo, unidades: 0, pedidos: [] };
      produto.unidades += i.quantidade;
      produto.pedidos.push({ id: p.id, venda: p.venda, conta: p.conta, quantidade: i.quantidade, dias: p.dias });
      produtos.set(i.chave, produto);
    }
    const chave = p.itens.map((i) => `${i.chave}*${i.quantidade}`).join("|");
    const grupo = grupos.get(chave) ?? { chave, itens: p.itens, pedidos: [] };
    grupo.pedidos.push(p);
    grupos.set(chave, grupo);
  }

  const listaProdutos = [...produtos.values()].sort((a, b) => b.unidades - a.unidades || a.titulo.localeCompare(b.titulo, "pt-BR"));
  return {
    produtos: listaProdutos,
    grupos: [...grupos.values()].sort(
      (a, b) => urgencia(a.pedidos[0].dias) - urgencia(b.pedidos[0].dias) || b.pedidos.length - a.pedidos.length,
    ),
    pedidos: pedidos.length,
    unidades: listaProdutos.reduce((s, p) => s + p.unidades, 0),
  };
}
