import { carregarCatalogo } from "@/lib/dados/catalogo";
import CatalogoAnuncios from "./catalogo-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const dados = await carregarCatalogo();
  return <CatalogoAnuncios key={q ?? ""} dados={dados} buscaInicial={q ?? ""} />;
}
