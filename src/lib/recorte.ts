/**
 * Recorte por canal OU por conta — o filtro único das telas.
 *
 * O Mercado Livre opera duas contas no mesmo canal: pronta entrega e venda
 * a prazo. Filtrar só por canal soma as duas e esconde justamente a
 * comparação que interessa; filtrar só por conta obriga a escolher uma
 * antes de ver o total. As telas precisam das três leituras: a conta A, a
 * conta B e o canal inteiro.
 *
 * Um parâmetro só na URL (`canal`) carrega as duas formas:
 *
 *   ?canal=<uuid do canal>        o canal inteiro, todas as contas
 *   ?canal=conta:<uuid da conta>  uma conta
 *
 * Um parâmetro e não dois porque os dois nunca valem juntos — e porque os
 * links antigos, que já mandavam o uuid do canal, continuam funcionando.
 *
 * Sem `server-only`: é lógica pura, e a tela usa as mesmas funções para
 * montar o seletor e rotular o que está filtrado.
 */

export type Recorte = { canalId?: string; contaCanalId?: string };

export type ContaDoRecorte = {
  contaId: string;
  contaNome: string;
  canalId: string;
  canalNome: string;
};

export type OpcaoRecorte = { valor: string; rotulo: string };
export type GrupoRecorte = { rotulo?: string; opcoes: OpcaoRecorte[] };

const PREFIXO_CONTA = "conta:";

export function lerRecorte(valor?: string | null): Recorte {
  const v = (valor ?? "").trim();
  if (!v) return {};
  if (v.startsWith(PREFIXO_CONTA)) {
    const id = v.slice(PREFIXO_CONTA.length);
    return id ? { contaCanalId: id } : {};
  }
  return { canalId: v };
}

export function valorRecorte(r: Recorte): string {
  if (r.contaCanalId) return PREFIXO_CONTA + r.contaCanalId;
  return r.canalId ?? "";
}

/**
 * A linha pertence ao recorte?
 *
 * Recebe canal E conta da linha porque o recorte por canal tem que
 * aceitar qualquer conta dele, e o por conta, só a sua.
 */
export function noRecorte(
  r: Recorte,
  linha: { canalId?: string | null; contaCanalId?: string | null }
): boolean {
  if (r.contaCanalId) return linha.contaCanalId === r.contaCanalId;
  if (r.canalId) return linha.canalId === r.canalId;
  return true;
}

/**
 * Quantas contas o canal do recorte tem.
 *
 * Serve às metas, que são gravadas por CANAL: a meta do Mercado Livre é
 * das duas contas juntas. Olhando uma conta só de um canal com duas, a
 * meta inteira ao lado faria a conta parecer sempre abaixo do alvo.
 */
export function contasNoCanal(contas: ContaDoRecorte[], canalId: string): number {
  return contas.filter((c) => c.canalId === canalId).length;
}

/** O recorte é uma conta que divide o canal com outra? */
export function recorteParcial(r: Recorte, contas: ContaDoRecorte[]): boolean {
  if (!r.contaCanalId) return false;
  const conta = contas.find((c) => c.contaId === r.contaCanalId);
  return conta ? contasNoCanal(contas, conta.canalId) > 1 : false;
}

/** Canal da conta do recorte — para o que só existe por canal. */
export function canalDoRecorte(r: Recorte, contas: ContaDoRecorte[]): string | undefined {
  if (r.canalId) return r.canalId;
  if (r.contaCanalId) return contas.find((c) => c.contaId === r.contaCanalId)?.canalId;
  return undefined;
}

/**
 * As opções do seletor.
 *
 * Canal de conta única vira uma opção só: "Amazon — Conta principal" seria
 * ruído. Canal com várias contas vira um grupo: primeiro o canal inteiro,
 * depois cada conta. A ordem já diz a relação, sem legenda.
 */
export function opcoesRecorte(
  contas: ContaDoRecorte[],
  rotuloTodos = "Todos os canais"
): GrupoRecorte[] {
  const porCanal = new Map<string, ContaDoRecorte[]>();
  for (const c of contas) {
    const lista = porCanal.get(c.canalId) ?? [];
    lista.push(c);
    porCanal.set(c.canalId, lista);
  }

  const canais = [...porCanal.values()].sort((a, b) =>
    a[0].canalNome.localeCompare(b[0].canalNome, "pt-BR")
  );

  const grupos: GrupoRecorte[] = [{ opcoes: [{ valor: "", rotulo: rotuloTodos }] }];
  let soltas: OpcaoRecorte[] = [];

  for (const lista of canais) {
    const canal = lista[0];
    if (lista.length === 1) {
      soltas.push({ valor: canal.canalId, rotulo: canal.canalNome });
      continue;
    }
    // Fecha as soltas antes do grupo, para manter a ordem alfabética.
    if (soltas.length) {
      grupos.push({ opcoes: soltas });
      soltas = [];
    }
    grupos.push({
      rotulo: canal.canalNome,
      opcoes: [
        { valor: canal.canalId, rotulo: `${canal.canalNome} — todas as contas` },
        ...[...lista]
          .sort((a, b) => a.contaNome.localeCompare(b.contaNome, "pt-BR"))
          .map((c) => ({ valor: PREFIXO_CONTA + c.contaId, rotulo: c.contaNome })),
      ],
    });
  }
  if (soltas.length) grupos.push({ opcoes: soltas });
  return grupos;
}

/** Rótulo curto do recorte atual, para cabeçalho e exportação. */
export function nomeRecorte(
  r: Recorte,
  contas: ContaDoRecorte[],
  rotuloTodos = "Todos os canais"
): string {
  if (r.contaCanalId) {
    const c = contas.find((x) => x.contaId === r.contaCanalId);
    if (!c) return rotuloTodos;
    return contasNoCanal(contas, c.canalId) > 1 ? `${c.canalNome} — ${c.contaNome}` : c.canalNome;
  }
  if (r.canalId) {
    const c = contas.find((x) => x.canalId === r.canalId);
    return c?.canalNome ?? rotuloTodos;
  }
  return rotuloTodos;
}
