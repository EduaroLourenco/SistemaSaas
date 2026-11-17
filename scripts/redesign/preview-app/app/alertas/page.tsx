import Alertas from "@/app/alertas/alertas-cliente";
import { alertas } from "../../fixtures";
export default async function Preview({ searchParams }: { searchParams: Promise<{cenario?:string;estado?:string}> }) {
  const query = await searchParams;
  const estado = query.estado || query.cenario;
  return <Alertas dados={["vazio", "zero"].includes(estado || "") ? {...alertas, alertas: []} : alertas} />;
}
