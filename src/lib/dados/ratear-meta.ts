/**
 * O rateio da meta: do valor do mês até o alvo de cada dia.
 *
 * Sem dependência de servidor, para poder ser testado fora do Next — é
 * uma conta com três armadilhas conhecidas, e todas já custaram caro em
 * planilhas por aí.
 *
 * ── Armadilha 1: o arredondamento não fecha ──
 *
 * Ratear R$ 100.000 entre três canais de peso igual dá 33.333,33 cada,
 * que somam 99.999,99. Um centavo some. Distribuído por 30 dias e 8
 * canais, somem trinta centavos — pouco em dinheiro, e o bastante para
 * alguém perguntar por que a soma das metas não bate com a meta.
 *
 * A correção vai na maior fatia, que é onde o centavo desaparece na
 * proporção.
 *
 * ── Armadilha 2: o dia manual ──
 *
 * Fixar um dia não pode nem ser apagado pelo próximo recálculo, nem
 * estourar o total do mês. O que se fixa sai do bolo: o rateio soma os
 * dias manuais, subtrai do mês e divide o RESTO entre os outros dias.
 *
 * ── Armadilha 3: o resto negativo ──
 *
 * Se os dias fixados já passam da meta do mês, não há o que distribuir.
 * Aí os demais dias recebem zero e a função avisa — em vez de devolver
 * números negativos que apareceriam como alvo na tela.
 */

export type PesoCanal = {
  canalId: string;
  peso: number;
  /**
   * Valor fixado à mão para este canal.
   *
   * Mesma regra do dia manual: o que se fixa SAI DO BOLO. O rateio soma
   * os fixados, subtrai do total e divide o resto entre os demais pelos
   * pesos deles. O mês continua fechando no número que se digitou.
   *
   * Existe porque a sazonalidade dos 90 dias é uma boa base e uma péssima
   * ordem. Quando a operação sabe algo que o histórico não sabe — uma
   * campanha contratada, um canal que vai entrar em férias coletivas — ela
   * precisa poder dizer o número daquele canal sem abrir mão da
   * distribuição automática de todos os outros.
   */
  fixo?: number;
};

export type FatiaCanal = {
  canalId: string;
  valor: number;
  peso: number;
  /** Veio de `fixo`, não do rateio. */
  manual: boolean;
};

export type RateioCanais = {
  fatias: FatiaCanal[];
  /** Soma dos canais fixados à mão. */
  fixado: number;
  /** Quanto sobrou para os canais automáticos. */
  distribuido: number;
  /** Os fixados já passam da meta do mês? */
  estourou: boolean;
};

const r2 = (v: number) => Number(v.toFixed(2));

/**
 * Divide um total por pesos, garantindo que as fatias somem o total.
 *
 * Peso zero em todos — canal novo, sem histórico — cai em partes iguais:
 * é o único palpite honesto quando não há o que ponderar.
 *
 * Canal com `fixo` não entra no rateio: recebe o valor pedido e o resto
 * se divide entre os outros. Se os fixados já passam do total, os
 * automáticos ficam em zero e `estourou` avisa — em vez de devolver
 * negativo, que apareceria como alvo na tela.
 */
export function ratearCanais(total: number, pesos: PesoCanal[]): RateioCanais {
  if (!pesos.length) {
    return { fatias: [], fixado: 0, distribuido: 0, estourou: false };
  }

  const manuais = pesos.filter((p) => p.fixo != null);
  const livres = pesos.filter((p) => p.fixo == null);

  const fixado = r2(manuais.reduce((s, p) => s + Math.max(0, p.fixo ?? 0), 0));
  const resto = r2(total - fixado);
  const estourou = resto < 0;

  const somaPesos = livres.reduce((s, p) => s + Math.max(0, p.peso), 0);
  const iguais = somaPesos <= 0;

  const calculadas: FatiaCanal[] = livres.map((p) => {
    const fracao = iguais ? 1 / (livres.length || 1) : Math.max(0, p.peso) / somaPesos;
    return {
      canalId: p.canalId,
      valor: estourou ? 0 : r2(resto * fracao),
      peso: r2(fracao * 100),
      manual: false,
    };
  });

  if (!estourou && calculadas.length) ajustarSobra(calculadas, resto);

  const fixas: FatiaCanal[] = manuais.map((p) => ({
    canalId: p.canalId,
    valor: r2(Math.max(0, p.fixo ?? 0)),
    // O peso mostrado é a fatia REAL do total, não o peso histórico: é o
    // que responde "quanto deste mês é deste canal", que é a pergunta.
    peso: total > 0 ? r2((Math.max(0, p.fixo ?? 0) * 100) / total) : 0,
    manual: true,
  }));

  // Devolve na ordem em que entrou, para a tabela não dançar quando
  // alguém fixa um canal.
  const porId = new Map([...calculadas, ...fixas].map((f) => [f.canalId, f]));
  const fatias = pesos
    .map((p) => porId.get(p.canalId))
    .filter((f): f is FatiaCanal => Boolean(f));

  return { fatias, fixado, distribuido: estourou ? 0 : resto, estourou };
}

/**
 * A forma antiga: só o rateio, sem fixos.
 *
 * Mantida porque três chamadas ainda a usam e ela nunca precisou de mais
 * que isso. Por dentro é `ratearCanais`, para não existirem duas contas.
 */
export function ratearPorPeso(total: number, pesos: PesoCanal[]): FatiaCanal[] {
  return ratearCanais(total, pesos).fatias;
}

export type DiaMeta = {
  data: string;
  /** Peso relativo do dia. Tipicamente o padrão do dia da semana. */
  peso: number;
  /** Fixado à mão: não entra no rateio, sai do bolo. */
  manual?: boolean;
  /** O valor fixado, quando manual. */
  valor?: number;
};

export type RateioDiario = {
  dias: { data: string; valor: number; manual: boolean }[];
  /** Quanto sobrou para os dias não fixados. */
  distribuido: number;
  /** Soma dos dias fixados à mão. */
  fixado: number;
  /** Os fixados já passam da meta do mês? */
  estourou: boolean;
};

/**
 * Divide a meta do mês entre os dias, preservando os fixados.
 *
 * O peso do dia vem do histórico de dia da semana: sábado que vende
 * metade de uma terça recebe metade da meta. Dividir igual entre 30 dias
 * produz um alvo que ninguém bate no domingo e que todos batem na
 * segunda — e uma meta que só é atingida em dias fáceis não orienta nada.
 */
export function ratearNoMes(
  metaDoMes: number,
  dias: DiaMeta[]
): RateioDiario {
  const manuais = dias.filter((d) => d.manual);
  const livres = dias.filter((d) => !d.manual);

  const fixado = r2(manuais.reduce((s, d) => s + (d.valor ?? 0), 0));
  const resto = r2(metaDoMes - fixado);
  const estourou = resto < 0;

  const somaPesos = livres.reduce((s, d) => s + Math.max(0, d.peso), 0);
  const iguais = somaPesos <= 0;

  const calculados = livres.map((d) => {
    if (estourou) return { data: d.data, valor: 0, manual: false };
    const fracao = iguais ? 1 / (livres.length || 1) : Math.max(0, d.peso) / somaPesos;
    return { data: d.data, valor: r2(resto * fracao), manual: false };
  });

  if (!estourou && calculados.length) ajustarSobra(calculados, resto);

  const todos = [
    ...calculados,
    ...manuais.map((d) => ({
      data: d.data,
      valor: r2(d.valor ?? 0),
      manual: true,
    })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  return {
    dias: todos,
    distribuido: estourou ? 0 : resto,
    fixado,
    estourou,
  };
}

/**
 * Joga a diferença de arredondamento na maior fatia.
 *
 * Espalhar o centavo entre todos daria vários valores com terceira casa;
 * na maior fatia ele some na proporção e a soma fecha exata.
 */
function ajustarSobra(fatias: { valor: number }[], total: number): void {
  const soma = r2(fatias.reduce((s, f) => s + f.valor, 0));
  const dif = r2(total - soma);
  if (dif === 0) return;

  let maior = fatias[0];
  for (const f of fatias) if (f.valor > maior.valor) maior = f;
  maior.valor = r2(maior.valor + dif);
}

/**
 * Peso de cada dia da semana, a partir do histórico de receita.
 *
 * Devolve um número por dia da semana (0 = domingo) normalizado pela
 * média. Dia sem histórico recebe peso 1 — neutro, nem penalizado nem
 * favorecido.
 */
export function pesosDaSemana(
  historico: { data: string; receita: number }[]
): number[] {
  const soma = Array(7).fill(0);
  const contagem = Array(7).fill(0);

  for (const h of historico) {
    const d = new Date(`${h.data.slice(0, 10)}T00:00:00Z`).getUTCDay();
    soma[d] += h.receita;
    contagem[d] += 1;
  }

  const medias = soma.map((s, i) => (contagem[i] > 0 ? s / contagem[i] : 0));
  const comDado = medias.filter((m) => m > 0);
  if (!comDado.length) return Array(7).fill(1);

  const referencia = comDado.reduce((s, m) => s + m, 0) / comDado.length;
  // Um dia da semana sem venda nenhuma no histórico ainda recebe alvo: a
  // ausência pode ser do recorte, não do comportamento.
  return medias.map((m) => (m > 0 ? m / referencia : 1));
}

/**
 * O último dia do mês, em aaaa-mm-dd.
 *
 * Existe porque `${ano}-${mes}-31` como limite superior parecia inofensivo
 * e derrubava a tela inteira: o Postgres recusa "2026-09-31" com
 * "date/time field value out of range", e a consulta morre antes de
 * devolver qualquer linha. Setembro, abril, junho, novembro e fevereiro —
 * sete meses do ano quebram.
 */
export function ultimoDiaDoMes(ano: number, mes: number): string {
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** O primeiro dia do mês, em aaaa-mm-dd. */
export function primeiroDiaDoMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}
