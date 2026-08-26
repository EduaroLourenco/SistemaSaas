import { carregarSemanal } from "@/lib/dados/vendas";
import VendasSemanal from "./semanal-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarSemanal();
  return <VendasSemanal dados={dados} />;
}
