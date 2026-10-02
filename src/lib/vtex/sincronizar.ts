import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { consolidarDiarias, emLotes, type ContextoCanal } from "@/lib/sync/diarias";
import { pedidos as buscarPedidos, type PedidoVtex } from "./cliente";

/**
 * Sincronização da loja própria (VTEX).
 *
 * Grava só pedido e item. A VTEX não tem "anúncio" nem visita por anúncio
 * como um marketplace tem — o catálogo da loja é o mesmo produto, e visita
 * é assunto do Analytics, não do OMS.
 *
 * Isto substitui a planilha da Loja própria: a partir daqui o cancelamento
 * dela vem do mesmo lugar que o número de venda, que é o que faltava para
 * resolver a divergência entre os 9% da planilha e os 51% que a API mostra.
 */

/**
 * Carrega a loja pelo id.
 *
 * Antes isto varria todas as `contas_canal` e casava pelo NOME do canal
 * ("Loja própria (VTEX)"). Com duas empresas as duas têm um canal com esse
 * nome, e o `find` devolvia o primeiro — os pedidos de uma iriam para a
 * operação da outra. O id resolve isso por construção.
 */
async function resolverConta(conta: string): Promise<ContextoCanal & { nome: string }> {
  const sb = clientePrivilegiado();
  const { data: achada, error } = await sb
    .from("contas_canal")
    .select("id,operacao_id,canal_id,nome")
    .eq("id", conta)
    .maybeSingle();
  if (error) throw new Error(`Não consegui ler contas_canal: ${error.message}`);
  if (!achada) throw new Error(`Conta de canal ${conta} não existe.`);

  return {
    operacaoId: achada.operacao_id as string,
    canalId: achada.canal_id as string,
    contaCanalId: achada.id as string,
    nome: achada.nome as string,
  };
}

async function gravar(ctx: ContextoCanal, lista: PedidoVtex[]) {
  const sb = clientePrivilegiado();
  if (!lista.length) return { gravados: 0, itens: 0 };

  const cabecalhos = lista.map((p) => ({
    operacao_id: ctx.operacaoId,
    canal_id: ctx.canalId,
    conta_canal_id: ctx.contaCanalId,
    codigo_externo: p.id,
    data: p.data,
    fechado_em: p.fechadoEm,
    status: p.status,
    cancelado: p.cancelado,
    total: p.total,
    frete: p.frete,
    // Loja própria não paga comissão de marketplace. Nulo, não zero: zero
    // seria uma afirmação de que foi apurada e deu zero.
    comissao: null,
    origem: "api",
  }));

  await emLotes(cabecalhos, 300, async (lote) => {
    const { error } = await sb
      .from("pedidos")
      .upsert(lote, { onConflict: "canal_id,codigo_externo" });
    if (error) throw new Error(`Falha ao gravar pedidos: ${error.message}`);
  });

  /*
   * Some o que a execução anterior gravou e hoje não é mais venda.
   *
   * Um pedido pago ontem pode ter o pagamento estornado hoje, e a VTEX o
   * devolve sem autorização — ele precisa sair, ou a receita fica com uma
   * venda que não existe. Só linhas de origem `api` e só dentro da janela:
   * o que veio de planilha não é desta rotina mexer.
   *
   * A comparação é feita AQUI, e não com `not.in` no banco: a lista de
   * pedidos da janela passa de setecentos códigos, e a URL do PostgREST
   * estoura muito antes disso — o filtro voltava 400 e derrubava a
   * sincronização inteira.
   */
  const janela = lista.map((p) => p.data).sort();
  const vivos = new Set(lista.map((p) => p.id));
  const { data: gravadosAntes, error: eLeitura } = await sb
    .from("pedidos")
    .select("id,codigo_externo")
    .eq("conta_canal_id", ctx.contaCanalId)
    .eq("origem", "api")
    .gte("data", janela[0])
    .lte("data", janela[janela.length - 1]);
  if (eLeitura) throw new Error(`Falha ao ler pedidos da janela: ${eLeitura.message}`);

  const sobrando = (gravadosAntes ?? []).filter((p) => !vivos.has(String(p.codigo_externo))).map((p) => p.id as string);
  await emLotes(sobrando, 200, async (lote) => {
    const { error } = await sb.from("pedidos").delete().in("id", lote);
    if (error) throw new Error(`Falha ao limpar pedidos vencidos: ${error.message}`);
  });

  /* Os itens precisam do id do pedido, que só existe depois do upsert. */
  const idPorCodigo = new Map<string, string>();
  await emLotes(lista.map((p) => p.id), 300, async (lote) => {
    const { data, error } = await sb
      .from("pedidos")
      .select("id,codigo_externo")
      .eq("canal_id", ctx.canalId)
      .in("codigo_externo", lote);
    if (error) throw new Error(`Falha ao reler pedidos: ${error.message}`);
    for (const p of data ?? []) idPorCodigo.set(String(p.codigo_externo), p.id as string);
  });

  const itens: Record<string, unknown>[] = [];
  for (const p of lista) {
    const pedidoId = idPorCodigo.get(p.id);
    if (!pedidoId) continue;
    for (const i of p.itens) {
      if (!i.codigoExterno) continue;
      itens.push({
        operacao_id: ctx.operacaoId,
        pedido_id: pedidoId,
        codigo_externo: i.codigoExterno,
        sku: i.sku,
        titulo: i.titulo,
        quantidade: i.quantidade,
        preco_unitario: i.precoUnitario,
      });
    }
  }

  // Reescreve, não acrescenta: `pedido_itens` não tem chave natural, e sem
  // apagar antes cada execução duplicaria a quantidade vendida.
  const ids = [...idPorCodigo.values()];
  await emLotes(ids, 300, async (lote) => {
    const { error } = await sb.from("pedido_itens").delete().in("pedido_id", lote);
    if (error) throw new Error(`Falha ao limpar itens: ${error.message}`);
  });
  await emLotes(itens, 500, async (lote) => {
    const { error } = await sb.from("pedido_itens").insert(lote);
    if (error) throw new Error(`Falha ao gravar itens: ${error.message}`);
  });

  return { gravados: cabecalhos.length, itens: itens.length };
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export type ResultadoVtex = {
  conta: string;
  periodo: { de: string; ate: string };
  pedidos: {
    lidos: number;
    gravados: number;
    itens: number;
    cancelados: number;
    /** Criados e nunca pagos — não entram como venda nem como cancelamento. */
    semPagamento: number;
  };
  diarias: { dias: number };
};

/**
 * Pedido que nunca teve pagamento aprovado NÃO é venda cancelada.
 *
 * A VTEX cria um pedido no instante em que alguém fecha o carrinho, antes
 * de o cartão responder. Cartão recusado vira pedido `canceled` do mesmo
 * jeito que uma desistência depois de pago — e em setembro isso era metade
 * da loja: 450 cancelados em 927, quase todos sem autorização, muitos
 * repetidos no mesmo valor (indício de teste de cartão).
 *
 * Gravar esses pedidos punha a loja própria com 48% de cancelamento contra
 * 9% da planilha, e a diferença não era erro de ninguém: eram duas
 * perguntas diferentes. Aqui fica a do negócio — "quem comprou e desistiu"
 * —, e a tentativa de compra que nem virou venda fica de fora.
 */
const virouVenda = (p: PedidoVtex) => p.autorizado;

export async function sincronizarVtex(
  opcoes: { de?: string; ate?: string; conta?: string } = {}
): Promise<ResultadoVtex> {
  const de = opcoes.de ?? new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const ate = opcoes.ate ?? hoje();
  if (!opcoes.conta) {
    throw new Error("Diga qual loja sincronizar — o id em `contas_canal`.");
  }

  const ctx = await resolverConta(opcoes.conta);
  const todos = await buscarPedidos({ de, ate, conta: ctx.contaCanalId, nome: ctx.nome });
  const lista = todos.filter(virouVenda);
  const { gravados, itens } = await gravar(ctx, lista);
  const dias = await consolidarDiarias(ctx, de, ate);

  return {
    conta: ctx.nome,
    periodo: { de, ate },
    pedidos: {
      lidos: todos.length,
      gravados,
      itens,
      cancelados: lista.filter((p) => p.cancelado).length,
      semPagamento: todos.length - lista.length,
    },
    diarias: { dias },
  };
}
