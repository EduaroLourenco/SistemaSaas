import { carregarComparacao } from "@/lib/dados/comparar-ofertas";
import Comparar from "./comparar-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { searchParams: Promise<{ sku?: string | string[] }> }) {
  const { sku } = await searchParams;
  const dados = await carregarComparacao();
  return <Comparar dados={dados} buscaInicial={(Array.isArray(sku) ? sku[0] : sku) ?? ""} />;
}
