import { carregarTipoAnuncio } from "@/lib/dados/tipo-anuncio";
import TipoAnuncio from "./tipo-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string; dias?: string; comparar?: string }>;
}) {
  const p = await searchParams;
  const dados = await carregarTipoAnuncio({
    canal: p.canal || undefined,
    // 0 = histórico inteiro, que é o padrão antigo desta tela.
    dias: p.dias === undefined ? 0 : Number(p.dias) || 0,
    comparar: p.comparar === "1",
  });
  return <TipoAnuncio dados={dados} />;
}
