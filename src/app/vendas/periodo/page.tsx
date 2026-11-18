import { carregarPainel } from "@/lib/dados/painel";
import VisaoGeral from "@/app/painel-cliente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Análise do período" };

export default async function Pagina() {
  return <VisaoGeral dados={await carregarPainel()} />;
}
