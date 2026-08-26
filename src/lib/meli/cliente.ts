/**
 * Cliente do Mercado Livre.
 *
 * Portado da lógica de `src/cli.mjs` do pacote Meli+, com três diferenças:
 *
 *  1. credenciais vêm de variável de ambiente, não de arquivo em disco —
 *     token em texto puro no repositório é o que causou o vazamento;
 *  2. o access token é renovado sob demanda pelo refresh token e fica só
 *     em memória do processo;
 *  3. nunca é importado de componente de cliente. Só de rota de API.
 */

import { aguardarVez, autorizarLeitura, MeliBloqueado } from "./limite";

export { MeliBloqueado };

const API = "https://api.mercadolibre.com";
const TOKEN_URL = `${API}/oauth/token`;

/* ══════════════════════════════════════════════════════════════
   Contas
   ══════════════════════════════════════════════════════════════

   O Mercado Livre emite token POR CONTA DE VENDEDOR. Uma autorização não
   enxerga os pedidos da outra — não existe token que cubra as duas.

   Por isso cada conta tem seu próprio refresh token, e toda consulta diz
   de qual conta está falando. O app (appId + secret) é o mesmo para as
   duas: você autoriza o mesmo aplicativo em cada conta, separadamente.
*/

export type Conta = "principal" | "segunda";

export const CONTAS: { slug: Conta; nome: string; variavel: string }[] = [
  {
    slug: "principal",
    nome: "São Paulo — pronta entrega",
    variavel: "MELI_REFRESH_TOKEN",
  },
  {
    slug: "segunda",
    nome: "2ª conta — venda a prazo",
    variavel: "MELI_REFRESH_TOKEN_2",
  },
];

export class MeliNaoConfigurado extends Error {
  constructor(conta?: Conta) {
    const alvo = conta ? CONTAS.find((c) => c.slug === conta) : null;
    super(
      alvo
        ? `Conta "${alvo.nome}" não conectada. Defina MELI_APP_ID, MELI_CLIENT_SECRET e ${alvo.variavel}.`
        : "Integração com o Mercado Livre não configurada. Defina MELI_APP_ID, MELI_CLIENT_SECRET e MELI_REFRESH_TOKEN."
    );
    this.name = "MeliNaoConfigurado";
  }
}

type Credenciais = {
  appId: string;
  clientSecret: string;
  refreshToken: string;
};

function refreshDe(conta: Conta): string | undefined {
  const def = CONTAS.find((c) => c.slug === conta);
  return def ? process.env[def.variavel] : undefined;
}

function credenciais(conta: Conta): Credenciais {
  const appId = process.env.MELI_APP_ID;
  const clientSecret = process.env.MELI_CLIENT_SECRET;
  const refreshToken = refreshDe(conta);
  if (!appId || !clientSecret || !refreshToken) throw new MeliNaoConfigurado(conta);
  return { appId, clientSecret, refreshToken };
}

/** Sem argumento, responde se ao menos UMA conta está conectada. */
export function meliConfigurado(conta?: Conta) {
  const base = Boolean(process.env.MELI_APP_ID && process.env.MELI_CLIENT_SECRET);
  if (!base) return false;
  if (conta) return Boolean(refreshDe(conta));
  return CONTAS.some((c) => Boolean(process.env[c.variavel]));
}

/** Situação de cada conta — a tela usa para mostrar o que falta ligar. */
export function situacaoContas() {
  const base = Boolean(process.env.MELI_APP_ID && process.env.MELI_CLIENT_SECRET);
  return CONTAS.map((c) => ({
    slug: c.slug,
    nome: c.nome,
    variavel: c.variavel,
    conectada: base && Boolean(process.env[c.variavel]),
  }));
}

/**
 * Token em memória, por conta, renovado 60 s antes de vencer.
 *
 * O access token dura 6 horas e a renovação é automática — ninguém precisa
 * fazer login de novo por isso.
 *
 * `refresh` guarda o refresh token MAIS RECENTE. O Mercado Livre pode
 * devolver um refresh token novo a cada renovação e invalidar o anterior
 * (rotação). Guardando só o valor da variável de ambiente, a integração
 * funcionaria no primeiro dia e quebraria na primeira rotação — o pior
 * tipo de falha, porque aparece horas depois, sem ninguém ter mexido.
 */
const g = globalThis as unknown as {
  __meliToken?: Record<
    string,
    { valor: string; expiraEm: number; refresh?: string }
  >;
};

async function accessToken(conta: Conta): Promise<string> {
  g.__meliToken = g.__meliToken ?? {};
  const cache = g.__meliToken[conta];
  if (cache && cache.expiraEm > Date.now() + 60_000) return cache.valor;

  const c = credenciais(conta);
  const corpo = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: c.appId,
    client_secret: c.clientSecret,
    // Prefere o rotacionado; cai para o do .env no primeiro uso.
    refresh_token: cache?.refresh ?? c.refreshToken,
  });

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: corpo,
  });

  if (!r.ok) {
    const texto = await r.text().catch(() => "");
    // Nunca ecoar o corpo inteiro: pode trazer pedaço de credencial.
    throw new Error(
      `Falha ao renovar o token (HTTP ${r.status}). ` +
        (r.status === 400
          ? "O refresh token provavelmente expirou ou foi revogado — refaça a autorização."
          : texto.slice(0, 120))
    );
  }

  const json = (await r.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  const rotacionou = Boolean(
    json.refresh_token && json.refresh_token !== (cache?.refresh ?? c.refreshToken)
  );

  g.__meliToken![conta] = {
    valor: json.access_token,
    expiraEm: Date.now() + json.expires_in * 1000,
    refresh: json.refresh_token ?? cache?.refresh ?? c.refreshToken,
  };

  if (rotacionou) {
    // Só a memória do processo tem o valor novo. Reiniciar o servidor faz
    // cair para o do .env, que já pode ter sido invalidado — daí o aviso.
    // Some quando o refresh token passar a ser guardado no banco.
    console.warn(
      `[meli] A conta "${conta}" recebeu um refresh token novo. ` +
        "Ele está apenas em memória: se o servidor reiniciar e o antigo já " +
        "tiver sido invalidado, será preciso refazer o login."
    );
  }

  return json.access_token;
}

/**
 * GET autenticado na API. `caminho` começa com barra.
 *
 * Passa por dois portões antes de sair: `autorizarLeitura` recusa o que não
 * for leitura prevista, e `aguardarVez` espaça as chamadas para não comer a
 * cota dos agentes que dividem esta mesma aplicação. Este é o ÚNICO ponto
 * do sistema que fala com o Mercado Livre — os portões aqui valem para
 * todas as rotas, presentes e futuras.
 */
export async function meliGet<T>(
  caminho: string,
  conta: Conta = "principal"
): Promise<T> {
  autorizarLeitura(caminho);
  const token = await accessToken(conta);
  await aguardarVez();

  const r = await fetch(`${API}${caminho}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });

  if (!r.ok) {
    // 429 é o sintoma de cota estourada. Vale dizer o nome, porque aqui a
    // cota é dividida e a causa provável está fora desta plataforma.
    if (r.status === 429) {
      throw new Error(
        `Mercado Livre respondeu 429 (limite de chamadas) em ${caminho}. ` +
          "A cota é por aplicação e está compartilhada com seus agentes."
      );
    }
    throw new Error(`Mercado Livre respondeu HTTP ${r.status} em ${caminho}`);
  }
  return (await r.json()) as T;
}

/* ══════════════════════════════════════════════════════════════
   Consultas usadas pelas telas
   ══════════════════════════════════════════════════════════════ */

export type PrecoAnuncio = {
  mlb: string;
  /** Preço da vitrine agora. */
  preco: number | null;
  /** Preço cheio, quando o anúncio está com desconto. */
  precoOriginal: number | null;
  status: string | null;
  tipo: string | null;
  disponivel: number | null;
  vendidos: number | null;
  erro?: string;
};

type RespostaMulti = {
  code: number;
  body: {
    id: string;
    price?: number;
    original_price?: number | null;
    status?: string;
    listing_type_id?: string;
    available_quantity?: number;
    sold_quantity?: number;
  };
};

/**
 * Preço atual de vários anúncios. A API aceita no máximo 20 ids por
 * chamada, então os lotes são fatiados aqui.
 */
export async function precosAtuais(
  mlbs: string[],
  conta: Conta = "principal"
): Promise<PrecoAnuncio[]> {
  const unicos = Array.from(new Set(mlbs.filter(Boolean)));
  const saida: PrecoAnuncio[] = [];

  for (let i = 0; i < unicos.length; i += 20) {
    const lote = unicos.slice(i, i + 20);
    const resposta = await meliGet<RespostaMulti[]>(
      `/items?ids=${encodeURIComponent(lote.join(","))}`,
      conta
    );

    for (const item of resposta) {
      const b = item.body ?? {};
      if (item.code !== 200) {
        saida.push({
          mlb: b.id ?? "",
          preco: null,
          precoOriginal: null,
          status: null,
          tipo: null,
          disponivel: null,
          vendidos: null,
          erro: `HTTP ${item.code}`,
        });
        continue;
      }
      saida.push({
        mlb: b.id ?? "",
        preco: b.price ?? null,
        precoOriginal: b.original_price ?? null,
        status: b.status ?? null,
        tipo: b.listing_type_id ?? null,
        disponivel: b.available_quantity ?? null,
        vendidos: b.sold_quantity ?? null,
      });
    }
  }

  return saida;
}

/* ── Vendedor ────────────────────────────────────────────────── */

export type Vendedor = { id: number; nickname: string; permalink?: string };

const gv = globalThis as unknown as { __meliVendedor?: Record<string, Vendedor> };

/** `/users/me`. Guardado em memória: não muda dentro do processo. */
export async function vendedor(conta: Conta = "principal"): Promise<Vendedor> {
  gv.__meliVendedor = gv.__meliVendedor ?? {};
  const guardado = gv.__meliVendedor[conta];
  if (guardado) return guardado;
  const v = await meliGet<Vendedor>("/users/me", conta);
  gv.__meliVendedor[conta] = v;
  return v;
}

/* ── Pedidos ─────────────────────────────────────────────────── */

export type ItemPedido = {
  mlb: string;
  titulo: string;
  sku: string | null;
  quantidade: number;
  /** O preço que o cliente pagou por unidade. É a fonte do histórico. */
  precoUnitario: number;
};

export type Pedido = {
  id: number;
  data: string;
  status: string;
  cancelado: boolean;
  total: number;
  itens: ItemPedido[];
};

type OrdemBruta = {
  id: number;
  status?: string;
  date_created?: string;
  date_closed?: string;
  total_amount?: number;
  paid_amount?: number;
  order_items?: {
    quantity?: number;
    unit_price?: number;
    item?: { id?: string; title?: string; seller_sku?: string | null };
  }[];
};

function normalizarPedido(o: OrdemBruta): Pedido {
  const itens = (o.order_items ?? []).map((i) => ({
    mlb: i.item?.id ?? "",
    titulo: i.item?.title ?? "",
    sku: i.item?.seller_sku ?? null,
    quantidade: Number(i.quantity ?? 0),
    precoUnitario: Number(i.unit_price ?? 0),
  }));

  // Prioriza total_amount; se faltar, soma item a item — mesma regra do CLI.
  const total = Number.isFinite(Number(o.total_amount))
    ? Number(o.total_amount)
    : itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0);

  const status = String(o.status ?? "").toLowerCase();

  return {
    id: o.id,
    data: (o.date_closed ?? o.date_created ?? "").slice(0, 10),
    status,
    cancelado: status === "cancelled" || status === "canceled",
    total: +total.toFixed(2),
    itens,
  };
}

/**
 * Pedidos num intervalo de datas.
 *
 * ATENÇÃO ao limite que quase custou dado: o Mercado Livre **corta a
 * paginação em offset 1000**. Pedir offset 1050 não devolve a página
 * seguinte — devolve vazio ou erro. Paginar direto numa janela grande
 * perderia pedidos em silêncio, que é o pior tipo de bug: o número fica
 * menor e ninguém percebe.
 *
 * Por isso o intervalo é fatiado em janelas. Se uma janela encostar no
 * teto, ela é partida ao meio e refeita — assim um mês de pico se resolve
 * sozinho, sem exigir que quem chama saiba o volume de antemão.
 *
 * `/orders/search/recent` cobre um passado curto e é mais rápido; cai para
 * `/orders/search` quando não devolve nada — mesma escada do CLI.
 */

const TETO_OFFSET = 1000;

function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function diferencaDias(de: string, ate: string) {
  const [ay, am, ad] = de.split("-").map(Number);
  const [by, bm, bd] = ate.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000
  );
}

/** Uma janela, paginada até o teto. Devolve também se encostou nele. */
async function janela(
  rota: string,
  sellerId: number,
  de: string,
  ate: string,
  conta: Conta
): Promise<{ linhas: OrdemBruta[]; encostou: boolean }> {
  const limite = 50;
  const linhas: OrdemBruta[] = [];

  for (let offset = 0; offset < TETO_OFFSET; offset += limite) {
    const qs = new URLSearchParams({
      seller: String(sellerId),
      offset: String(offset),
      limit: String(limite),
      "order.date_created.from": `${de}T00:00:00.000-03:00`,
      "order.date_created.to": `${ate}T23:59:59.999-03:00`,
    });

    const data = await meliGet<{ results?: OrdemBruta[]; paging?: { total?: number } }>(
      `${rota}?${qs}`,
      conta
    );
    const pagina = data.results ?? [];
    linhas.push(...pagina);

    const total = Number(data.paging?.total);
    // O canal diz quantos existem: se passa do teto, a janela é grande demais.
    if (Number.isFinite(total) && total > TETO_OFFSET) {
      return { linhas, encostou: true };
    }
    if (pagina.length < limite) break;
  }

  return { linhas, encostou: linhas.length >= TETO_OFFSET };
}

/** Busca recursiva: janela grande demais é partida ao meio. */
async function buscarJanela(
  rota: string,
  sellerId: number,
  de: string,
  ate: string,
  conta: Conta,
  profundidade = 0
): Promise<OrdemBruta[]> {
  const r = await janela(rota, sellerId, de, ate, conta);

  // Um único dia com mais de 1000 pedidos não tem como partir mais.
  // Devolve o que veio — melhor um dado marcado do que travar.
  if (!r.encostou || de === ate || profundidade > 8) return r.linhas;

  const dias = diferencaDias(de, ate);
  const meio = somarDias(de, Math.floor(dias / 2));

  const [a, b] = await Promise.all([
    buscarJanela(rota, sellerId, de, meio, conta, profundidade + 1),
    buscarJanela(rota, sellerId, somarDias(meio, 1), ate, conta, profundidade + 1),
  ]);
  return [...a, ...b];
}

export async function pedidos({
  de,
  ate,
  conta = "principal",
  /** Tamanho da primeira fatia, em dias. Janelas maiores são partidas sozinhas. */
  janelaDias = 30,
}: {
  de: string;
  ate: string;
  conta?: Conta;
  janelaDias?: number;
}): Promise<Pedido[]> {
  const v = await vendedor(conta);

  for (const rota of ["/orders/search/recent", "/orders/search"]) {
    const brutos: OrdemBruta[] = [];

    for (let inicio = de; inicio <= ate; inicio = somarDias(inicio, janelaDias)) {
      const fim = somarDias(inicio, janelaDias - 1);
      brutos.push(
        ...(await buscarJanela(rota, v.id, inicio, fim > ate ? ate : fim, conta))
      );
    }

    if (brutos.length) {
      // O mesmo pedido pode vir em duas janelas na fronteira; tira repetido.
      const porId = new Map<number, OrdemBruta>();
      for (const o of brutos) porId.set(o.id, o);
      return [...porId.values()].map(normalizarPedido);
    }
  }

  return [];
}

/* ── Visitas ─────────────────────────────────────────────────── */

export type VisitaAnuncio = { mlb: string; visitas: number };

/**
 * Visitas por anúncio no intervalo. A API aceita no máximo 50 ids por
 * chamada, então os lotes são fatiados.
 */
export async function visitas({
  de,
  ate,
  mlbs = [],
  conta = "principal",
}: {
  de: string;
  ate: string;
  mlbs?: string[];
  conta?: Conta;
}): Promise<{ total: number; itens: VisitaAnuncio[] }> {
  const v = await vendedor(conta);
  const itens: VisitaAnuncio[] = [];
  const lotes = mlbs.length
    ? Array.from({ length: Math.ceil(mlbs.length / 50) }, (_, i) =>
        mlbs.slice(i * 50, i * 50 + 50)
      )
    : [[]];

  for (const lote of lotes) {
    const qs = new URLSearchParams({ date_from: de, date_to: ate, limit: "50" });
    if (lote.length) qs.set("item_ids", lote.join(","));

    const data = await meliGet<{
      total_visits?: number;
      visits?: { item_id?: string; total_visits?: number; visits?: number }[];
      items?: { item_id?: string; total_visits?: number; visits?: number }[];
    }>(`/users/${encodeURIComponent(String(v.id))}/items_visits?${qs}`, conta);

    const linhas = data.visits ?? data.items ?? [];
    for (const l of linhas) {
      itens.push({
        mlb: l.item_id ?? "",
        visitas: Number(l.total_visits ?? l.visits ?? 0),
      });
    }
  }

  return { total: itens.reduce((s, i) => s + i.visitas, 0), itens };
}

/* ── Catálogo do vendedor ────────────────────────────────────── */

/**
 * Todos os seus anúncios, com detalhe. Pagina a busca de ids e depois
 * hidrata em lotes de 20.
 */
export async function meusAnuncios({
  status,
  conta = "principal",
  maximo = 3000,
}: {
  status?: "active" | "paused" | "closed";
  conta?: Conta;
  maximo?: number;
} = {}): Promise<PrecoAnuncio[]> {
  const v = await vendedor(conta);
  const ids: string[] = [];
  const limite = 100;

  for (let offset = 0; offset < maximo; offset += limite) {
    const qs = new URLSearchParams({ limit: String(limite), offset: String(offset) });
    if (status) qs.set("status", status);

    const data = await meliGet<{ results?: string[]; paging?: { total?: number } }>(
      `/users/${encodeURIComponent(String(v.id))}/items/search?${qs}`,
      conta
    );
    const pagina = data.results ?? [];
    ids.push(...pagina);

    const total = Number(data.paging?.total);
    if (pagina.length < limite || (Number.isFinite(total) && ids.length >= total)) break;
  }

  return ids.length ? precosAtuais(ids, conta) : [];
}

/* ── Frete ───────────────────────────────────────────────────── */

export type OpcaoFrete = {
  nome: string;
  modalidade: string | null;
  valor: number;
  gratis: boolean;
  prazoDias: number | null;
};

/** Opções de frete de um anúncio para um CEP. */
export async function opcoesFrete({
  mlb,
  cep,
  quantidade = 1,
  conta = "principal",
}: {
  mlb: string;
  cep: string;
  quantidade?: number;
  conta?: Conta;
}): Promise<OpcaoFrete[]> {
  const qs = new URLSearchParams({
    zip_code: cep.replace(/\D/g, ""),
    quantity: String(quantidade),
  });

  const data = await meliGet<{
    options?: {
      name?: string;
      shipping_method_id?: number;
      cost?: number;
      list_cost?: number;
      estimated_delivery_time?: { shipping?: number };
    }[];
  }>(`/items/${encodeURIComponent(mlb)}/shipping_options?${qs}`, conta);

  return (data.options ?? []).map((o) => ({
    nome: o.name ?? "",
    modalidade: o.shipping_method_id ? String(o.shipping_method_id) : null,
    valor: Number(o.cost ?? 0),
    // custo zero para o comprador significa frete bancado pelo vendedor
    gratis: Number(o.cost ?? 0) === 0,
    prazoDias: o.estimated_delivery_time?.shipping ?? null,
  }));
}

/* ── Concorrentes ────────────────────────────────────────────── */

export type ResultadoBusca = {
  mlb: string;
  titulo: string;
  preco: number;
  vendedor: string | null;
  vendedorId: number | null;
  /** true quando o anúncio é seu — a busca devolve os seus junto. */
  meu: boolean;
  vendidos: number | null;
  freteGratis: boolean;
  link: string;
};

/**
 * Busca pública no catálogo. É como se acha o preço do concorrente —
 * não exige token de vendedor, mas usa o mesmo cliente por simplicidade.
 */
export async function buscarNoCanal({
  termo,
  site = "MLB",
  limite = 20,
  conta = "principal",
}: {
  termo: string;
  site?: string;
  limite?: number;
  conta?: Conta;
}): Promise<ResultadoBusca[]> {
  const qs = new URLSearchParams({
    q: termo,
    limit: String(Math.min(50, Math.max(1, limite))),
  });

  const data = await meliGet<{
    results?: {
      id?: string;
      title?: string;
      price?: number;
      sold_quantity?: number;
      permalink?: string;
      shipping?: { free_shipping?: boolean };
      seller?: { id?: number; nickname?: string };
    }[];
  }>(`/sites/${encodeURIComponent(site)}/search?${qs}`, conta);

  // Marca os anúncios que são seus. Sem isso, o "menor preço concorrente"
  // pode acabar sendo o seu próprio anúncio — e o alerta dispara contra
  // você mesmo.
  let meuId: number | null = null;
  try {
    meuId = (await vendedor(conta)).id;
  } catch {
    // Busca pública funciona sem identificar o vendedor; segue sem marcar.
  }

  return (data.results ?? []).map((r) => ({
    mlb: r.id ?? "",
    titulo: r.title ?? "",
    preco: Number(r.price ?? 0),
    vendedor: r.seller?.nickname ?? null,
    vendedorId: r.seller?.id ?? null,
    meu: meuId !== null && r.seller?.id === meuId,
    vendidos: r.sold_quantity ?? null,
    freteGratis: Boolean(r.shipping?.free_shipping),
    link: r.permalink ?? "",
  }));
}
