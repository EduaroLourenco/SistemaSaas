import { carregarSemanal } from "@/lib/dados/vendas";
import VendasSemanal from "./semanal-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarSemanal();
  // Sem pedido não há semana para somar — a tela fazia `reduce` em lista vazia.
  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Semanal" breadcrumb="Vendas" />
        <PageBody>
          <SemFonte
            titulo="Ainda não há venda registrada"
            origem="A visão semanal sai dos pedidos. Conecte um canal por API ou importe a listagem de pedidos."
          />
        </PageBody>
      </>
    );
  }
  return <VendasSemanal dados={dados} />;
}
