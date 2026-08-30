import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar, type Exclusao } from "./exclusoes";

/**
 * Cancelamento por canal e por SKU.
 *
 * A tela existe porque o número já estava no banco e ninguém olhava: mais
 * de um milhão de reais cancelados no ano, com um canal cancelando quase
 * quatro de cada dez pedidos. Faturamento que volta não aparece em
 * nenhuma tela de faturamento — some da soma e não deixa rastro.
 *
 * A taxa é contada em VALOR e em QUANTIDADE, e as duas discordam de
 * propósito. Um canal que cancela muitos pedidos pequenos é um problema
 * de operação; um que cancela poucos pedidos grandes é um problema de
 * caixa. Só a taxa por quantidade esconderia o segundo.
 */

export type CancelamentoCanal = {
  canalId: string;
  canal: string;
  conta: string;
  mostrarConta: boolean;
  pedidos: number;
  cancelados: number;
  taxaQuantidade: number;
  receitaBruta: number;
  valorCancelado: number;
  taxaValor: number;
  ticketCancelado: number;
  ticketNormal: number;
};

export type CancelamentoSku = {
  sku: string;
  titulo: string;
  itens: number;
  itensCancelados: number;
  valorCancelado: number;
  taxaQuantidade: number;
  canais: string[];
};

export type CancelamentoMes = {
  mes: string;
  valorCancelado: number;
  receitaBruta: number;
  taxaValor: number;
};

export type DadosCancelamento = {
  /** O que está fora da análise, e quanto saiu. A tela é obrigada a mostrar. */
  exclusoes: Exclusao[];
  removidas: number;
  totalOriginal: number;
  canaisDisponiveis: { id: string; nome: string }[];
  porCanal: CancelamentoCanal[];
  porSku: CancelamentoSku[];
  porMes: CancelamentoMes[];
  totalCancelado: number;
  totalBruto: number;
  taxaGeral: number;
  periodo: { inicio: string | null; fim: string | null };
  vazio: boolean;
};

type LinhaPedido = {
  id: string;
  data: string;
  cancelado: boolean;
  total: string | number;
  conta_canal_id: string;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

export async function carregarCancelamentos(
  desde?: string
): Promise<DadosCancelamento> {
  const sb = await clienteServidor();

  const [pedidos, { data: contasRaw }, exclusoes] = await Promise.all([
    paginar(() => {
      let q = sb
        .from("pedidos")
        .select("id,data,cancelado,total,conta_canal_id")
        .order("data", { ascending: true });
      if (desde) q = q.gte("data", desde);
      return q;
    }),
    sb
      .from("contas_canal")
      .select("id,nome,canal_id,canais(nome)")
      .limit(200),
    carregarExclusoes(),
  ]);

  const brutas = pedidos as unknown as LinhaPedido[];
  if (!brutas.length) {
    return {
      porCanal: [],
      porSku: [],
      porMes: [],
      totalCancelado: 0,
      totalBruto: 0,
      taxaGeral: 0,
      periodo: { inicio: null, fim: null },
      vazio: true,
      exclusoes,
      removidas: 0,
      totalOriginal: 0,
      canaisDisponiveis: [],
    };
  }

  type Conta = {
    id: string;
    nome: string;
    canal_id: string;
    canais: { nome: string } | null;
  };
  const contas = (contasRaw ?? []) as unknown as Conta[];
  const porConta = new Map(contas.map((c) => [c.id, c]));

  // A conta só é mostrada onde o canal tem mais de uma. Repetir "Conta
  // principal" em canal de conta única sugere que os canais compartilham
  // algo, que foi exatamente a dúvida que essa exibição já causou antes.
  const contasPorCanal = new Map<string, number>();
  for (const c of contas) {
    contasPorCanal.set(c.canal_id, (contasPorCanal.get(c.canal_id) ?? 0) + 1);
  }

  /*
   * As exclusões entram aqui, depois do mapa de contas: o teste precisa do
   * canal da linha, e o pedido só carrega a conta.
   */
  const anotadas = brutas.map((p) => {
    const c = porConta.get(p.conta_canal_id);
    return { ...p, canalId: c?.canal_id ?? null, contaCanalId: p.conta_canal_id };
  });
  const { mantidas: linhas, removidas } = aplicar(anotadas, exclusoes);

  const canaisDisponiveis = [
    ...new Map(
      contas.map((c) => [c.canal_id, { id: c.canal_id, nome: c.canais?.nome ?? "Outros" }])
    ).values(),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  /* ── Por canal ── */
  const canais = new Map<string, CancelamentoCanal>();
  for (const p of linhas) {
    const c = porConta.get(p.conta_canal_id);
    if (!c) continue;

    const chave = p.conta_canal_id;
    const at =
      canais.get(chave) ??
      {
        canalId: c.canal_id,
        canal: c.canais?.nome ?? "Outros",
        conta: c.nome,
        mostrarConta: (contasPorCanal.get(c.canal_id) ?? 1) > 1,
        pedidos: 0,
        cancelados: 0,
        taxaQuantidade: 0,
        receitaBruta: 0,
        valorCancelado: 0,
        taxaValor: 0,
        ticketCancelado: 0,
        ticketNormal: 0,
      };

    at.pedidos += 1;
    at.receitaBruta += n(p.total);
    if (p.cancelado) {
      at.cancelados += 1;
      at.valorCancelado += n(p.total);
    }
    canais.set(chave, at);
  }

  const porCanal = [...canais.values()]
    .map((c) => ({
      ...c,
      taxaQuantidade: c.pedidos ? (c.cancelados * 100) / c.pedidos : 0,
      taxaValor: c.receitaBruta ? (c.valorCancelado * 100) / c.receitaBruta : 0,
      ticketCancelado: c.cancelados ? c.valorCancelado / c.cancelados : 0,
      ticketNormal:
        c.pedidos - c.cancelados
          ? (c.receitaBruta - c.valorCancelado) / (c.pedidos - c.cancelados)
          : 0,
    }))
    .sort((a, b) => b.valorCancelado - a.valorCancelado);

  /* ── Por mês ── */
  const meses = new Map<string, CancelamentoMes>();
  for (const p of linhas) {
    const mes = String(p.data).slice(0, 7);
    const at =
      meses.get(mes) ?? { mes, valorCancelado: 0, receitaBruta: 0, taxaValor: 0 };
    at.receitaBruta += n(p.total);
    if (p.cancelado) at.valorCancelado += n(p.total);
    meses.set(mes, at);
  }
  const porMes = [...meses.values()]
    .map((m) => ({
      ...m,
      taxaValor: m.receitaBruta ? (m.valorCancelado * 100) / m.receitaBruta : 0,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  /* ── Por SKU ──
   *
   * Só os itens dos pedidos cancelados são buscados. Trazer os 7 mil itens
   * para descartar 90% deles custaria a consulta inteira para responder a
   * mesma pergunta.
   */
  const idsCancelados = linhas.filter((p) => p.cancelado).map((p) => p.id);
  const porSku: CancelamentoSku[] = [];

  if (idsCancelados.length) {
    const itens: { sku: string | null; titulo: string | null; quantidade: number; total: string | number; pedido_id: string }[] = [];
    for (let i = 0; i < idsCancelados.length; i += 200) {
      const { data } = await sb
        .from("pedido_itens")
        .select("sku,titulo,quantidade,total,pedido_id")
        .in("pedido_id", idsCancelados.slice(i, i + 200));
      itens.push(...((data ?? []) as typeof itens));
    }

    const canalDoPedido = new Map(
      linhas.map((p) => {
        const c = porConta.get(p.conta_canal_id);
        return [p.id, c?.canais?.nome ?? "Outros"];
      })
    );

    const skus = new Map<string, CancelamentoSku & { canaisSet: Set<string> }>();
    for (const it of itens) {
      const sku = it.sku ?? "(sem SKU)";
      const at =
        skus.get(sku) ??
        {
          sku,
          titulo: it.titulo ?? "",
          itens: 0,
          itensCancelados: 0,
          valorCancelado: 0,
          taxaQuantidade: 0,
          canais: [] as string[],
          canaisSet: new Set<string>(),
        };
      at.itensCancelados += it.quantidade ?? 1;
      at.valorCancelado += n(it.total);
      if (!at.titulo && it.titulo) at.titulo = it.titulo;
      const canal = canalDoPedido.get(it.pedido_id);
      if (canal) at.canaisSet.add(canal);
      skus.set(sku, at);
    }

    // Total vendido de cada SKU, para a taxa fazer sentido: 5 cancelamentos
    // em 6 vendas é um problema, em 600 é ruído.
    const chaves = [...skus.keys()].filter((s) => s !== "(sem SKU)");
    const vendidoPorSku = new Map<string, number>();
    for (let i = 0; i < chaves.length; i += 100) {
      const { data } = await sb
        .from("pedido_itens")
        .select("sku,quantidade")
        .in("sku", chaves.slice(i, i + 100));
      for (const r of data ?? []) {
        const k = r.sku as string;
        vendidoPorSku.set(k, (vendidoPorSku.get(k) ?? 0) + ((r.quantidade as number) ?? 1));
      }
    }

    for (const s of skus.values()) {
      const total = vendidoPorSku.get(s.sku) ?? s.itensCancelados;
      porSku.push({
        sku: s.sku,
        titulo: s.titulo,
        itens: total,
        itensCancelados: s.itensCancelados,
        valorCancelado: s.valorCancelado,
        taxaQuantidade: total ? (s.itensCancelados * 100) / total : 0,
        canais: [...s.canaisSet].sort(),
      });
    }
    porSku.sort((a, b) => b.valorCancelado - a.valorCancelado);
  }

  const totalCancelado = porCanal.reduce((s, c) => s + c.valorCancelado, 0);
  const totalBruto = porCanal.reduce((s, c) => s + c.receitaBruta, 0);

  return {
    porCanal,
    porSku: porSku.slice(0, 60),
    porMes,
    totalCancelado,
    totalBruto,
    taxaGeral: totalBruto ? (totalCancelado * 100) / totalBruto : 0,
    periodo: {
      inicio: linhas.length ? String(linhas[0].data).slice(0, 10) : null,
      fim: linhas.length ? String(linhas[linhas.length - 1].data).slice(0, 10) : null,
    },
    vazio: false,
    exclusoes,
    removidas,
    totalOriginal: brutas.length,
    canaisDisponiveis,
  };
}
