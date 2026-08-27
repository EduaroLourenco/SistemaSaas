import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/**
 * Campanhas e histórico de promoções, lidos do banco.
 *
 * O que alimenta estas telas é o processamento da Central de Promoções.
 * Enquanto nenhuma planilha for processada, elas ficam vazias — e é o
 * estado correto: antes eram dados inventados de campanhas que nunca
 * existiram.
 *
 * A curva ABC vem da MESMA regra da análise de anúncios, calculada sobre
 * a receita real do SKU. Duas definições de curva A no mesmo sistema
 * fariam a mesma peça aparecer como A numa tela e B na outra.
 */

export type ItemHistorico = {
  id: string;
  mlb: string;
  sku: string;
  titulo: string;
  campanha: string;
  tipoAnuncio: "Clássico" | "Premium";
  tipoCampanha: string;
  precoOfertadoML: number | null;
  precoTabela: number | null;
  precoPiso: number | null;
  precoComExtra: number | null;
  reducaoTarifa: string;
  aprovado: boolean;
  motivo: string | null;
  tags: string[];
  data: string;
  /** Curva do SKU, vinda da receita real. */
  curva: "A" | "B" | "C" | "—";
  /** Preço médio pago no período da campanha, dos pedidos. */
  precoPraticado: number | null;
};

export type CampanhaResumo = {
  id: string;
  nome: string;
  temReducao: boolean;
  ativa: boolean;
  inicio: string | null;
  fim: string | null;
  itens: number;
  participam: number;
  fora: number;
  ultimoProcessamento: string | null;
};

export type DadosPromocoes = {
  campanhas: CampanhaResumo[];
  historico: ItemHistorico[];
  processamentos: {
    id: string;
    quando: string;
    lidos: number;
    aprovados: number;
    reprovados: number;
    descontoExtra: number;
    arquivos: string[];
  }[];
  vazio: boolean;
};

const n = (v: unknown) => (v == null ? null : Number(v));

export async function carregarPromocoes(): Promise<DadosPromocoes> {
  const sb = await clienteServidor();

  const [historicoBruto, campanhasBrutas, procs, itensPedido, anuncios] =
    await Promise.all([
      paginar(() =>
        sb
          .from("historico_promocoes")
          .select(
            "id,mlb,sku,campanha,tipo_anuncio,tipo_campanha,preco_tabela,preco_oferta," +
              "preco_piso,preco_com_extra,reducao_tarifa,status_aprovacao,motivo,tags,data_processamento"
          )
          .order("data_processamento", { ascending: false })
      ),
      sb
        .from("campanhas")
        .select("id,nome,tem_reducao_tarifa,ativa,inicio,fim,atualizado_em")
        .order("atualizado_em", { ascending: false })
        .limit(200),
      sb
        .from("processamentos_promocao")
        .select("id,executado_em,itens_lidos,itens_aprovados,itens_reprovados,desconto_extra,arquivos")
        .order("executado_em", { ascending: false })
        .limit(50),
      paginar(() =>
        sb
          .from("pedido_itens")
          .select("sku,quantidade,preco_unitario,pedidos(data,cancelado)")
      ),
      paginar(() => sb.from("anuncios").select("codigo_externo,titulo")),
    ]);

  if (!historicoBruto.length) {
    return { campanhas: [], historico: [], processamentos: [], vazio: true };
  }

  /* ── Curva ABC e preço praticado, por SKU ─────────────── */

  type Item = {
    sku: string | null;
    quantidade: number;
    preco_unitario: string;
    pedidos: { data: string; cancelado: boolean } | null;
  };

  const porSku = new Map<string, { receita: number; un: number }>();
  for (const i of itensPedido as unknown as Item[]) {
    if (!i.pedidos || i.pedidos.cancelado) continue;
    const sku = (i.sku ?? "").trim();
    if (!sku) continue;
    const preco = Number(i.preco_unitario) || 0;
    const qtd = i.quantidade || 1;
    const g = porSku.get(sku) ?? { receita: 0, un: 0 };
    g.receita += preco * qtd;
    g.un += qtd;
    porSku.set(sku, g);
  }

  const ordenados = [...porSku.entries()].sort((a, b) => b[1].receita - a[1].receita);
  const total = ordenados.reduce((s, [, v]) => s + v.receita, 0);
  const curvaPorSku = new Map<string, "A" | "B" | "C">();
  let acumulado = 0;
  for (const [sku, v] of ordenados) {
    acumulado += v.receita;
    const p = total ? (acumulado / total) * 100 : 100;
    curvaPorSku.set(sku, p <= 80 ? "A" : p <= 95 ? "B" : "C");
  }

  const tituloPorMlb = new Map(
    (anuncios as { codigo_externo: string; titulo: string }[]).map((a) => [
      a.codigo_externo.toUpperCase(),
      a.titulo,
    ])
  );

  type LinhaHist = {
    id: string; mlb: string; sku: string | null; campanha: string;
    tipo_anuncio: string; tipo_campanha: string | null;
    preco_tabela: string | null; preco_oferta: string | null;
    preco_piso: string | null; preco_com_extra: string | null;
    reducao_tarifa: string | null; status_aprovacao: string;
    motivo: string | null; tags: string[] | null; data_processamento: string;
  };

  const historico: ItemHistorico[] = (historicoBruto as unknown as LinhaHist[]).map((h) => {
    const sku = (h.sku ?? "").trim();
    const doSku = porSku.get(sku);
    return {
      id: h.id,
      mlb: h.mlb,
      sku: sku || "—",
      titulo: tituloPorMlb.get(h.mlb.toUpperCase()) ?? h.mlb,
      campanha: h.campanha,
      tipoAnuncio: h.tipo_anuncio === "premium" ? "Premium" : "Clássico",
      tipoCampanha: h.tipo_campanha ?? "—",
      precoOfertadoML: n(h.preco_oferta),
      precoTabela: n(h.preco_tabela),
      // O piso é gravado; se a coluna ainda não existir no banco, cai para
      // o cálculo — a tela não deve quebrar por causa de uma migração.
      precoPiso: n(h.preco_piso) ?? (n(h.preco_tabela) ? n(h.preco_tabela)! * 0.95 : null),
      precoComExtra: n(h.preco_com_extra),
      reducaoTarifa: h.reducao_tarifa ?? "Não",
      aprovado: h.status_aprovacao === "aprovado",
      motivo: h.motivo,
      tags: h.tags ?? [],
      data: h.data_processamento.slice(0, 10),
      curva: curvaPorSku.get(sku) ?? "—",
      precoPraticado: doSku && doSku.un ? doSku.receita / doSku.un : null,
    };
  });

  /* ── Campanhas, com contagem vinda do histórico ────────── */

  const porCampanha = new Map<string, { itens: number; sim: number; quando: string }>();
  for (const h of historico) {
    const g = porCampanha.get(h.campanha) ?? { itens: 0, sim: 0, quando: h.data };
    g.itens++;
    if (h.aprovado) g.sim++;
    if (h.data > g.quando) g.quando = h.data;
    porCampanha.set(h.campanha, g);
  }

  type LinhaCamp = {
    id: string; nome: string; tem_reducao_tarifa: boolean;
    ativa: boolean; inicio: string | null; fim: string | null;
  };

  const campanhas: CampanhaResumo[] = (campanhasBrutas.data ?? []).map((c) => {
    const l = c as unknown as LinhaCamp;
    const g = porCampanha.get(l.nome);
    return {
      id: l.id,
      nome: l.nome,
      temReducao: l.tem_reducao_tarifa,
      ativa: l.ativa,
      inicio: l.inicio,
      fim: l.fim,
      itens: g?.itens ?? 0,
      participam: g?.sim ?? 0,
      fora: (g?.itens ?? 0) - (g?.sim ?? 0),
      ultimoProcessamento: g?.quando ?? null,
    };
  });

  const processamentos = (procs.data ?? []).map((p) => ({
    id: p.id as string,
    quando: (p.executado_em as string).slice(0, 10),
    lidos: (p.itens_lidos as number) ?? 0,
    aprovados: (p.itens_aprovados as number) ?? 0,
    reprovados: (p.itens_reprovados as number) ?? 0,
    descontoExtra: Number(p.desconto_extra ?? 0),
    arquivos: (p.arquivos as string[]) ?? [],
  }));

  return { campanhas, historico, processamentos, vazio: false };
}
