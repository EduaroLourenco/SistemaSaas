import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { semanaIso } from "@/lib/periodo";

/**
 * O recorde histórico de um SKU, e o preço que ele tinha no pico.
 *
 * ── Por que existe ──
 *
 * "Vendeu 6 na semana" não diz nada sozinho. Diz tudo contra o que esse
 * mesmo SKU já fez: 6 contra um recorde de 31 é um problema; 6 contra um
 * recorde de 7 é o normal dele. É a comparação que o raio-x precisa para
 * não virar mais uma tabela de números absolutos.
 *
 * ── De onde sai ──
 *
 * De `pedido_itens` + `pedidos`, não do desempenho semanal: o desempenho
 * começa em 2025 e é por ANÚNCIO, e o mesmo colchão tem 3,9 anúncios
 * entre clássico, premium e duas contas. O recorde do produto é a soma
 * deles na mesma semana.
 *
 * ── Qual preço é o "preço no pico" ──
 *
 * O PRATICADO: receita ÷ unidades daquela semana, dos próprios pedidos.
 * Não a vitrine. A leitura diária de vitrine só existe desde 30/09/2026,
 * e o recorde da maioria dos SKUs é bem anterior — mostrar a vitrine ali
 * seria mostrar vazio na linha mais importante do bloco.
 */

export type SemanaRecorde = {
  /** Segunda-feira da semana ISO. */
  inicio: string;
  fim: string;
  rotulo: string;
  unidades: number;
  receita: number;
  /** Receita ÷ unidades: o que o cliente pagou, em média, naquela semana. */
  precoMedio: number;
};

export type RecordeSku = {
  sku: string;
  /** A melhor semana em UNIDADES. Empate resolve pela receita. */
  recorde: SemanaRecorde | null;
  /** A última semana fechada com venda. */
  ultima: SemanaRecorde | null;
  /** Quantas semanas distintas já tiveram venda deste SKU. */
  semanasComVenda: number;
  /** Primeira venda registrada, para dizer de quando é o histórico. */
  desde: string | null;
};

type LinhaItem = {
  quantidade: number;
  preco_unitario: string | number;
  pedidos: { data: string; cancelado: boolean } | null;
};

/** Segunda-feira da semana ISO de uma data. */
function segundaDe(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const maisDias = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function carregarRecordeSku(sku: string): Promise<RecordeSku> {
  const sb = await clienteServidor();
  const vazio: RecordeSku = { sku, recorde: null, ultima: null, semanasComVenda: 0, desde: null };
  if (!sku.trim()) return vazio;

  /*
   * O filtro é por SKU no ITEM, não por anúncio: é assim que os anúncios
   * irmãos do mesmo produto entram na mesma semana. `sku` é citext, então
   * a comparação já ignora caixa.
   */
  const linhas = (await paginar(() =>
    sb
      .from("pedido_itens")
      .select("quantidade,preco_unitario,pedidos!inner(data,cancelado)")
      .eq("sku", sku)
      .order("id")
  )) as unknown as LinhaItem[];

  const porSemana = new Map<string, { unidades: number; receita: number }>();
  let desde: string | null = null;

  for (const l of linhas) {
    const p = l.pedidos;
    /* Cancelado não é venda: um pico feito de pedido cancelado viraria
       uma meta que nunca existiu. */
    if (!p || p.cancelado) continue;
    const inicio = segundaDe(p.data);
    const q = Number(l.quantidade) || 0;
    const v = q * (Number(l.preco_unitario) || 0);
    const at = porSemana.get(inicio) ?? { unidades: 0, receita: 0 };
    at.unidades += q;
    at.receita += v;
    porSemana.set(inicio, at);
    if (!desde || p.data < desde) desde = p.data;
  }

  if (!porSemana.size) return vazio;

  const monta = (inicio: string): SemanaRecorde => {
    const x = porSemana.get(inicio)!;
    const fim = maisDias(inicio, 6);
    const { semana } = semanaIso(inicio);
    return {
      inicio,
      fim,
      rotulo: `S${semana}/${inicio.slice(2, 4)} · ${dm(inicio)} a ${dm(fim)}`,
      unidades: x.unidades,
      receita: Number(x.receita.toFixed(2)),
      precoMedio: Number((x.receita / x.unidades).toFixed(2)),
    };
  };

  const semanas = [...porSemana.keys()].sort();
  const melhor = semanas.reduce((a, b) => {
    const x = porSemana.get(a)!;
    const y = porSemana.get(b)!;
    return y.unidades > x.unidades || (y.unidades === x.unidades && y.receita > x.receita) ? b : a;
  });

  return {
    sku,
    recorde: monta(melhor),
    ultima: monta(semanas[semanas.length - 1]),
    semanasComVenda: semanas.length,
    desde,
  };
}
