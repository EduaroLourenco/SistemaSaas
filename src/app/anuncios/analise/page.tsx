import { carregarAnalise } from "@/lib/dados/analise";
import { lerPeriodo } from "@/lib/periodo-anuncios";
import AnaliseAnuncios from "@/components/analise/central-anuncios";

export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; vs?: string; vsde?: string; vsate?: string }>;
}) {
  const [dados, q] = await Promise.all([carregarAnalise(), searchParams]);
  return <AnaliseAnuncios dados={dados} inicial={lerPeriodo(q, dados.hoje)} />;
}
