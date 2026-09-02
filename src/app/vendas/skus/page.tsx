import { carregarAnaliseSku } from "@/lib/dados/analise-sku";
import AnaliseSkuCliente from "./analise-sku-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

export const dynamic = "force-dynamic";

/**
 * Análise de SKU.
 *
 * O período e o canal vêm da URL, não do estado do cliente: o recorte
 * muda o que o servidor agrega, e um link para "PA85351 em agosto no
 * Meli" precisa poder ser colado no chat de alguém.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; canal?: string }>;
}) {
  const { de, ate, canal } = await searchParams;
  const dados = await carregarAnaliseSku({
    inicio: de,
    fim: ate,
    canalId: canal || undefined,
  });

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Análise de SKU" breadcrumb="Vendas" />
        <PageBody>
          <SemFonte
            titulo="Nenhuma venda no recorte"
            origem="Os dados vêm da listagem de pedidos. Importe-a na tela de Importar, ou amplie o período escolhido."
          />
        </PageBody>
      </>
    );
  }

  return <AnaliseSkuCliente dados={dados} />;
}
