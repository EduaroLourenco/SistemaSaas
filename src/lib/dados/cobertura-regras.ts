import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { paginar } from "./paginar";
import { rotuloDoCampo, type CampoRegra } from "@/lib/planilhas/avaliar-regras";

/**
 * Quanto de cada campo de regra esta operação tem preenchido.
 *
 * ── Por que a regra não some ──
 *
 * A tela é a mesma para todas as empresas, e cada uma chega com um
 * buraco diferente: uma não cadastrou custo, outra não tem curva, outra
 * não conectou a publicidade. Esconder a condição que não dá para usar
 * faz a tela parecer menor do que é e não ensina nada.
 *
 * Então toda condição aparece sempre, com a cobertura ao lado e o
 * caminho para resolver. "Margem — 8 de 716 produtos têm custo" com um
 * link para Financeiro › Custos resolve o problema de verdade; uma
 * condição escondida só o adia.
 *
 * ── Parcial é diferente de vazio ──
 *
 * 8 de 716 não é "não dá para usar": dá, para 8 produtos, e a regra
 * decide o que fazer com os outros 708 pelo `quandoNaoSei`. Quem lê
 * precisa dos dois números, não de um sinal verde ou vermelho.
 */

export type CoberturaCampo = {
  campo: CampoRegra;
  rotulo: string;
  /** Quantos itens o campo cobre, e de quantos. */
  com: number;
  total: number;
  /** Onde resolver, quando falta. */
  onde: { rotulo: string; href: string } | null;
  /** Uma linha dizendo o que falta, quando falta. */
  aviso: string | null;
};

export async function carregarCobertura(): Promise<CoberturaCampo[]> {
  const op = await operacaoPadrao();
  if (!op) return [];
  const sb = await clienteServidor();

  const [anuncios, produtos, ads, catalogo] = await Promise.all([
    paginar<{ sku_canal: string | null; tipo: string | null; estoque: number | null; familia_nome: string | null }>(
      () => sb.from("anuncios").select("sku_canal,tipo,estoque,familia_nome").eq("operacao_id", op.id)
    ),
    paginar<{ sku: string; custo_unitario: number | null; curva: string | null; categoria: string | null }>(
      () => sb.from("produtos").select("sku,custo_unitario,curva,categoria").eq("operacao_id", op.id)
    ),
    paginar<{ anuncio_id: string }>(() => sb.from("anuncio_ads").select("anuncio_id").eq("operacao_id", op.id)),
    paginar<{ anuncio_id: string }>(
      () => sb.from("anuncio_catalogo_diario").select("anuncio_id").eq("operacao_id", op.id)
    ),
  ]);

  const totalAnuncios = anuncios.length;
  const totalProdutos = produtos.length;
  const comCatalogo = new Set(catalogo.map((c) => c.anuncio_id)).size;
  const comAds = new Set(ads.map((a) => a.anuncio_id)).size;

  const linha = (
    campo: CampoRegra,
    com: number,
    total: number,
    onde: CoberturaCampo["onde"],
    comoFalta: string
  ): CoberturaCampo => ({
    campo,
    rotulo: rotuloDoCampo(campo),
    com,
    total,
    onde: com >= total ? null : onde,
    aviso: com >= total ? null : com === 0 ? `ninguém tem ${comoFalta}` : `${total - com} sem ${comoFalta}`,
  });

  const CUSTOS = { rotulo: "Financeiro › Custos", href: "/financeiro/custos" };
  const PRODUTOS = { rotulo: "Produtos e preços", href: "/produtos" };
  const CANAIS = { rotulo: "Canais e contas", href: "/integracoes/canais" };

  return [
    /* Vêm do canal junto com a promoção: sempre completos. */
    linha("campanha.tipo", totalAnuncios, totalAnuncios, null, ""),
    linha("campanha.nome", totalAnuncios, totalAnuncios, null, ""),
    linha("conta", totalAnuncios, totalAnuncios, null, ""),

    /* Do cadastro do anúncio, que a sincronização preenche. */
    linha("anuncio.tipo", anuncios.filter((a) => a.tipo).length, totalAnuncios, CANAIS, "tipo"),
    linha("anuncio.sku", anuncios.filter((a) => a.sku_canal).length, totalAnuncios, CANAIS, "SKU no anúncio"),
    linha("anuncio.estoque", anuncios.filter((a) => a.estoque != null).length, totalAnuncios, CANAIS, "estoque"),
    linha("anuncio.familia", anuncios.filter((a) => a.familia_nome).length, totalAnuncios, CANAIS, "família de catálogo"),
    linha("anuncio.catalogo", comCatalogo, totalAnuncios, CANAIS, "leitura de catálogo"),

    /* Desempenho: existe para quem o canal reporta. */
    linha("venda.unidades30", totalAnuncios, totalAnuncios, null, ""),
    linha("visita.visitas30", totalAnuncios, totalAnuncios, null, ""),
    linha("ads.acos", comAds, totalAnuncios, CANAIS, "mídia no período"),
    linha("ads.investimento30", comAds, totalAnuncios, CANAIS, "mídia no período"),

    /* Preço: depende da Fórmula base, que é por operação. */
    linha("preco.faixaQueSobra", totalAnuncios, totalAnuncios, null, ""),
    linha("preco.descontoProposto", totalAnuncios, totalAnuncios, null, ""),

    /* O buraco de verdade, e o que mais muda de empresa para empresa. */
    linha("margem.pct", produtos.filter((p) => Number(p.custo_unitario) > 0).length, totalProdutos, CUSTOS, "custo cadastrado"),
  ].filter((c) => c.total > 0);
}

/** Só o que falta, que é o que a tela destaca. */
export const pendencias = (c: CoberturaCampo[]) => c.filter((x) => x.aviso);
