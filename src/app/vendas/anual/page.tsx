import { carregarAnual } from "@/lib/dados/vendas";
import VendasAnual from "./anual-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarAnual();
  return <VendasAnual dados={dados} />;
}
