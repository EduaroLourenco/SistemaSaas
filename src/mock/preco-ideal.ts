/**
 * Relatórios de preço ideal.
 *
 * Formato igual ao do parser da planilha: um relatório por upload, com
 * `dataBase` informada pelo operador e uma linha por MLB trazendo o preço
 * alvo e a comissão negociada. O preço praticado NÃO vem aqui — ele mora no
 * catálogo e é cruzado por MLB na tela.
 *
 * Geração determinística (PRNG semeado) para não quebrar a hidratação.
 */

import { CATALOGO, CATALOGO_POR_MLB, type ItemCatalogo } from "./catalogo";

export type LinhaPrecoIdeal = {
  mlb: string;
  /** Preço alvo calculado pela planilha, em reais. */
  precoIdeal: number;
  /** Comissão negociada com o canal, em %. */
  comissaoNegociada: number;
};

export type RelatorioPrecoIdeal = {
  id: string;
  fileName: string;
  /** ISO curto (yyyy-mm-dd) — informada no upload. */
  dataBase: string;
  /** Carimbo de envio, já formatado. */
  uploadedAt: string;
  linhas: LinhaPrecoIdeal[];
};

function prng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Cabecalho = {
  id: string;
  fileName: string;
  dataBase: string;
  uploadedAt: string;
  /** Amplitude do desvio daquele recorte, em pontos percentuais. */
  amplitude: number;
  /** Deslocamento sistêmico do recorte (campanha, reajuste de tabela). */
  vies: number;
  /** Itens finalizados ainda apareciam nos relatórios antigos. */
  incluiFinalizados: boolean;
};

const CABECALHOS: Cabecalho[] = [
  {
    id: "pi1",
    fileName: "ReportIdealSalePrice-2026-05-31.xlsx",
    dataBase: "2026-05-31",
    uploadedAt: "02/06/2026 08:41",
    amplitude: 14,
    vies: -1.8,
    incluiFinalizados: true,
  },
  {
    id: "pi2",
    fileName: "ReportIdealSalePrice-2026-06-30.xlsx",
    dataBase: "2026-06-30",
    uploadedAt: "01/07/2026 09:07",
    amplitude: 12,
    vies: 0.9,
    incluiFinalizados: true,
  },
  {
    id: "pi3",
    fileName: "ReportIdealSalePrice-2026-07-31.xlsx",
    dataBase: "2026-07-31",
    uploadedAt: "03/08/2026 08:26",
    amplitude: 10,
    vies: 2.4,
    incluiFinalizados: false,
  },
  {
    id: "pi4",
    fileName: "ReportIdealSalePrice-2026-08-18.xlsx",
    dataBase: "2026-08-18",
    uploadedAt: "19/08/2026 07:58",
    amplitude: 9,
    vies: 1.2,
    incluiFinalizados: false,
  },
];

/** Desconto de comissão conquistado na negociação, em pontos percentuais. */
const DESCONTOS = [0, 0.5, 1, 1.5, 2, 0.5, 1, 0, 1.5, 2];

function linhas(itens: ItemCatalogo[], c: Cabecalho, k: number): LinhaPrecoIdeal[] {
  const r = prng(k * 7919 + 101);
  return itens.map((item, i) => {
    // Desvio desejado do praticado em relação ao ideal, em %.
    const desvio = c.vies + (r() - 0.5) * c.amplitude;
    const precoIdeal = item.precoAtual / (1 + desvio / 100);
    const desconto = DESCONTOS[(i + k) % DESCONTOS.length];
    return {
      mlb: item.mlb,
      precoIdeal: +precoIdeal.toFixed(2),
      comissaoNegociada: +Math.max(8, item.comissaoAtual - desconto).toFixed(1),
    };
  });
}

export const RELATORIOS_PRECO_IDEAL: RelatorioPrecoIdeal[] = CABECALHOS.map(
  (c, k) => ({
    id: c.id,
    fileName: c.fileName,
    dataBase: c.dataBase,
    uploadedAt: c.uploadedAt,
    linhas: linhas(
      CATALOGO.filter((i) => c.incluiFinalizados || i.status !== "finalizado"),
      c,
      k + 1
    ),
  })
);

/** Relatório mais recente por data-base — o padrão da tela. */
export const RELATORIO_ATUAL: RelatorioPrecoIdeal =
  RELATORIOS_PRECO_IDEAL[RELATORIOS_PRECO_IDEAL.length - 1];

/** Preço ideal vigente de um MLB, ou 0 quando o item não está no relatório. */
export function precoIdealVigente(mlb: string): number {
  const l = RELATORIO_ATUAL.linhas.find((x) => x.mlb === mlb);
  return l ? l.precoIdeal : 0;
}

/** Comissão negociada vigente de um MLB, ou 0 quando não há linha. */
export function comissaoNegociadaVigente(mlb: string): number {
  const l = RELATORIO_ATUAL.linhas.find((x) => x.mlb === mlb);
  return l ? l.comissaoNegociada : 0;
}

/** Linha do relatório já cruzada com o catálogo — o que a tabela consome. */
export type LinhaCruzada = {
  mlb: string;
  sku: string;
  titulo: string;
  categoria: string;
  tipo: ItemCatalogo["tipo"];
  status: ItemCatalogo["status"];
  precoPraticado: number;
  precoIdeal: number;
  /** (praticado − ideal) / ideal, em %. */
  desvio: number;
  comissaoAtual: number;
  comissaoNegociada: number;
};

export function cruzar(rel: RelatorioPrecoIdeal): LinhaCruzada[] {
  const saida: LinhaCruzada[] = [];
  for (const l of rel.linhas) {
    const item = CATALOGO_POR_MLB[l.mlb];
    if (!item) continue;
    const desvio = l.precoIdeal
      ? ((item.precoAtual - l.precoIdeal) / l.precoIdeal) * 100
      : 0;
    saida.push({
      mlb: item.mlb,
      sku: item.sku,
      titulo: item.titulo,
      categoria: item.categoria,
      tipo: item.tipo,
      status: item.status,
      precoPraticado: item.precoAtual,
      precoIdeal: l.precoIdeal,
      desvio: +desvio.toFixed(2),
      comissaoAtual: item.comissaoAtual,
      comissaoNegociada: l.comissaoNegociada,
    });
  }
  return saida;
}
