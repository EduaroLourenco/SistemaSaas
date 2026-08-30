import "server-only";
import type { clienteServidor } from "@/lib/supabase/servidor";

/**
 * Deriva os KPIs diários a partir dos pedidos importados.
 *
 * A planilha de pedidos já sabe, por canal e por dia, quanto vendeu,
 * quantos pedidos foram e quanto cancelou. Pedir que alguém redigite isso
 * em Lançamentos é trabalho manual sobre um dado que o sistema já tem — e
 * trabalho manual sobre dado existente é onde o erro de digitação entra.
 *
 * Fica em Lançamentos só o que a planilha NÃO traz: visitas e
 * investimento em mídia.
 *
 * ── A parte delicada ────────────────────────────────────────────
 *
 * O upsert manda apenas as colunas de dinheiro. As de mídia ficam fora do
 * payload de propósito: no PostgREST, coluna ausente não entra no
 * `DO UPDATE SET`, então o que você digitou sobrevive à reimportação.
 *
 * Se elas fossem enviadas com zero — que é o default da tabela — cada
 * importação apagaria as visitas e o investimento em ADS do período. O
 * faturamento continuaria certo e a conversão viraria divisão por zero,
 * sem nada avisando.
 */

type Sb = Awaited<ReturnType<typeof clienteServidor>>;

export type PedidoDerivavel = {
  contaCanalId: string;
  canalId: string;
  data: string;
  total: number;
  cancelado: boolean;
};

export type Derivacao = {
  dias: number;
  contas: number;
};

const LOTE = 400;

export async function derivarKpisDiarios(
  sb: Sb,
  operacaoId: string,
  pedidos: PedidoDerivavel[]
): Promise<Derivacao> {
  type Acumulado = {
    operacao_id: string;
    canal_id: string;
    conta_canal_id: string;
    data: string;
    pedidos: number;
    receita: number;
    pedidos_cancelados: number;
    valor_cancelado: number;
    origem: "planilha";
  };

  const porChave = new Map<string, Acumulado>();

  for (const p of pedidos) {
    const chave = `${p.contaCanalId}|${p.data}`;
    const at =
      porChave.get(chave) ??
      {
        operacao_id: operacaoId,
        canal_id: p.canalId,
        conta_canal_id: p.contaCanalId,
        data: p.data,
        pedidos: 0,
        receita: 0,
        pedidos_cancelados: 0,
        valor_cancelado: 0,
        origem: "planilha" as const,
      };

    /*
     * Cancelado conta nos dois lugares, e é assim de propósito.
     *
     * `receita` é o que foi vendido; `valor_cancelado` é o que voltou. A
     * tabela calcula `receita_liquida = receita - valor_cancelado`
     * sozinha. Tirar o cancelado da receita aqui subtrairia duas vezes e
     * a receita líquida ficaria menor que a verdade.
     */
    at.pedidos += 1;
    at.receita += p.total;
    if (p.cancelado) {
      at.pedidos_cancelados += 1;
      at.valor_cancelado += p.total;
    }

    porChave.set(chave, at);
  }

  const linhas = [...porChave.values()].map((a) => ({
    ...a,
    receita: Number(a.receita.toFixed(2)),
    valor_cancelado: Number(a.valor_cancelado.toFixed(2)),
  }));

  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await sb
      .from("vendas_diarias")
      .upsert(linhas.slice(i, i + LOTE), {
        onConflict: "conta_canal_id,data",
      });
    if (error) {
      throw new Error(`Falha ao derivar os KPIs diários: ${error.message}`);
    }
  }

  return {
    dias: new Set(linhas.map((l) => l.data)).size,
    contas: new Set(linhas.map((l) => l.conta_canal_id)).size,
  };
}
