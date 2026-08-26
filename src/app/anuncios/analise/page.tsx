import { carregarAnalise } from "@/lib/dados/analise";
import AnaliseAnuncios from "./analise-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarAnalise();
  return <AnaliseAnuncios dados={dados} />;
}
