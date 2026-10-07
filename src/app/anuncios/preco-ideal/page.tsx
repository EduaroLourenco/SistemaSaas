import { carregarPrecoIdeal } from "@/lib/dados/preco-ideal";
import PrecoIdeal from "./preco-ideal-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarPrecoIdeal();
  // Sem campanha processada não há relatório para abrir — a tela pegava o
  // primeiro de uma lista vazia e quebrava.
  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Lógica de promoção" breadcrumb="Anúncios" />
        <PageBody>
          <SemFonte
            titulo="Nenhuma campanha processada ainda"
            origem="A lógica de promoção cruza a planilha da Central de Promoções com a Fórmula base. Processe uma campanha em Processar planilha."
          />
        </PageBody>
      </>
    );
  }
  return <PrecoIdeal dados={dados} />;
}
