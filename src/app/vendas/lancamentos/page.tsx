import { carregarLancamentos } from "@/lib/dados/vendas";
import VendasLancamentos from "./lancamentos-cliente";
import { carregarAutomacao } from "@/lib/dados/automacao";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const [dados, automacao] = await Promise.all([carregarLancamentos(), carregarAutomacao()]);
  return <VendasLancamentos dados={dados} automacao={automacao} />;
}
