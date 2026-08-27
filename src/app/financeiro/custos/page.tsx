import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

/*
 * O dado de exemplo saiu daqui.
 *
 * Zerar os números mantinha os gráficos desenhados, o que passa a
 * impressão de operação parada — e não é isso: é ausência de fonte. A
 * tela agora diz o que precisa acontecer para ter conteúdo.
 */
export default function Pagina() {
  return (
    <>
      <PageHeader title="Custos" breadcrumb="Financeiro" />
      <PageBody>
        <SemFonte
          titulo="Sem dados para mostrar"
          origem="Não há planilha de custos importada. Sem custo por produto não dá para calcular margem, que é o que falta hoje na análise de anúncios."
        />
      </PageBody>
    </>
  );
}
