/**
 * O que fazer com cada anúncio, em tráfego pago.
 *
 * ── Por que existe ──
 *
 * O relatório do canal responde "quanto gastei e quanto voltou". Ele não
 * responde as três perguntas que mandam na verba:
 *
 *   · onde a mídia está pagando a si mesma e dá para pôr mais dinheiro;
 *   · onde a mídia custa mais que a margem do próprio anúncio;
 *   · o que vende BEM SEM mídia e nunca entrou em campanha.
 *
 * A terceira é a que não existe em lugar nenhum: o painel de ads só conhece
 * o que já está anunciado. Quem converte alto com pouca visita é
 * exatamente o candidato a verba — tem oferta boa e falta gente vendo.
 *
 * ── Sem regra de dedo ──
 *
 * Os cortes são a MEDIANA do próprio recorte, não números fixos. "Conversão
 * alta" em colchão não é "conversão alta" em caneca, e um limite fixo
 * acertaria num cliente e erraria em todos os outros — e aqui todos os
 * clientes usam a mesma tela. A mediana se ajusta sozinha ao catálogo de
 * quem está olhando.
 *
 * ── O par que o canal confunde ──
 *
 * Investimento com receita atribuída zero são dois casos de ação OPOSTA:
 * o anúncio que não vendeu nada (desligar) e o que vendeu bem por fora
 * (a mídia sobrou). O relatório do canal mostra os dois iguais, porque não
 * sabe o faturamento real do anúncio. Aqui sabe.
 *
 * Esta função é pura de propósito: a classificação é o que decide dinheiro,
 * e `scripts/testar-oportunidades.mjs` tranca cada regra.
 */

export type AcaoAds = "escalar" | "entrar" | "rever_preco" | "desligar" | "midia_sobrou" | "manter";

export type EntradaOportunidade = {
  mlb: string;
  sku: string;
  titulo: string;
  conta: string;
  tipo: string;
  /** null = o canal não informa visita para este anúncio. */
  visitas: number | null;
  unidades: number;
  receitaReal: number;
  margem: number | null;
  margemPct: number | null;
  investimento: number;
  receitaAtribuida: number;
  estoque: number | null;
  status: string | null;
};

export type LinhaOportunidade = EntradaOportunidade & {
  /** Unidades por visita, em %. */
  conversao: number | null;
  acos: number | null;
  roas: number | null;
  sobraAposMidia: number | null;
  acao: AcaoAds;
  /** O número que sustenta a ação. Curto: é célula de tabela, não parágrafo. */
  motivo: string;
};

export type Referencias = {
  /** Mediana da conversão entre anúncios com visita suficiente, em %. */
  conversaoMediana: number | null;
  /** O teto de "ainda tem onde crescer": p75 das visitas do grupo com piso. */
  visitasTeto: number | null;
  /** O piso de visitas usado, para a tela poder dizer de onde vêm os cortes. */
  visitasMinimas: number;
  /** Quantos anúncios têm visita suficiente para a conversão significar algo. */
  comVisitaSuficiente: number;
  /** Quantos anúncios caíram em cada ação. */
  contagem: Record<AcaoAds, number>;
};

/**
 * Visitas mínimas para a conversão valer como medida.
 *
 * Medido na Probel, janela de 31 dias: a mediana de visitas por anúncio é 5
 * e o p90 é 70. Sem piso, a lista de "converte alto" enche de anúncio com
 * 1 visita e 1 venda — conversão de 100% que não quer dizer nada, e que
 * empurraria verba para o lugar errado com cara de dado. Com 20 visitas o
 * grupo cai para os ~180 anúncios em que a taxa tem o que medir.
 */
export const VISITAS_MINIMAS = 20;

/** Unidades mínimas: uma venda só não distingue sorte de demanda. */
export const UNIDADES_MINIMAS = 2;

export const ROTULO_ACAO: Record<AcaoAds, string> = {
  escalar: "Pôr mais verba",
  entrar: "Entrar no ads",
  rever_preco: "Rever preço ou lance",
  desligar: "Desligar",
  midia_sobrou: "A mídia sobrou",
  manter: "Manter",
};

const r2 = (v: number) => Number(v.toFixed(2));
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const reais = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Mediana, e não média: um anúncio com 40 mil visitas puxaria a média sozinho. */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export function classificarOportunidades(entradas: EntradaOportunidade[]): {
  linhas: LinhaOportunidade[];
  referencias: Referencias;
} {
  const conv = (e: EntradaOportunidade) =>
    e.visitas != null && e.visitas > 0 ? r2((e.unidades * 100) / e.visitas) : null;

  /*
   * Os cortes saem do grupo com visita SUFICIENTE, não do catálogo inteiro.
   *
   * Duas razões. A mediana sobre todo mundo cairia para perto de zero, com
   * metade do catálogo sem venda — e aí qualquer coisa viraria "conversão
   * alta". E incluir anúncio de 1 visita contamina a própria mediana com
   * taxas de 50% e 100% que são ruído de amostra pequena.
   */
  const base = entradas.filter((e) => e.visitas != null && e.visitas >= VISITAS_MINIMAS);
  const conversaoMediana = mediana(base.filter((e) => e.unidades > 0).map((e) => conv(e)!));
  /* O p75 das visitas marca "já é bem visto": acima dele, mais tráfego pago
     é empurrar gente para onde já tem gente. */
  const visitasOrdenadas = base.map((e) => e.visitas!).sort((a, b) => a - b);
  const visitasTeto = visitasOrdenadas.length
    ? visitasOrdenadas[Math.min(visitasOrdenadas.length - 1, Math.floor(visitasOrdenadas.length * 0.75))]
    : null;

  const linhas = entradas.map((e): LinhaOportunidade => {
    const conversao = conv(e);
    const acos = e.receitaAtribuida > 0 && e.investimento > 0 ? r2((e.investimento * 100) / e.receitaAtribuida) : null;
    const roas = e.investimento > 0 && e.receitaAtribuida > 0 ? r2(e.receitaAtribuida / e.investimento) : null;
    const sobraAposMidia = e.margem == null ? null : r2(e.margem - e.investimento);
    const temEstoque = e.estoque == null || e.estoque > 0;
    const ativo = e.status == null || e.status === "ativo";

    let acao: AcaoAds = "manter";
    let motivo = "";

    if (e.investimento > 0 && e.receitaAtribuida === 0 && e.receitaReal === 0) {
      acao = "desligar";
      motivo = `${reais(e.investimento)} sem venda nenhuma`;
    } else if (e.investimento > 0 && e.receitaAtribuida === 0 && e.receitaReal > 0) {
      acao = "midia_sobrou";
      motivo = `vendeu ${reais(e.receitaReal)} sem a mídia creditar nada`;
    } else if (e.investimento > 0 && acos != null && e.margemPct != null && acos > e.margemPct) {
      /* A mídia custa mais do que o anúncio deixa. Não é "ACOS alto" no
         abstrato: é ACOS acima da margem DESTE anúncio, que é o ponto em
         que cada venda da mídia passa a tirar dinheiro. */
      acao = "rever_preco";
      motivo = `ACOS ${pct(acos)} acima da margem de ${pct(e.margemPct)}`;
    } else if (
      e.investimento > 0 &&
      acos != null &&
      e.margemPct != null &&
      acos <= e.margemPct / 2 &&
      sobraAposMidia != null &&
      sobraAposMidia > 0 &&
      temEstoque
    ) {
      acao = "escalar";
      motivo = `ACOS ${pct(acos)} contra margem de ${pct(e.margemPct)} — sobra ${reais(sobraAposMidia)}`;
    } else if (
      e.investimento === 0 &&
      conversao != null &&
      conversaoMediana != null &&
      visitasTeto != null &&
      e.visitas! >= VISITAS_MINIMAS &&
      e.unidades >= UNIDADES_MINIMAS &&
      conversao >= conversaoMediana &&
      e.visitas! <= visitasTeto &&
      (e.margemPct == null || e.margemPct > 0) &&
      temEstoque &&
      ativo
    ) {
      /* Converte acima da mediana e ainda não é dos mais vistos: a oferta
         já convence, falta gente vendo. É o único grupo que o painel do
         canal não tem como mostrar, porque ele só conhece quem já anuncia. */
      acao = "entrar";
      motivo = `converte ${pct(conversao)} contra mediana de ${pct(conversaoMediana)}, com ${e.visitas!.toLocaleString("pt-BR")} visitas`;
    }

    return { ...e, conversao, acos, roas, sobraAposMidia, acao, motivo };
  });

  const contagem = { escalar: 0, entrar: 0, rever_preco: 0, desligar: 0, midia_sobrou: 0, manter: 0 } as Record<AcaoAds, number>;
  for (const l of linhas) contagem[l.acao] += 1;

  /* Ordem de abertura: o que custa dinheiro agora primeiro, depois o que
     ganha dinheiro, e "manter" no fim. Dentro de cada grupo, pelo valor em
     jogo — gasto para quem gasta, margem para quem rende. */
  const peso: Record<AcaoAds, number> = { desligar: 0, rever_preco: 1, midia_sobrou: 2, escalar: 3, entrar: 4, manter: 5 };
  linhas.sort(
    (a, b) =>
      peso[a.acao] - peso[b.acao] ||
      b.investimento - a.investimento ||
      (b.margem ?? 0) - (a.margem ?? 0) ||
      b.receitaReal - a.receitaReal
  );

  return {
    linhas,
    referencias: {
      conversaoMediana,
      visitasTeto,
      visitasMinimas: VISITAS_MINIMAS,
      comVisitaSuficiente: base.length,
      contagem,
    },
  };
}
