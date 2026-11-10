import "server-only";
import { operacaoPadrao } from "./operacao";
import { integracoesDoProvedor } from "@/lib/integracoes/cofre";
import { meliGet, vendedor } from "@/lib/meli/cliente";

/**
 * Envios do Mercado Livre: o que está pago e ainda não saiu, e até quando.
 *
 * O prazo vem de duas fontes, porque as duas contas despacham diferente:
 *
 * - **canal** — `/shipments/{id}/sla`. É o limite de despacho que o Meli
 *   calcula para quem envia pelo Mercado Envios (conta de São Paulo).
 * - **prazo** — conta a prazo (envio próprio, sob encomenda): o sla responde
 *   404, e o limite é a data do pagamento + o prazo de produção do anúncio
 *   (`lead_time.estimated_delivery_time.schedule`, em horas).
 *
 * Só entram pedidos pagos com envio `ready_to_ship` ou `pending`.
 */

export type EnvioMeli = {
  conta: string;
  pedido: number;
  /** Data da compra, ISO com fuso. */
  compra: string;
  /** Limite para despachar, ISO com -03:00. Nulo = o canal não informou. */
  limite: string | null;
  origem: "canal" | "prazo" | null;
  /** Dias de calendário até o limite, em Brasília. Negativo = atrasado. */
  dias: number | null;
  /** O que falta para sair, em palavras do operador. */
  situacao: string;
  comprador: string | null;
  itens: { titulo: string; sku: string | null; quantidade: number }[];
  total: number;
};

export type DadosEnvios = {
  hoje: string;
  contas: string[];
  envios: EnvioMeli[];
  /** Contas que não responderam, com o motivo. */
  falhas: { conta: string; motivo: string }[];
  geradoEm: string;
};

type Ordem = {
  id: number;
  date_created: string;
  total_amount?: number;
  buyer?: { nickname?: string };
  shipping?: { id?: number };
  order_items?: { quantity?: number; item?: { title?: string; seller_sku?: string | null } }[];
};

const SITUACAO: Record<string, string> = {
  invoice_pending: "Falta emitir a nota",
  in_packing_list: "Pronto para enviar",
  ready_for_dropoff: "Pronto para postar",
  ready_to_print: "Etiqueta para imprimir",
  printed: "Etiqueta impressa",
  buffered: "Aguardando liberação",
  shipment_paid: "Em produção",
};

const brt = (ms: number) => new Date(ms - 3 * 3600_000).toISOString();
const dias = (a: string, b: string) =>
  Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86_400_000);

/** Três minutos de memória: cada pedido custa até duas chamadas à cota compartilhada. */
const g = globalThis as unknown as { __enviosMeli?: { op: string; em: number; v: DadosEnvios } };
const VALE_MS = 180_000;

async function doConta(contaId: string, nome: string, hoje: string): Promise<EnvioMeli[]> {
  const v = await vendedor(contaId);
  const saida: EnvioMeli[] = [];

  for (const status of ["ready_to_ship", "pending"]) {
    for (let offset = 0; offset < 500; offset += 50) {
      const q = new URLSearchParams({
        seller: String(v.id),
        "order.status": "paid",
        "shipping.status": status,
        sort: "date_asc",
        limit: "50",
        offset: String(offset),
      });
      const r = await meliGet<{ results?: Ordem[] }>(`/orders/search?${q}`, contaId);
      const pagina = r.results ?? [];

      for (const o of pagina) {
        const envio = o.shipping?.id;
        let limite: string | null = null;
        let origem: EnvioMeli["origem"] = null;
        let sub = "";

        if (envio) {
          const sla = await meliGet<{ expected_date?: string }>(`/shipments/${envio}/sla`, contaId).catch(() => null);
          const sh = await meliGet<{
            substatus?: string;
            date_created?: string;
            lead_time?: { estimated_delivery_time?: { schedule?: number | null } };
          }>(`/shipments/${envio}`, contaId, { "x-format-new": "true" }).catch(() => null);
          sub = sh?.substatus ?? "";
          if (sla?.expected_date) {
            limite = sla.expected_date;
            origem = "canal";
          } else {
            const h = sh?.lead_time?.estimated_delivery_time?.schedule;
            if (h != null && sh?.date_created) {
              limite = brt(Date.parse(sh.date_created) + h * 3600_000).slice(0, 19) + "-03:00";
              origem = "prazo";
            }
          }
        }

        saida.push({
          conta: nome,
          pedido: o.id,
          compra: o.date_created,
          limite,
          origem,
          dias: limite ? dias(limite.slice(0, 10), hoje) : null,
          situacao: SITUACAO[sub] ?? (status === "ready_to_ship" ? "Pronto para enviar" : "Aguardando envio"),
          comprador: o.buyer?.nickname ?? null,
          itens: (o.order_items ?? []).map((i) => ({
            titulo: i.item?.title ?? "",
            sku: i.item?.seller_sku ?? null,
            quantidade: Number(i.quantity ?? 0),
          })),
          total: Number(o.total_amount ?? 0),
        });
      }
      if (pagina.length < 50) break;
    }
  }
  return saida;
}

export async function carregarEnvios(forcar = false): Promise<DadosEnvios> {
  const op = await operacaoPadrao();
  if (!op) return { hoje: brt(Date.now()).slice(0, 10), contas: [], envios: [], falhas: [], geradoEm: new Date().toISOString() };

  const guardado = g.__enviosMeli;
  if (!forcar && guardado && guardado.op === op.id && Date.now() - guardado.em < VALE_MS) return guardado.v;

  const hoje = brt(Date.now()).slice(0, 10);
  const integs = (await integracoesDoProvedor("mercado_livre", op.id)).filter((i) => i.ref);
  const falhas: DadosEnvios["falhas"] = [];

  const porConta = await Promise.all(
    integs.map((i) =>
      doConta(i.contaCanalId, i.nome, hoje).catch((e: unknown) => {
        falhas.push({ conta: i.nome, motivo: e instanceof Error ? e.message : "falha ao consultar" });
        return [] as EnvioMeli[];
      })
    )
  );

  const v: DadosEnvios = {
    hoje,
    contas: integs.map((i) => i.nome),
    envios: porConta.flat(),
    falhas,
    geradoEm: new Date().toISOString(),
  };
  g.__enviosMeli = { op: op.id, em: Date.now(), v };
  return v;
}
