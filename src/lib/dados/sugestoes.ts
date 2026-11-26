import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { carregarCanais } from "./canais";
import { carregarFormulaBase } from "./formula-base";
import { operacaoPadrao } from "./operacao";
import { paginar, paginarPorIds } from "./paginar";
import { emCache } from "@/lib/cache-tela";
import { lerPromocoesDoCanal, promocoesDoAnuncio } from "@/lib/meli/promocoes-canal";
import {
  PARAMETROS_PADRAO,
  type CustoDoItem,
  type ItemBruto,
  type Parametros,
  type PromoDoItem,
} from "@/lib/planilhas/sugestoes-promocao";

/**
 * O que as Promoções sugeridas precisam, por anúncio — sem decidir nada.
 *
 * A decisão mora em `planilhas/sugestoes-promocao.ts` e roda na tela: o
 * lápis muda um parâmetro e a lista se recalcula sem voltar aqui. Este
 * módulo só junta o dado bruto, uma vez, e guarda em cache por empresa.
 *
 * ── O que é ao vivo e o que é banco ──
 *
 * Os convites vêm do canal, porque o banco não guarda `seller_percentage`,
 * `offer_id` nem a faixa de preço do convite, e convite muda todo dia.
 * Uma chamada por conta para a lista de promoções, e a varredura de cada
 * promoção de 50 em 50, três promoções por vez — o freio do cliente
 * (`limite.ts`) segura a cota. Na Bom de Compras são 8 promoções.
 *
 * Todo o resto é banco: anúncio, custo, vendas de 90 dias, catálogo,
 * preço mínimo.
 *
 * ── Cache ──
 *
 * Dez minutos por empresa (`emCache`), e o botão Atualizar fura. Antes de
 * enviar, a rota relê cada item selecionado no canal — o cache nunca
 * decide o que sai.
 */

const SEM_TABELA = new Set(["42P01", "PGRST205"]);

export type DadosSugestoes = {
  itens: ItemBruto[];
  parametros: Parametros;
  contas: { id: string; nome: string; escrita: boolean }[];
  /** Aviso de migração que falta, para a tela mostrar. */
  faltaMigracao: string | null;
  /** De onde veio o preço mínimo, e de quando. */
  fonteMinimo: { tabela: string | null; formulaBase: string | null };
  falhas: { conta: string; erro: string }[];
  lidoEm: string;
};

/* ══ Parâmetros do robô ═══════════════════════════════════════ */

export async function carregarParametros(): Promise<{ parametros: Parametros; faltaMigracao: boolean }> {
  const op = await operacaoPadrao();
  if (!op) return { parametros: PARAMETROS_PADRAO, faltaMigracao: false };
  const sb = await clienteServidor();
  const { data, error } = await sb
    .from("robo_promocoes")
    .select("parametros,regras_desligadas")
    .eq("operacao_id", op.id)
    .maybeSingle();
  if (error) {
    if (SEM_TABELA.has(error.code)) return { parametros: PARAMETROS_PADRAO, faltaMigracao: true };
    throw new Error(`Não consegui ler as regras do robô: ${error.message}`);
  }
  const salvo = (data?.parametros ?? {}) as Partial<Parametros>;
  return {
    parametros: {
      ...PARAMETROS_PADRAO,
      ...salvo,
      regrasDesligadas: (data?.regras_desligadas ?? []) as Parametros["regrasDesligadas"],
    },
    faltaMigracao: false,
  };
}

export async function gravarParametros(p: Parametros): Promise<{ erro?: string }> {
  const op = await operacaoPadrao();
  if (!op) return { erro: "Sem empresa." };
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  const { regrasDesligadas, ...parametros } = p;
  const { error } = await sb.from("robo_promocoes").upsert({
    operacao_id: op.id,
    parametros,
    regras_desligadas: regrasDesligadas,
    atualizado_por: sessao.user?.id ?? null,
    atualizado_em: new Date().toISOString(),
  });
  if (!error) return {};
  if (SEM_TABELA.has(error.code)) return { erro: "Rode db/52_promocoes_sugeridas.sql no Supabase para guardar as regras." };
  if (error.code === "42501") return { erro: "Seu acesso não permite mudar as regras desta empresa." };
  return { erro: error.message };
}

/* ══ Preço mínimo ═════════════════════════════════════════════ */

type Minimos = { porSku: Map<string, { classico?: number; premium?: number }>; vigencia: string | null; faltaMigracao: boolean };

async function carregarMinimos(operacaoId: string): Promise<Minimos> {
  const sb = await clienteServidor();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { data: v, error } = await sb
    .from("preco_minimo")
    .select("vigente_de")
    .eq("operacao_id", operacaoId)
    .lte("vigente_de", hoje)
    .order("vigente_de", { ascending: false })
    .limit(1);
  if (error) {
    if (SEM_TABELA.has(error.code)) return { porSku: new Map(), vigencia: null, faltaMigracao: true };
    throw new Error(`Não consegui ler o preço mínimo: ${error.message}`);
  }
  const vigencia = (v?.[0]?.vigente_de as string | undefined) ?? null;
  const porSku = new Map<string, { classico?: number; premium?: number }>();
  if (!vigencia) return { porSku, vigencia, faltaMigracao: false };
  const linhas = (await paginar(() =>
    sb.from("preco_minimo").select("id,sku,tipo_anuncio,preco").eq("operacao_id", operacaoId).eq("vigente_de", vigencia).order("id")
  )) as unknown as { sku: string; tipo_anuncio: "classico" | "premium"; preco: number | string }[];
  for (const l of linhas) {
    const k = l.sku.trim().toUpperCase();
    porSku.set(k, { ...porSku.get(k), [l.tipo_anuncio]: Number(l.preco) });
  }
  return { porSku, vigencia, faltaMigracao: false };
}

/* ══ Anúncios, custo, vendas, catálogo ════════════════════════ */

type AnuncioLinha = {
  id: string;
  codigo_externo: string;
  sku_canal: string | null;
  titulo: string;
  foto: string | null;
  status: string;
  estoque: number | null;
  tipo: string | null;
  preco_atual: number | string | null;
  comissao_atual: number | string | null;
  produtos: CustoLinha | CustoLinha[] | null;
};
type CustoLinha = {
  custo_unitario: number | string | null;
  embalagem: number | string | null;
  aliquota_impostos: number | string | null;
  frete_unitario: number | string | null;
};

function custoDe(p: CustoLinha | null): CustoDoItem | null {
  if (!p || p.embalagem == null || p.aliquota_impostos == null || p.frete_unitario == null) return null;
  const mercadoria = Number(p.custo_unitario);
  if (!(mercadoria > 0)) return null;
  return { mercadoria, embalagem: Number(p.embalagem), frete: Number(p.frete_unitario), impostoPct: Number(p.aliquota_impostos) };
}

const tipoDe = (t: string | null): "classico" | "premium" | null =>
  t == null ? null : t.toLowerCase().startsWith("prem") || t === "gold_pro" ? "premium" : "classico";

async function vendasPorAnuncio(ids: string[]) {
  const sb = await clienteServidor();
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const linhas = (await paginarPorIds(ids, (lote) =>
    sb
      .from("pedido_itens")
      .select("id,anuncio_id,quantidade,pedidos!inner(data,cancelado)")
      .in("anuncio_id", lote)
      .gte("pedidos.data", desde)
      .eq("pedidos.cancelado", false)
      .order("id")
  )) as unknown as { anuncio_id: string; quantidade: number | string | null; pedidos: { data: string } | { data: string }[] }[];
  const agora = Date.now();
  const mapa = new Map<string, { u7: number; u30: number; u90: number; ultimaVenda: string | null }>();
  for (const l of linhas) {
    const dataPedido = Array.isArray(l.pedidos) ? l.pedidos[0]?.data : l.pedidos?.data;
    if (!dataPedido) continue;
    const q = Number(l.quantidade ?? 1) || 1;
    const dias = (agora - new Date(dataPedido).getTime()) / 86_400_000;
    const v = mapa.get(l.anuncio_id) ?? { u7: 0, u30: 0, u90: 0, ultimaVenda: null };
    v.u90 += q;
    if (dias <= 30) v.u30 += q;
    if (dias <= 7) v.u7 += q;
    if (!v.ultimaVenda || dataPedido > v.ultimaVenda) v.ultimaVenda = dataPedido;
    mapa.set(l.anuncio_id, v);
  }
  return mapa;
}

async function catalogoPorAnuncio(ids: string[]) {
  const sb = await clienteServidor();
  const desde = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
  const linhas = (await paginarPorIds(ids, (lote) =>
    sb
      .from("anuncio_catalogo_diario")
      .select("id,anuncio_id,data,situacao,vencedor_preco")
      .in("anuncio_id", lote)
      .gte("data", desde)
      .order("id")
  )) as unknown as { anuncio_id: string; data: string; situacao: string | null; vencedor_preco: number | string | null }[];
  const mapa = new Map<string, { data: string; vencedorPreco: number | null; situacao: string | null }>();
  for (const l of linhas) {
    const atual = mapa.get(l.anuncio_id);
    if (atual && atual.data >= l.data) continue;
    mapa.set(l.anuncio_id, { data: l.data, vencedorPreco: l.vencedor_preco == null ? null : Number(l.vencedor_preco), situacao: l.situacao });
  }
  return mapa;
}

/* ══ Convites ao vivo ═════════════════════════════════════════ */

type PromoBrutaExtra = { deadline_date?: string };

/**
 * As promoções de cada anúncio ativo, uma chamada por anúncio.
 *
 * Por anúncio e não por promoção: em 26/11/2026 a lista de promoções da
 * Bom de Compras (`/seller-promotions/users`) trazia 5 campanhas, e as
 * co-participadas em que os anúncios estavam convidados — "Massivo FH
 * Houseware Nov", "FH Hous SD Alto 80 OutNo" — não estavam entre elas.
 * Só `/seller-promotions/items/{MLB}` mostra tudo. O prazo, quando a
 * campanha aparece na lista, vem de lá.
 *
 * O freio do cliente (4 por segundo) dá o ritmo: 105 anúncios na BdC
 * são uns 30 segundos; 753 na conta a prazo da Probel, uns 3 minutos.
 */
async function convitesDaConta(contaId: string, mlbs: string[]): Promise<{ porMlb: Map<string, PromoDoItem[]>; naoLidos: number }> {
  const prazos = new Map<string, string | null>();
  try {
    for (const p of await lerPromocoesDoCanal(contaId)) {
      prazos.set(p.codigo, (p.bruto as PromoBrutaExtra)?.deadline_date ?? p.fim);
    }
  } catch {
    /* Sem a lista, só fica sem prazo — os convites vêm do item. */
  }

  const porMlb = new Map<string, PromoDoItem[]>();
  let naoLidos = 0;
  const fila = [...mlbs];
  const trabalhar = async (): Promise<void> => {
    const mlb = fila.shift();
    if (!mlb) return;
    const r = await promocoesDoAnuncio(contaId, mlb);
    if (!r.lido) naoLidos++;
    else {
      porMlb.set(
        mlb.toUpperCase(),
        r.promocoes
          /* PRICE_DISCOUNT é desconto avulso, sem campanha: precisa de datas e fica fora. */
          .filter((p) => p.codigo && p.status !== "finished")
          .map((p) => ({
            codigo: p.codigo!,
            tipo: p.tipo,
            nome: p.nome,
            status: p.status,
            preco: p.preco,
            precoCheio: p.precoOriginal,
            minimo: p.precoMinimo,
            maximo: p.precoMaximo,
            sugerido: p.sugerido,
            meliPct: p.meliPct,
            sellerPct: p.sellerPct,
            oferta: p.oferta,
            inicio: p.inicio,
            fim: p.fim,
            prazo: p.status === "candidate" ? prazos.get(p.codigo!) ?? null : null,
            estoqueMin: p.estoqueMin,
            estoqueMax: p.estoqueMax,
            boost: p.boost ?? null,
          }))
      );
    }
    return trabalhar();
  };
  await Promise.all(Array.from({ length: Math.min(4, fila.length) }, trabalhar));
  return { porMlb, naoLidos };
}

/* ══ Contexto e uma conta ═════════════════════════════════════ */

/** O que a tela precisa antes de ler qualquer conta. Só banco. */
export async function carregarContextoSugestoes(): Promise<Omit<DadosSugestoes, "itens" | "falhas" | "lidoEm">> {
  const op = await operacaoPadrao();
  if (!op) return { parametros: PARAMETROS_PADRAO, contas: [], faltaMigracao: null, fonteMinimo: { tabela: null, formulaBase: null } };
  const [{ contas }, { parametros, faltaMigracao: semRobo }, minimos] = await Promise.all([
    carregarCanais(),
    carregarParametros(),
    carregarMinimos(op.id),
  ]);
  const base = await carregarFormulaBase().catch(() => null);
  const doMeli = contas.filter((c) => c.canalCodigo === "mercado_livre" && c.conectada && c.ativa);
  return {
    parametros,
    contas: doMeli.map((c) => ({ id: c.id, nome: c.nome, escrita: Boolean(c.escrita?.conectada) })),
    faltaMigracao: semRobo || minimos.faltaMigracao
      ? "Rode db/52_promocoes_sugeridas.sql no Supabase para guardar as regras e importar a tabela de preço mínimo."
      : null,
    fonteMinimo: { tabela: minimos.vigencia, formulaBase: base?.vigenteDe ?? null },
  };
}

export type SugestoesDaConta = { itens: ItemBruto[]; lidos: number; naoLidos: number; lidoEm: string };

async function montarConta(contaId: string): Promise<SugestoesDaConta> {
  const lidoEm = new Date().toISOString();
  const op = await operacaoPadrao();
  if (!op) return { itens: [], lidos: 0, naoLidos: 0, lidoEm };

  const { contas } = await carregarCanais();
  const conta = contas.find((c) => c.id === contaId && c.canalCodigo === "mercado_livre");
  if (!conta) throw new Error("conta não encontrada");

  const sb = await clienteServidor();
  const [anuncios, minimos, base] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncios")
        .select("id,codigo_externo,sku_canal,titulo,foto,status,estoque,tipo,preco_atual,comissao_atual,produtos(custo_unitario,embalagem,aliquota_impostos,frete_unitario)")
        .eq("conta_canal_id", conta.id)
        .order("id")
    ) as unknown as Promise<AnuncioLinha[]>,
    carregarMinimos(op.id),
    carregarFormulaBase().catch(() => null),
  ]);

  /* Só o que pode entrar em promoção: ativo e com estoque (ou sem controle). */
  const ativos = anuncios.filter((a) => (a.status === "ativo" || a.status === "active") && (a.estoque == null || a.estoque > 0));
  const { porMlb, naoLidos } = await convitesDaConta(conta.id, ativos.map((a) => a.codigo_externo));
  const comPromo = ativos.filter((a) => (porMlb.get(a.codigo_externo.toUpperCase()) ?? []).length > 0);
  const ids = comPromo.map((a) => a.id);
  const [vendas, catalogo] = await Promise.all([
    vendasPorAnuncio(ids).catch(() => null),
    catalogoPorAnuncio(ids).catch(() => new Map<string, { data: string; vencedorPreco: number | null; situacao: string | null }>()),
  ]);

  const itens: ItemBruto[] = comPromo.map((a) => {
    const mlb = a.codigo_externo.toUpperCase();
    const tipo = tipoDe(a.tipo);
    const sku = a.sku_canal?.trim() || null;

    /* 1. tabela de preço mínimo → 2. Fórmula base na comissão cheia → 3. custo (no motor) */
    let minimo: ItemBruto["minimo"] = null;
    const daTabela = sku ? minimos.porSku.get(sku.toUpperCase()) : undefined;
    const valorTabela = tipo === "premium" ? daTabela?.premium : daTabela?.classico;
    if (valorTabela != null) {
      minimo = { valor: valorTabela, fonte: "tabela", vigencia: minimos.vigencia };
    } else if (base) {
      const linha = base.dados.precosMLB.get(mlb) ?? (sku ? base.dados.precosSKU.get(sku) : undefined);
      const v = linha?.[tipo === "premium" ? 0.165 : 0.115];
      if (v != null) minimo = { valor: v, fonte: "formula_base", vigencia: base.vigenteDe };
    }

    const produto = Array.isArray(a.produtos) ? a.produtos[0] ?? null : a.produtos;
    const cat = catalogo.get(a.id);
    return {
      contaId: conta.id,
      contaNome: conta.nome,
      mlb: a.codigo_externo,
      sku,
      titulo: a.titulo,
      foto: a.foto,
      tipoAnuncio: tipo,
      statusAnuncio: a.status,
      estoque: a.estoque,
      precoCheio: a.preco_atual == null ? null : Number(a.preco_atual),
      minimo,
      custo: custoDe(produto),
      comissaoPct: a.comissao_atual == null ? null : Number(a.comissao_atual) || null,
      vendas: vendas ? vendas.get(a.id) ?? { u7: 0, u30: 0, u90: 0, ultimaVenda: null } : null,
      catalogo: cat ? { vencedorPreco: cat.vencedorPreco, situacao: cat.situacao } : null,
      promos: porMlb.get(mlb) ?? [],
    };
  });

  return { itens, lidos: ativos.length - naoLidos, naoLidos, lidoEm };
}

/** Uma conta, com cache de 10 minutos por empresa; `forcar` relê do canal. */
export async function carregarSugestoesDaConta(contaId: string, forcar = false): Promise<SugestoesDaConta> {
  if (forcar) return montarConta(contaId);
  return emCache("sugestoes-promocao", { contaId }, () => montarConta(contaId));
}

/* ══ Importar a tabela ════════════════════════════════════════ */

export async function gravarPrecoMinimo(
  linhas: { sku: string; tipo: "classico" | "premium"; preco: number }[],
  origem: string
): Promise<{ erro?: string; vigenteDe?: string; gravadas?: number }> {
  const op = await operacaoPadrao();
  if (!op) return { erro: "Sem empresa." };
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const rows = linhas.map((l) => ({
    operacao_id: op.id,
    sku: l.sku,
    tipo_anuncio: l.tipo,
    preco: l.preco,
    vigente_de: hoje,
    origem,
    criado_por: sessao.user?.id ?? null,
  }));
  /* Reimportar no mesmo dia substitui a vigência de hoje inteira: SKU que
     saiu da planilha não pode continuar valendo. */
  const { error: erroApagar } = await sb.from("preco_minimo").delete().eq("operacao_id", op.id).eq("vigente_de", hoje);
  if (erroApagar) {
    if (SEM_TABELA.has(erroApagar.code)) return { erro: "Rode db/52_promocoes_sugeridas.sql no Supabase antes de importar." };
    return { erro: erroApagar.code === "42501" ? "Seu acesso não permite alterar esta empresa." : erroApagar.message };
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("preco_minimo").insert(rows.slice(i, i + 500));
    if (error) return { erro: error.code === "42501" ? "Seu acesso não permite alterar esta empresa." : error.message };
  }
  return { vigenteDe: hoje, gravadas: rows.length };
}
