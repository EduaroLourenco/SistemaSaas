import { carregarDiario } from "@/lib/dados/diario";
import ComparativoDiario from "./diario-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarDiario();
  return <ComparativoDiario dados={dados} />;
}
