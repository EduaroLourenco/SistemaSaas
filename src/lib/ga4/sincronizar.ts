import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { emLotes, r2 } from "@/lib/sync/diarias";
import type { Integracao } from "@/lib/integracoes/cofre";
import { nomesAceitos, relatorio, tokenDeAcesso } from "./cliente";

/**
 * GA4 → `vendas_diarias` da conta da loja própria.
 *
 * Grava SÓ o que o GA4 mede e nada do que é da VTEX:
 *
 *   visitas           ← sessões
 *   investimento_ads  ← custo do Google Ads (precisa do vínculo GA4 ↔ Ads)
 *   cliques_ads       ← cliques do Google Ads
 *   receita_ads       ← receita de compra das sessões google / cpc
 *
 * Pedido e receita continuam vindo da VTEX. O upsert do PostgREST só
 * atualiza as colunas presentes no payload, então as duas fontes convivem
 * na mesma linha sem uma zerar a outra — a consolidação da VTEX também só
 * manda `visitas` quando mediu visita, e no site nunca mede.
 *
 * Quem lança visita à mão em Lançamentos para a loja própria vai ver o
 * GA4 sobrescrever o dia: a partir da conexão, a fonte das visitas do site
 * é o GA4. É o desejado — número medido no lugar de número digitado.
 */

const OBRIGATORIOS = ["date", "sessions"];
const ADS = ["advertiserAdCost", "advertiserAdClicks"];
const RECEITA_ADS = ["purchaseRevenue", "sessionSourceMedium"];

/** GA4 devolve a data como AAAAMMDD. */
const dataIso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export type ResultadoGa4 = { dias: number; comAds: boolean; avisos: string[] };

export async function sincronizarGa4(
  integ: Integracao,
  de: string,
  ate: string
): Promise<ResultadoGa4> {
  const propriedade = String(integ.config.propriedade ?? "");
  if (!propriedade) {
    throw new Error("A conexão do Google está feita, mas falta escolher a propriedade do GA4.");
  }
  if (!integ.canalId) throw new Error("Integração GA4 sem canal — reconecte pela tela de canais.");

  const acesso = await tokenDeAcesso(integ);

  /*
   * Confere os nomes contra a lista da própria propriedade antes de pedir
   * relatório. Nome errado na Data API é um 400 genérico; aqui vira "falta
   * a métrica X", que diz o que fazer.
   */
  const aceitos = await nomesAceitos(acesso, propriedade);
  const faltam = OBRIGATORIOS.filter((n) => !aceitos.has(n));
  if (faltam.length) throw new Error(`A propriedade não aceita: ${faltam.join(", ")}`);
  const avisos: string[] = [];
  const comAds = ADS.every((n) => aceitos.has(n));
  if (!comAds) avisos.push("GA4 sem vínculo com o Google Ads: investimento e cliques de mídia ficam de fora.");
  const comReceitaAds = RECEITA_ADS.every((n) => aceitos.has(n));

  const periodo = { dateRanges: [{ startDate: de, endDate: ate }] };

  const [sessoes, ads, receitaAds] = await Promise.all([
    relatorio(acesso, propriedade, {
      ...periodo,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
    }),
    comAds
      ? relatorio(acesso, propriedade, {
          ...periodo,
          dimensions: [{ name: "date" }],
          metrics: ADS.map((name) => ({ name })),
        })
      : Promise.resolve([]),
    comReceitaAds
      ? relatorio(acesso, propriedade, {
          ...periodo,
          dimensions: [{ name: "date" }],
          metrics: [{ name: "purchaseRevenue" }],
          dimensionFilter: {
            filter: {
              fieldName: "sessionSourceMedium",
              stringFilter: { matchType: "EXACT", value: "google / cpc" },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const adsDoDia = new Map(ads.map((l) => [l.dimensoes[0], l.metricas]));
  const receitaDoDia = new Map(receitaAds.map((l) => [l.dimensoes[0], l.metricas[0]]));

  /*
   * O universo de dias é o do relatório de sessões. Dia que o GA4 ainda não
   * processou não volta, e não gravá-lo é o certo: ausência de coleta não é
   * ausência de visita (foi esse o erro que zerou 01/09 na consolidação
   * do Meli). Já DENTRO de um dia processado, Ads sem linha é gasto zero —
   * o GA4 omite linha toda zerada.
   */
  const linhas = sessoes.map((l) => {
    const dia = l.dimensoes[0];
    const linha: Record<string, unknown> = {
      operacao_id: integ.operacaoId,
      canal_id: integ.canalId,
      conta_canal_id: integ.contaCanalId,
      data: dataIso(dia),
      visitas: Math.round(l.metricas[0]),
    };
    if (comAds) {
      const [custo = 0, cliques = 0] = adsDoDia.get(dia) ?? [];
      linha.investimento_ads = r2(custo);
      linha.cliques_ads = Math.round(cliques);
    }
    if (comReceitaAds) linha.receita_ads = r2(receitaDoDia.get(dia) ?? 0);
    return linha;
  });

  const sb = clientePrivilegiado();
  await emLotes(linhas, 500, async (lote) => {
    const { error } = await sb.from("vendas_diarias").upsert(lote, { onConflict: "conta_canal_id,data" });
    if (error) throw new Error(`Falha ao gravar o GA4 em vendas diárias: ${error.message}`);
  });

  await sb
    .from("integracoes")
    .update({ ultima_sincronizacao: new Date().toISOString(), ultimo_erro: null, status: "conectada" })
    .eq("id", integ.id);

  return { dias: linhas.length, comAds, avisos };
}

/** Data em Brasília, AAAA-MM-DD, deslocada em dias. */
export function diaSP(deslocamento = 0) {
  const d = new Date(Date.now() + deslocamento * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/**
 * Fixa a propriedade escolhida e traz o histórico.
 *
 * 400 dias: cobre a comparação com o mesmo período do ano anterior, que as
 * telas de Vendas fazem. Dado agregado da Data API não sofre o limite de
 * retenção do GA4 (esse vale para dado por usuário), então o passado vem.
 */
export async function fixarPropriedade(integ: Integracao, propriedade: { id: string; nome: string }) {
  const config = { ...integ.config, propriedade: propriedade.id, propriedadeNome: propriedade.nome };
  const { error } = await clientePrivilegiado().from("integracoes").update({ config }).eq("id", integ.id);
  if (error) throw new Error(`Não consegui guardar a propriedade: ${error.message}`);
  integ.config = config;
  return sincronizarGa4(integ, diaSP(-400), diaSP(0));
}
