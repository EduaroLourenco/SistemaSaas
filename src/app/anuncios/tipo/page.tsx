import { carregarTipoAnuncio } from "@/lib/dados/tipo-anuncio";
import TipoAnuncio from "./tipo-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const dados = await carregarTipoAnuncio();
  return <TipoAnuncio dados={dados} />;
}
