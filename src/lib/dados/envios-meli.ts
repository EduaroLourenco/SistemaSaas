import "server-only";
import { operacaoPadrao } from "./operacao";
import { integracoesDoProvedor } from "@/lib/integracoes/cofre";
import { meliGet, vendedor } from "@/lib/meli/cliente";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { clienteServidor } from "@/lib/supabase/servidor";

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
  /** Id da conta de canal, para pedir a etiqueta na conta certa. Ausente em retrato antigo. */
  contaId?: string;
  /** Id do envio no Meli (shipping.id). Ausente em retrato antigo. */
  envio?: number | null;
  /** Substatus cru do envio: diz se a etiqueta já pode ser baixada. */
  substatus?: string;
  pedido: number;
  /** O número que o painel do Meli mostra: o do pacote, ou o do pedido se não houver. */
  venda?: number;
  /** Já saiu da mão do vendedor: fica fora dos pendentes e dos atrasados. */
  saiu?: boolean;
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
  /** Ainda sem baixa no Meli, mas já postados, coletados ou no centro de distribuição. */
  enviados?: EnvioMeli[];
  /** Contas que não responderam, com o motivo. */
  falhas: { conta: string; motivo: string }[];
  geradoEm: string;
};

type Ordem = {
  id: number;
  pack_id?: number | null;
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
  waiting_for_payment: "Aguardando pagamento",
  in_warehouse: "No centro do Meli",
};

/* O pacote já saiu da mão do vendedor, mas o status segue `ready_to_ship`. */
const JA_SAIU: Record<string, string> = {
  in_hub: "Entregue ao Meli",
  dropped_off: "Postado",
  picked_up: "Coletado",
};

function separar(lista: EnvioMeli[]) {
  return { envios: lista.filter((e) => !e.saiu), enviados: lista.filter((e) => e.saiu) };
}

const brt = (ms: number) => new Date(ms - 3 * 3600_000).toISOString();
const dias = (a: string, b: string) =>
  Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86_400_000);

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
        let saiu = false;
        let lido = !envio;

        if (envio) {
          const sla = await meliGet<{ expected_date?: string; last_updated?: string }>(`/shipments/${envio}/sla`, contaId).catch(() => null);
          const sh = await meliGet<{
            substatus?: string;
            date_created?: string;
            lead_time?: { estimated_delivery_time?: { schedule?: number | null } };
          }>(`/shipments/${envio}`, contaId, { "x-format-new": "true" }).catch(() => null);
          lido = Boolean(sh);
          sub = sh?.substatus ?? "";
          /* Coletado e a API ainda não soube. Na coleta (cross_docking) o
             envio fica em `ready_to_ship/in_packing_list` por dias, enquanto
             o painel já mostra "A caminho"; o que muda é o sla, que o Meli
             fecha logo depois da coleta. Sla mexido depois do limite com o
             envio na lista de coleta = já saiu. */
          saiu =
            sub in JA_SAIU ||
            (sub === "in_packing_list" &&
              Boolean(sla?.expected_date && sla.last_updated) &&
              Date.parse(sla!.last_updated!) > Date.parse(sla!.expected_date!));
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
          contaId,
          envio: envio ?? null,
          substatus: sub,
          pedido: o.id,
          venda: o.pack_id ?? o.id,
          saiu,
          compra: o.date_created,
          limite,
          origem,
          dias: limite && !saiu ? dias(limite.slice(0, 10), hoje) : null,
          situacao: saiu
            ? (JA_SAIU[sub] ?? "Coletado")
            : !lido
              ? "Situação não lida"
              : (SITUACAO[sub] ?? (status === "ready_to_ship" ? "Pronto para enviar" : "Aguardando envio")),
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

/*
 * Os envios são um RETRATO, não uma consulta ao vivo.
 *
 * Cada pedido custa até duas chamadas à cota compartilhada, e abrir a tela
 * no celular esperava todas elas. Agora o retrato é tirado nos horários do
 * bloco "Envios" (madrugada, manhã, 14h, 15h e 16h) ou quando alguém pede
 * pela atualização manual, e a tela só lê. Mora em `agendamentos` com
 * tipo "envios", uma linha por empresa.
 */
const TIPO = "envios";

export async function atualizarEnvios(operacaoId: string): Promise<DadosEnvios> {
  const hoje = brt(Date.now()).slice(0, 10);
  const integs = (await integracoesDoProvedor("mercado_livre", operacaoId)).filter((i) => i.ref);
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
    ...separar(porConta.flat()),
    falhas,
    geradoEm: new Date().toISOString(),
  };
  const sb = clientePrivilegiado();
  const { data: atual } = await sb.from("agendamentos").select("id").eq("operacao_id", operacaoId).eq("tipo", TIPO).limit(1).maybeSingle();
  const linha = { operacao_id: operacaoId, tipo: TIPO, cron: "bloco envios", descricao: "Retrato dos envios do Mercado Livre", config: v, ultimo_disparo: v.geradoEm };
  const { error } = atual
    ? await sb.from("agendamentos").update(linha).eq("id", atual.id)
    : await sb.from("agendamentos").insert(linha);
  if (error) throw new Error(`Não consegui guardar os envios: ${error.message}`);
  return v;
}

export type RecorteContas = { ids: Set<string>; nomes: string[] } | null;

/** Expedição só recebe as contas liberadas. Null: quem pergunta vê todas. */
async function recorteDaExpedicao(operacaoId: string): Promise<RecorteContas> {
  const sb = await clienteServidor();
  const ausente = (c?: string) => c === "PGRST202" || c === "42883";
  const { data: restrito, error } = await sb.rpc("acesso_so_expedicao", { p_operacao: operacaoId });
  if (error) {
    if (ausente(error.code)) return null;
    throw new Error(`Não consegui conferir seu acesso: ${error.message}`);
  }
  if (restrito !== true) return null;
  const { data, error: e2 } = await sb.rpc("contas_da_expedicao", { p_operacao: operacaoId });
  /* Sem a lista, não libera conta nenhuma. */
  if (e2 && !ausente(e2.code)) throw new Error(`Não consegui ler suas contas: ${e2.message}`);
  const contas = (e2 ? [] : (data ?? [])) as { id: string; nome: string }[];
  return { ids: new Set(contas.map((c) => c.id)), nomes: contas.map((c) => c.nome) };
}

export function aplicarRecorte(d: DadosEnvios, r: RecorteContas): DadosEnvios {
  if (!r) return d;
  const dentro = (e: EnvioMeli) => Boolean(e.contaId && r.ids.has(e.contaId));
  return {
    ...d,
    contas: r.nomes,
    envios: d.envios.filter(dentro),
    enviados: (d.enviados ?? []).filter(dentro),
    falhas: d.falhas.filter((f) => r.nomes.includes(f.conta)),
  };
}

export async function carregarEnvios(): Promise<DadosEnvios> {
  const op = await operacaoPadrao();
  if (!op) return { hoje: brt(Date.now()).slice(0, 10), contas: [], envios: [], falhas: [], geradoEm: new Date().toISOString() };
  const { data } = await clientePrivilegiado().from("agendamentos").select("config").eq("operacao_id", op.id).eq("tipo", TIPO).limit(1).maybeSingle();
  const salvo = data?.config as DadosEnvios | undefined;
  const recorte = await recorteDaExpedicao(op.id);
  if (!salvo?.geradoEm) return aplicarRecorte(await atualizarEnvios(op.id), recorte);
  // O "hoje" e os dias até o limite mudam à meia-noite, mesmo sem retrato novo.
  const hoje = brt(Date.now()).slice(0, 10);
  /* Retrato antigo não traz `saiu`: o substatus guardado responde. */
  const lista = [...salvo.envios, ...(salvo.enviados ?? [])].map((e) => {
    const saiu = Boolean(e.saiu) || (e.substatus ?? "") in JA_SAIU;
    return {
      ...e,
      saiu,
      situacao: saiu ? (JA_SAIU[e.substatus ?? ""] ?? "Coletado") : e.situacao,
      dias: e.limite && !saiu ? dias(e.limite.slice(0, 10), hoje) : null,
    };
  });
  return aplicarRecorte({ ...salvo, hoje, ...separar(lista) }, recorte);
}
