import { clienteServidor } from "@/lib/supabase/servidor";
import ImportarCliente, { type Importacao, type Origens } from "./importar-cliente";

export const dynamic = "force-dynamic";

/**
 * Importar: além do fluxo de planilha (que é todo do cliente), a tela mostra
 * de onde o dado já está entrando e o histórico real de importações — o que
 * a referência aprovada pede, com número do banco no lugar do exemplo.
 *
 * As consultas passam pelo cliente da sessão: o RLS e o cabeçalho de
 * operação deixam só o que é da empresa ativa.
 */
export default async function Pagina() {
  const sb = await clienteServidor();
  const [{ data: integs }, { data: recentes }] = await Promise.all([
    sb.from("integracoes").select("provedor,conta_canal_id,credencial_ref"),
    sb
      .from("importacoes")
      .select("id,tipo,nome_arquivo,linhas_lidas,linhas_validas,status,erro,criado_em")
      .order("criado_em", { ascending: false })
      .limit(8),
  ]);

  const ligadas = (integs ?? []).filter((i) => i.credencial_ref);
  const origens: Origens = {
    contasApi: ligadas.filter((i) => i.provedor !== "bling").length,
    erpConectado: ligadas.some((i) => i.provedor === "bling"),
  };

  return <ImportarCliente origens={origens} recentes={(recentes ?? []) as Importacao[]} />;
}
