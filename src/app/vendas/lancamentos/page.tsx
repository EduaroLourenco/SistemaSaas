import { carregarLancamentos } from "@/lib/dados/vendas";
import VendasLancamentos from "./lancamentos-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarLancamentos();
  return <VendasLancamentos dados={dados} />;
}
