import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { operacaoPadrao } from "./operacao";
import { REGRAS } from "@/lib/precificacao/regras-canal";
import { carregarAdsPorProduto } from "./ads-produto";

/**
 * O que a tela de precificação precisa, por produto e por canal.
 *
 * ── Recebido vem do canal, nunca do preço ──
 *
 * `recebido` é a soma de `pedidos.liquido_recebido`, que no Mercado Livre é a
 * conta do próprio canal (itens − tarifa − frete do vendedor). Em promoção
 * com desconto bancado pelo canal, a tarifa vem reduzida e o recebido não cai
 * junto com o preço — derivar de preço × alíquota erraria justamente aí.
 * Pedido sem esse valor fica fora da média e é contado em `semRecebido`.
 */

export type VendaCanal = {
  /** Menor preço de vitrine ativo (clássico, no Meli). */
  vitrine: number | null;
  unidades: number;
  vendido: number;
  /** Só dos pedidos que têm recebido informado. */
  unidadesComRecebido: number;
  vendidoComRecebido: number;
  recebido: number;
  /** Tarifa e frete do vendedor dos mesmos pedidos — o que separa vendido de recebido. */
  comissao: number;
  freteVendedor: number;
  semRecebido: number;
};

export type ProdutoPreco = {
  id: string;
  sku: string;
  titulo: string;
  custo: number | null;
  embalagem: number | null;
  impostoPct: number | null;
  margemMinimaPct: number | null;
  pesoKg: number | null;
  /** Frete por unidade salvo à mão ou cotado (`produtos.frete_unitario`). */
  freteSalvo: number | null;
  /** O anúncio clássico mais barato no Meli, para cotar o frete pela API. */
  mlbMeli: string | null;
  medidas: { altura: number; largura: number; comprimento: number } | null;
  porCanal: Record<string, VendaCanal>;
  /** Gasto de Ads do Meli na janela de `adsJanela`. Nulo sem anúncio patrocinado. */
  adsMeli: number | null;
  /** Esse gasto ÷ vendido do produto no Meli na mesma janela. */
  adsMeliPct: number | null;
};

export type DadosPrecificacao = {
  empresa: string;
  de: string;
  ate: string;
  /** Canais da empresa que têm regra pré-configurada. */
  canais: { codigo: string; nome: string; temVenda: boolean }[];
  produtos: ProdutoPreco[];
  /** Ads ÷ receita do Meli na janela. Nulo sem gasto medido. */
  tacosMeliPct: number | null;
  /** Janela de 30 dias do Ads por produto, como o Meli entrega. */
  adsJanela: { inicio: string; fim: string } | null;
  /** A conta do Meli para cotar frete por medidas. */
  contaMeli: string | null;
};

const n = (v: unknown) => (v == null ? null : Number(v));
const dia = (d: Date) => d.toISOString().slice(0, 10);

export async function carregarPrecificacao(): Promise<DadosPrecificacao | null> {
  const op = await operacaoPadrao();
  if (!op) return null;
  const sb = await clienteServidor();

  const ate = new Date(Date.now() - 86_400_000);
  const de = new Date(ate.getTime() - 29 * 86_400_000);

  const [canaisRaw, produtosRaw, anunciosRaw, pedidosRaw, diariasRaw, contasRaw, ads] = await Promise.all([
    sb.from("canais").select("id,codigo,nome").eq("operacao_id", op.id),
    paginar(() =>
      sb
        .from("produtos")
        .select("id,sku,titulo,custo_unitario,embalagem,aliquota_impostos,margem_minima_pct,peso_kg,altura_cm,largura_cm,comprimento_cm,frete_unitario")
        .eq("operacao_id", op.id)
        .order("sku")
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select("id,produto_id,canal_id,codigo_externo,tipo,preco_atual,status")
        .eq("operacao_id", op.id)
        .eq("status", "ativo")
        .order("id")
    ),
    paginar(() =>
      sb
        .from("pedidos")
        .select("id,canal_id,total,liquido_recebido,comissao,frete_vendedor,pedido_itens(anuncio_id,sku,quantidade,total)")
        .eq("operacao_id", op.id)
        .eq("cancelado", false)
        .gte("data", dia(de))
        .lte("data", dia(ate))
        .order("id")
    ),
    paginar(() =>
      sb
        .from("vendas_diarias")
        .select("canal_id,receita,investimento_ads")
        .eq("operacao_id", op.id)
        .gte("data", dia(de))
        .lte("data", dia(ate))
        .order("id")
    ),
    sb.from("contas_canal").select("id,canal_id,padrao").eq("operacao_id", op.id).eq("ativa", true),
    carregarAdsPorProduto(sb, op.id),
  ]);

  const canais = (canaisRaw.data ?? []) as { id: string; codigo: string; nome: string }[];
  const codigoDoCanal = new Map(canais.map((c) => [c.id, c.codigo]));
  const comRegra = new Set(REGRAS.map((r) => r.codigo));

  type Prod = Record<string, unknown> & { id: string; sku: string; titulo: string };
  const produtos = produtosRaw as unknown as Prod[];
  const porSku = new Map(produtos.map((p) => [p.sku.trim().toUpperCase(), p.id]));

  const vazio = (): VendaCanal => ({
    vitrine: null, unidades: 0, vendido: 0, unidadesComRecebido: 0, vendidoComRecebido: 0, recebido: 0, comissao: 0, freteVendedor: 0, semRecebido: 0,
  });
  const vendas = new Map<string, Record<string, VendaCanal>>();
  const da = (produtoId: string, codigo: string) => {
    const m = vendas.get(produtoId) ?? {};
    vendas.set(produtoId, m);
    return (m[codigo] ??= vazio());
  };

  /* Vitrine: o menor preço ativo. No Meli, o clássico — o premium é outra régua. */
  type Anuncio = { id: string; produto_id: string | null; canal_id: string; codigo_externo: string; tipo: string | null; preco_atual: number | null };
  const mlbDoProduto = new Map<string, string>();
  const anuncios = anunciosRaw as unknown as Anuncio[];
  const produtoDoAnuncio = new Map(anuncios.map((a) => [a.id, a.produto_id]));
  for (const a of anuncios) {
    const codigo = codigoDoCanal.get(a.canal_id);
    if (!a.produto_id || !codigo || a.preco_atual == null) continue;
    if (codigo === "mercado_livre" && a.tipo && a.tipo !== "classico") continue;
    const v = da(a.produto_id, codigo);
    const preco = Number(a.preco_atual);
    if (v.vitrine == null || preco < v.vitrine) {
      v.vitrine = preco;
      if (codigo === "mercado_livre") mlbDoProduto.set(a.produto_id, a.codigo_externo);
    }
  }

  type Pedido = {
    canal_id: string;
    total: number;
    liquido_recebido: number | null;
    comissao: number | null;
    frete_vendedor: number | null;
    pedido_itens: { anuncio_id: string | null; sku: string | null; quantidade: number; total: number }[];
  };
  const canaisComVenda = new Set<string>();
  for (const p of pedidosRaw as unknown as Pedido[]) {
    const codigo = codigoDoCanal.get(p.canal_id);
    if (!codigo) continue;
    const total = Number(p.total);
    for (const i of p.pedido_itens ?? []) {
      const produtoId =
        (i.anuncio_id && produtoDoAnuncio.get(i.anuncio_id)) || (i.sku && porSku.get(i.sku.trim().toUpperCase()));
      if (!produtoId) continue;
      canaisComVenda.add(codigo);
      const v = da(produtoId, codigo);
      const itemTotal = Number(i.total);
      v.unidades += i.quantidade;
      v.vendido += itemTotal;
      if (p.liquido_recebido == null || !total) {
        v.semRecebido += 1;
        continue;
      }
      v.unidadesComRecebido += i.quantidade;
      v.vendidoComRecebido += itemTotal;
      const fatia = itemTotal / total;
      v.recebido += Number(p.liquido_recebido) * fatia;
      v.comissao += Number(p.comissao ?? 0) * fatia;
      v.freteVendedor += Number(p.frete_vendedor ?? 0) * fatia;
    }
  }

  const meliIds = new Set(canais.filter((c) => c.codigo === "mercado_livre").map((c) => c.id));
  let receitaMeli = 0;
  let adsMeli = 0;
  for (const d of diariasRaw as unknown as { canal_id: string; receita: number; investimento_ads: number }[]) {
    if (!meliIds.has(d.canal_id)) continue;
    receitaMeli += Number(d.receita) || 0;
    adsMeli += Number(d.investimento_ads) || 0;
  }

  const contas = (contasRaw.data ?? []) as { id: string; canal_id: string; padrao: boolean }[];
  const contaMeli = contas.filter((c) => meliIds.has(c.canal_id)).sort((a, b) => Number(b.padrao) - Number(a.padrao))[0]?.id ?? null;

  return {
    empresa: op.empresa || op.nome,
    de: dia(de),
    ate: dia(ate),
    canais: canais
      .filter((c) => comRegra.has(c.codigo))
      .map((c) => ({ codigo: c.codigo, nome: REGRAS.find((r) => r.codigo === c.codigo)!.nome, temVenda: canaisComVenda.has(c.codigo) }))
      // Os canais da regra que a empresa ainda não tem também entram: é para eles que se cota.
      .concat(
        REGRAS.filter((r) => !canais.some((c) => c.codigo === r.codigo)).map((r) => ({ codigo: r.codigo, nome: r.nome, temVenda: false }))
      ),
    produtos: produtos.map((p) => {
      const a = n(p.altura_cm), l = n(p.largura_cm), c = n(p.comprimento_cm);
      return {
        id: p.id,
        sku: p.sku,
        titulo: p.titulo,
        custo: n(p.custo_unitario),
        embalagem: n(p.embalagem),
        impostoPct: n(p.aliquota_impostos),
        margemMinimaPct: n(p.margem_minima_pct),
        pesoKg: n(p.peso_kg),
        freteSalvo: n(p.frete_unitario),
        mlbMeli: mlbDoProduto.get(p.id) ?? null,
        medidas: a && l && c ? { altura: a, largura: l, comprimento: c } : null,
        porCanal: vendas.get(p.id) ?? {},
        adsMeli: ads?.porProduto.get(p.id)?.investimento ?? null,
        adsMeliPct: ads?.porProduto.get(p.id)?.tacosPct ?? null,
      };
    }),
    adsJanela: ads ? { inicio: ads.inicio, fim: ads.fim } : null,
    tacosMeliPct: receitaMeli > 0 && adsMeli > 0 ? +((adsMeli / receitaMeli) * 100).toFixed(1) : null,
    contaMeli,
  };
}
