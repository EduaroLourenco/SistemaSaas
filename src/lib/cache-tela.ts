import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escopoCache } from "@/lib/supabase/escopo";
import { operacaoPadrao } from "@/lib/dados/operacao";
import { COOKIE_VERSAO } from "@/lib/versao-dados";

/**
 * Telas pesadas guardadas no servidor, por pessoa e por empresa.
 *
 * Por quê: em 24/11 Queda, Dia, Tráfego, Análise e Histórico ainda levavam
 * 5–7 s depois de tirar fila e leitura repetida. O que sobrava era volume
 * (mais de 125 mil linhas por abertura), e o dado só muda quando a
 * sincronização roda ou alguém grava.
 *
 * A chave é o usuário (conferido pela assinatura do token), a empresa, os
 * filtros e a "versão" que o proxy troca a cada gravação do próprio usuário.
 * Dentro do cache as consultas seguem com o token dele — o RLS continua
 * valendo, e uma pessoa nunca recebe o cache de outra.
 *
 * Invalidação: fim de sincronização limpa a empresa inteira
 * (`limparCacheDaEmpresa`); gravação do próprio usuário troca a versão; a
 * gravação de outra pessoa da mesma empresa aparece em até 10 minutos.
 */

const VALIDADE_S = 600;
const tagDaEmpresa = (operacaoId: string) => `dados:${operacaoId}`;

export async function emCache<T>(tela: string, filtros: unknown, carregar: () => Promise<T>): Promise<T> {
  const sb = await clienteServidor();
  const [{ data: claims }, { data: sessao }, operacao, jar] = await Promise.all([
    sb.auth.getClaims(),
    sb.auth.getSession(),
    operacaoPadrao(),
    cookies(),
  ]);
  const usuario = claims?.claims?.sub;
  const token = sessao.session?.access_token;
  // Sem identidade conferida ou sem empresa, lê direto: nunca guarda o que não sabe de quem é.
  if (!usuario || !token || !operacao || sessao.session?.user.id !== usuario) return carregar();
  const versao = jar.get(COOKIE_VERSAO)?.value ?? "";
  // O padrão das telas é "até ontem": virou o dia, é outra tela.
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return unstable_cache(
    () => escopoCache.run({ token, operacao }, carregar),
    ["tela", tela, usuario, operacao.id, versao, hoje, JSON.stringify(filtros ?? null)],
    { tags: [tagDaEmpresa(operacao.id)], revalidate: VALIDADE_S },
  )();
}

/** Fim de sincronização: a próxima abertura de qualquer pessoa da empresa lê de novo. */
export function limparCacheDaEmpresa(operacaoId: string) {
  revalidateTag(tagDaEmpresa(operacaoId), { expire: 0 });
}
