import { carregarComparativos } from "@/lib/dados/vendas";
import VendasComparativos from "./comparativos-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarComparativos();
  return <VendasComparativos dados={dados} />;
}
