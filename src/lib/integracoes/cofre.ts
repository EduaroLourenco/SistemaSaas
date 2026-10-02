/**
 * Credencial de canal por empresa, guardada no cofre do Supabase.
 *
 * Toda integração é achada pela CONTA DE CANAL (`conta_canal_id`), que é
 * única no banco e carrega a operação. Antes o Mercado Livre usava um
 * apelido global ("principal", "segunda") que virava variável de ambiente,
 * e a VTEX nem isso: casava pelo nome do canal. Nos dois casos uma segunda
 * empresa cairia na credencial da primeira.
 *
 * O segredo em si (refresh token, appKey/appToken) vai para o Vault, nunca
 * para `integracoes.config` — `config` é legível por qualquer membro via
 * RLS, inclusive quem só tem papel de leitor, e um token de loja dá acesso
 * a todos os pedidos dela.
 *
 * Sem a migração 19 rodada, tudo aqui vira no-op com aviso. Nada quebra;
 * só não fica automático.
 */
import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";

/** Tabela, coluna ou função que só existe depois da migração 19. */
const AUSENTE = new Set(["42P01", "PGRST205", "42703", "PGRST204", "PGRST202", "42883"]);
const avisou = new Set<string>();

export function semMigracao(codigo?: string) {
  if (!codigo || !AUSENTE.has(codigo)) return false;
  if (!avisou.has("19")) {
    avisou.add("19");
    console.warn(
      "[integrações] Rode db/19_sincronizacao_automatica.sql. Até lá a credencial " +
        "renovada fica só em memória e a sincronização agendada não se sustenta."
    );
  }
  return true;
}

export type Integracao = {
  id: string;
  operacaoId: string;
  canalId: string | null;
  contaCanalId: string;
  ref: string | null;
  /** `integracoes.config` — nunca guarda segredo. */
  config: Record<string, unknown>;
};

const COLUNAS = "id,operacao_id,canal_id,conta_canal_id,credencial_ref,config";

type Linha = {
  id: string;
  operacao_id: string;
  canal_id: string | null;
  conta_canal_id: string | null;
  credencial_ref: string | null;
  config: Record<string, unknown> | null;
};

function montar(l: Linha): Integracao {
  return {
    id: l.id,
    operacaoId: l.operacao_id,
    canalId: l.canal_id ?? null,
    contaCanalId: l.conta_canal_id ?? "",
    ref: l.credencial_ref ?? null,
    config: l.config ?? {},
  };
}

/** A integração daquele provedor para aquela conta de canal. */
export async function integracaoDaConta(
  provedor: string,
  contaCanalId: string
): Promise<Integracao | null> {
  const { data, error } = await clientePrivilegiado()
    .from("integracoes")
    .select(COLUNAS)
    .eq("provedor", provedor)
    .eq("conta_canal_id", contaCanalId)
    .maybeSingle();
  if (error) {
    if (semMigracao(error.code)) return null;
    throw new Error(`Não consegui ler a integração: ${error.message}`);
  }
  return data ? montar(data as Linha) : null;
}

/**
 * Toda integração do provedor, de todas as operações, com o nome da conta.
 *
 * É o que uma rotina agendada varre: ela não tem usuário logado, então não
 * tem como partir de uma operação. Roda com privilégio justamente para
 * atender todas as empresas numa passada.
 */
export async function integracoesDoProvedor(
  provedor: string
): Promise<(Integracao & { nome: string })[]> {
  const sb = clientePrivilegiado();
  const { data, error } = await sb
    .from("integracoes")
    .select(COLUNAS)
    .eq("provedor", provedor)
    .not("conta_canal_id", "is", null);
  if (error) {
    if (semMigracao(error.code)) return [];
    throw new Error(`Não consegui listar as integrações: ${error.message}`);
  }

  const integs = (data as Linha[]).map(montar);
  if (integs.length === 0) return [];

  /*
   * O nome vem numa segunda consulta, não num embed. O embed depende de o
   * PostgREST ter a chave estrangeira no cache de schema, e a de
   * `conta_canal_id` entrou por `alter table` na migração 19 — voltou vazio
   * e o nome caía no uuid. Duas consultas simples não dependem disso.
   */
  const { data: contas } = await sb
    .from("contas_canal")
    .select("id,nome,ativa")
    .in("id", integs.map((i) => i.contaCanalId));

  const porId = new Map(
    ((contas ?? []) as { id: string; nome: string; ativa: boolean }[]).map((c) => [c.id, c])
  );

  return integs
    .filter((i) => porId.get(i.contaCanalId)?.ativa !== false)
    .map((i) => ({ ...i, nome: porId.get(i.contaCanalId)?.nome ?? i.contaCanalId }));
}

/** O segredo da integração, ou null se ela ainda não tem um. */
export async function lerSegredo<T>(integ: Integracao | null): Promise<T | null> {
  if (!integ?.ref) return null;
  const { data, error } = await clientePrivilegiado().rpc("integracao_segredo_ler", {
    p_ref: integ.ref,
  });
  if (error) {
    if (semMigracao(error.code)) return null;
    throw new Error(`Não consegui ler o segredo do cofre: ${error.message}`);
  }
  if (!data) return null;
  try {
    return JSON.parse(data as string) as T;
  } catch {
    return null;
  }
}

/**
 * Grava o segredo e marca a integração como conectada.
 *
 * Devolve o erro em vez de lançar: quem chama costuma estar com uma
 * credencial recém-emitida em mãos, e derrubar a execução por falha de
 * gravação perderia o trabalho todo. A decisão de gritar ou seguir é de
 * quem chamou.
 */
export async function gravarSegredo(
  integ: Integracao,
  segredo: unknown,
  expiraEm?: string | null
) {
  const sb = clientePrivilegiado();
  const { data: ref, error } = await sb.rpc("integracao_segredo_gravar", {
    p_ref: integ.ref,
    p_nome: `integracao_${integ.id}`,
    p_segredo: JSON.stringify(segredo),
  });
  if (error) return error;
  const { error: e2 } = await sb
    .from("integracoes")
    .update({
      credencial_ref: ref as string,
      status: "conectada",
      expira_em: expiraEm ?? null,
      ultimo_erro: null,
    })
    .eq("id", integ.id);
  if (e2) return e2;
  integ.ref = ref as string;
  return null;
}

export async function registrarErro(
  provedor: string,
  contaCanalId: string,
  erro: string
): Promise<void> {
  const { error } = await clientePrivilegiado()
    .from("integracoes")
    .update({ status: "expirada", ultimo_erro: erro.slice(0, 500) })
    .eq("provedor", provedor)
    .eq("conta_canal_id", contaCanalId);
  if (error && !semMigracao(error.code)) {
    console.warn(`[integrações] Não consegui registrar a falha: ${error.message}`);
  }
}

/** Cria a linha de `integracoes` se ainda não existe. */
export async function garantirIntegracao(
  provedor: string,
  ctx: {
    operacaoId: string;
    canalId: string;
    contaCanalId: string;
    config?: Record<string, unknown>;
  }
): Promise<Integracao | null> {
  const existe = await integracaoDaConta(provedor, ctx.contaCanalId);
  if (existe) return existe;

  const { data, error } = await clientePrivilegiado()
    .from("integracoes")
    .insert({
      operacao_id: ctx.operacaoId,
      provedor,
      canal_id: ctx.canalId,
      conta_canal_id: ctx.contaCanalId,
      status: "conectada",
      config: ctx.config ?? {},
    })
    .select("id")
    .single();
  if (error) {
    if (!semMigracao(error.code)) {
      console.warn(`[integrações] Não consegui criar a integração: ${error.message}`);
    }
    return null;
  }
  return {
    id: data.id as string,
    operacaoId: ctx.operacaoId,
    canalId: ctx.canalId,
    contaCanalId: ctx.contaCanalId,
    ref: null,
    config: ctx.config ?? {},
  };
}
