import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paginar } from "./paginar";
import { chaveSemana } from "./tarifa-cobrada";

/**
 * O preço de vitrine de cada anúncio, por semana.
 *
 * ── Por que existe ──
 *
 * `anuncio_desempenho_semanal.preco_anunciado` está nulo nas 10.452
 * linhas do banco: ninguém nunca gravou. A análise então caía para
 * `receita ÷ vendas`, que é o preço PAGO — e em semana sem venda virava
 * zero. Como o desvio contra a tabela usa esse número, 825 dos 1.004
 * anúncios da Probel apareciam "100% abaixo do preço ideal". Não
 * estavam; só não tinham preço medido.
 *
 * O preço existe, em `anuncio_estoque_diario.preco`: 15.180 leituras
 * diárias que a rotina de preços grava e ninguém lia.
 *
 * ── Último dia, não média ──
 *
 * Preço é estado, não fluxo. A média dos sete dias de uma semana em que
 * o preço subiu na quarta não é nenhum dos dois preços, e esconde
 * exatamente a troca que explica a venda ter parado. Vale a última
 * leitura da semana.
 *
 * ── O que não cobre ──
 *
 * As leituras começam em outubro de 2026. Semana anterior fica de fora
 * do mapa, e quem lê recebe `undefined` — que a análise trata como
 * "não medimos", não como zero.
 */
export async function carregarVitrineSemanal(
  sb: SupabaseClient,
  desde?: string,
): Promise<Map<string, number>> {
  let consulta = () => {
    const q = sb
      .from("anuncio_estoque_diario")
      .select("data,preco,anuncios(codigo_externo)")
      .not("preco", "is", null);
    return desde ? q.gte("data", desde) : q;
  };

  const linhas = (await paginar(consulta)) as unknown as {
    data: string;
    preco: string | number | null;
    anuncios: { codigo_externo: string } | null;
  }[];

  /* Último dia medido de cada semana: percorre guardando a data junto, e
     só troca o valor quando a leitura é mais nova. */
  const ultimo = new Map<string, { data: string; preco: number }>();
  for (const l of linhas) {
    const mlb = l.anuncios?.codigo_externo;
    const preco = l.preco == null ? 0 : Number(l.preco);
    if (!mlb || !preco) continue;
    const chave = chaveSemana(mlb, l.data);
    const atual = ultimo.get(chave);
    if (!atual || l.data > atual.data) ultimo.set(chave, { data: l.data, preco });
  }

  return new Map([...ultimo].map(([chave, v]) => [chave, v.preco]));
}
