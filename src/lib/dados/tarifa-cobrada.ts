import "server-only";
import type { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";

/**
 * A tarifa que o canal realmente cobrou, por anúncio e por semana.
 *
 * A alíquota do catálogo é a de TABELA — 11,5% no clássico, 16,5% no
 * premium. Ela quase nunca é o que saiu do bolso: campanha com redução
 * derruba isso pela metade, e a média cobrada nos pedidos do Mercado
 * Livre é 7,45%, não 11,5%.
 *
 * Mostrar só a de tabela numa tela de análise faz alguém decidir preço
 * com um custo que não existe. Por isso a cobrada é calculada aqui e
 * mostrada ao lado.
 *
 * ── Como se liga ao anúncio ──
 *
 * Pelo MLB, que o item de pedido guarda em `codigo_externo`. Não por SKU:
 * 138 dos 142 SKUs têm mais de um anúncio, e clássico e premium têm
 * tarifas diferentes — juntar por SKU daria um número que parece certo.
 *
 * ── De onde vem a comissão ──
 *
 * De `pedidos.comissao`, que é o extrato do canal onde ele informa (33%
 * dos pedidos) e uma reconstrução onde não informa. A reconstrução está
 * documentada em `gravar-importacao.ts`; aqui só se usa o resultado.
 */

type Sb = Awaited<ReturnType<typeof clienteServidor>>;

/** Chave `MLB|segunda-feira-da-semana` → tarifa em %. */
export type TarifasPorSemana = Map<string, number>;

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;

export function chaveSemana(mlb: string, dataIso: string): string {
  const d = new Date(`${dataIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `${mlb}|${d.toISOString().slice(0, 10)}`;
}

export async function carregarTarifasCobradas(
  sb: Sb
): Promise<TarifasPorSemana> {
  const [pedidosRaw, exclusoes, { data: contasRaw }] = await Promise.all([
    paginar(() =>
      sb
        .from("pedidos")
        .select("id,data,cancelado,total,comissao,conta_canal_id")
        .order("data", { ascending: true })
    ),
    carregarExclusoes(),
    sb.from("contas_canal").select("id,canal_id").limit(200),
  ]);

  type Ped = {
    id: string;
    data: string;
    cancelado: boolean;
    total: string | number;
    comissao: string | number | null;
    conta_canal_id: string;
  };

  const canalDaConta = new Map(
    ((contasRaw ?? []) as { id: string; canal_id: string }[]).map((c) => [
      c.id,
      c.canal_id,
    ])
  );

  const { mantidas: pedidos } = aplicar(
    (pedidosRaw as unknown as Ped[]).map((p) => ({
      ...p,
      canalId: canalDaConta.get(p.conta_canal_id) ?? null,
      contaCanalId: p.conta_canal_id,
    })),
    exclusoes
  );

  // Só pedidos com comissão entram: os sem ela não podem virar zero, ou a
  // tarifa da semana seria diluída para baixo por ausência de dado.
  /*
   * `> 0`, não `!= null`.
   *
   * Havia 1.373 pedidos com comissão gravada como 0,00 por uma importação
   * antiga: zero ali não é tarifa, é "não informado" guardado errado.
   * Tratá-lo como valor real diluía a tarifa da semana para baixo — um
   * anúncio que cobrou 11% aparecia com 3%.
   */
  const comComissao = pedidos.filter(
    (p) => !p.cancelado && p.comissao != null && n(p.comissao) > 0
  );
  if (!comComissao.length) return new Map();

  const porId = new Map(comComissao.map((p) => [p.id, p]));

  const itens = await paginar(() =>
    sb
      .from("pedido_itens")
      .select("pedido_id,codigo_externo,total")
      .order("pedido_id")
  );

  type Item = { pedido_id: string; codigo_externo: string; total: string | number };
  const lista = itens as unknown as Item[];

  // Denominador do rateio: sem ele, a comissão de um pedido com vários
  // itens iria inteira para o primeiro.
  const totalDoPedido = new Map<string, number>();
  for (const it of lista) {
    if (!porId.has(it.pedido_id)) continue;
    totalDoPedido.set(
      it.pedido_id,
      (totalDoPedido.get(it.pedido_id) ?? 0) + n(it.total)
    );
  }

  const acumulado = new Map<string, { comissao: number; valor: number }>();

  for (const it of lista) {
    const p = porId.get(it.pedido_id);
    if (!p) continue;

    const mlb = String(it.codigo_externo ?? "");
    if (!/^MLB/i.test(mlb)) continue;

    const chave = chaveSemana(mlb, String(p.data));
    const at = acumulado.get(chave) ?? { comissao: 0, valor: 0 };

    const totalPed = totalDoPedido.get(it.pedido_id) ?? 0;
    const fatia = totalPed > 0 ? n(it.total) / totalPed : 1;

    at.comissao += n(p.comissao) * fatia;
    at.valor += n(it.total);
    acumulado.set(chave, at);
  }

  const tarifas: TarifasPorSemana = new Map();
  for (const [chave, v] of acumulado) {
    if (v.valor > 0) {
      tarifas.set(chave, Number(((v.comissao * 100) / v.valor).toFixed(2)));
    }
  }
  return tarifas;
}
