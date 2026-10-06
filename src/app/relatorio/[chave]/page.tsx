import { notFound } from "next/navigation";
import { montarRelatorio } from "@/lib/dados/relatorio";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { usuarioAtual } from "@/lib/supabase/servidor";
import { RelatorioCliente } from "./relatorio-cliente";

export const dynamic = "force-dynamic";
/** A montagem lê o ano inteiro de pedidos; 60s não sobra, 120 sobra. */
export const maxDuration = 120;

export const metadata = {
  title: "Raio-X da operação",
  robots: { index: false, follow: false },
};

/**
 * O relatório, aberto por link com chave.
 *
 * Fica fora do menu de propósito: o endereço vai para gestor e diretoria, e
 * ninguém precisa de conta para ler.
 *
 * ── A chave é de UMA empresa ──
 *
 * Ela morava em `RELATORIO_CHAVE`, uma variável de ambiente, e era uma só
 * para a instalação inteira. O relatório também é montado com a chave de
 * serviço, que passa por fora do RLS — é o que permite abrir sem login.
 *
 * Com uma empresa isso bastava. Com três, o mesmo endereço mostraria o
 * faturamento das três somado para quem tivesse o link. Agora a chave vive
 * em `operacoes.relatorio_chave`, uma por operação, e é ela que decide de
 * qual empresa o relatório é.
 *
 * Quem resolve é uma função do banco: o visitante não tem sessão, então o
 * RLS de `operacoes` não devolveria nada. Ela devolve só id e nome — nada
 * que sirva para descobrir outra chave —, e chave errada devolve vazio sem
 * dizer se existe.
 */
async function operacaoDaChave(chave: string) {
  if (!chave || chave.length < 32) return null;
  const sb = clientePrivilegiado();
  const { data, error } = await sb.rpc("operacao_por_chave_relatorio", { p_chave: chave });
  if (error) return null;
  const linha = Array.isArray(data) ? data[0] : data;
  return linha?.operacao_id
    ? { id: linha.operacao_id as string, nome: linha.nome as string, empresa: linha.empresa as string }
    : null;
}

export default async function Relatorio({
  params,
  searchParams,
}: {
  params: Promise<{ chave: string }>;
  searchParams: Promise<{ dias?: string; canal?: string }>;
}) {
  const { chave } = await params;
  const { dias, canal } = await searchParams;

  let operacaoId = (await operacaoDaChave(chave))?.id ?? null;

  /*
   * Chave que não resolve ainda abre para quem está logado, usando a
   * empresa que ele escolheu no seletor. É o que mantém o endereço
   * funcionando para quem já tem acesso enquanto os links novos não foram
   * distribuídos — e quem não tem sessão continua recebendo 404, sem pista
   * de que a chave existe ou não.
   */
  if (!operacaoId) {
    const usuario = await usuarioAtual();
    if (!usuario) notFound();
    operacaoId = (await operacaoPadrao())?.id ?? null;
    if (!operacaoId) notFound();
  }

  const janela = Math.min(90, Math.max(1, Number(dias) || 7));
  const dados = await montarRelatorio({ dias: janela, canal: canal ?? null, operacaoId });

  return <RelatorioCliente dados={dados} chave={chave} />;
}
