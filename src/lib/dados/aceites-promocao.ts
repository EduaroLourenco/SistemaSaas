import type { SupabaseClient } from "@supabase/supabase-js";
import type { PedidoDeAceite } from "@/lib/planilhas/corpo-promocao";
import type { ResultadoAceite } from "@/lib/meli/promocoes-escrita";

/**
 * Aceite de promoção com histórico.
 *
 * A linha nasce antes da chamada ao canal: sem histórico, nada sai. Se a
 * execução cair no meio, ela fica `aprovada`, o que marca resultado incerto.
 */
export async function aceitarComHistorico({
  sb,
  operacaoId,
  contaId,
  usuarioId,
  itens,
  enviar,
}: {
  sb: Pick<SupabaseClient, "from">;
  operacaoId: string;
  contaId: string;
  usuarioId: string;
  itens: PedidoDeAceite[];
  enviar: (itens: PedidoDeAceite[]) => Promise<ResultadoAceite[]>;
}): Promise<{ erro: string } | { resultados: ResultadoAceite[]; historicoIncompleto: boolean }> {
  const agora = new Date().toISOString();
  const linhas = itens.map((p) => ({
    id: crypto.randomUUID(),
    operacao_id: operacaoId,
    conta_canal_id: contaId,
    promocao: p.promocao,
    tipo_promocao: p.tipo,
    mlb: p.mlb,
    decisao: p.alterar ? "reescrever" : "aceitar",
    preco_proposto: p.preco ?? p.tetoDoCanal ?? null,
    preco_canal: p.tetoDoCanal ?? null,
    motivo: p.alterar ? `Baixar preço na campanha (era ${p.precoAtual ?? "?"})` : "Aceite manual na revisão",
    estado: "aprovada",
    aprovada_por: usuarioId,
    aprovada_em: agora,
  }));

  const { error } = await sb.from("decisoes_promocao").insert(linhas);
  if (error) {
    console.error("[aceites-promocao]", error);
    return { erro: "Não consegui registrar o histórico. Nada foi enviado ao Mercado Livre." };
  }

  const resultados = await enviar(itens);
  const gravados = await Promise.all(
    resultados.map((r, k) =>
      sb
        .from("decisoes_promocao")
        .update({
          estado: r.ok ? "enviada" : "falhou",
          enviado_em: new Date().toISOString(),
          resposta_canal: JSON.stringify(r.ok ? { preco: r.preco ?? null, oferta: r.ofertaCriada ?? null } : { erro: r.erro ?? "recusado" }).slice(0, 2000),
        })
        .eq("id", linhas[k].id)
        .eq("operacao_id", operacaoId)
    )
  );
  const falhas = gravados.filter((g) => g.error);
  if (falhas.length) console.error("[aceites-promocao]", falhas[0].error);
  return { resultados, historicoIncompleto: falhas.length > 0 };
}

/** Como contar o resultado sem chamar de agendado o que já pode estar valendo. */
export function resumoDoAceite({ entraram, recusados, inicios, agora }: {
  entraram: number;
  recusados: number;
  inicios: (string | null)[];
  agora: number;
}): { tipo: "agendada" | "aceita" | "parcial" | "recusada"; inicio: string | null } {
  if (!entraram) return { tipo: "recusada", inicio: null };
  if (recusados) return { tipo: "parcial", inicio: null };
  const datas = inicios.map((d) => (d ? Date.parse(d) : NaN));
  if (!datas.length || datas.some((d) => !Number.isFinite(d) || d <= agora)) return { tipo: "aceita", inicio: null };
  return { tipo: "agendada", inicio: new Date(Math.min(...datas)).toISOString() };
}
