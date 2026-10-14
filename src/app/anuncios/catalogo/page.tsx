import { carregarCatalogo } from "@/lib/dados/catalogo";
import { carregarDisputa } from "@/lib/dados/disputa-catalogo";
import CatalogoAnuncios from "./catalogo-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  /* As duas leituras juntas: a disputa é o que a tela responde primeiro,
     e a lista de anúncios continua abaixo dela. */
  const [dados, disputa] = await Promise.all([carregarCatalogo(), carregarDisputa()]);
  return <CatalogoAnuncios key={q ?? ""} dados={dados} disputa={disputa} buscaInicial={q ?? ""} />;
}
