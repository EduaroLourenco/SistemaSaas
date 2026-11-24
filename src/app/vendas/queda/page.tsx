import { carregarQueda, type Nivel } from "@/lib/dados/queda";
import { emCache } from "@/lib/cache-tela";
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
  searchParams: Promise<{ de?: string; ate?: string; deAnt?: string; ateAnt?: string; nivel?: string; canais?: string; sku?: string }>;
}) {
  const { de, ate, deAnt, ateAnt, nivel, canais, sku } = await searchParams;
  const filtros = { de, ate, deAnt, ateAnt, nivel: nivel as Nivel | undefined, canais, sku };
  const dados = await emCache("queda", filtros, () => carregarQueda(filtros));
  return <QuedaCliente dados={dados} />;
}
