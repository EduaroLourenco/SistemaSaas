import { carregarPrecoIdeal } from "@/lib/dados/preco-ideal";
import PrecoIdeal from "./preco-ideal-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarPrecoIdeal();
  return <PrecoIdeal dados={dados} />;
}
