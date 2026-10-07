import { carregarCanais } from "@/lib/dados/canais";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import CanaisCliente from "./canais-cliente";

export const dynamic = "force-dynamic";

/**
 * Onde se cadastra um canal e as contas de venda dele.
 *
 * Até aqui essas linhas eram inseridas direto no banco. Servia enquanto a
 * única empresa aqui era a nossa; um cliente não tem acesso ao banco, e sem
 * esta tela cada "tenho uma conta Magalu" viraria trabalho manual nosso.
 *
 * Um canal pode ter mais de uma conta — é o caso real das duas contas de
 * Mercado Livre, pronta entrega e venda a prazo. Separá-las é o que permite
 * ver margem por conta, que foi o corte que mostrou a reputação amarela da
 * conta a prazo.
 *
 * `?aba=erp` abre direto na aba do ERP: é para lá que a volta da conexão do
 * Bling manda quem precisa ligar loja a canal.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await searchParams;
  const { canais, contas, erp, faltaMigracao } = await carregarCanais();

  return (
    <>
      <PageHeader
        title="Canais e contas"
        breadcrumb="Integrações"
        description="Onde a empresa vende, com quais contas, e de qual ERP vêm os pedidos"
      />
      <PageBody>
        <CanaisCliente
          canais={canais}
          contas={contas}
          erp={erp}
          abaInicial={aba === "erp" ? "erp" : aba === "canais" ? "canais" : "contas"}
          faltaMigracao={faltaMigracao}
        />
      </PageBody>
    </>
  );
}
