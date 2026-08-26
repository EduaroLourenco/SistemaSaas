import { carregarCatalogo } from "@/lib/dados/catalogo";
import CatalogoAnuncios from "./catalogo-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarCatalogo();
  return <CatalogoAnuncios dados={dados} />;
}
