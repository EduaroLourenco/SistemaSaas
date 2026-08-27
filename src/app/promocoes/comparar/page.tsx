import { carregarComparacao } from "@/lib/dados/comparar-ofertas";
import Comparar from "./comparar-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarComparacao();
  return <Comparar dados={dados} />;
}
