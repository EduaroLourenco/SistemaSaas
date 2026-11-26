/**
 * Promoções sugeridas: o que cada anúncio pode fazer, decidido por regra.
 *
 * Regra pura — recebe o anúncio já montado (convites, preço mínimo, custo,
 * giro) e os parâmetros, devolve as opções e qual recomenda. Não fala com
 * banco nem com canal. Roda no servidor E na tela: o lápis troca um
 * parâmetro e a lista se recalcula na hora, sem chamada nenhuma.
 *
 * Spec: .scratch/promocoes-sugeridas/spec.md
 *
 * ── As três perguntas, por anúncio ──
 *
 *  1. Quanto é o mínimo? (tabela de preço mínimo → Fórmula base → custo)
 *  2. Quanto o comprador paga HOJE? O Meli aplica uma promoção por vez,
 *     a de menor preço — o resto está dentro mas encoberto.
 *  3. Qual promoção leva o comprador mais para baixo sem que o que NÓS
 *     recebemos fure o mínimo?
 *
 * ── O que nós recebemos não é o que o comprador paga ──
 *
 * Em co-participada (SMART, PRICE_MATCHING, SMART_LIGHTNING) o Meli põe
 * uma parte do desconto: nós recebemos o cheio menos `seller_percentage`,
 * e o comprador paga ainda menos. Por isso uma co-participada pode ser
 * melhor que baixar o preço sozinho: vende mais barato e recebe mais.
 */
import type { PedidoDeAceite } from "./corpo-promocao";

/* ══ O que entra ═══════════════════════════════════════════════ */

export type PromoDoItem = {
  codigo: string;
  tipo: string;
  nome: string | null;
  /** candidate | pending | started */
  status: string | null;
  /** O que o comprador paga dentro da promoção. 0 ou nulo em convite de preço nosso. */
  preco: number | null;
  precoCheio: number | null;
  minimo: number | null;
  maximo: number | null;
  sugerido: number | null;
  meliPct: number | null;
  sellerPct: number | null;
  oferta: string | null;
  inicio: string | null;
  fim: string | null;
  /** Até quando dá para aceitar (deadline da campanha). */
  prazo: string | null;
  estoqueMin: number | null;
  estoqueMax: number | null;
  /** Desconto extra que o Meli dá por conta dele, em reais. */
  boost: number | null;
};

export type FonteMinimo = "tabela" | "formula_base" | "custo";

export type CustoDoItem = { mercadoria: number; embalagem: number; frete: number; impostoPct: number };

export type ItemBruto = {
  contaId: string;
  contaNome: string;
  mlb: string;
  sku: string | null;
  titulo: string | null;
  foto: string | null;
  tipoAnuncio: "classico" | "premium" | null;
  statusAnuncio: string | null;
  estoque: number | null;
  precoCheio: number | null;
  minimo: { valor: number; fonte: FonteMinimo; vigencia: string | null } | null;
  custo: CustoDoItem | null;
  /** Comissão do anúncio, em pontos (11,5). */
  comissaoPct: number | null;
  /** Nulo quando a empresa não tem pedidos sincronizados — não é zero. */
  vendas: { u7: number; u30: number; u90: number; ultimaVenda: string | null } | null;
  catalogo: { vencedorPreco: number | null; situacao: string | null } | null;
  promos: PromoDoItem[];
};

export type Parametros = {
  /** Quanto abaixo do mínimo uma oferta DO CANAL ainda é aceita. 0 = mínimo é piso. */
  toleranciaPct: number;
  /** Diferença menor que isso não vira sugestão — vira "no alvo". */
  diferencaMinimaPct: number;
  diasParado: number;
  /** Tolerância a mais para quem está parado ou com estoque sobrando. */
  toleranciaParadoPct: number;
  /** Estoque que dura mais que isso no ritmo atual conta como sobrando. */
  coberturaAltaDias: number;
  /** Estoque que acaba antes disso: não precisa de desconto. */
  coberturaBaixaDias: number;
  /** Margem de contribuição mínima, em %. Nulo = regra sem número. */
  margemMinimaPct: number | null;
  /** Quanto do estoque oferecer num relâmpago, em %. */
  unidadesRelampagoPct: number;
  /** SKUs que nunca entram sozinhos. */
  listaFora: string[];
  regrasDesligadas: CodigoRegra[];
};

export const PARAMETROS_PADRAO: Parametros = {
  toleranciaPct: 0,
  diferencaMinimaPct: 2,
  diasParado: 15,
  toleranciaParadoPct: 5,
  coberturaAltaDias: 90,
  coberturaBaixaDias: 15,
  margemMinimaPct: null,
  unidadesRelampagoPct: 30,
  listaFora: [],
  regrasDesligadas: [],
};

/** O lápis de UM item: o que a pessoa trocou à mão. */
export type Ajuste = { minimo?: number; toleranciaPct?: number; preco?: number };

/* ══ As regras do sistema ═════════════════════════════════════ */

export type CodigoRegra =
  | "meta" | "meli_paga" | "baixar" | "margem" | "parado" | "estoque_curto"
  | "relampago" | "pre_acordo" | "lista_fora" | "abaixo_minimo" | "concorrente";

export type Dado = "minimo" | "custo" | "vendas" | "catalogo";

export type RegraDoRobo = {
  codigo: CodigoRegra;
  nome: string;
  /** O que ela faz, em uma linha. */
  faz: string;
  /** O dado de que precisa. Sem ele, desliga sozinha. */
  precisa: Dado | null;
  parametros: (keyof Parametros)[];
};

export const REGRAS_DO_ROBO: RegraDoRobo[] = [
  { codigo: "meta", nome: "Meta da tabela", faz: "Entra quando a promoção leva o preço até o mínimo, sem passar dele", precisa: "minimo", parametros: ["toleranciaPct"] },
  { codigo: "meli_paga", nome: "O Meli paga a diferença", faz: "Co-participada em que o comprador paga menos e você recebe pelo menos o mínimo", precisa: "minimo", parametros: [] },
  { codigo: "baixar", nome: "Baixar preço em campanha ativa", faz: "Baixa até o mínimo na campanha própria em que o item já está", precisa: "minimo", parametros: ["diferencaMinimaPct"] },
  { codigo: "margem", nome: "Margem mínima", faz: "Nunca recebe menos do que fecha a margem", precisa: "custo", parametros: ["margemMinimaPct"] },
  { codigo: "parado", nome: "Parado ou estoque sobrando", faz: "Sem venda há N dias, ou estoque para mais de N dias: libera tolerância extra", precisa: "vendas", parametros: ["diasParado", "coberturaAltaDias", "toleranciaParadoPct"] },
  { codigo: "estoque_curto", nome: "Estoque acabando", faz: "Estoque que acaba antes de N dias no ritmo atual: sugere desmarcado e sem relâmpago", precisa: "vendas", parametros: ["coberturaBaixaDias"] },
  { codigo: "relampago", nome: "Unidades no relâmpago", faz: "Oferece uma parte do estoque, dentro da faixa do Meli", precisa: null, parametros: ["unidadesRelampagoPct"] },
  { codigo: "pre_acordo", nome: "Proteger pré-acordo", faz: "Pré-acordo negociado com o comercial do canal não entra pelo robô", precisa: null, parametros: [] },
  { codigo: "lista_fora", nome: "Lista de fora", faz: "SKUs que nunca entram sozinhos", precisa: null, parametros: ["listaFora"] },
  { codigo: "abaixo_minimo", nome: "Alerta de preço abaixo do mínimo", faz: "Avisa quando o comprador já paga menos que o mínimo", precisa: "minimo", parametros: [] },
  { codigo: "concorrente", nome: "Concorrente no catálogo", faz: "Mostra quando o vencedor do catálogo está mais barato", precisa: "catalogo", parametros: [] },
];

/** Quantos itens têm cada dado — é o que liga ou desliga cada regra na empresa. */
export function cobertura(itens: ItemBruto[]): Record<Dado, { tem: number; total: number }> {
  const total = itens.length;
  const conta = (f: (i: ItemBruto) => boolean) => ({ tem: itens.filter(f).length, total });
  return {
    minimo: conta((i) => i.minimo != null),
    custo: conta((i) => i.custo != null),
    vendas: conta((i) => i.vendas != null),
    catalogo: conta((i) => i.catalogo?.vencedorPreco != null),
  };
}

/** A regra está ligada nesta empresa? Desligada à mão ou por falta de dado. */
export function estadoDaRegra(
  r: RegraDoRobo,
  p: Parametros,
  cob: ReturnType<typeof cobertura>
): { ligada: boolean; motivo: string | null } {
  if (p.regrasDesligadas.includes(r.codigo)) return { ligada: false, motivo: "desligada" };
  if (r.precisa && cob[r.precisa].tem === 0) {
    const nome = { minimo: "preço mínimo", custo: "custo", vendas: "vendas", catalogo: "catálogo" }[r.precisa];
    return { ligada: false, motivo: `0 de ${cob[r.precisa].total} com ${nome}` };
  }
  if (r.codigo === "margem" && p.margemMinimaPct == null) return { ligada: false, motivo: "sem margem definida" };
  return { ligada: true, motivo: null };
}

/* ══ O que sai ════════════════════════════════════════════════ */

export type Opcao = {
  id: string;
  acao: "aceitar" | "entrar" | "baixar";
  regra: CodigoRegra;
  promocao: string;
  tipo: string;
  nome: string;
  comprador: number;
  recebe: number;
  precoAtual: number | null;
  meliPct: number | null;
  prazo: string | null;
  inicio: string | null;
  fim: string | null;
  unidades: number | null;
  margemPct: number | null;
  pedido: PedidoDeAceite;
};

export type Tom = "up" | "down" | "warn" | "info" | "neutral";
export type Tag = { texto: string; tom: Tom };

export type Grupo = "aceitar" | "baixar" | "alerta" | "no_alvo" | "fora";

export type Giro = {
  vendaDia: number | null;
  coberturaDias: number | null;
  diasSemVenda: number | null;
  parado: boolean;
  sobrando: boolean;
  acabando: boolean;
  semControle: boolean;
};

export type Sugestao = {
  chave: string;
  item: ItemBruto;
  vitrine: number | null;
  valendo: PromoDoItem | null;
  minimo: number | null;
  minimoEfetivo: number | null;
  toleranciaUsada: number;
  giro: Giro;
  tags: Tag[];
  alertas: string[];
  opcoes: Opcao[];
  recomendada: Opcao | null;
  /** Começa marcada na lista? */
  marcada: boolean;
  grupo: Grupo;
  motivo: string;
};

/* ══ O cálculo ════════════════════════════════════════════════ */

const SEM_CONTROLE = 40_000;
const CO_PARTICIPADA = new Set(["SMART", "PRICE_MATCHING", "SMART_LIGHTNING", "MARKETPLACE_CAMPAIGN", "UNHEALTHY_STOCK", "PRE_NEGOTIATED"]);
const NOSSO_PRECO = new Set(["DEAL", "SELLER_CAMPAIGN"]);
const NOSSO_COM_ESTOQUE = new Set(["LIGHTNING", "DOD"]);
const ALTERAVEL = new Set(["DEAL", "SELLER_CAMPAIGN"]);

const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const comissaoDe = (i: ItemBruto) =>
  i.comissaoPct ?? (i.tipoAnuncio === "premium" ? 16.5 : 11.5);

/** Margem de contribuição sobre o que recebemos. Nulo sem custo. */
export function margemNoPreco(i: ItemBruto, recebe: number): number | null {
  if (!i.custo || !(recebe > 0)) return null;
  const c = i.custo;
  const sobra = recebe * (1 - (comissaoDe(i) + c.impostoPct) / 100) - c.mercadoria - c.embalagem - c.frete;
  return r2((sobra / recebe) * 100);
}

/** O menor preço que fecha a margem pedida. Nulo sem custo. */
export function precoDaMargem(i: ItemBruto, margemPct: number): number | null {
  if (!i.custo) return null;
  const c = i.custo;
  const resto = 1 - (comissaoDe(i) + c.impostoPct + margemPct) / 100;
  if (resto <= 0) return null;
  return r2((c.mercadoria + c.embalagem + c.frete) / resto);
}

/** Quanto o estoque dura e há quanto tempo não vende. */
export function giroDoItem(i: ItemBruto, p: Parametros, hoje: Date): Giro {
  const semControle = i.estoque != null && i.estoque >= SEM_CONTROLE;
  if (!i.vendas) {
    return { vendaDia: null, coberturaDias: null, diasSemVenda: null, parado: false, sobrando: false, acabando: false, semControle };
  }
  const v = i.vendas;
  /* 30 dias quando há venda neles; senão 90, para não chamar de zero
     o produto que vende uma vez por mês. */
  const vendaDia = v.u30 > 0 ? v.u30 / 30 : v.u90 > 0 ? v.u90 / 90 : 0;
  const estoque = semControle ? null : i.estoque;
  const coberturaDias = estoque == null ? null : vendaDia > 0 ? Math.round(estoque / vendaDia) : null;
  const diasSemVenda = v.ultimaVenda
    ? Math.max(0, Math.floor((hoje.getTime() - new Date(v.ultimaVenda).getTime()) / 86_400_000))
    : null;
  const temEstoque = semControle || (estoque ?? 0) > 0;
  const parado = temEstoque && (diasSemVenda == null || diasSemVenda >= p.diasParado);
  const sobrando = coberturaDias != null && coberturaDias >= p.coberturaAltaDias;
  const acabando = coberturaDias != null && coberturaDias < p.coberturaBaixaDias;
  return { vendaDia: r2(vendaDia), coberturaDias, diasSemVenda, parado, sobrando, acabando, semControle };
}

const dataCurta = (iso: string | null) =>
  iso == null ? "" : new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export function sugerir(i: ItemBruto, pIn: Parametros, ajuste: Ajuste = {}, hoje = new Date()): Sugestao {
  const p = pIn;
  const liga = (c: CodigoRegra) => !p.regrasDesligadas.includes(c);
  const chave = `${i.contaId}:${i.mlb}`;
  const tags: Tag[] = [];
  const alertas: string[] = [];
  const fora: string[] = [];

  /* ── 2. O que o comprador paga hoje ── */
  const cheio = i.precoCheio ?? i.promos.find((x) => x.precoCheio)?.precoCheio ?? null;
  const noAr = i.promos.filter((x) => x.status === "started" && (x.preco ?? 0) > 0);
  let valendo: PromoDoItem | null = null;
  let vitrine = cheio;
  for (const x of noAr) {
    if (vitrine == null || x.preco! < vitrine - 0.005) { vitrine = x.preco!; valendo = x; }
  }

  /* ── Giro ── */
  const giro = giroDoItem(i, p, hoje);
  const usaGiro = i.vendas != null;

  /* ── 1. O mínimo ── */
  let minimo = ajuste.minimo ?? i.minimo?.valor ?? null;
  if (minimo == null && i.custo && p.margemMinimaPct != null && liga("margem")) {
    minimo = precoDaMargem(i, p.margemMinimaPct);
  }
  let tol = ajuste.toleranciaPct ?? p.toleranciaPct;
  if (usaGiro && liga("parado") && (giro.parado || giro.sobrando)) tol += p.toleranciaParadoPct;
  let minimoEfetivo = minimo == null ? null : r2(minimo * (1 - tol / 100));
  if (minimoEfetivo != null && liga("margem") && p.margemMinimaPct != null) {
    const daMargem = precoDaMargem(i, p.margemMinimaPct);
    if (daMargem != null && daMargem > minimoEfetivo) minimoEfetivo = daMargem;
  }

  /* ── Tags de situação ── */
  if (valendo) tags.push({ texto: `Vale: ${valendo.nome ?? valendo.tipo} ${brl(valendo.preco!)}`, tom: "up" });
  const encobertas = noAr.filter((x) => x !== valendo).length;
  if (encobertas) tags.push({ texto: `${encobertas} encoberta${encobertas > 1 ? "s" : ""}`, tom: "neutral" });
  for (const x of i.promos.filter((x) => x.status === "pending")) {
    tags.push({ texto: `Agendada ${dataCurta(x.inicio)}${x.preco ? ` · ${brl(x.preco)}` : ""}`, tom: "info" });
  }
  const convites = i.promos.filter((x) => x.status === "candidate").length;
  if (convites) tags.push({ texto: `${convites} convite${convites > 1 ? "s" : ""}`, tom: "neutral" });
  if (usaGiro) {
    if (giro.diasSemVenda == null) tags.push({ texto: "Sem venda em 90 dias", tom: "warn" });
    else if (giro.parado) tags.push({ texto: `Parado há ${giro.diasSemVenda} dias`, tom: "warn" });
    if (giro.semControle) tags.push({ texto: "Sem controle de estoque", tom: "neutral" });
    else if (giro.coberturaDias != null) {
      tags.push({
        texto: giro.coberturaDias > 365 ? "Estoque p/ mais de 1 ano" : `Estoque p/ ${giro.coberturaDias} dias`,
        tom: giro.acabando ? "down" : giro.sobrando ? "warn" : "neutral",
      });
    }
  }
  if (!i.custo) tags.push({ texto: "Sem custo", tom: "neutral" });

  const resultado = (grupo: Grupo, motivo: string, opcoes: Opcao[] = [], recomendada: Opcao | null = null, marcada = false): Sugestao => ({
    chave, item: i, vitrine, valendo, minimo, minimoEfetivo, toleranciaUsada: tol, giro,
    tags, alertas, opcoes, recomendada, marcada, grupo, motivo,
  });

  /* ── Quem não entra de jeito nenhum ── */
  if (i.statusAnuncio && i.statusAnuncio !== "active" && i.statusAnuncio !== "ativo") {
    return resultado("fora", `anúncio ${i.statusAnuncio === "paused" || i.statusAnuncio === "pausado" ? "pausado" : i.statusAnuncio}`);
  }
  if (!giro.semControle && i.estoque != null && i.estoque <= 0) return resultado("fora", "sem estoque");
  if (liga("lista_fora") && i.sku && p.listaFora.some((s) => s.trim().toUpperCase() === i.sku!.trim().toUpperCase())) {
    return resultado("fora", "na lista de fora");
  }
  if (minimo == null || minimoEfetivo == null) {
    alertas.push("sem preço mínimo: importe a tabela ou cadastre o custo");
    return resultado("alerta", "sem preço mínimo");
  }

  /* ── R13: já abaixo do mínimo ── */
  const pisoSemGiro = minimo * (1 - (ajuste.toleranciaPct ?? p.toleranciaPct) / 100);
  /* Centavos abaixo não é alerta: a mesma diferença mínima que separa "no alvo". */
  if (liga("abaixo_minimo") && vitrine != null && vitrine < pisoSemGiro * (1 - p.diferencaMinimaPct / 100) - 0.01) {
    alertas.push(`o comprador paga ${brl(vitrine)} e o mínimo é ${brl(minimo)}`);
    return resultado("alerta", "já abaixo do mínimo");
  }

  /* ── 3. As opções ── */
  const opcoes: Opcao[] = [];
  const dif = p.diferencaMinimaPct / 100;
  const melhora = (comprador: number) => vitrine == null || comprador < vitrine * (1 - dif) - 0.005;
  const unidadesDe = (x: PromoDoItem): number | null | "nao" => {
    if (x.estoqueMin == null && x.estoqueMax == null) return null;
    if (usaGiro && liga("estoque_curto") && giro.acabando) return "nao";
    const estoque = giro.semControle ? x.estoqueMax ?? 1 : i.estoque ?? 0;
    const min = x.estoqueMin ?? 1;
    const max = Math.min(x.estoqueMax ?? estoque, estoque);
    if (max < min) return "nao";
    const pct = liga("relampago") ? p.unidadesRelampagoPct : 100;
    return Math.max(min, Math.min(max, Math.floor((estoque * pct) / 100)));
  };
  const nova = (o: Omit<Opcao, "id" | "margemPct">): Opcao => ({
    ...o,
    id: `${o.promocao}:${o.pedido.oferta ?? o.acao}`,
    margemPct: margemNoPreco(i, o.recebe),
  });

  for (const x of i.promos) {
    const tipo = x.tipo.toUpperCase();
    const nome = x.nome ?? tipo;

    /* Co-participada: o canal define o preço, e o Meli põe uma parte. */
    if (x.status === "candidate" && CO_PARTICIPADA.has(tipo)) {
      if (tipo === "PRE_NEGOTIATED" && liga("pre_acordo")) { fora.push(`${nome}: pré-acordo`); continue; }
      const comprador = x.preco;
      if (comprador == null || !(comprador > 0)) continue;
      const base = x.precoCheio ?? cheio;
      const recebe = x.sellerPct != null && base ? r2(base * (1 - x.sellerPct / 100)) : comprador;
      if (recebe < minimoEfetivo - 0.005) { fora.push(`${nome}: você receberia ${brl(recebe)}`); continue; }
      if (!melhora(comprador)) continue;
      const u = unidadesDe(x);
      if (u === "nao") { fora.push(`${nome}: estoque não cobre o relâmpago`); continue; }
      opcoes.push(nova({
        acao: "aceitar", regra: recebe > comprador + 0.005 ? "meli_paga" : "meta",
        promocao: x.codigo, tipo, nome, comprador, recebe, precoAtual: null, meliPct: x.meliPct,
        prazo: x.prazo, inicio: x.inicio, fim: x.fim, unidades: u,
        pedido: { mlb: i.mlb, promocao: x.codigo, tipo, oferta: x.oferta, estoque: u, tetoDoCanal: comprador },
      }));
      continue;
    }

    /* Convite em que o preço é nosso: entra no mínimo, dentro da faixa do canal. */
    if (x.status === "candidate" && (NOSSO_PRECO.has(tipo) || NOSSO_COM_ESTOQUE.has(tipo))) {
      if (!liga("meta")) continue;
      const teto = NOSSO_COM_ESTOQUE.has(tipo) ? x.sugerido ?? x.maximo : x.maximo;
      let preco = ajuste.preco ?? minimo;
      if (teto != null && preco > teto + 0.005) {
        if (teto >= minimoEfetivo - 0.005) preco = teto;
        else { fora.push(`${nome}: o canal aceita até ${brl(teto)}`); continue; }
      }
      if (x.minimo != null && preco < x.minimo) preco = x.minimo;
      preco = r2(preco);
      if (!melhora(preco)) continue;
      const u = NOSSO_COM_ESTOQUE.has(tipo) ? unidadesDe(x) : null;
      if (u === "nao") { fora.push(`${nome}: estoque não cobre o relâmpago`); continue; }
      opcoes.push(nova({
        acao: "entrar", regra: "meta", promocao: x.codigo, tipo, nome, comprador: preco, recebe: preco,
        precoAtual: null, meliPct: null, prazo: x.prazo, inicio: x.inicio, fim: x.fim, unidades: u,
        pedido: { mlb: i.mlb, promocao: x.codigo, tipo, preco, oferta: x.oferta, estoque: u, tetoDoCanal: teto },
      }));
      continue;
    }

    /* Já dentro de campanha própria, acima do mínimo: baixa (só desce). */
    if (x.status === "started" && ALTERAVEL.has(tipo) && (x.preco ?? 0) > 0) {
      if (!liga("baixar")) continue;
      const alvo = r2(ajuste.preco ?? minimo);
      if (alvo >= x.preco! * (1 - dif) - 0.005) continue;
      if (alvo < minimoEfetivo - 0.005) continue;
      if (!melhora(alvo)) continue;
      opcoes.push(nova({
        acao: "baixar", regra: "baixar", promocao: x.codigo, tipo, nome, comprador: alvo, recebe: alvo,
        precoAtual: x.preco, meliPct: null, prazo: null, inicio: x.inicio, fim: x.fim, unidades: null,
        pedido: { mlb: i.mlb, promocao: x.codigo, tipo, preco: alvo, alterar: true, precoAtual: x.preco },
      }));
    }
  }

  /* Menor preço ao comprador; empate, quem recebe mais. */
  opcoes.sort((a, b) => a.comprador - b.comprador || b.recebe - a.recebe);
  const recomendada = opcoes[0] ?? null;

  if (recomendada?.regra === "meli_paga" && recomendada.meliPct) {
    tags.push({ texto: `Meli paga ${String(recomendada.meliPct).replace(".", ",")}%`, tom: "up" });
  }
  const boost = i.promos.find((x) => x.status === "candidate" && x.boost);
  if (boost?.boost) tags.push({ texto: `Boost do Meli ${brl(boost.boost)}`, tom: "up" });
  const venc = i.catalogo?.vencedorPreco;
  if (liga("concorrente") && venc != null && recomendada && venc < recomendada.comprador - 0.005) {
    tags.push({ texto: `Catálogo: vencedor a ${brl(venc)}`, tom: "warn" });
  }

  if (!recomendada) {
    const noAlvo = vitrine != null && vitrine <= minimo * (1 + dif) + 0.005;
    return resultado(noAlvo ? "no_alvo" : "fora", noAlvo ? "no alvo" : fora[0] ?? "nenhuma promoção leva ao mínimo");
  }

  /*
   * Começa desmarcada — entra só se a pessoa marcar:
   *  · estoque acabando: o desconto é dinheiro dado à toa;
   *  · abaixo do mínimo da tabela: só a tolerância de giro deixou passar,
   *    e "selecionar tudo" não pode levar isso junto sem ninguém ver.
   */
  const acabando = usaGiro && liga("estoque_curto") && giro.acabando;
  const abaixoDaTabela = recomendada.recebe < minimo - 0.005;
  if (acabando) tags.push({ texto: "Talvez desnecessário", tom: "warn" });
  if (abaixoDaTabela) tags.push({ texto: `Abaixo da tabela (${brl(minimo)}) · tolerância de giro`, tom: "down" });
  const marcada = !acabando && !abaixoDaTabela;

  const motivo =
    recomendada.acao === "baixar"
      ? `baixar ${brl(recomendada.precoAtual!)} → ${brl(recomendada.comprador)}`
      : recomendada.regra === "meli_paga"
        ? `comprador ${brl(recomendada.comprador)}, você recebe ${brl(recomendada.recebe)}`
        : `entrar a ${brl(recomendada.comprador)}`;
  return resultado(recomendada.acao === "baixar" ? "baixar" : "aceitar", motivo, opcoes, recomendada, marcada);
}

/** A lista inteira, na ordem da tela: prazo, depois o que o Meli paga, depois o maior desconto. */
export function sugerirTodos(
  itens: ItemBruto[],
  p: Parametros,
  ajustes: Map<string, Ajuste> = new Map(),
  hoje = new Date()
): Sugestao[] {
  const peso: Record<Grupo, number> = { aceitar: 0, baixar: 1, alerta: 2, no_alvo: 3, fora: 4 };
  return itens
    .map((i) => sugerir(i, p, ajustes.get(`${i.contaId}:${i.mlb}`), hoje))
    .sort((a, b) => {
      if (peso[a.grupo] !== peso[b.grupo]) return peso[a.grupo] - peso[b.grupo];
      const pa = a.recomendada?.prazo ?? "9999";
      const pb = b.recomendada?.prazo ?? "9999";
      if (pa !== pb) return pa.localeCompare(pb);
      const ma = a.recomendada?.regra === "meli_paga" ? 0 : 1;
      const mb = b.recomendada?.regra === "meli_paga" ? 0 : 1;
      if (ma !== mb) return ma - mb;
      const da = a.vitrine && a.recomendada ? 1 - a.recomendada.comprador / a.vitrine : 0;
      const db = b.vitrine && b.recomendada ? 1 - b.recomendada.comprador / b.vitrine : 0;
      return db - da;
    });
}

/* ══ Simulação: em que preço o anúncio vende mais ═════════════ */

export type DiaDoAnuncio = { data: string; preco: number | null; unidades: number; visitas: number | null; estoque: number | null };

export type FaixaDePreco = { de: number; ate: number; dias: number; unidades: number; porDia: number; conversao: number | null };

/**
 * Unidades POR DIA NO AR em cada faixa de preço, nos dias que a leitura
 * diária registrou.
 *
 * Por dia, e não no total: o preço que ficou 60 dias no ar soma mais
 * venda que o que ficou 5, e isso não diz que vende melhor. Dia sem preço
 * lido ou sem estoque fica de fora — não mediu, não é zero.
 *
 * As faixas são de 3% (preço praticado oscila centavos de um dia para o
 * outro e cada centavo viraria uma faixa de um dia só).
 */
export function desempenhoPorPreco(dias: DiaDoAnuncio[]): { faixas: FaixaDePreco[]; melhor: FaixaDePreco | null } {
  const validos = dias.filter((d) => d.preco != null && d.preco > 0 && (d.estoque == null || d.estoque > 0));
  if (!validos.length) return { faixas: [], melhor: null };
  const ordenados = [...validos].sort((a, b) => a.preco! - b.preco!);
  const faixas: (FaixaDePreco & { visitas: number; comVisita: number })[] = [];
  for (const d of ordenados) {
    let f = faixas[faixas.length - 1];
    if (!f || d.preco! > f.de * 1.03) {
      f = { de: d.preco!, ate: d.preco!, dias: 0, unidades: 0, porDia: 0, conversao: null, visitas: 0, comVisita: 0 };
      faixas.push(f);
    }
    f.ate = d.preco!;
    f.dias++;
    f.unidades += d.unidades;
    if (d.visitas != null) { f.visitas += d.visitas; f.comVisita += d.unidades; }
  }
  const saida = faixas.map(({ visitas, comVisita, ...f }) => ({
    ...f,
    porDia: r2(f.unidades / f.dias),
    conversao: visitas > 0 ? r2((comVisita / visitas) * 100) : null,
  }));
  /* Faixa de 1 ou 2 dias é sorte, não padrão: só disputa quem ficou 3+ dias. */
  const candidatas = saida.filter((f) => f.dias >= 3);
  const melhor = (candidatas.length ? candidatas : saida).reduce((a, b) => (b.porDia > a.porDia ? b : a));
  return { faixas: saida, melhor };
}
