import { carregarPainel } from "@/lib/dados/painel";
import VendasPorCanal from "./canais-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarPainel();
  return <VendasPorCanal dados={dados} />;
}
