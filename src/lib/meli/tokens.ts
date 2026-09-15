/**
 * Onde o token do Mercado Livre sobrevive entre uma execução e outra.
 *
 * O refresh token do Meli é de uso único: renovou, o anterior morre. Na
 * memória do servidor ele não sobrevive ao fim da função, e numa rotina
 * agendada cada execução começa do zero — a segunda tentaria o token já
 * gasto. Por isso ele mora no cofre do Supabase (Vault), referenciado por
 * `integracoes.credencial_ref`, como o schema sempre previu.
 *
 * A integração é achada pelo apelido da conta (`config.conta`), porque o
 * token é necessário ANTES de saber qual conta de canal ele representa —
 * é com ele que se pergunta ao Meli "quem sou eu". Na primeira renovação,
 * quando a integração ainda não existe, o token fica pendente em memória
 * até `vincularIntegracao` criá-la, logo em seguida.
 *
 * Sem a migração 19 rodada, tudo aqui vira no-op com aviso e o cliente
 * volta ao comportamento antigo, só em memória. Nada quebra; só não fica
 * automático.
 */
import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";

export type TokenSalvo = {
  refresh_token: string;
  access_token: string | null;
  expira_em: string | null;
};

const PROVEDOR = "mercado_livre";

/** Tabela, coluna ou função que só existe depois da migração 19. */
const AUSENTE = new Set(["42P01", "PGRST205", "42703", "PGRST204", "PGRST202", "42883"]);
let avisou = false;

function semMigracao(codigo?: string) {
  if (!codigo || !AUSENTE.has(codigo)) return false;
  if (!avisou) {
    avisou = true;
    console.warn(
      "[meli] Rode db/19_sincronizacao_automatica.sql. Até lá o token renovado " +
        "fica só em memória e a sincronização agendada não se sustenta."
    );
  }
  return true;
}

/** Token renovado antes de a integração existir. Ver `vincularIntegracao`. */
const g = globalThis as unknown as {
  __meliPendente?: Record<string, TokenSalvo>;
};

export type Integracao = { id: string; operacaoId: string; ref: string | null };

/** A integração da conta, se já existe. */
export async function integracaoDa(conta: string): Promise<Integracao | null> {
  const { data, error } = await clientePrivilegiado()
    .from("integracoes")
    .select("id,operacao_id,credencial_ref")
    .eq("provedor", PROVEDOR)
    .eq("config->>conta", conta)
    .maybeSingle();
  if (error) {
    if (semMigracao(error.code)) return null;
    throw new Error(`Não consegui ler a integração: ${error.message}`);
  }
  return data
    ? {
        id: data.id as string,
        operacaoId: data.operacao_id as string,
        ref: (data.credencial_ref as string | null) ?? null,
      }
    : null;
}

export async function lerToken(conta: string): Promise<TokenSalvo | null> {
  const integ = await integracaoDa(conta);
  if (!integ?.ref) return g.__meliPendente?.[conta] ?? null;

  const { data, error } = await clientePrivilegiado().rpc("integracao_segredo_ler", {
    p_ref: integ.ref,
  });
  if (error) {
    if (semMigracao(error.code)) return null;
    throw new Error(`Não consegui ler o token do cofre: ${error.message}`);
  }
  if (!data) return null;
  try {
    return JSON.parse(data as string) as TokenSalvo;
  } catch {
    return null;
  }
}

async function gravarNoCofre(integ: Integracao, t: TokenSalvo) {
  const sb = clientePrivilegiado();
  const { data: ref, error } = await sb.rpc("integracao_segredo_gravar", {
    p_ref: integ.ref,
    p_nome: `integracao_${integ.id}`,
    p_segredo: JSON.stringify(t),
  });
  if (error) return error;
  const { error: e2 } = await sb
    .from("integracoes")
    .update({
      credencial_ref: ref as string,
      status: "conectada",
      expira_em: t.expira_em,
      ultimo_erro: null,
    })
    .eq("id", integ.id);
  if (e2) return e2;
  integ.ref = ref as string;
  return null;
}

export async function gravarToken(
  conta: string,
  t: { refresh_token: string; access_token: string; expira_em: Date }
): Promise<void> {
  const salvo: TokenSalvo = {
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    expira_em: t.expira_em.toISOString(),
  };

  const integ = await integracaoDa(conta);
  if (!integ) {
    // Primeira renovação da conta: ainda não se sabe a qual conta de canal
    // o token pertence. Fica pendente até `vincularIntegracao`.
    g.__meliPendente = { ...(g.__meliPendente ?? {}), [conta]: salvo };
    return;
  }

  const erro = await gravarNoCofre(integ, salvo);
  if (erro && !semMigracao(erro.code)) {
    // O token novo já foi emitido e o antigo morreu. Falhar em gravar é o
    // pior caso possível: a próxima execução não terá com o que renovar.
    // Grita no log, mas não derruba a execução atual, que tem um token
    // válido em mãos.
    console.error(
      `[meli] Token da conta "${conta}" renovado mas NÃO gravado: ${erro.message}. ` +
        "A próxima execução pode exigir nova autorização."
    );
  }
}

export async function registrarErroToken(conta: string, erro: string): Promise<void> {
  const { error } = await clientePrivilegiado()
    .from("integracoes")
    .update({ status: "expirada", ultimo_erro: erro.slice(0, 500) })
    .eq("provedor", PROVEDOR)
    .eq("config->>conta", conta);
  if (error && !semMigracao(error.code)) {
    console.warn(`[meli] Não consegui registrar a falha do token: ${error.message}`);
  }
}

/**
 * Garante a linha de `integracoes` da conta e grava o token pendente.
 *
 * Chamada logo depois de descobrir a conta de canal — é o primeiro
 * momento em que se sabe operação, canal e conta. Devolve o id da
 * integração, que o registro da sincronização precisa.
 */
export async function vincularIntegracao(
  conta: string,
  ctx: { operacaoId: string; canalId: string; contaCanalId: string }
): Promise<Integracao | null> {
  const sb = clientePrivilegiado();
  let integ = await integracaoDa(conta);

  if (!integ) {
    const { data, error } = await sb
      .from("integracoes")
      .insert({
        operacao_id: ctx.operacaoId,
        provedor: PROVEDOR,
        canal_id: ctx.canalId,
        conta_canal_id: ctx.contaCanalId,
        status: "conectada",
        config: { conta },
      })
      .select("id")
      .single();
    if (error) {
      if (!semMigracao(error.code)) {
        console.warn(`[meli] Não consegui criar a integração: ${error.message}`);
      }
      return null;
    }
    integ = { id: data.id as string, operacaoId: ctx.operacaoId, ref: null };
  }

  const pendente = g.__meliPendente?.[conta];
  if (pendente) {
    const erro = await gravarNoCofre(integ, pendente);
    if (erro) {
      if (!semMigracao(erro.code)) {
        console.error(`[meli] Token da conta "${conta}" NÃO gravado no cofre: ${erro.message}`);
      }
    } else {
      delete g.__meliPendente![conta];
    }
  }
  return integ;
}
