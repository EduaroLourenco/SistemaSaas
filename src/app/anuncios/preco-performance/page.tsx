import { carregarPerformancePreco } from "@/lib/dados/performance-preco";
import PerformancePrecoCliente from "./performance-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; canal?: string }>;
}) {
  const p = await searchParams;
  const dados = await carregarPerformancePreco({
    dias: Number(p.dias) || 90,
    canalId: p.canal || undefined,
  });

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Performance de preço" breadcrumb="Anúncios" />
        <PageBody>
          <SemFonte
            titulo="Sem venda no recorte"
            origem="A análise vem da listagem de pedidos, comparando o preço praticado com o que foi vendido. Importe-a ou amplie o período."
          />
        </PageBody>
      </>
    );
  }

  return <PerformancePrecoCliente dados={dados} />;
}
