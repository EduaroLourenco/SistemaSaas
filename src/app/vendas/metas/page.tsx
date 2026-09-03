import { carregarPlanejamento } from "@/lib/dados/metas-planejamento";
import PlanejarMetas from "./metas-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

export const dynamic = "force-dynamic";

/**
 * Metas.
 *
 * O mês vem da URL: um link para "a meta de outubro" precisa poder ser
 * mandado para alguém, e voltar da gravação sem perder o mês que estava
 * sendo editado.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; mes?: string }>;
}) {
  const p = await searchParams;
  const hoje = new Date();
  const ano = Number(p.ano) || hoje.getFullYear();
  const mes = Number(p.mes) || hoje.getMonth() + 1;

  const dados = await carregarPlanejamento(ano, mes);

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Metas" breadcrumb="Vendas" />
        <PageBody>
          <SemFonte
            titulo="Sem histórico para distribuir a meta"
            origem="A meta é rateada pelo peso recente de cada canal, e não há venda registrada. Importe a listagem de pedidos primeiro."
          />
        </PageBody>
      </>
    );
  }

  return <PlanejarMetas dados={dados} />;
}
