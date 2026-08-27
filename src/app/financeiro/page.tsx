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
      <PageHeader title="Financeiro" breadcrumb="Financeiro" />
      <PageBody>
        <SemFonte
          titulo="Sem dados para mostrar"
          origem="Custos, folha e fornecedores ainda não têm origem no sistema. Nenhuma das planilhas enviadas traz esses números — quando houver, esta tela passa a ler do banco como as de vendas."
        />
      </PageBody>
    </>
  );
}
