import { carregarMetas } from "@/lib/dados/metas";
import VendasMetas from "./metas-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarMetas();
  return <VendasMetas dados={dados} />;
}
