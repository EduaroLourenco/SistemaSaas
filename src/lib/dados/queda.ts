import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarContasRecorte } from "./contas-recorte";
import { lerRecorte, noRecorte, opcoesRecorte, type GrupoRecorte } from "@/lib/recorte";
import { diagnosticar, repartir } from "./queda-causa";

/**
 * Por que caiu — produto ou anúncio, período contra o anterior.
 *
 * ── A conta ──
 *
 * Receita = visitas × conversão × preço. Cada fator tem uma razão entre o
 * período atual e o anterior, e o logaritmo da razão da receita é a SOMA
 * dos logaritmos das três. Então a queda em reais se reparte entre eles na
 * proporção de cada logaritmo — sem resto, e sem depender da ordem em que
 * se olha (o "primeiro visita, depois conversão" de uma cascata muda o
 * resultado conforme a ordem; esta conta não).
 *
 * Canal sem visita (loja que só manda pedido) reparte em unidades × preço.
 *
 * ── O preço ──
 *
 * Dois preços, e eles respondem coisas diferentes:
 *   · VITRINE — o que estava anunciado, um retrato por dia que a
 *     sincronização do Mercado Livre tira (db/33). Existe mesmo no dia
 *     sem venda, que é justamente o dia que interessa depois de um aumento.
 *   · VENDIDO — receita ÷ unidades, dos pedidos. Vale para todo canal,
 *     mas só existe onde houve venda; é o "último preço vendido" dos canais
 *     sem API.
 * A causa usa a vitrine quando os dois períodos têm, e o vendido se não.
 */

export type Nivel = "produto" | "anuncio";

export type Causa =
  | "sem estoque"
  | "pausado"
  | "parou de vender"
  | "preço subiu"
  | "vendeu mais barato"
  | "perdeu visitas"
  | "conversão caiu"
  | "vendeu menos"
  | "cresceu"
  | "estável";

export type Lado = {
  receita: number;
  unidades: number;
  pedidos: number;
  /** null = canal sem visita registrada. */
  visitas: number | null;
  conversao: number | null;
  precoVendido: number | null;
  precoVitrine: number | null;
  /** Parte das unidades que veio de anúncio com visita (0–1). */
  cobertura: number;
};

export type LinhaQueda = {
  chave: string;
  nivel: Nivel;
  /** SKU no produto; código do anúncio (MLB) no anúncio. */
  codigo: string;
  sku: string;
  titulo: string;
  /** Canal · conta (anúncio) ou lista de canais (produto). */
  onde: string;
  curva: "A" | "B" | "C";
  antes: Lado;
  agora: Lado;
  delta: number;
  deltaPct: number | null;
  /** Quanto da diferença em R$ cada fator explica. Soma = delta. */
  efeito: { visitas: number | null; conversao: number | null; unidades: number | null; preco: number };
  diasSemEstoque: number;
  diasComEstoque: number;
  status: string | null;
  precoAtual: number | null;
  /**
   * O estoque de hoje, somado nos anúncios da linha. Null = nunca lido.
   *
   * Vem de `anuncios.estoque`, que a sincronização sobrescreve, e não da
   * série diária: a pergunta aqui é "ainda falta produto AGORA", e a série
   * responde pelo período escolhido — que pode ser de duas semanas atrás.
   */
  estoqueAtual: number | null;
  /** Anúncio sob encomenda (estoque declarado absurdo): o número não vale. */
  sobEncomenda: boolean;
  /**
   * Dias ganhando o catálogo, em cada período. Null = anúncio que não
   * disputa catálogo, ou período anterior ao início do registro (30/09).
   */
  catalogo: { antes: { ganhando: number; dias: number }; agora: { ganhando: number; dias: number } } | null;
  causa: Causa;
  explicacao: string;
  /** No produto: os anúncios/contas que o compõem, do que mais caiu. */
  partes: { onde: string; codigo: string; delta: number; antes: number; agora: number }[];
};

export type DadosQueda = {
  de: string;
  ate: string;
  deAnterior: string;
  ateAnterior: string;
  dias: number;
  nivel: Nivel;
  recorte: string[];
  opcoes: GrupoRecorte[];
  linhas: LinhaQueda[];
  totalAntes: number;
  totalAgora: number;
  /** Desde quando há preço de vitrine diário (null = ainda não há). */
  vitrineDesde: string | null;
  vazio: boolean;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function diaSP(desloc = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + desloc * 86_400_000)
  );
}
function somarDias(iso: string, d: number) {
  const t = new Date(iso + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}
function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000) + 1;
}
const pctVar = (agora: number | null, antes: number | null) =>
  agora != null && antes != null && antes > 0 ? ((agora - antes) / antes) * 100 : null;

/* ── Acumulador de um lado (um período) ── */
type Acc = {
  receita: number;
  unidades: number;
  /** Unidades de anúncio que tem visita registrada — o numerador certo da conversão. */
  unidadesComVisita: number;
  pedidos: Set<string>;
  visitas: number;
  temVisita: boolean;
  vitrineSoma: number;
  vitrineDias: number;
};
const novoAcc = (): Acc => ({
  receita: 0, unidades: 0, unidadesComVisita: 0, pedidos: new Set(), visitas: 0, temVisita: false, vitrineSoma: 0, vitrineDias: 0,
});
function fechar(a: Acc): Lado {
  const visitas = a.temVisita ? a.visitas : null;
  return {
    receita: r2(a.receita),
    unidades: a.unidades,
    pedidos: a.pedidos.size,
    visitas,
    conversao: visitas ? (a.unidadesComVisita * 100) / visitas : null,
    cobertura: a.unidades ? a.unidadesComVisita / a.unidades : 0,
    precoVendido: a.unidades ? r2(a.receita / a.unidades) : null,
    precoVitrine: a.vitrineDias ? r2(a.vitrineSoma / a.vitrineDias) : null,
  };
}

/* A repartição da diferença e a causa vivem em queda-causa.ts — matemática
 * pura, sem banco, para que scripts/testar-causa-queda.mjs as rode de verdade. */

/* A causa de cada linha é escolhida em queda-causa.ts — módulo sem banco,
   para que scripts/testar-causa-queda.mjs rode a decisão de verdade. */
export { diagnosticar };

/* ══ A disputa do catálogo, por dia ══════════════════════════ */

/**
 * Em que dias o anúncio estava ganhando o catálogo.
 *
 * É a prova de que o preço custou a VISITA, e não só a conversão: no
 * Mercado Livre o preço aparece na busca, antes do clique, e no catálogo
 * quem não ganha a disputa sai da posição que recebe o tráfego (a API
 * chama essa fatia de `maximum` para o vencedor e `minimum` para os
 * outros). Preço que sobe e tira o anúncio do primeiro lugar derruba a
 * visita sem que nada tenha piorado na exposição paga ou na reputação.
 *
 * `competing` é o que a API devolve hoje para quem disputa e não ganha; a
 * lista do comentário da migração 21 (`losing`) não aparece mais. Os dois
 * entram em "não ganhando" junto de `listed` e `not_listed`.
 *
 * Só existe desde 30/09, e só para anúncio de catálogo — por isso quem
 * chama trata o vazio como "sem evidência", nunca como "não ganhava".
 */
const GANHANDO = new Set(["winning", "sharing_first_place"]);

async function disputaPorDia(
  sb: Awaited<ReturnType<typeof clienteServidor>>,
  de: string,
  ate: string
): Promise<{ anuncio_id: string; data: string; ganhando: boolean }[]> {
  type Linha = { anuncio_id: string; data: string; situacao: string };
  const linhas = (await paginar(() =>
    sb.from("anuncio_catalogo_diario").select("anuncio_id,data,situacao").gte("data", de).lte("data", ate).order("id")
  ).catch(() => [])) as unknown as Linha[];
  return linhas.map((l) => ({ anuncio_id: l.anuncio_id, data: l.data, ganhando: GANHANDO.has(l.situacao) }));
}

/* ══ Preço de vitrine por dia, de todas as fontes ═════════════ */

/**
 * O preço anunciado de cada anúncio em cada dia, juntando o que existe.
 *
 * A coluna de preço do retrato diário (db/33) só começou em 07/10. Antes
 * dela já havia preço gravado em dois lugares, e eles cobrem boa parte do
 * histórico recente:
 *   · o retrato do catálogo do Meli (`anuncio_catalogo_diario`), diário
 *     desde 30/09, para os anúncios que disputam catálogo;
 * Prioridade, quando as duas têm o mesmo dia: o retrato diário.
 * Chave: `anuncio|AAAA-MM-DD`.
 *
 * O "Atualizar preços" semanal (`anuncio_precos_vitrine`) e o preço do
 * cadastro do anúncio ficam DE FORA de propósito: os dois vêm de `/items`,
 * que dá o preço cheio. Misturar com o preço de campanha inventaria uma
 * queda de 50% onde só entrou uma promoção.
 */
async function precosDeVitrine(
  sb: Awaited<ReturnType<typeof clienteServidor>>,
  de: string,
  ate: string,
  anuncioIds?: string[]
): Promise<Map<string, number>> {
  type Cat = { anuncio_id: string; data: string; preco_atual: number | string };
  const lerCatalogo = () => {
    let q = sb.from("anuncio_catalogo_diario").select("anuncio_id,data,preco_atual").gte("data", de).lte("data", ate);
    if (anuncioIds) q = q.in("anuncio_id", anuncioIds);
    return q.not("preco_atual", "is", null).order("id");
  };
  const catalogo = (await paginar(lerCatalogo).catch(() => [])) as unknown as Cat[];
  const m = new Map<string, number>();
  for (const c of catalogo) if (n(c.preco_atual) > 0) m.set(`${c.anuncio_id}|${c.data}`, n(c.preco_atual));
  return m;
}

/* ══ Carga ══════════════════════════════════════════════════ */

export async function carregarQueda(opcoes: {
  de?: string;
  ate?: string;
  nivel?: Nivel;
  canais?: string;
}): Promise<DadosQueda> {
  const sb = await clienteServidor();
  const nivel: Nivel = opcoes.nivel === "anuncio" ? "anuncio" : "produto";

  // Padrão: os 30 dias até ontem — hoje ainda está acontecendo.
  const ate = opcoes.ate && ISO.test(opcoes.ate) ? opcoes.ate : diaSP(-1);
  const de = opcoes.de && ISO.test(opcoes.de) && opcoes.de <= ate ? opcoes.de : somarDias(ate, -29);
  const dias = diasEntre(de, ate);
  const ateAnterior = somarDias(de, -1);
  const deAnterior = somarDias(ateAnterior, -(dias - 1));

  const recorte = (opcoes.canais ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const recortes = recorte.map((v) => lerRecorte(v));
  const dentro = (canalId: string | null, contaCanalId: string | null) =>
    recortes.length === 0 || recortes.some((rc) => noRecorte(rc, { canalId, contaCanalId }));

  type Item = {
    sku: string | null;
    titulo: string | null;
    quantidade: number;
    preco_unitario: string | number;
    anuncio_id: string | null;
    codigo_externo: string | null;
    pedido_id: string;
    pedidos: { data: string; canal_id: string; conta_canal_id: string } | null;
  };
  type Anuncio = {
    id: string;
    codigo_externo: string;
    titulo: string;
    sku_canal: string | null;
    canal_id: string;
    conta_canal_id: string | null;
    status: string | null;
    preco_atual: string | number | null;
    estoque: number | null;
  };
  type Desempenho = { anuncio_id: string; data: string; visitas: number };
  type Retrato = { anuncio_id: string; data: string; estoque: number; preco?: string | number | null };

  const lerRetratos = async (): Promise<Retrato[]> => {
    const q = (cols: string) =>
      paginar(() =>
        sb.from("anuncio_estoque_diario").select(cols).gte("data", deAnterior).lte("data", ate).order("id")
      );
    try {
      return (await q("anuncio_id,data,estoque,preco")) as unknown as Retrato[];
    } catch {
      // Sem a migração 33 não há preço no retrato; o estoque continua servindo.
      return (await q("anuncio_id,data,estoque")) as unknown as Retrato[];
    }
  };

  const [itens, anuncios, desempenho, retratos, contas, vitrineOutras, disputa] = await Promise.all([
    paginar(() =>
      sb
        .from("pedido_itens")
        .select(
          "sku,titulo,quantidade,preco_unitario,anuncio_id,codigo_externo,pedido_id,pedidos!inner(data,canal_id,conta_canal_id,cancelado)"
        )
        .gte("pedidos.data", deAnterior)
        .lte("pedidos.data", ate)
        .eq("pedidos.cancelado", false)
        .order("id")
    ) as unknown as Promise<Item[]>,
    paginar(() =>
      sb
        .from("anuncios")
        .select("id,codigo_externo,titulo,sku_canal,canal_id,conta_canal_id,status,preco_atual,estoque")
        .order("id")
    ) as unknown as Promise<Anuncio[]>,
    paginar(() =>
      sb
        .from("anuncio_desempenho_diario")
        .select("anuncio_id,data,visitas")
        .gte("data", deAnterior)
        .lte("data", ate)
        .order("id")
    ) as unknown as Promise<Desempenho[]>,
    lerRetratos(),
    carregarContasRecorte(),
    precosDeVitrine(sb, deAnterior, ate),
    disputaPorDia(sb, deAnterior, ate),
  ]);

  const nomeConta = new Map(
    contas.map((c) => [
      c.contaId,
      c.contaNome && c.contaNome !== "Conta principal" ? `${c.canalNome} · ${c.contaNome}` : c.canalNome,
    ])
  );
  const anuncioPorId = new Map(anuncios.map((a) => [a.id, a]));
  const anuncioPorCodigo = new Map(anuncios.map((a) => [`${a.conta_canal_id}|${a.codigo_externo.toUpperCase()}`, a]));
  const normSku = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

  /* Cada unidade de análise junta: vendas, visitas, retratos. */
  type Grupo = {
    chave: string;
    codigo: string;
    sku: string;
    titulo: string;
    onde: Set<string>;
    anuncios: Set<string>;
    antes: Acc;
    agora: Acc;
    semEstoque: Set<string>;
    comEstoque: Set<string>;
    status: string | null;
    precoAtual: number | null;
    /* Dias-anúncio, não dias: produto com dois anúncios de catálogo tem dois
       registros no mesmo dia, e a proporção ganhando/total segue honesta. */
    catAntes: { ganhando: number; dias: number };
    catAgora: { ganhando: number; dias: number };
    partes: Map<string, { onde: string; codigo: string; antes: number; agora: number }>;
  };
  const grupos = new Map<string, Grupo>();
  const grupo = (chave: string, base: { codigo: string; sku: string; titulo: string }) => {
    let g = grupos.get(chave);
    if (!g) {
      g = {
        chave, ...base, onde: new Set(), anuncios: new Set(), antes: novoAcc(), agora: novoAcc(),
        semEstoque: new Set(), comEstoque: new Set(), status: null, precoAtual: null,
        catAntes: { ganhando: 0, dias: 0 }, catAgora: { ganhando: 0, dias: 0 }, partes: new Map(),
      };
      grupos.set(chave, g);
    }
    if (!g.titulo && base.titulo) g.titulo = base.titulo;
    return g;
  };

  /** A chave de um anúncio cadastrado. */
  const chaveDoAnuncio = (a: Anuncio) =>
    nivel === "anuncio" ? `a:${a.id}` : `p:${normSku(a.sku_canal) || a.codigo_externo.toUpperCase()}`;

  const comVisita = new Set(desempenho.map((d) => d.anuncio_id));

  // ── Vendas ──
  for (const it of itens) {
    const p = it.pedidos;
    if (!p || !dentro(p.canal_id, p.conta_canal_id)) continue;
    const an =
      (it.anuncio_id && anuncioPorId.get(it.anuncio_id)) ||
      (it.codigo_externo ? anuncioPorCodigo.get(`${p.conta_canal_id}|${it.codigo_externo.toUpperCase()}`) : undefined);
    const sku = normSku(it.sku) || normSku(an?.sku_canal);
    const onde = nomeConta.get(p.conta_canal_id) ?? "Outros";
    let chave: string;
    let codigo: string;
    if (nivel === "anuncio") {
      chave = an ? `a:${an.id}` : `s:${p.conta_canal_id}|${sku || it.titulo}`;
      codigo = an?.codigo_externo ?? (sku || "—");
    } else {
      chave = `p:${sku || an?.codigo_externo.toUpperCase() || it.titulo}`;
      codigo = sku || an?.codigo_externo || "—";
    }
    const g = grupo(chave, { codigo, sku: sku || "—", titulo: it.titulo ?? an?.titulo ?? "" });
    g.onde.add(onde);
    if (an) g.anuncios.add(an.id);
    const lado = p.data >= de ? g.agora : g.antes;
    const qtd = Number(it.quantidade) || 0;
    const valor = qtd * n(it.preco_unitario);
    lado.receita += valor;
    lado.unidades += qtd;
    if (an && comVisita.has(an.id)) lado.unidadesComVisita += qtd;
    lado.pedidos.add(it.pedido_id);

    if (nivel === "produto") {
      const parteChave = an ? an.id : `${p.conta_canal_id}`;
      const parte = g.partes.get(parteChave) ?? { onde, codigo: an?.codigo_externo ?? onde, antes: 0, agora: 0 };
      if (p.data >= de) parte.agora += valor;
      else parte.antes += valor;
      g.partes.set(parteChave, parte);
    }
  }

  // ── Anúncios no recorte: entram mesmo sem venda (o que parou de vender) ──
  const anunciosNoRecorte = anuncios.filter((a) => dentro(a.canal_id, a.conta_canal_id));
  const chavePorAnuncio = new Map<string, string>();
  for (const a of anunciosNoRecorte) {
    const chave = chaveDoAnuncio(a);
    chavePorAnuncio.set(a.id, chave);
    const g = grupos.get(chave);
    if (!g) continue; // sem venda nos dois períodos: não há queda para explicar
    g.anuncios.add(a.id);
    g.onde.add(nomeConta.get(a.conta_canal_id ?? "") ?? "Outros");
    if (nivel === "anuncio") g.status = a.status;
  }

  // ── Visitas ──
  for (const d of desempenho) {
    const chave = chavePorAnuncio.get(d.anuncio_id);
    const g = chave && grupos.get(chave);
    if (!g) continue;
    const lado = d.data >= de ? g.agora : g.antes;
    lado.visitas += d.visitas;
    lado.temVisita = true;
  }

  // ── Disputa do catálogo ──
  for (const d of disputa) {
    const chave = chavePorAnuncio.get(d.anuncio_id);
    const g = chave && grupos.get(chave);
    if (!g) continue;
    const lado = d.data >= de ? g.catAgora : g.catAntes;
    lado.dias += 1;
    if (d.ganhando) lado.ganhando += 1;
  }

  // ── Retratos diários: estoque e preço de vitrine ──
  let vitrineDesde: string | null = null;
  for (const r of retratos) {
    const chave = chavePorAnuncio.get(r.anuncio_id);
    const g = chave && grupos.get(chave);
    if (!g) continue;
    if (r.data >= de) {
      // Produto com vários anúncios: o dia conta como sem estoque só se
      // NENHUM anúncio tinha. Um zerado com o irmão abastecido não para a venda.
      if (r.estoque > 0) {
        g.comEstoque.add(r.data);
        g.semEstoque.delete(r.data);
      } else if (!g.comEstoque.has(r.data)) g.semEstoque.add(r.data);
    }
    if (r.preco != null && n(r.preco) > 0) vitrineOutras.set(`${r.anuncio_id}|${r.data}`, n(r.preco));
  }
  /*
   * Preço de hoje: o último preço de venda registrado de cada anúncio (não
   * o do cadastro, que é o cheio). No produto, o menor entre os anúncios,
   * que é o que o comprador vê primeiro.
   */
  const ultimo = new Map<string, { data: string; preco: number }>();
  for (const [k, preco] of vitrineOutras) {
    const [anuncioId, data] = k.split("|");
    const u = ultimo.get(anuncioId);
    if (!u || data > u.data) ultimo.set(anuncioId, { data, preco });
  }
  for (const [anuncioId, u] of ultimo) {
    const g = grupos.get(chavePorAnuncio.get(anuncioId) ?? "");
    if (g) g.precoAtual = g.precoAtual == null ? u.preco : Math.min(g.precoAtual, u.preco);
  }
  for (const [k, preco] of vitrineOutras) {
    const [anuncioId, data] = k.split("|");
    const chave = chavePorAnuncio.get(anuncioId);
    const g = chave && grupos.get(chave);
    if (!g) continue;
    if (!vitrineDesde || data < vitrineDesde) vitrineDesde = data;
    const lado = data >= de ? g.agora : g.antes;
    lado.vitrineSoma += preco;
    lado.vitrineDias += 1;
  }

  const acompanhados = new Set(retratos.map((r) => r.anuncio_id));

  // ── Fechamento ──
  const lista = [...grupos.values()].map((g) => {
    const quedaTotal = g.agora.receita - g.antes.receita;
    let pesoAcompanhado = 0;
    if (nivel === "anuncio") pesoAcompanhado = [...g.anuncios].some((id) => acompanhados.has(id)) ? 1 : 0;
    else if (quedaTotal < 0) {
      let q = 0;
      for (const [id, pt] of g.partes) if (acompanhados.has(id) && pt.agora < pt.antes) q += pt.antes - pt.agora;
      pesoAcompanhado = q / -quedaTotal;
    }
    /*
     * Estoque de hoje. Só soma o que foi lido: anúncio nunca sincronizado
     * tem estoque nulo, e tratá-lo como zero diria "faltou produto" de um
     * anúncio sobre o qual não se sabe nada.
     *
     * Acima de 40 mil é anúncio sob encomenda — o vendedor declara um
     * número alto para não ficar sem anúncio, e somá-lo afogaria o estoque
     * real dos irmãos.
     */
    let estoqueAtual: number | null = null;
    let sobEncomenda = false;
    for (const id of g.anuncios) {
      const e = anuncioPorId.get(id)?.estoque;
      if (e == null) continue;
      if (e >= 40_000) sobEncomenda = true;
      else estoqueAtual = (estoqueAtual ?? 0) + e;
    }
    /* Sem registro nos DOIS lados não há comparação: um período sem dado é
       "não sei", e dizer "perdeu o catálogo" por isso seria inventar. */
    const catalogo =
      g.catAntes.dias > 0 && g.catAgora.dias > 0 ? { antes: g.catAntes, agora: g.catAgora } : null;
    const antes = fechar(g.antes);
    const agora = fechar(g.agora);
    const delta = r2(agora.receita - antes.receita);
    const efeito = repartir(antes, agora, delta);
    const { causa, explicacao } = diagnosticar({
      antes, agora, delta, efeito, diasSemEstoque: g.semEstoque.size,
      diasObservados: g.semEstoque.size + g.comEstoque.size, pesoAcompanhado, status: g.status,
      estoqueAtual, sobEncomenda, catalogo,
    });
    return {
      chave: g.chave,
      nivel,
      codigo: g.codigo,
      sku: g.sku,
      titulo: g.titulo,
      onde: [...g.onde].join(", "),
      curva: "C" as LinhaQueda["curva"],
      antes,
      agora,
      delta,
      deltaPct: antes.receita > 0 ? (delta / antes.receita) * 100 : null,
      efeito,
      diasSemEstoque: g.semEstoque.size,
      diasComEstoque: g.comEstoque.size,
      status: g.status,
      precoAtual: g.precoAtual,
      estoqueAtual,
      sobEncomenda,
      catalogo,
      causa,
      explicacao,
      partes: [...g.partes.values()]
        .map((p) => ({ ...p, antes: r2(p.antes), agora: r2(p.agora), delta: r2(p.agora - p.antes) }))
        .sort((a, b) => a.delta - b.delta),
    } satisfies LinhaQueda;
  });

  // Curva ABC pela receita do período ANTERIOR: é o tamanho que o item
  // tinha antes de cair. Pela atual, o que despencou viraria C e sumiria.
  const porTamanho = [...lista].sort((a, b) => b.antes.receita - a.antes.receita);
  const totalAntes = porTamanho.reduce((s, l) => s + l.antes.receita, 0);
  let acc = 0;
  for (const l of porTamanho) {
    acc += l.antes.receita;
    const p = totalAntes ? (acc / totalAntes) * 100 : 100;
    l.curva = p <= 80 ? "A" : p <= 95 ? "B" : "C";
  }

  lista.sort((a, b) => a.delta - b.delta);
  return {
    de,
    ate,
    deAnterior,
    ateAnterior,
    dias,
    nivel,
    recorte,
    opcoes: opcoesRecorte(contas),
    linhas: lista,
    totalAntes: r2(totalAntes),
    totalAgora: r2(lista.reduce((s, l) => s + l.agora.receita, 0)),
    vitrineDesde,
    vazio: lista.length === 0,
  };
}

/* ══ A série diária de uma linha, para o detalhe ══════════════ */

export type DiaQueda = {
  data: string;
  receita: number;
  unidades: number;
  visitas: number | null;
  precoVendido: number | null;
  precoVitrine: number | null;
  estoque: number | null;
};

/**
 * Dia a dia de um produto (`p:SKU`), anúncio (`a:id`) ou SKU numa conta
 * sem anúncio cadastrado (`s:conta|SKU`), nos dois períodos juntos.
 * É o que mostra QUANDO mudou — o resumo diz quanto, a série diz o dia.
 */
export async function serieDaQueda(chave: string, de: string, ate: string, canais?: string): Promise<DiaQueda[]> {
  if (!ISO.test(de) || !ISO.test(ate) || de > ate) return [];
  const sb = await clienteServidor();
  const recortes = (canais ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((v) => lerRecorte(v));
  const dentro = (canalId: string | null, contaCanalId: string | null) =>
    recortes.length === 0 || recortes.some((rc) => noRecorte(rc, { canalId, contaCanalId }));

  const [tipo, resto] = [chave.slice(0, 2), chave.slice(2)];
  let anuncioIds: string[] = [];
  let sku: string | null = null;
  let conta: string | null = null;

  if (tipo === "a:") anuncioIds = [resto];
  else if (tipo === "p:") {
    sku = resto;
    const { data } = await sb
      .from("anuncios")
      .select("id,canal_id,conta_canal_id")
      .or(`sku_canal.ilike."${sku}",codigo_externo.ilike."${sku}"`);
    anuncioIds = ((data ?? []) as { id: string; canal_id: string; conta_canal_id: string | null }[])
      .filter((a) => dentro(a.canal_id, a.conta_canal_id))
      .map((a) => a.id);
  } else if (tipo === "s:") {
    [conta, sku] = resto.split("|");
  } else return [];

  const itensQ = sb
    .from("pedido_itens")
    .select("quantidade,preco_unitario,anuncio_id,sku,pedidos!inner(data,canal_id,conta_canal_id,cancelado)")
    .gte("pedidos.data", de)
    .lte("pedidos.data", ate)
    .eq("pedidos.cancelado", false)
    .order("id");
  const filtroItens =
    tipo === "a:"
      ? () => itensQ.eq("anuncio_id", resto)
      : tipo === "s:"
        ? () => itensQ.eq("pedidos.conta_canal_id", conta!).ilike("sku", sku!)
        : () =>
            anuncioIds.length
              ? itensQ.or(`sku.ilike."${sku}",anuncio_id.in.(${anuncioIds.join(",")})`)
              : itensQ.ilike("sku", sku!);

  const lerRetratos = async () => {
    if (!anuncioIds.length) return [] as { anuncio_id: string; data: string; estoque: number; preco?: number | null }[];
    const q = (cols: string) =>
      sb.from("anuncio_estoque_diario").select(cols).in("anuncio_id", anuncioIds).gte("data", de).lte("data", ate);
    const r = await q("anuncio_id,data,estoque,preco");
    if (!r.error) return r.data as unknown as { anuncio_id: string; data: string; estoque: number; preco: number | null }[];
    return ((await q("anuncio_id,data,estoque")).data ?? []) as unknown as { anuncio_id: string; data: string; estoque: number }[];
  };

  const [itens, desempenho, retratos] = await Promise.all([
    paginar(filtroItens) as unknown as Promise<
      { quantidade: number; preco_unitario: number | string; pedidos: { data: string; canal_id: string; conta_canal_id: string } | null }[]
    >,
    anuncioIds.length
      ? paginar(() =>
          sb
            .from("anuncio_desempenho_diario")
            .select("data,visitas")
            .in("anuncio_id", anuncioIds)
            .gte("data", de)
            .lte("data", ate)
            .order("id")
        )
      : Promise.resolve([]),
    lerRetratos(),
  ]);
  const precos = anuncioIds.length ? await precosDeVitrine(sb, de, ate, anuncioIds) : new Map<string, number>();

  const dias = new Map<string, { receita: number; unidades: number; visitas: number | null; vit: number[]; estoque: number | null }>();
  const dia = (d: string) => {
    let x = dias.get(d);
    if (!x) dias.set(d, (x = { receita: 0, unidades: 0, visitas: null, vit: [], estoque: null }));
    return x;
  };
  for (let d = de; d <= ate; d = somarDias(d, 1)) dia(d);
  for (const it of itens) {
    const p = it.pedidos;
    if (!p || !dentro(p.canal_id, p.conta_canal_id)) continue;
    const x = dia(p.data);
    const q = Number(it.quantidade) || 0;
    x.unidades += q;
    x.receita += q * n(it.preco_unitario);
  }
  for (const v of desempenho as { data: string; visitas: number }[]) {
    const x = dia(v.data);
    x.visitas = (x.visitas ?? 0) + v.visitas;
  }
  const semControle = new Set<string>();
  for (const r of retratos) {
    const x = dia(r.data);
    // Marcador de sem controle (sob encomenda): disponível, mas não é quantidade.
    if (r.estoque >= 40_000) semControle.add(r.data);
    else x.estoque = (x.estoque ?? 0) + r.estoque;
    const preco = "preco" in r ? r.preco : null;
    if (preco != null && n(preco) > 0) precos.set(`${r.anuncio_id}|${r.data}`, n(preco));
  }
  for (const [k, preco] of precos) {
    const data = k.split("|")[1];
    if (data >= de && data <= ate) dia(data).vit.push(preco);
  }
  return [...dias.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, x]) => ({
      data,
      receita: r2(x.receita),
      unidades: x.unidades,
      visitas: x.visitas,
      precoVendido: x.unidades ? r2(x.receita / x.unidades) : null,
      // Vários anúncios: o menor preço do dia é o que o comprador vê primeiro.
      precoVitrine: x.vit.length ? Math.min(...x.vit) : null,
      estoque: semControle.has(data) ? null : x.estoque,
    }));
}
