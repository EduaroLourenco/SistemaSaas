import { carregarCustos, carregarDespesasCanal } from "@/lib/dados/custos";
import { clienteServidor } from "@/lib/supabase/servidor";
import CustosCliente from "./custos-cliente";
import { carregarContasRecorte } from "@/lib/dados/contas-recorte";
import { opcoesRecorte } from "@/lib/recorte";

export const dynamic = "force-dynamic";

/**
 * Custos.
 *
 * A tela existia como aviso de ausência: "sem custo por produto não dá
 * para calcular margem, que é o que falta hoje". Agora ela é o lugar
 * onde esse custo entra.
 *
 * O recorte vive na URL, como no Diário: sobrevive ao recarregar, pode
 * ser colado para outra pessoa, e roda no banco em vez de trazer o
 * histórico inteiro para descartar na tela.
 */

/** Últimos 90 dias a partir do último pedido, não de hoje. */
async function periodoPadrao(): Promise<{ inicio: string; fim: string }> {
  const sb = await clienteServidor();
  const { data } = await sb
    .from("pedidos")
    .select("data")
    .order("data", { ascending: false })
    .limit(1);

  const ultima = data?.[0]?.data
    ? String(data[0].data).slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const d = new Date(`${ultima}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 89);
  return { inicio: d.toISOString().slice(0, 10), fim: ultima };
}

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ inicio?: string; fim?: string; canal?: string }>;
}) {
  const params = await searchParams;
  const padrao = await periodoPadrao();
  const inicio = params.inicio ?? padrao.inicio;
  const fim = params.fim ?? padrao.fim;
  const canalId = params.canal || undefined;

  const [custos, canal, contas] = await Promise.all([
    carregarCustos({ inicio, fim, canalId }),
    carregarDespesasCanal(),
    carregarContasRecorte(),
  ]);

  return (
    <CustosCliente
      linhas={custos.linhas}
      faixas={custos.faixas}
      completos={custos.completos}
      despesas={canal.despesas}
      canais={custos.canais}
      opcoes={opcoesRecorte(contas)}
      adsPorMes={canal.adsPorMes}
      inicio={inicio}
      fim={fim}
      canalId={canalId ?? ""}
    />
  );
}
