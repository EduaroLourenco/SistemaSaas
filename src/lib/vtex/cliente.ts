import "server-only";

/**
 * Cliente da VTEX — a loja própria.
 *
 * Só leitura de pedidos. Credencial é par de chave e token de aplicação
 * (`appKey`/`appToken`), que não expira e não rotaciona: diferente do
 * Mercado Livre, aqui não existe refresh nem cofre a manter.
 *
 * Todo valor da VTEX vem em CENTAVOS. Converter na borda, uma vez, é o que
 * impede um pedido de R$ 82,80 virar R$ 8.280 lá dentro.
 */

const ENV = "vtexcommercestable.com.br";

export class VtexNaoConfigurada extends Error {
  constructor() {
    super("VTEX não conectada. Defina VTEX_ACCOUNT, VTEX_APP_KEY e VTEX_APP_TOKEN.");
    this.name = "VtexNaoConfigurada";
  }
}

export function vtexConfigurada() {
  return Boolean(
    process.env.VTEX_ACCOUNT && process.env.VTEX_APP_KEY && process.env.VTEX_APP_TOKEN
  );
}

function credenciais() {
  const conta = process.env.VTEX_ACCOUNT;
  const chave = process.env.VTEX_APP_KEY;
  const token = process.env.VTEX_APP_TOKEN;
  if (!conta || !chave || !token) throw new VtexNaoConfigurada();
  return {
    base: `https://${conta}.${ENV}`,
    headers: {
      "X-VTEX-API-AppKey": chave,
      "X-VTEX-API-AppToken": token,
      Accept: "application/json",
    },
  };
}

const reais = (centavos: number | null | undefined) =>
  centavos == null ? 0 : Number((centavos / 100).toFixed(2));

async function api<T>(caminho: string, tentativa = 0): Promise<T> {
  const { base, headers } = credenciais();
  const r = await fetch(base + caminho, { headers, cache: "no-store" });
  if ((r.status === 429 || r.status >= 500) && tentativa < 3) {
    await new Promise((s) => setTimeout(s, 800 * (tentativa + 1)));
    return api<T>(caminho, tentativa + 1);
  }
  if (!r.ok) {
    throw new Error(`VTEX respondeu ${r.status} em ${caminho.split("?")[0]}`);
  }
  return (await r.json()) as T;
}

export type ItemVtex = {
  /** O SKU interno, como a Probel o chama (`PA65751`). */
  sku: string | null;
  codigoExterno: string;
  titulo: string;
  quantidade: number;
  precoUnitario: number;
};

export type PedidoVtex = {
  id: string;
  data: string;
  fechadoEm: string | null;
  status: string;
  cancelado: boolean;
  /** Teve pagamento aprovado alguma vez. Ver `sincronizar.ts`. */
  autorizado: boolean;
  total: number;
  frete: number;
  itens: ItemVtex[];
};

type ListaOms = {
  list: { orderId: string }[];
  paging: { total: number; pages: number; currentPage: number };
};

type DetalheOms = {
  orderId: string;
  status: string;
  creationDate: string;
  authorizedDate?: string | null;
  invoicedDate?: string | null;
  value: number;
  totals?: { id: string; value: number }[];
  items?: {
    refId?: string | null;
    sellerSku?: string | null;
    id?: string;
    uniqueId?: string;
    name?: string;
    quantity: number;
    sellingPrice: number;
  }[];
};

/** Roda `fn` sobre a lista com no máximo `n` chamadas ao mesmo tempo. */
async function comLimite<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++;
        saida[i] = await fn(itens[i]);
      }
    })
  );
  return saida;
}

/**
 * Pedidos criados na janela, com os itens.
 *
 * A listagem do OMS devolve `items: null` — o item só existe no detalhe,
 * um pedido por chamada. Por isso a janela do dia a dia é curta: 30 dias
 * da loja são ~1.400 chamadas, e é o que torna a leitura cara.
 */
export async function pedidos({ de, ate }: { de: string; ate: string }): Promise<PedidoVtex[]> {
  const janela = `creationDate:[${de}T00:00:00.000Z TO ${ate}T23:59:59.999Z]`;
  const ids: string[] = [];

  for (let pagina = 1; pagina <= 30; pagina++) {
    const l = await api<ListaOms>(
      `/api/oms/pvt/orders?f_creationDate=${encodeURIComponent(janela)}&per_page=100&page=${pagina}`
    );
    ids.push(...(l.list ?? []).map((o) => o.orderId));
    if (!l.paging || pagina >= l.paging.pages) break;
  }

  const detalhes = await comLimite(ids, 4, (id) =>
    api<DetalheOms>(`/api/oms/pvt/orders/${id}`).catch(() => null)
  );

  const saida: PedidoVtex[] = [];
  for (const d of detalhes) {
    if (!d) continue;
    const frete = d.totals?.find((t) => t.id === "Shipping")?.value ?? 0;
    saida.push({
      id: d.orderId,
      data: d.creationDate.slice(0, 10),
      fechadoEm: d.creationDate,
      status: d.status,
      cancelado: d.status === "canceled",
      autorizado: Boolean(d.authorizedDate ?? d.invoicedDate),
      total: reais(d.value),
      frete: reais(frete),
      itens: (d.items ?? []).map((i) => ({
        // `refId` é o SKU da Probel; `id` é o número interno da VTEX.
        sku: i.refId ?? i.sellerSku ?? null,
        codigoExterno: String(i.refId ?? i.id ?? i.uniqueId ?? ""),
        titulo: i.name ?? "",
        quantidade: i.quantity,
        precoUnitario: reais(i.sellingPrice),
      })),
    });
  }
  return saida;
}
