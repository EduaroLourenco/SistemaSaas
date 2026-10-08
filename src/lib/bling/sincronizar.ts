import { abastecerProdutos } from "@/lib/produtos/abastecer";
import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { consolidarDiarias } from "@/lib/sync/diarias";
import type { Integracao } from "@/lib/integracoes/cofre";
import { bling } from "./cliente";

/**
 * Pedidos do Bling → `pedidos` e `pedido_itens`, conta por conta.
 *
 * ── A distribuição por canal ──
 *
 * O Bling mistura pedido de todos os canais. Cada pedido traz `loja.id`, o
 * número da loja virtual DENTRO do Bling daquela empresa — que não diz o
 * nome do canal (ler o nome pediria o escopo de configurar integrações, e o
 * app é só leitura). A ligação loja → conta fica em `config.lojas`,
 * escolhida na aba ERP; na falta, vale a conta cujo "Id no canal" seja o
 * número da loja.
 *
 * Pedido de loja ainda não ligada NÃO é gravado: jogá-lo num canal qualquer
 * poria receita de Magalu no Mercado Livre sem ninguém ver. Ele fica
 * contado em `config.lojasPendentes`, que a aba ERP mostra para ligar.
 *
 * ── Dupla contagem ──
 *
 * Conta que já entra por API própria (Mercado Livre, VTEX) é pulada: o
 * mesmo pedido chega pelos dois caminhos com códigos diferentes, e a
 * receita dobraria. É a mesma regra da importação da Vtrina.
 *
 * ── Cancelamento ──
 *
 * Situação 12 é "Cancelado" no Bling. Situação personalizada criada pela
 * empresa não é reconhecida como cancelada — o status fica gravado, e dá
 * para revisar quando aparecer.
 */

const CANCELADO = 12;

type PedidoLista = {
  id: number;
  numero?: number;
  numeroLoja?: string;
  data: string;
  total: number;
  situacao?: { id: number };
  loja?: { id: number };
};
type PedidoDetalhe = {
  data: {
    itens?: { codigo?: string; descricao?: string; quantidade?: number; valor?: number; produto?: { id?: number } }[];
    transporte?: { frete?: number };
  };
};

export type Pendente = { pedidos: number; exemplo: string };
export type ResultadoBling = {
  pedidos: number;
  itens: number;
  pulados: number;
  pendentes: Record<string, Pendente>;
};

export async function sincronizarBling(integ: Integracao, de: string, ate: string): Promise<ResultadoBling> {
  const sb = clientePrivilegiado();

  const [{ data: contas }, { data: comApi }] = await Promise.all([
    sb.from("contas_canal").select("id,canal_id,identificador").eq("operacao_id", integ.operacaoId),
    sb
      .from("integracoes")
      .select("conta_canal_id")
      .eq("operacao_id", integ.operacaoId)
      .in("provedor", ["mercado_livre", "vtex"])
      .not("credencial_ref", "is", null),
  ]);
  const contaPorId = new Map((contas ?? []).map((c) => [c.id as string, c]));
  const porIdentificador = new Map(
    (contas ?? []).filter((c) => c.identificador).map((c) => [String(c.identificador), c.id as string])
  );
  const viaApi = new Set((comApi ?? []).map((i) => i.conta_canal_id as string));
  const mapa = (integ.config.lojas ?? {}) as Record<string, string>;

  /* 1. A lista do período, paginada. */
  const lista: PedidoLista[] = [];
  for (let pagina = 1; ; pagina++) {
    const j = await bling<{ data?: PedidoLista[] }>(integ, "/pedidos/vendas", {
      pagina,
      limite: 100,
      dataInicial: de,
      dataFinal: ate,
    });
    const lote = j.data ?? [];
    lista.push(...lote);
    if (lote.length < 100) break;
  }

  /* 2. Distribuição. */
  const pendentes: Record<string, Pendente> = {};
  let pulados = 0;
  const porConta = new Map<string, PedidoLista[]>();
  for (const p of lista) {
    const loja = String(p.loja?.id ?? 0);
    const contaId = mapa[loja] ?? porIdentificador.get(loja);
    if (!contaId || !contaPorId.has(contaId)) {
      const pd = (pendentes[loja] ??= { pedidos: 0, exemplo: String(p.numeroLoja || p.numero || p.id) });
      pd.pedidos++;
      continue;
    }
    if (viaApi.has(contaId)) {
      pulados++;
      continue;
    }
    porConta.set(contaId, [...(porConta.get(contaId) ?? []), p]);
  }

  /* 3. Grava, conta por conta, com o detalhe (itens e frete) de cada pedido. */
  let gravados = 0;
  let itensGravados = 0;
  for (const [contaId, pedidos] of porConta) {
    const conta = contaPorId.get(contaId)!;
    const detalhes = new Map<number, PedidoDetalhe["data"]>();
    for (const p of pedidos) {
      detalhes.set(p.id, (await bling<PedidoDetalhe>(integ, `/pedidos/vendas/${p.id}`)).data ?? {});
    }

    const cabecalhos = pedidos.map((p) => ({
      operacao_id: integ.operacaoId,
      canal_id: conta.canal_id,
      conta_canal_id: contaId,
      /*
       * O id do Bling, prefixado, e não o número do pedido no canal: dois
       * pedidos do Bling podem carregar o mesmo número de loja (envio
       * desmembrado), e a chave única fundiria os dois num só.
       */
      codigo_externo: `bling-${p.id}`,
      data: p.data,
      status: String(p.situacao?.id ?? ""),
      cancelado: p.situacao?.id === CANCELADO,
      total: Number(p.total) || 0,
      frete: Number(detalhes.get(p.id)?.transporte?.frete) || 0,
      origem: "api",
    }));
    const { data: salvos, error } = await sb
      .from("pedidos")
      .upsert(cabecalhos, { onConflict: "canal_id,codigo_externo" })
      .select("id,codigo_externo");
    if (error) throw new Error(`Falha ao gravar pedidos do Bling: ${error.message}`);

    const idPorCodigo = new Map((salvos ?? []).map((s) => [String(s.codigo_externo), s.id as string]));
    const itens = pedidos.flatMap((p) => {
      const pid = idPorCodigo.get(`bling-${p.id}`);
      if (!pid) return [];
      /*
       * Desconto do pedido rateado nos itens. O Bling devolve o item pelo
       * preço de lista, e o cupom/desconto do canal (Shopee, Magalu) fica
       * no pedido: os itens somavam MAIS que o pedido em 148 de 256 pedidos
       * da Shopee, e a receita por produto saía inflada. Com o rateio,
       * itens + frete = total do pedido, a mesma relação dos outros canais.
       */
      const brutos = detalhes.get(p.id)?.itens ?? [];
      const somaItens = brutos.reduce((t, it) => t + (Number(it.quantidade) || 0) * (Number(it.valor) || 0), 0);
      const frete = Number(detalhes.get(p.id)?.transporte?.frete) || 0;
      const liquido = (Number(p.total) || 0) - frete;
      const fator = somaItens > 0 && liquido > 0 && liquido < somaItens ? liquido / somaItens : 1;
      return brutos
        .map((it) => ({
          operacao_id: integ.operacaoId,
          pedido_id: pid,
          codigo_externo: String(it.codigo || it.produto?.id || "sem-codigo"),
          sku: it.codigo || null,
          titulo: it.descricao ?? null,
          quantidade: Math.round(Number(it.quantidade) || 0),
          preco_unitario: Math.round(Math.max(0, (Number(it.valor) || 0) * fator) * 100) / 100,
        }))
        .filter((it) => it.quantidade > 0);
    });
    // Reescreve os itens: sem apagar antes, ressincronizar duplicaria quantidade.
    const ids = [...idPorCodigo.values()];
    for (let i = 0; i < ids.length; i += 200) {
      await sb.from("pedido_itens").delete().in("pedido_id", ids.slice(i, i + 200));
    }
    for (let i = 0; i < itens.length; i += 500) {
      const { error: e } = await sb.from("pedido_itens").insert(itens.slice(i, i + 500));
      if (e) throw new Error(`Falha ao gravar itens do Bling: ${e.message}`);
    }

    await consolidarDiarias({ operacaoId: integ.operacaoId, canalId: conta.canal_id, contaCanalId: contaId }, de, ate);
    gravados += cabecalhos.length;
    itensGravados += itens.length;
  }

  /*
   * Pendentes acumulam entre execuções: a janela diária é curta, e uma loja
   * que vendeu na semana passada continua precisando de ligação hoje.
   */
  const antes = (integ.config.lojasPendentes ?? {}) as Record<string, Pendente>;
  const juntos: Record<string, Pendente> = { ...antes };
  for (const [loja, p] of Object.entries(pendentes)) {
    juntos[loja] = { pedidos: Math.max(p.pedidos, antes[loja]?.pedidos ?? 0), exemplo: p.exemplo };
  }
  for (const loja of Object.keys(juntos)) if (mapa[loja]) delete juntos[loja];

  const config = { ...integ.config, lojasPendentes: juntos };
  await sb
    .from("integracoes")
    .update({ config, ultima_sincronizacao: new Date().toISOString(), ultimo_erro: null, status: "conectada" })
    .eq("id", integ.id);
  integ.config = config;

  // SKU novo vendido pelo Bling ganha produto, para ter onde pôr custo.
  if (itensGravados) await abastecerProdutos(sb, integ.operacaoId).catch(() => null);

  return { pedidos: gravados, itens: itensGravados, pulados, pendentes: juntos };
}
