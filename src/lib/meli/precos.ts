import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { meliGet } from "./cliente";

/**
 * O preço que o comprador paga, um retrato por anúncio por dia.
 *
 * ── Por que não sai da sincronização ──
 *
 * `/items` devolve o preço CHEIO. O desconto das campanhas da Central de
 * Promoções só aparece em `/items/{id}/sale_price`: no MLB5397764684,
 * `/items` dizia R$ 4.212 enquanto o comprador pagava R$ 2.140,49 (que é o
 * que os pedidos mostram). Gravar o cheio faria a análise de queda enxergar
 * "o preço caiu 50%" toda vez que uma campanha entra.
 *
 * Só que `sale_price` é um anúncio por chamada. Somado à sincronização, que
 * já faz uma chamada por anúncio para as visitas, passaria do tempo da
 * função. Então é uma rotina à parte, com prazo: começa pelos anúncios que
 * mais vendem e para antes do limite — o que faltar fica sem retrato no dia,
 * em vez de derrubar tudo.
 */
type Anuncio = { id: string; operacao_id: string; codigo_externo: string; estoque: number | null };
type SalePrice = { amount?: number | null; regular_amount?: number | null };

const r2 = (v: number) => Math.round(v * 100) / 100;

export async function capturarPrecosDeVenda(
  contaCanalId: string,
  prazo: number
): Promise<{ ativos: number; gravados: number; falharam: number; semTempo: number }> {
  const sb = clientePrivilegiado();
  const { data, error } = await sb
    .from("anuncios")
    .select("id,operacao_id,codigo_externo,estoque")
    .eq("conta_canal_id", contaCanalId)
    .eq("status", "ativo")
    .order("vendidos_total", { ascending: false, nullsFirst: false })
    .limit(3000);
  if (error) throw new Error(`Não consegui ler os anúncios: ${error.message}`);
  const anuncios = (data ?? []) as Anuncio[];

  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const linhas: Record<string, unknown>[] = [];
  let falharam = 0;
  let i = 0;
  // Lotes de 8 em paralelo; o freio de `meliGet` segura a taxa por segundo.
  for (; i < anuncios.length && Date.now() < prazo; i += 8) {
    const lote = anuncios.slice(i, i + 8);
    const res = await Promise.allSettled(
      lote.map((a) =>
        meliGet<SalePrice>(`/items/${a.codigo_externo}/sale_price?context=channel_marketplace`, contaCanalId)
      )
    );
    res.forEach((r, k) => {
      const a = lote[k];
      if (r.status !== "fulfilled" || !r.value?.amount) {
        falharam++;
        return;
      }
      const preco = r2(r.value.amount);
      const cheio = r.value.regular_amount ? r2(r.value.regular_amount) : null;
      linhas.push({
        operacao_id: a.operacao_id,
        anuncio_id: a.id,
        data: dia,
        estoque: Math.max(0, a.estoque ?? 0),
        preco,
        preco_original: cheio && cheio > preco ? cheio : null,
      });
    });
  }

  for (let j = 0; j < linhas.length; j += 500) {
    const { error: e } = await sb
      .from("anuncio_estoque_diario")
      .upsert(linhas.slice(j, j + 500), { onConflict: "anuncio_id,data" });
    if (e) throw new Error(`Falha ao gravar preços: ${e.message}`);
  }
  return {
    ativos: anuncios.length,
    gravados: linhas.length,
    falharam,
    semTempo: Math.max(0, anuncios.length - i),
  };
}
