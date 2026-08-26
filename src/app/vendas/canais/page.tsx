import { carregarCanais } from "@/lib/dados/vendas";
import VendasPorCanal from "./canais-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarCanais();
  return <VendasPorCanal dados={dados} />;
}
