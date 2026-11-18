import type { ReactNode } from "react";
import Anual from "@/app/vendas/anual/anual-cliente";
import Semanal from "@/app/vendas/semanal/semanal-cliente";
import Comparativos from "@/app/vendas/comparativos/comparativos-cliente";
import Lancamentos from "@/app/vendas/lancamentos/lancamentos-cliente";
import Canais from "@/app/vendas/canais/canais-cliente";
import Diario from "@/app/vendas/diario/diario-cliente";
import Dia from "@/app/vendas/dia/dia-cliente";
import { BlocoOperacao } from "@/app/vendas/dia/operacao-hoje";
import Mtd from "@/app/vendas/mtd/mtd-cliente";
import Metas from "@/app/vendas/metas/metas-cliente";
import Skus from "@/app/vendas/skus/analise-sku-cliente";
import Queda from "@/app/vendas/queda/queda-cliente";
import Cancelamentos from "@/app/vendas/cancelamentos/cancelamentos-cliente";
import Termometro from "@/app/mercado-livre/termometro-cliente";
import Trafego from "@/app/anuncios/trafego-pago/trafego-pago-cliente";
import Produtos from "@/app/produtos/produtos-cliente";
import Precificacao from "@/app/produtos/precificacao/precificacao-cliente";
import * as dados from "./fixtures-decisao";
import { skusRefino, quedaRefino, termometroRefino, trafegoRefino } from "./fixtures-refino-analitico";
export const ROTAS_DECISAO: Record<string, ReactNode> = {
 "/vendas/anual":<Anual dados={dados.anual}/>, "/vendas/semanal":<Semanal dados={dados.semanal}/>,
 "/vendas/comparativos":<Comparativos dados={dados.comparativos}/>, "/vendas/lancamentos":<Lancamentos dados={dados.lancamentos}/>,
 "/vendas/canais":<Canais dados={dados.porCanais}/>, "/vendas/diario":<Diario dados={dados.diario} canalAtual=""/>,
 "/vendas/dia":<Dia dados={{...dados.dia,recentes:dados.dia.mes.slice(9,16)}} operacao={<BlocoOperacao termometro={termometroRefino} envios={null}/>}/>, "/vendas/mtd":<Mtd dados={dados.mtd}/>, "/vendas/metas":<Metas dados={dados.metas}/>,
 "/vendas/skus":<Skus dados={skusRefino}/>, "/vendas/queda":<Queda dados={quedaRefino}/>,
 "/vendas/cancelamentos":<Cancelamentos dados={dados.cancelamentos}/>, "/mercado-livre":<Termometro dados={termometroRefino}/>,
 "/anuncios/trafego-pago":<Trafego dados={trafegoRefino}/>, "/produtos":<Produtos dados={dados.produtos}/>,
 "/produtos/precificacao":<Precificacao dados={dados.precificacao}/>,
};
