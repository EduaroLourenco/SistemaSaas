import "server-only";
import { meliGet, vendedor } from "./cliente";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import type { Integracao } from "@/lib/integracoes/cofre";
import { gravarEstoques, registrarFalhaEstoque } from "@/lib/estoques/gravar";
import { quantidade, type LocalEstoque, type SaldoEstoque } from "@/lib/estoques/tipos";

type Variacao = { id?: number; user_product_id?: string; inventory_id?: string; seller_custom_field?: string; available_quantity?: number; attributes?: { id: string; value_name?: string }[] };
type Item = Variacao & { id: string; title?: string; variations?: Variacao[] };
type Estoque = { locations?: { type: string; store_id?: string; quantity?: number; availability_type?: string }[]; last_updated?: string };
type Loja = { id: string | number; description?: string };
const TAMANHO = 40;
const fila = globalThis as unknown as { __filaEstoqueMeli?: Promise<void> };

// User Products tem cota própria de 100 requisições/minuto. Serializa também
// execuções simultâneas deste processo, além do limitador geral do cliente.
async function lerSaldo(conta: string, up: string) {
  const anterior = fila.__filaEstoqueMeli ?? Promise.resolve();
  let liberar!: () => void;
  fila.__filaEstoqueMeli = new Promise<void>((resolve) => { liberar = resolve; });
  await anterior;
  try { return await meliGet<Estoque>(`/user-products/${encodeURIComponent(up)}/stock`, conta); }
  finally { await new Promise((resolve) => setTimeout(resolve, 650)); liberar(); }
}

export function normalizarLocaisMeli(up: string, itens: { mlb: string; sku: string | null; titulo: string }[], r: Estoque, lojas: Map<string, string>): SaldoEstoque[] {
  const skus = [...new Set(itens.map((i) => i.sku).filter(Boolean))];
  const saida = new Map<string, SaldoEstoque>();
  for (const l of r.locations ?? []) {
    const full = l.type === "meli_facility";
    const id = `${l.type}:${l.store_id ?? "geral"}:${l.availability_type ?? "in_stock"}`;
    const nome = full ? "Full · Mercado Livre" : l.store_id
      ? lojas.get(String(l.store_id)) ?? `Depósito ${l.store_id}`
      : l.type === "selling_address" ? "Depósito do vendedor" : l.type;
    const disponivel = l.availability_type && l.availability_type !== "in_stock" ? null : quantidade(l.quantity);
    saida.set(id, {
      produto_externo: up, sku: skus.length === 1 ? skus[0]! : null, titulo: itens[0]?.titulo ?? up,
      local_id: id, local_nome: nome, local_tipo: l.type, disponivel, fisico: null, reservado: null,
      anuncios: [...new Set(itens.map((i) => i.mlb))], atualizado_origem_em: r.last_updated ?? null,
      observacao: skus.length > 1 ? "Estoque compartilhado por anúncios com SKUs diferentes. Confira o vínculo no canal."
        : disponivel == null ? `Situação informada pelo canal: ${l.availability_type ?? "saldo não informado"}.`
        : l.type === "selling_address" ? "Saldo declarado ao Mercado Livre; não confirma a contagem física do depósito." : null,
    });
  }
  return [...saida.values()];
}

export async function estoqueMeli(integ: Integracao, pagina = 0) {
  try {
    const conta = integ.contaCanalId;
    if (!conta) throw new Error("A integração não possui conta de canal.");
    const sb = clientePrivilegiado();
    const { data, error } = await sb.from("anuncios").select("codigo:codigo_externo,sku:sku_canal,titulo")
      .eq("operacao_id", integ.operacaoId).eq("conta_canal_id", conta)
      .order("codigo_externo").range(pagina * TAMANHO, (pagina + 1) * TAMANHO - 1);
    if (error) throw new Error(`Não foi possível listar os anúncios: ${error.message}`);
    const catalogo = (data ?? []) as { codigo: string; sku: string | null; titulo: string }[];
    const lojas = new Map<string, string>();
    const avisos = new Set<string>();
    try {
      const v = await vendedor(conta);
      for (let offset = 0; ; offset += 50) {
        const r = await meliGet<{ results?: Loja[]; paging?: { total?: number } }>(`/users/${v.id}/stores/search?limit=50&offset=${offset}`, conta);
        (r.results ?? []).forEach((l) => lojas.set(String(l.id), l.description?.trim() || `Depósito ${l.id}`));
        if ((r.results?.length ?? 0) < 50 || offset + 50 >= (r.paging?.total ?? Infinity)) break;
      }
    } catch { avisos.add("O canal não retornou os nomes de todos os depósitos. Os identificadores foram preservados."); }
    const grupos = new Map<string, { up?: string; inventario?: string; itens: { mlb: string; sku: string | null; titulo: string }[]; quantidade: number | null }>();
    for (let p = 0; p < catalogo.length; p += 20) {
      const lote = catalogo.slice(p, p + 20);
      const brutos = await meliGet<{ code: number; body: Item }[]>(`/items?ids=${encodeURIComponent(lote.map((a) => a.codigo).join(","))}`, conta);
      for (const r of brutos) {
        if (r.code !== 200 || !r.body?.id) { avisos.add("Alguns anúncios não puderam ser consultados; seus saldos anteriores continuam identificados pela data."); continue; }
        const b = r.body;
        const conhecido = lote.find((a) => a.codigo === b.id);
        const variantes = b.variations?.length ? b.variations : [b];
        for (const v of variantes) {
          const up = v.user_product_id ?? (variantes.length === 1 ? b.user_product_id : undefined);
          const inventario = v.inventory_id ?? (variantes.length === 1 ? b.inventory_id : undefined);
          const chave = up || (inventario ? `inventory:${inventario}` : `item:${b.id}:${v.id ?? "unico"}`);
          const grupo = grupos.get(chave) ?? { up, inventario, itens: [], quantidade: quantidade(v.available_quantity) };
          grupo.itens.push({ mlb: b.id, sku: v.seller_custom_field?.trim() || v.attributes?.find((a) => a.id === "SELLER_SKU")?.value_name?.trim() || conhecido?.sku || null, titulo: b.title || conhecido?.titulo || b.id });
          grupos.set(chave, grupo);
        }
      }
    }
    const saldos: SaldoEstoque[] = [];
    for (const [chave, g] of grupos) {
      let separados: SaldoEstoque[] = [];
      if (g.up) {
        try { separados = normalizarLocaisMeli(g.up, g.itens, await lerSaldo(conta, g.up), lojas); }
        catch { avisos.add("Alguns produtos não disponibilizaram o detalhamento por depósito."); }
      }
      if (!separados.some((s) => s.local_tipo === "meli_facility") && g.inventario) {
        try {
          const r = await meliGet<{ total?: number; available_quantity?: number }>(`/inventories/${encodeURIComponent(g.inventario)}/stock/fulfillment`, conta);
          separados.push({ produto_externo: chave, sku: g.itens[0].sku, titulo: g.itens[0].titulo, local_id: "meli_facility:geral:in_stock", local_nome: "Full · Mercado Livre", local_tipo: "meli_facility", disponivel: quantidade(r.available_quantity), fisico: quantidade(r.total), reservado: null, anuncios: g.itens.map((i) => i.mlb), observacao: "Total nos centros Full. O canal não detalhou os centros individualmente." });
        } catch { avisos.add("Alguns estoques Full não puderam ser consultados."); }
      }
      if (!separados.length) separados.push({ produto_externo: chave, sku: g.itens[0].sku, titulo: g.itens[0].titulo, local_id: "anuncio", local_nome: "Disponível no anúncio", local_tipo: "anuncio", disponivel: g.quantidade, fisico: null, reservado: null, anuncios: g.itens.map((i) => i.mlb), observacao: "Sem divisão por depósito na resposta. Este saldo não deve ser somado ao ERP ou a outros anúncios." });
      saldos.push(...separados);
    }
    const locais: LocalEstoque[] = [...new Map(saldos.map((s) => [s.local_id, { id: s.local_id, nome: s.local_nome, tipo: s.local_tipo }])).values()];
    const continuacao = catalogo.length === TAMANHO ? pagina + 1 : undefined;
    await gravarEstoques(integ, "mercado_livre", "canal", saldos, locais, pagina, continuacao, [...avisos]);
    return { detalhe: `${catalogo.length} anúncios consultados · lote ${pagina + 1}`, avisos: [...avisos], continuacao };
  } catch (e) {
    await registrarFalhaEstoque(integ, "mercado_livre", e instanceof Error ? e.message : "Falha na leitura do estoque.");
    throw e;
  }
}
