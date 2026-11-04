import { nomePromocao } from "./promocao-rotulos";
import type { PromocaoAberta, ContagemPromocao } from "./dados/automacoes";

/**
 * De promoção por conta para campanha.
 *
 * O canal devolve uma linha por CONTA; a decisão é por CAMPANHA. A mesma
 * campanha existe nas duas contas da Probel — 11.11 da Black, Black
 * Friday 2026, Pre Acordo Casa e a relâmpago do canal vinham duas vezes
 * na tela, 17 cartões para 13 campanhas, e era metade da confusão.
 *
 * Mora fora da tela porque é a única parte com conta para errar, e o
 * `scripts/testar-agenda-promocoes.mjs` roda em cima dela.
 */

export type Campanha = {
  codigo: string;
  tipo: string;
  /** Já resolvido: LIGHTNING vem sem `name` do canal. */
  nome: string;
  /**
   * Prazo de ACEITE, o mais curto entre as contas. É ele que manda na
   * urgência — e é só `deadline_date`, nunca o fim da campanha.
   *
   * A tela antiga caía em `fim` quando não havia prazo, e com isso
   * escrevia "aceite até 19 de dez." no cupom, que não tem prazo de
   * aceite nenhum: a data era o fim da campanha. Uma data certa no
   * lugar errado é pior que travessão.
   */
  prazo: string | null;
  /** Quando a campanha acaba. Contexto, não prazo. */
  fim: string | null;
  dias: number | null;
  contas: { promocao: PromocaoAberta; contagem: ContagemPromocao | null }[];
  noAr: number;
  agendados: number;
  pendentes: number;
  /** Alguma conta não respondeu: o total é parcial, e não é zero. */
  incerto: boolean;
  /** Quanto o canal põe, em pontos. Null é "esta campanha não tem". */
  rebate: { de: number; ate: number } | null;
};

/* O prazo é a espinha da tela: o que vence antes aparece antes, e o que
   não tem prazo não se mistura com o que tem. */
export const GRUPOS: { titulo: string; cabe: (d: number | null) => boolean }[] = [
  { titulo: "Vence esta semana", cabe: (d) => d != null && d <= 9 },
  { titulo: "Vence este mês", cabe: (d) => d != null && d > 9 && d <= 45 },
  { titulo: "Depois", cabe: (d) => d != null && d > 45 },
  { titulo: "Sem prazo de aceite", cabe: (d) => d == null },
];

export const diasAte = (iso: string | null, agora: number = Date.now()) =>
  iso == null ? null : Math.round((new Date(iso).getTime() - agora) / 86_400_000);

export function agruparCampanhas(
  promocoes: PromocaoAberta[],
  contagens: Map<string, ContagemPromocao | null>,
  agora: number = Date.now()
): Campanha[] {
  const porCodigo = new Map<string, Campanha>();

  for (const p of promocoes) {
    let c = porCodigo.get(p.codigo);
    if (!c) {
      c = {
        codigo: p.codigo, tipo: p.tipo, nome: nomePromocao(p.tipo, p.nome),
        prazo: p.prazo, fim: p.fim, dias: null, contas: [],
        noAr: 0, agendados: 0, pendentes: 0, incerto: false, rebate: null,
      };
      porCodigo.set(p.codigo, c);
    }
    /* O prazo da campanha é o MAIS CURTO entre as contas: é o que não
       dá para deixar para amanhã. */
    if (p.prazo && (!c.prazo || p.prazo < c.prazo)) c.prazo = p.prazo;
    if (p.fim && (!c.fim || p.fim < c.fim)) c.fim = p.fim;
    c.contas.push({ promocao: p, contagem: contagens.get(p.contaId + p.codigo) ?? null });
  }

  for (const c of porCodigo.values()) {
    c.dias = diasAte(c.prazo, agora);
    /* Quem tem mais esperando resposta aparece primeiro no botão. */
    c.contas.sort((a, b) => (b.contagem?.pendentes ?? 0) - (a.contagem?.pendentes ?? 0));
    for (const { contagem } of c.contas) {
      c.noAr += contagem?.participando ?? 0;
      c.agendados += contagem?.agendados ?? 0;
      c.pendentes += contagem?.pendentes ?? 0;
      /* Conta sem resposta do canal não vira zero: vira "não sei". */
      if (contagem?.pendentes == null) c.incerto = true;
      const r = contagem?.rebate;
      if (r) {
        c.rebate = c.rebate
          ? { de: Math.min(c.rebate.de, r.de), ate: Math.max(c.rebate.ate, r.ate) }
          : r;
      }
    }
  }

  return [...porCodigo.values()];
}

/** O número que decide a tela: o que espera resposta e vence primeiro. */
export function oQueNaoEspera(campanhas: Campanha[]) {
  const urgentes = campanhas.filter((c) => GRUPOS[0].cabe(c.dias));
  return {
    urgentes,
    /* Clampado em zero: campanha vencida ainda é "vence hoje" para quem
       está lendo, e "em até -2 dias" não é frase. */
    prazo: urgentes.length ? Math.max(0, ...urgentes.map((c) => c.dias ?? 0)) : null,
    esperando: urgentes.reduce((s, c) => s + c.pendentes, 0),
  };
}
