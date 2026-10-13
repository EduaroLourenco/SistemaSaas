import { carregarQueda } from "@/lib/dados/queda";
import ProdutosCliente from "./produtos-cliente";
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; canais?: string; sku?: string }> }) {
  const p = await searchParams;
  const dados = await carregarQueda({ ...p, nivel: "anuncio", incluirSemVenda: true });
  return <ProdutosCliente dados={dados} />;
}
