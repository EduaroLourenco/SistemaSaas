import "server-only";
import { integracaoDaConta, lerSegredo } from "@/lib/integracoes/cofre";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";

/**
 * Cliente da VTEX — a loja própria.
 *
 * Só leitura de pedidos. Credencial é par de chave e token de aplicação
 * (`appKey`/`appToken`), que não expira e não rotaciona: diferente do
 * Mercado Livre, aqui não há renovação a manter. Mas o cofre vale igual —
 * `integracoes.config` é legível por qualquer membro via RLS, inclusive um
 * leitor, e esse par dá acesso a todos os pedidos da loja.
 *
 * A credencial é POR CONTA DE CANAL, como no Meli. Antes vinha do ambiente,
 * uma só para o servidor inteiro: a segunda empresa leria os pedidos da
 * primeira.
 *
 * Todo valor da VTEX vem em CENTAVOS. Converter na borda, uma vez, é o que
 * impede um pedido de R$ 82,80 virar R$ 8.280 lá dentro.
 */

const ENV = "vtexcommercestable.com.br";
export const PROVEDOR_VTEX = "vtex";

export class VtexNaoConfigurada extends Error {
  constructor(nome?: string) {
    super(
      nome
        ? `A loja "${nome}" não está conectada à VTEX. Conecte em Integrações.`
        : "VTEX não conectada. Conecte a loja em Integrações."
    );
    this.name = "VtexNaoConfigurada";
  }
}

export type CredencialVtex = { account: string; appKey: string; appToken: string };

/**
 * Credencial do ambiente — a loja da Probel, de antes do cofre.
 *
 * `VTEX_CONTA_CANAL_ID` diz DE QUEM ela é, e é obrigatório para ela valer.
 * Sem esse amarrão a credencial de uma empresa atenderia a loja de
 * qualquer outra: a VTEX não tem linha em `integracoes` ainda, então não
 * havia nada dizendo a quem o par de chaves pertence.
 *
 * Num SaaS isso não escala (não há variável de ambiente por cliente) e nem
 * precisa: quem conecta pela tela grava no cofre. Some sozinho quando
 * gravar.
 */
function sementeDoAmbiente(contaCanalId: string): CredencialVtex | null {
  const dona = process.env.VTEX_CONTA_CANAL_ID;
  if (!dona || dona !== contaCanalId) return null;

  const account = process.env.VTEX_ACCOUNT;
  const appKey = process.env.VTEX_APP_KEY;
  const appToken = process.env.VTEX_APP_TOKEN;
  return account && appKey && appToken ? { account, appKey, appToken } : null;
}

/** A credencial da conta: cofre primeiro, ambiente como recurso. */
export async function credencialDaConta(contaCanalId: string): Promise<CredencialVtex | null> {
  const integ = await integracaoDaConta(PROVEDOR_VTEX, contaCanalId);
  const guardada = await lerSegredo<Partial<CredencialVtex>>(integ);

  // `account` não é segredo e pode estar em `config`; a chave e o token, não.
  const account =
    guardada?.account ??
    (typeof integ?.config.account === "string" ? integ.config.account : undefined);

  if (account && guardada?.appKey && guardada.appToken) {
    return { account, appKey: guardada.appKey, appToken: guardada.appToken };
  }
  return sementeDoAmbiente(contaCanalId);
}

/** As lojas VTEX cadastradas, de todas as operações. Para a rotina agendada. */
export async function lojasVtex(): Promise<{ id: string; operacaoId: string; nome: string }[]> {
  const sb = clientePrivilegiado();
  const { data: canais } = await sb.from("canais").select("id").eq("codigo", PROVEDOR_VTEX);
  const ids = (canais ?? []).map((c) => c.id as string);
  if (!ids.length) return [];

  const { data } = await sb
    .from("contas_canal")
    .select("id,operacao_id,nome")
    .in("canal_id", ids)
    .eq("ativa", true);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    operacaoId: c.operacao_id as string,
    nome: c.nome as string,
  }));
}

/** A conta tem com que falar com a VTEX. */
export async function vtexConectada(contaCanalId: string) {
  return Boolean(await credencialDaConta(contaCanalId));
}

function montarAcesso(c: CredencialVtex) {
  return {
    base: `https://${c.account}.${ENV}`,
    headers: {
      "X-VTEX-API-AppKey": c.appKey,
      "X-VTEX-API-AppToken": c.appToken,
      Accept: "application/json",
    },
  };
}

const reais = (centavos: number | null | undefined) =>
  centavos == null ? 0 : Number((centavos / 100).toFixed(2));

type Acesso = ReturnType<typeof montarAcesso>;

async function api<T>(acesso: Acesso, caminho: string, tentativa = 0): Promise<T> {
  const { base, headers } = acesso;
  const r = await fetch(base + caminho, { headers, cache: "no-store" });
  if ((r.status === 429 || r.status >= 500) && tentativa < 3) {
    await new Promise((s) => setTimeout(s, 800 * (tentativa + 1)));
    return api<T>(acesso, caminho, tentativa + 1);
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
export async function pedidos({
  de,
  ate,
  conta,
  nome,
}: {
  de: string;
  ate: string;
  /** Id de `contas_canal` — qual loja. */
  conta: string;
  nome?: string;
}): Promise<PedidoVtex[]> {
  const credencial = await credencialDaConta(conta);
  if (!credencial) throw new VtexNaoConfigurada(nome);
  const acesso = montarAcesso(credencial);

  const janela = `creationDate:[${de}T00:00:00.000Z TO ${ate}T23:59:59.999Z]`;
  const ids: string[] = [];

  for (let pagina = 1; pagina <= 30; pagina++) {
    const l = await api<ListaOms>(
      acesso,
      `/api/oms/pvt/orders?f_creationDate=${encodeURIComponent(janela)}&per_page=100&page=${pagina}`
    );
    ids.push(...(l.list ?? []).map((o) => o.orderId));
    if (!l.paging || pagina >= l.paging.pages) break;
  }

  const detalhes = await comLimite(ids, 4, (id) =>
    api<DetalheOms>(acesso, `/api/oms/pvt/orders/${id}`).catch(() => null)
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
