import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { paginar } from "@/lib/dados/paginar";

/**
 * Consolida `vendas_diarias` a partir do que já está gravado em `pedidos`
 * e `anuncio_desempenho_diario`.
 *
 * Mora aqui, e não dentro do Mercado Livre, porque o consolidado é do
 * CANAL, não do provedor: a VTEX grava pedido na mesma tabela e precisa
 * exatamente da mesma soma. Duas cópias divergiriam no primeiro ajuste, e
 * a tela mostraria um número por canal com regra diferente.
 */

export const r2 = (v: number) => Number(v.toFixed(2));

/** Lotes: o PostgREST aceita mais, mas o payload fica grande demais. */
export async function emLotes<T>(linhas: T[], tamanho: number, fn: (lote: T[]) => Promise<void>) {
  for (let i = 0; i < linhas.length; i += tamanho) {
    await fn(linhas.slice(i, i + tamanho));
  }
}

export type ContextoCanal = {
  operacaoId: string;
  canalId: string;
  contaCanalId: string;
};

export async function consolidarDiarias(
  ctx: ContextoCanal,
  de: string,
  ate: string
): Promise<number> {
  const sb = clientePrivilegiado();

  /*
   * As duas leituras são PAGINADAS, e não é detalhe.
   *
   * O PostgREST corta a resposta em 1000 linhas por padrão. Trinta e cinco
   * dias de visita em 468 anúncios são ~16 mil linhas: sem paginar, voltam
   * as mil primeiras e a soma sai truncada — sem erro, sem aviso, só um
   * número menor. Foi exatamente o que aconteceu no teste, e o sintoma
   * enganou: 09/09 mostrou 781 visitas numa execução e 370 na seguinte,
   * com o mesmo dado do lado do canal.
   */
  const peds = await paginar(() =>
    sb
      .from("pedidos")
      .select("data,total,cancelado")
      .eq("conta_canal_id", ctx.contaCanalId)
      .gte("data", de)
      .lte("data", ate)
      .order("data")
  ).catch((e: Error) => {
    throw new Error(`Falha ao ler pedidos para consolidar: ${e.message}`);
  });

  const vis = await paginar(() =>
    sb
      .from("anuncio_desempenho_diario")
      .select("data,visitas,anuncios!inner(conta_canal_id)")
      .eq("anuncios.conta_canal_id", ctx.contaCanalId)
      .gte("data", de)
      .lte("data", ate)
      .order("data")
  ).catch(() => [] as unknown[]);

  type Acum = {
    receita: number;
    pedidos: number;
    cancelados: number;
    valorCancelado: number;
    visitas: number;
  };
  const porDia = new Map<string, Acum>();
  const novo = (): Acum => ({
    receita: 0, pedidos: 0, cancelados: 0, valorCancelado: 0, visitas: 0,
  });

  for (const p of peds as unknown as { data: string; total: number; cancelado: boolean }[]) {
    const d = String(p.data).slice(0, 10);
    const a = porDia.get(d) ?? novo();
    const total = Number(p.total) || 0;
    // `pedidos` conta tudo, cancelado incluído — é a convenção que a
    // plataforma já usa e que o ticket médio divide depois.
    a.pedidos += 1;
    a.receita += total;
    if (p.cancelado) {
      a.cancelados += 1;
      a.valorCancelado += total;
    }
    porDia.set(d, a);
  }

  // Guarda QUAIS dias têm visita medida. Um dia pode ter linha de visita
  // somando zero, e isso é diferente de não ter linha nenhuma.
  const diasComVisita = new Set<string>();
  for (const v of vis as unknown as { data: string; visitas: number }[]) {
    const d = String(v.data).slice(0, 10);
    const a = porDia.get(d) ?? novo();
    a.visitas += Number(v.visitas) || 0;
    porDia.set(d, a);
    diasComVisita.add(d);
  }

  /*
   * Dias SEM visita coletada não levam a coluna `visitas` no payload.
   *
   * Isto custou um dia de dado no teste: a janela de visitas era de 7 dias
   * e a consolidação, de 30. Nos 23 dias sem coleta o campo ia como zero e
   * SOBRESCREVIA o que já estava lá — 01/09 tinha 1.011 visitas e virou 0.
   *
   * Ausência de coleta não é ausência de visita. Como o upsert só atualiza
   * as colunas que estão no payload, basta omitir `visitas` nesses dias
   * para o valor anterior sobreviver. Por isso são duas gravações: uma
   * para os dias com visita medida, outra para os sem.
   */
  const comum = (data: string, a: Acum) => ({
    operacao_id: ctx.operacaoId,
    canal_id: ctx.canalId,
    conta_canal_id: ctx.contaCanalId,
    data,
    pedidos: a.pedidos,
    receita: r2(a.receita),
    pedidos_cancelados: a.cancelados,
    valor_cancelado: r2(a.valorCancelado),
  });

  const comVisita: Record<string, unknown>[] = [];
  const semVisita: Record<string, unknown>[] = [];
  for (const [data, a] of porDia) {
    if (diasComVisita.has(data)) comVisita.push({ ...comum(data, a), visitas: a.visitas });
    else semVisita.push(comum(data, a));
  }

  for (const grupo of [comVisita, semVisita]) {
    await emLotes(grupo, 500, async (lote) => {
      const { error: e } = await sb
        .from("vendas_diarias")
        .upsert(lote, { onConflict: "conta_canal_id,data" });
      if (e) throw new Error(`Falha ao consolidar vendas diárias: ${e.message}`);
    });
  }

  return porDia.size;
}
