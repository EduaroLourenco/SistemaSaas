import { carregarAnual } from "@/lib/dados/vendas";
import VendasAnual from "./anual-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarAnual();
  // Empresa sem pedido nenhum: a tela presume um ano com meses e quebrava.
  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Acompanhamento anual" breadcrumb="Vendas" />
        <PageBody>
          <SemFonte
            titulo="Ainda não há venda registrada"
            origem="O acompanhamento do ano sai dos pedidos. Conecte um canal por API ou importe a listagem de pedidos."
          />
        </PageBody>
      </>
    );
  }
  return <VendasAnual dados={dados} />;
}
