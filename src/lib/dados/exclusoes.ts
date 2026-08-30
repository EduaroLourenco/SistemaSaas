import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * Períodos que a análise ignora — sem apagar nada do banco.
 *
 * Existe para o caso do lote: 27/08 trouxe 129 pedidos da Loja própria,
 * 117 cancelados, vários com o mesmo valor e códigos em sequência. O
 * registro é verdadeiro; o evento é de sistema, não de operação. Deixado
 * dentro, ele leva o cancelamento da semana a 63% e a receita a +128%, e
 * toda leitura acima dele fica errada.
 *
 * ── A regra que não pode ser esquecida ──
 *
 * Exclusão silenciosa é mais perigosa que o número torto que corrige.
 * Quem abre a tela precisa saber que está vendo um recorte, e quanto o
 * recorte mudou — senão a ferramenta passa a mentir com aparência de
 * precisão. Por isso `aplicar()` devolve o que foi removido, e não só o
 * que sobrou: a tela é obrigada a ter o número para mostrar.
 */

export type Exclusao = {
  id: string;
  dataInicio: string;
  dataFim: string;
  canalId: string | null;
  canal: string | null;
  contaCanalId: string | null;
  conta: string | null;
  motivo: string;
  criadoEm: string;
};

/**
 * O PostgREST devolve relação embutida ora como objeto, ora como array,
 * dependendo de como infere a cardinalidade. Normalizar aqui evita um
 * `undefined` que só apareceria em produção, com a tela já montada.
 */
function nomeDe(v: unknown): string | null {
  if (!v) return null;
  const alvo = Array.isArray(v) ? v[0] : v;
  const nome = (alvo as { nome?: unknown } | undefined)?.nome;
  return typeof nome === "string" ? nome : null;
}

export async function carregarExclusoes(): Promise<Exclusao[]> {
  const sb = await clienteServidor();
  const { data, error } = await sb
    .from("exclusoes_analise")
    .select(
      "id,data_inicio,data_fim,canal_id,conta_canal_id,motivo,criado_em,canais(nome),contas_canal(nome)"
    )
    .order("data_inicio", { ascending: false });

  if (error) {
    // Uma exclusão que não carrega não pode derrubar a tela: o pior caso
    // é mostrar o dado bruto, que é o que existia antes desta funcionalidade.
    console.warn("[exclusoes] não consegui ler:", error.message);
    return [];
  }

  return (data ?? []).map((e) => ({
    id: e.id as string,
    dataInicio: String(e.data_inicio).slice(0, 10),
    dataFim: String(e.data_fim).slice(0, 10),
    canalId: (e.canal_id as string | null) ?? null,
    canal: nomeDe(e.canais),
    contaCanalId: (e.conta_canal_id as string | null) ?? null,
    conta: nomeDe(e.contas_canal),
    motivo: e.motivo as string,
    criadoEm: e.criado_em as string,
  }));
}

/** O que uma linha precisa ter para ser testada contra as exclusões. */
export type Excluivel = {
  data: string;
  canalId?: string | null;
  contaCanalId?: string | null;
};

/**
 * A linha cai numa exclusão?
 *
 * A regra vai do geral ao específico: sem canal, exclui o dia inteiro;
 * com canal e sem conta, exclui o canal inteiro naquele dia; com os dois,
 * só aquela conta. É o que permite "descartar 27/08 na Loja própria" sem
 * perder o Mercado Livre do mesmo dia.
 */
export function estaExcluido(linha: Excluivel, exclusoes: Exclusao[]): boolean {
  const dia = String(linha.data).slice(0, 10);

  return exclusoes.some((e) => {
    if (dia < e.dataInicio || dia > e.dataFim) return false;
    if (!e.canalId) return true;
    if (e.canalId !== linha.canalId) return false;
    if (!e.contaCanalId) return true;
    return e.contaCanalId === linha.contaCanalId;
  });
}

export type Aplicacao<T> = {
  mantidas: T[];
  /** Quantas linhas saíram. A tela é obrigada a mostrar. */
  removidas: number;
  /** Os dias efetivamente atingidos, para nomear o que sumiu. */
  diasAtingidos: string[];
};

export function aplicar<T extends Excluivel>(
  linhas: T[],
  exclusoes: Exclusao[]
): Aplicacao<T> {
  if (!exclusoes.length) {
    return { mantidas: linhas, removidas: 0, diasAtingidos: [] };
  }

  const mantidas: T[] = [];
  const dias = new Set<string>();

  for (const l of linhas) {
    if (estaExcluido(l, exclusoes)) {
      dias.add(String(l.data).slice(0, 10));
      continue;
    }
    mantidas.push(l);
  }

  return {
    mantidas,
    removidas: linhas.length - mantidas.length,
    diasAtingidos: [...dias].sort(),
  };
}

/** Frase curta para o aviso na tela. */
export function resumo(exclusoes: Exclusao[]): string {
  if (!exclusoes.length) return "";
  if (exclusoes.length === 1) {
    const e = exclusoes[0];
    const periodo =
      e.dataInicio === e.dataFim
        ? dataBr(e.dataInicio)
        : `${dataBr(e.dataInicio)} a ${dataBr(e.dataFim)}`;
    return e.canal ? `${periodo} · ${e.canal}` : periodo;
  }
  return `${exclusoes.length} períodos`;
}

function dataBr(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}
