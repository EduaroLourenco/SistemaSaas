import { carregarQueda, type Nivel } from "@/lib/dados/queda";
import QuedaCliente from "./queda-cliente";

export const dynamic = "force-dynamic";

/**
 * Por que caiu.
 *
 * O recorte vem da URL — período, canais, produto ou anúncio — para que
 * "o PA85352 no Meli em setembro" seja um link que se cola no chat.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; nivel?: string; canais?: string }>;
}) {
  const { de, ate, nivel, canais } = await searchParams;
  const dados = await carregarQueda({ de, ate, nivel: nivel as Nivel | undefined, canais });
  return <QuedaCliente dados={dados} />;
}
