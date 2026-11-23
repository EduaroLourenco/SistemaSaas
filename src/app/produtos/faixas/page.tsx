import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { montarTabelaFaixas } from "@/lib/dados/tabela-faixas";
import FaixasCliente from "./faixas-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const op = await operacaoPadrao();
  const dados = op ? await montarTabelaFaixas(await clienteServidor(), op.id) : null;
  return <FaixasCliente dados={dados} empresa={op?.empresa ?? null} />;
}
