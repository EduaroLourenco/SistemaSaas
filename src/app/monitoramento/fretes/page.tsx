import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { SemFonte } from "@/components/ui/sem-fonte";

/*
 * Frete por CEP não existe em planilha nenhuma: é consulta ao vivo na API
 * do canal, item a item. O dado de exemplo saiu — num painel de frete, um
 * número inventado leva a prometer prazo que não se cumpre.
 */
export default function Pagina() {
  return (
    <>
      <PageHeader title="Fretes" breadcrumb="Monitoramento" />
      <PageBody>
        <SemFonte
          titulo="Depende da API do Mercado Livre"
          origem="Frete por anúncio e CEP é consulta ao vivo — nenhuma planilha traz esse número. A rota /api/monitoramento/frete já existe e passa a responder quando as credenciais do canal forem configuradas."
        />
      </PageBody>
    </>
  );
}
