import { carregarCancelamentos } from "@/lib/dados/cancelamentos";
import Cancelamentos from "./cancelamentos-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarCancelamentos();
  return <Cancelamentos dados={dados} />;
}
