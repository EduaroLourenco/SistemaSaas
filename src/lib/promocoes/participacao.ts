/**
 * Em que promoção um anúncio estava, em que dia — e o efeito de entrar.
 *
 * ── Por que existe ──
 *
 * O "deu certo?" do Planejamento media só promoção que passou pela
 * planilha, a partir do dia em que a planilha foi processada. Em 22/11/2026
 * eram 8.960 participações "started" vindas da API do Meli fora da conta —
 * SMART, DEAL, cupom, pré-acordo, que nunca passam por planilha — e a data
 * usada não era a de entrada real.
 *
 * ── Status não serve para dizer se estava no ar ──
 *
 * A sincronização tira um retrato: item que saiu da promoção continua
 * "started", com a data de fim. Então "no ar no dia D" é início ≤ D ≤ fim,
 * nunca o status.
 *
 * ── A medição ──
 *
 * Cada anúncio entra num dia diferente (SMART aceita aos poucos). Medir todo
 * mundo a partir do início da promoção misturaria antes e depois. Aqui cada
 * entrada tem a própria janela: até 14 dias depois de entrar, contra o mesmo
 * número de dias logo antes. O controle (convites não aceitos da mesma
 * promoção) é medido nas MESMAS datas de cada entrada, pesado pelo número de
 * entradas daquele dia — a mesma comparação, só a decisão de entrar mudando.
 *
 * Sem banco e sem `server-only`, para o teste rodar a regra de verdade.
 */

export type Origem = "Meli" | "Gerizo" | "planilha";

export type Entrada = {
  anuncioId: string;
  /** aaaa-mm-dd, no fuso de São Paulo. */
  inicio: string;
  fim: string | null;
};

const MS_DIA = 86400000;
const utc = (s: string) => Date.parse(`${s}T00:00:00Z`);
export const somarDias = (s: string, n: number) => new Date(utc(s) + n * MS_DIA).toISOString().slice(0, 10);
export const diasEntre = (a: string, b: string) => Math.round((utc(b) - utc(a)) / MS_DIA);

const fmtSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
/** "2026-10-31T23:00:00+00:00" → "2026-10-31" (20h em São Paulo). */
export function diaSP(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? fmtSP.format(new Date(t)) : null;
}

/** Estava no ar no dia? Pelas datas, não pelo status. */
export const noAr = (e: Pick<Entrada, "inicio" | "fim">, dia: string) => e.inicio <= dia && (e.fim == null || dia <= e.fim);

export type Medicao = {
  medidas: number;
  /** Entradas com menos de `minimo` dias completos: ainda não dá para ler. */
  cedo: number;
  /** Mediana da janela de cada entrada, em dias. */
  dias: number;
  desde: string | null;
  participantes: { antes: number; agora: number };
  controle: { antes: number; agora: number };
  crescimento: number | null;
  crescimentoControle: number | null;
  efeito: number | null;
  /** Janela de cada entrada medida, para detalhar por anúncio. */
  janelas: { anuncioId: string; antesIni: string; antesFim: string; ini: string; fim: string }[];
};

const pct = (agora: number, antes: number) => (antes > 0 ? ((agora - antes) / antes) * 100 : null);
const r2 = (v: number) => Math.round(v * 100) / 100;

export function medirEntradas({
  entradas,
  controle,
  somar,
  hoje,
  janela = 14,
  minimo = 7,
}: {
  entradas: Entrada[];
  controle: string[];
  somar: (ids: string[], de: string, ate: string) => number;
  hoje: string;
  janela?: number;
  minimo?: number;
}): Medicao {
  const ontem = somarDias(hoje, -1);
  const grupos = new Map<string, { antesIni: string; antesFim: string; ini: string; fim: string; ids: string[] }>();
  const tamanhos: number[] = [];
  let cedo = 0;
  for (const e of entradas) {
    const fim = [somarDias(e.inicio, janela - 1), e.fim ?? ontem, ontem].sort()[0];
    const d = diasEntre(e.inicio, fim) + 1;
    if (d < minimo) {
      cedo++;
      continue;
    }
    tamanhos.push(d);
    const k = `${e.inicio}|${fim}`;
    const g = grupos.get(k) ?? { antesIni: somarDias(e.inicio, -d), antesFim: somarDias(e.inicio, -1), ini: e.inicio, fim, ids: [] };
    g.ids.push(e.anuncioId);
    grupos.set(k, g);
  }

  const p = { antes: 0, agora: 0 };
  const c = { antes: 0, agora: 0 };
  const janelas: Medicao["janelas"] = [];
  for (const g of grupos.values()) {
    p.antes += somar(g.ids, g.antesIni, g.antesFim);
    p.agora += somar(g.ids, g.ini, g.fim);
    if (controle.length) {
      // Pesado pelo número de entradas do dia: cada entrada tem o seu controle.
      c.antes += g.ids.length * somar(controle, g.antesIni, g.antesFim);
      c.agora += g.ids.length * somar(controle, g.ini, g.fim);
    }
    for (const id of g.ids) janelas.push({ anuncioId: id, antesIni: g.antesIni, antesFim: g.antesFim, ini: g.ini, fim: g.fim });
  }
  tamanhos.sort((a, b) => a - b);
  const crescimento = pct(p.agora, p.antes);
  const crescimentoControle = pct(c.agora, c.antes);
  return {
    medidas: tamanhos.length,
    cedo,
    dias: tamanhos.length ? tamanhos[Math.floor(tamanhos.length / 2)] : 0,
    desde: janelas.map((j) => j.ini).sort()[0] ?? null,
    participantes: { antes: r2(p.antes), agora: r2(p.agora) },
    // A soma pesada não é receita de verdade: dividida pelas entradas, é a
    // receita do controle numa janela típica — a mesma razão, em reais.
    controle: tamanhos.length ? { antes: r2(c.antes / tamanhos.length), agora: r2(c.agora / tamanhos.length) } : c,
    crescimento,
    crescimentoControle,
    efeito: crescimento != null && crescimentoControle != null ? crescimento - crescimentoControle : null,
    janelas,
  };
}
