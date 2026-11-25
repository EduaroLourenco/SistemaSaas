import "server-only";
import { operacaoPadrao } from "./operacao";
import { integracoesDoProvedor } from "@/lib/integracoes/cofre";
import { meliGet } from "@/lib/meli/cliente";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { clienteServidor } from "@/lib/supabase/servidor";
import { lerReputacao, type ReputacaoBruta, type ReputacaoMeli, type StatusManual } from "@/lib/envios/reputacao";

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
  /** Quem recebe, do endereço do envio. Ausente em retrato antigo. */
  cliente?: string | null;
  /** Entrega prometida ao comprador, AAAA-MM-DD. */
  entrega?: string | null;
  /** me2 = Mercado Envios (o Meli mede o despacho); me1 = envio próprio. */
  logistica?: string | null;
  /** O que o Meli já registrou depois da saída, com a data (ISO). Só em `despachados`. */
  meli?: {
    status: "despachado" | "entregue";
    despachadoEm: string | null;
    entregueEm: string | null;
    /** Despachou depois do limite. Mercado Envios: o que o Meli conta (sla). Envio próprio: data de saída contra a prometida. */
    atrasou?: boolean | null;
  };
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
  /** Já despachados pelo Meli (em trânsito) e entregues nos últimos 3 dias. Fora de Envios. */
  despachados?: EnvioMeli[];
  /** Reputação de cada conta na hora do retrato. Ausente em retrato antigo. */
  reputacao?: { conta: string; contaId: string; rep: ReputacaoMeli | null }[];
  /** Status que a logística marca à mão, por pedido. Não vai ao Meli. */
  status?: Record<string, { s: StatusManual; em: string; por: string | null }>;
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

async function doConta(contaId: string, nome: string, hoje: string): Promise<{ envios: EnvioMeli[]; despachados: EnvioMeli[]; rep: ReputacaoMeli | null }> {
  /* Sem o cache de vendedor(): a reputação muda todo dia. */
  const v = await meliGet<{ id: number; seller_reputation?: ReputacaoBruta }>("/users/me", contaId);
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
        let cliente: string | null = null;
        let entrega: string | null = null;
        let logistica: string | null = null;

        if (envio) {
          const sla = await meliGet<{ expected_date?: string; last_updated?: string }>(`/shipments/${envio}/sla`, contaId).catch(() => null);
          const sh = await meliGet<{
            substatus?: string;
            date_created?: string;
            lead_time?: { estimated_delivery_time?: { schedule?: number | null; date?: string | null } };
            logistic?: { mode?: string };
            destination?: { receiver_name?: string };
          }>(`/shipments/${envio}`, contaId, { "x-format-new": "true" }).catch(() => null);
          lido = Boolean(sh);
          sub = sh?.substatus ?? "";
          cliente = sh?.destination?.receiver_name ?? null;
          entrega = sh?.lead_time?.estimated_delivery_time?.date?.slice(0, 10) ?? null;
          logistica = sh?.logistic?.mode ?? null;
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
          cliente,
          entrega,
          logistica,
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
  /*
   * O que já saiu, para Pedidos marcar sozinho. Em trânsito, só compras dos
   * últimos 45 dias: envio próprio fica "shipped" para sempre quando ninguém
   * baixa no Meli. Entregues, só os mexidos nos últimos 3 dias. O /shipments sem
   * x-format-new é o que traz as datas (status_history).
   */
  const despachados: EnvioMeli[] = [];
  const desde = brt(Date.now() - 3 * 86_400_000).slice(0, 19) + ".000-03:00";
  for (const status of ["shipped", "delivered"]) {
    for (let offset = 0; offset < 200; offset += 50) {
      const q = new URLSearchParams({ seller: String(v.id), "order.status": "paid", "shipping.status": status, sort: "date_desc", limit: "50", offset: String(offset) });
      if (status === "delivered") q.set("order.date_last_updated.from", desde);
      else q.set("order.date_created.from", brt(Date.now() - 45 * 86_400_000).slice(0, 19) + ".000-03:00");
      const pagina = (await meliGet<{ results?: Ordem[] }>(`/orders/search?${q}`, contaId)).results ?? [];
      for (const o of pagina) {
        const sh = o.shipping?.id
          ? await meliGet<{
              mode?: string;
              status_history?: { date_shipped?: string | null; date_delivered?: string | null };
              receiver_address?: { receiver_name?: string };
              shipping_option?: { estimated_delivery_time?: { date?: string | null } };
            }>(`/shipments/${o.shipping.id}`, contaId).catch(() => null)
          : null;
        const entregue = status === "delivered";
        const despachadoEm = sh?.status_history?.date_shipped ?? null;
        let limite: string | null = null;
        let atrasou: boolean | null = null;
        if (sh?.mode === "me2" && o.shipping?.id) {
          const sla = await meliGet<{ status?: string; expected_date?: string }>(`/shipments/${o.shipping.id}/sla`, contaId).catch(() => null);
          limite = sla?.expected_date ?? null;
          atrasou = sla?.status ? sla.status === "delayed" : null;
        } else {
          /* Envio próprio: a data prometida é o fim do prazo de produção. */
          limite = sh?.shipping_option?.estimated_delivery_time?.date ?? null;
          if (limite && despachadoEm) atrasou = brt(Date.parse(despachadoEm)).slice(0, 10) > limite.slice(0, 10);
        }
        despachados.push({
          conta: nome, contaId, envio: o.shipping?.id ?? null, pedido: o.id, venda: o.pack_id ?? o.id, saiu: true,
          compra: o.date_created, limite, origem: null, dias: null,
          situacao: entregue ? "Entregue" : "A caminho",
          comprador: o.buyer?.nickname ?? null,
          cliente: sh?.receiver_address?.receiver_name ?? null,
          entrega: sh?.shipping_option?.estimated_delivery_time?.date?.slice(0, 10) ?? null,
          logistica: sh?.mode ?? null,
          meli: { status: entregue ? "entregue" : "despachado", despachadoEm, entregueEm: sh?.status_history?.date_delivered ?? null, atrasou },
          itens: (o.order_items ?? []).map((i) => ({ titulo: i.item?.title ?? "", sku: i.item?.seller_sku ?? null, quantidade: Number(i.quantity ?? 0) })),
          total: Number(o.total_amount ?? 0),
        });
      }
      if (pagina.length < 50) break;
    }
  }
  return { envios: saida, despachados, rep: lerReputacao(v.seller_reputation) };
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
        return { envios: [] as EnvioMeli[], despachados: [] as EnvioMeli[], rep: null };
      })
    )
  );

  const v: DadosEnvios = {
    hoje,
    contas: integs.map((i) => i.nome),
    ...separar(porConta.flatMap((c) => c.envios)),
    despachados: porConta.flatMap((c) => c.despachados),
    reputacao: integs.map((i, k) => ({ conta: i.nome, contaId: i.contaCanalId, rep: porConta[k].rep })),
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
  const visiveis = new Set([...d.envios, ...(d.enviados ?? [])].filter(dentro).map((e) => String(e.pedido)));
  return {
    ...d,
    reputacao: (d.reputacao ?? []).filter((x) => r.ids.has(x.contaId)),
    status: Object.fromEntries(Object.entries(d.status ?? {}).filter(([p]) => visiveis.has(p))),
    contas: r.nomes,
    envios: d.envios.filter(dentro),
    enviados: (d.enviados ?? []).filter(dentro),
    despachados: (d.despachados ?? []).filter(dentro),
    falhas: d.falhas.filter((f) => r.nomes.includes(f.conta)),
  };
}

/*
 * Status manual: linha própria em `agendamentos`, porque o retrato é
 * sobrescrito inteiro a cada atualização e levaria as marcações junto.
 */
const TIPO_STATUS = "status-pedidos";
type MapaStatus = NonNullable<DadosEnvios["status"]>;

async function lerStatus(operacaoId: string): Promise<{ id: string | null; mapa: MapaStatus }> {
  const { data } = await clientePrivilegiado().from("agendamentos").select("id,config").eq("operacao_id", operacaoId).eq("tipo", TIPO_STATUS).limit(1).maybeSingle();
  return { id: (data?.id as string) ?? null, mapa: (data?.config as MapaStatus) ?? {} };
}

// ponytail: lê-altera-grava o mapa inteiro; duas marcações no mesmo segundo podem perder uma. Tabela por pedido se a equipe crescer.
export async function gravarStatus(operacaoId: string, pedido: number, s: StatusManual | null, por: string | null) {
  const { id, mapa } = await lerStatus(operacaoId);
  const corte = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const novo: MapaStatus = Object.fromEntries(Object.entries(mapa).filter(([, v]) => v.em >= corte));
  if (s) novo[String(pedido)] = { s, em: new Date().toISOString(), por };
  else delete novo[String(pedido)];
  const sb = clientePrivilegiado();
  const linha = { operacao_id: operacaoId, tipo: TIPO_STATUS, cron: "manual", descricao: "Status manual dos pedidos", config: novo, ativo: false };
  const { error } = id ? await sb.from("agendamentos").update({ config: novo }).eq("id", id) : await sb.from("agendamentos").insert(linha);
  if (error) throw new Error(`Não consegui guardar o status: ${error.message}`);
  return novo[String(pedido)] ?? null;
}

export async function carregarEnvios(): Promise<DadosEnvios> {
  const op = await operacaoPadrao();
  if (!op) return { hoje: brt(Date.now()).slice(0, 10), contas: [], envios: [], falhas: [], geradoEm: new Date().toISOString() };
  const [{ data }, { mapa: status }] = await Promise.all([
    clientePrivilegiado().from("agendamentos").select("config").eq("operacao_id", op.id).eq("tipo", TIPO).limit(1).maybeSingle(),
    lerStatus(op.id),
  ]);
  const salvo = data?.config as DadosEnvios | undefined;
  const recorte = await recorteDaExpedicao(op.id);
  if (!salvo?.geradoEm) return aplicarRecorte({ ...(await atualizarEnvios(op.id)), status }, recorte);
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
  return aplicarRecorte({ ...salvo, hoje, ...separar(lista), status }, recorte);
}
