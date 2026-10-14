import { carregarProdutosPrecos } from "@/lib/dados/produtos-precos";
import ProdutosCliente from "./produtos-cliente";
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; canais?: string; sku?: string }> }) {
  const p = await searchParams;
  const dados = await carregarProdutosPrecos(p);
  return <ProdutosCliente key={`${dados.operacaoId}:${dados.de}:${dados.ate}:${dados.skuFiltro}`} dados={dados} />;
}
