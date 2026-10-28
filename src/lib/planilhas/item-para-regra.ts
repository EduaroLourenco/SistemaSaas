/**
 * Traduz um item da promoção para o que a regra enxerga.
 *
 * Fica separado do avaliador porque é onde mora a decisão mais sutil
 * deste pedaço: **o que vira `null`**. Campo nulo não é zero — é "não
 * deu para saber", e a regra trata diferente. Confundir os dois faz a
 * condição "vendas < 10" aceitar o catálogo inteiro de quem não tem
 * relatório de venda.
 *
 * Mora em `planilhas/` junto do avaliador para entrar no espelho
 * compilado e ter teste.
 */
import type { CampoRegra, ItemParaRegra } from "./avaliar-regras";

/** O item como a tela já o tem, com o nosso lado junto. */
export type ItemDaTela = {
  mlb: string;
  contaCanalId: string;
  tipoCampanha: string;
  nomeCampanha: string | null;
  tipoAnuncio: string | null;
  statusAnuncio: string | null;
  estoque: number | null;
  sku: string | null;
  familia: string | null;
  catalogo: string | null;
  unidades30: number | null;
  unidades90: number | null;
  visitas30: number | null;
  precoCanal: number | null;
  precoCheio: number | null;
  /** Em pontos: 11,5 e não 0,115. */
  faixaQueSobra: number | null;
  meliPct: number | null;
  acos: number | null;
  investimento30: number | null;
  margemPct: number | null;
};

/** O marcador do canal para "sem controle de estoque". */
export const SEM_CONTROLE = 40_000;

export function paraRegra(i: ItemDaTela): ItemParaRegra {
  /* Conversão só existe quando houve visita: 0 vendas em 0 visitas não
     é conversão zero, é conversão desconhecida. */
  const conversao =
    i.visitas30 != null && i.visitas30 > 0 && i.unidades30 != null
      ? (i.unidades30 / i.visitas30) * 100
      : null;

  /* O desconto que o canal propõe, em pontos. Sem preço cheio não há
     percentual nenhum a calcular. */
  const desconto =
    i.precoCanal != null && i.precoCheio != null && i.precoCheio > 0
      ? ((i.precoCheio - i.precoCanal) / i.precoCheio) * 100
      : null;

  const campos: Partial<Record<CampoRegra, string | number | boolean | null>> = {
    "campanha.tipo": i.tipoCampanha,
    "campanha.nome": i.nomeCampanha,
    conta: i.contaCanalId,
    "anuncio.tipo": i.tipoAnuncio,
    "anuncio.status": i.statusAnuncio,
    /* O 40.000 do canal não é saldo: deixar passar como número faria
       "estoque maior que 50" aceitar justamente quem não tem controle. */
    "anuncio.estoque": i.estoque == null || i.estoque >= SEM_CONTROLE ? null : i.estoque,
    "anuncio.temControleEstoque":
      i.estoque == null ? null : i.estoque >= SEM_CONTROLE ? "nao" : "sim",
    "anuncio.sku": i.sku,
    "anuncio.familia": i.familia,
    "anuncio.catalogo": i.catalogo,
    "venda.unidades30": i.unidades30,
    "venda.unidades90": i.unidades90,
    "visita.visitas30": i.visitas30,
    "venda.conversao30": conversao,
    "preco.descontoProposto": desconto,
    "preco.faixaQueSobra": i.faixaQueSobra,
    "preco.meliPonto": i.meliPct,
    "ads.acos": i.acos,
    "ads.investimento30": i.investimento30,
    "margem.pct": i.margemPct,
  };

  return { mlb: i.mlb, contaCanalId: i.contaCanalId, ...campos };
}
