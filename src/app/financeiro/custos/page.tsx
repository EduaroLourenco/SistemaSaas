import { carregarCustos, carregarDespesasCanal } from "@/lib/dados/custos";
import CustosCliente from "./custos-cliente";

export const dynamic = "force-dynamic";

/**
 * Custos.
 *
 * A tela existia como aviso de ausência: "sem custo por produto não dá
 * para calcular margem, que é o que falta hoje". Agora ela é o lugar
 * onde esse custo entra.
 */
export default async function Pagina() {
  const [custos, canal] = await Promise.all([
    carregarCustos(),
    carregarDespesasCanal(),
  ]);

  return (
    <CustosCliente
      linhas={custos.linhas}
      faixas={custos.faixas}
      completos={custos.completos}
      despesas={canal.despesas}
      canais={canal.canais}
      adsPorMes={canal.adsPorMes}
    />
  );
}
