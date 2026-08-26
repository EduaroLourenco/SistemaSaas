import { carregarGlossario } from "@/lib/dados/glossario";
import Glossario from "./glossario-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarGlossario();
  return <Glossario dados={dados} />;
}
