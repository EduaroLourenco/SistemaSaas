import { carregarAlertas } from "@/lib/dados/alertas";

export const dynamic = "force-dynamic";

/** O número do sino. A leitura roda em segundo plano, fora da troca de tela. */
export async function GET() {
  const { alertas } = await carregarAlertas();
  return Response.json({
    total: alertas.length,
    criticos: alertas.filter((a) => a.severidade === "critico").length,
  });
}
