/**
 * Onde o token do Mercado Livre sobrevive entre uma execução e outra.
 *
 * O refresh token do Meli é de uso único: renovou, o anterior morre. Na
 * memória do servidor ele não sobrevive ao fim da função, e numa rotina
 * agendada cada execução começa do zero — a segunda tentaria o token já
 * gasto. Por isso ele mora no cofre (ver `@/lib/integracoes/cofre`).
 *
 * O que é específico do Meli e por isso mora aqui: o token pendente, que
 * existe porque a renovação pode acontecer antes de a integração existir.
 */
import "server-only";
import {
  integracaoDaConta,
  integracoesDoProvedor,
  lerSegredo,
  gravarSegredo,
  garantirIntegracao,
  registrarErro,
  type Integracao,
} from "@/lib/integracoes/cofre";

export type { Integracao };

export type TokenSalvo = {
  refresh_token: string;
  access_token: string | null;
  expira_em: string | null;
};

const PROVEDOR = "mercado_livre";

/** Token renovado antes de a integração existir. Ver `vincularIntegracao`. */
const g = globalThis as unknown as {
  __meliPendente?: Record<string, TokenSalvo>;
};

/** A integração da conta de canal, se já existe. */
export function integracaoDa(contaCanalId: string) {
  return integracaoDaConta(PROVEDOR, contaCanalId);
}

/** Toda integração do Meli que existe, de todas as operações. */
export function integracoesMeli() {
  return integracoesDoProvedor(PROVEDOR);
}

export async function lerToken(contaCanalId: string): Promise<TokenSalvo | null> {
  const integ = await integracaoDa(contaCanalId);
  const salvo = await lerSegredo<TokenSalvo>(integ);
  return salvo ?? g.__meliPendente?.[contaCanalId] ?? null;
}

export async function gravarToken(
  contaCanalId: string,
  t: { refresh_token: string; access_token: string; expira_em: Date }
): Promise<void> {
  const salvo: TokenSalvo = {
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    expira_em: t.expira_em.toISOString(),
  };

  const integ = await integracaoDa(contaCanalId);
  if (!integ) {
    // A conta de canal existe mas a integração ainda não. Fica pendente
    // até `vincularIntegracao` criá-la, logo em seguida.
    g.__meliPendente = { ...(g.__meliPendente ?? {}), [contaCanalId]: salvo };
    return;
  }

  const erro = await gravarSegredo(integ, salvo, salvo.expira_em);
  if (erro) {
    // O token novo já foi emitido e o antigo morreu. Falhar em gravar é o
    // pior caso possível: a próxima execução não terá com o que renovar.
    // Grita no log, mas não derruba a execução atual, que tem um token
    // válido em mãos.
    console.error(
      `[meli] Token da conta ${contaCanalId} renovado mas NÃO gravado: ${erro.message}. ` +
        "A próxima execução pode exigir nova autorização."
    );
  }
}

export function registrarErroToken(contaCanalId: string, erro: string) {
  return registrarErro(PROVEDOR, contaCanalId, erro);
}

/**
 * Garante a linha de `integracoes` da conta e grava o token pendente.
 *
 * Devolve o id da integração, que o registro da sincronização precisa.
 */
export async function vincularIntegracao(ctx: {
  operacaoId: string;
  canalId: string;
  contaCanalId: string;
  semente?: string | null;
}): Promise<Integracao | null> {
  const integ = await garantirIntegracao(PROVEDOR, {
    ...ctx,
    config: ctx.semente ? { conta: ctx.semente } : {},
  });
  if (!integ) return null;

  const pendente = g.__meliPendente?.[ctx.contaCanalId];
  if (pendente) {
    const erro = await gravarSegredo(integ, pendente, pendente.expira_em);
    if (erro) {
      console.error(
        `[meli] Token da conta ${ctx.contaCanalId} NÃO gravado no cofre: ${erro.message}`
      );
    } else {
      delete g.__meliPendente![ctx.contaCanalId];
    }
  }
  return integ;
}
