import { clienteServidor } from "@/lib/supabase/servidor";
import {
  carregarBaseMargem,
  carregarResultado,
  carregarResultadoMensal,
  agregar,
  type Dimensao,
} from "@/lib/dados/margem";
import FinanceiroCliente from "./financeiro-cliente";
import { carregarContasRecorte } from "@/lib/dados/contas-recorte";
import { opcoesRecorte } from "@/lib/recorte";

export const dynamic = "force-dynamic";

/**
 * O resultado financeiro da operação.
 *
 * A tela era um aviso de ausência: "custos, folha e fornecedores ainda
 * não têm origem no sistema". Agora ela lê do banco como as de vendas.
 *
 * As seis agregações saem da MESMA base de itens, calculada uma vez. Uma
 * consulta por visão era o caminho garantido para a margem da semana não
 * bater com a margem do mês.
 */

const DIMENSOES: Dimensao[] = ["mes", "semana", "canal", "conta", "sku", "anuncio"];

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

  const [resultado, mensal, base, contas] = await Promise.all([
    carregarResultado(inicio, fim, canalId),
    carregarResultadoMensal(inicio, fim, canalId),
    carregarBaseMargem({ inicio, fim, canalId }),
    carregarContasRecorte(),
  ]);

  const visoes = Object.fromEntries(
    DIMENSOES.map((d) => [d, agregar(base, d)])
  ) as Record<Dimensao, ReturnType<typeof agregar>>;

  return (
    <FinanceiroCliente
      resultado={resultado}
      mensal={mensal}
      visoes={visoes}
      opcoes={opcoesRecorte(contas)}
      inicio={inicio}
      fim={fim}
      canalId={canalId ?? ""}
    />
  );
}
