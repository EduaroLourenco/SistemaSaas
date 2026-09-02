import { carregarTrafegoPago } from "@/lib/dados/trafego-pago";
import TrafegoPagoCliente from "./trafego-pago-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

export const dynamic = "force-dynamic";

/**
 * Tráfego pago.
 *
 * Separada da análise de anúncios porque a pergunta é outra: lá é "este
 * anúncio vende?", aqui é "a mídia deste anúncio se paga?".
 */
export default async function Pagina() {
  const dados = await carregarTrafegoPago();

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Tráfego pago" breadcrumb="Anúncios" />
        <PageBody>
          <SemFonte
            titulo="Nenhum relatório de mídia importado"
            origem="Exporte o relatório de anúncios patrocinados no Mercado Livre e suba na tela de Importar. Ele traz investimento, cliques e receita atribuída por anúncio e por campanha."
          />
        </PageBody>
      </>
    );
  }

  return <TrafegoPagoCliente dados={dados} />;
}
