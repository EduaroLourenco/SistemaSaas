import { PageHeader, PageBody } from "@/components/layout/app-shell";
import "@/components/analise/operation-pages.css";
import { SemFonte } from "@/components/ui/sem-fonte";

/*
 * Frete por CEP não existe em planilha nenhuma: é consulta ao vivo na API
 * do canal, item a item. O dado de exemplo saiu — num painel de frete, um
 * número inventado leva a prometer prazo que não se cumpre.
 */
export default function Pagina() {
  return (
    <>
      <PageHeader title="Fretes" badge={<span className="text-[14px] text-ink-3">Consulta por anúncio e CEP</span>} />
      <PageBody className="op-workspace op-monitoramento-fretes">
        <SemFonte
          titulo="Consulta de frete indisponível"
          origem="O frete por anúncio e CEP depende da conexão com o Mercado Livre. Esse dado não está disponível em planilhas; confira a conexão do canal para consultar prazos e valores reais."
        />
      </PageBody>
    </>
  );
}
