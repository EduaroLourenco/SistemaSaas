/**
 * A causa de uma queda, escolhida a partir dos números do item.
 *
 * Fica em arquivo separado porque é a única parte da tela que decide algo
 * e não toca no banco: sem consulta, sem cliente de Supabase, nada de
 * `server-only`. Assim `scripts/testar-causa-queda.mjs` roda a decisão de
 * verdade, em vez de reescrevê-la — e um ajuste de regra que estrague um
 * caso aparece ali, não em produção.
 */
import type { Causa, Lado, LinhaQueda } from "./queda";

const r2 = (v: number) => Math.round(v * 100) / 100;
const pctVar = (agora: number | null, antes: number | null) =>
  agora != null && antes != null && antes > 0 ? ((agora - antes) / antes) * 100 : null;
/* ── A repartição da diferença ── */
export function repartir(antes: Lado, agora: Lado, delta: number): LinhaQueda["efeito"] {
  const vazio = { visitas: null, conversao: null, unidades: null, preco: 0 };
  if (antes.receita <= 0 || agora.receita <= 0) {
    // Um dos lados é zero: o logaritmo não existe. A queda inteira é volume.
    return { ...vazio, unidades: delta };
  }
  const lnR = Math.log(agora.receita / antes.receita);
  if (Math.abs(lnR) < 1e-9) return { ...vazio, unidades: 0 };
  const lnP = Math.log(agora.precoVendido! / antes.precoVendido!);
  const parte = (ln: number) => r2((delta * ln) / lnR);
  /*
   * Visita × conversão só quando quase toda a venda vem de anúncio com
   * visita. Produto vendido também em loja sem visita cairia numa conta
   * que mistura as duas; aí a leitura honesta é unidades × preço. A
   * conversão aqui é unidades TOTAIS ÷ visitas, para a soma fechar.
   */
  if (antes.visitas && agora.visitas && antes.cobertura >= 0.8 && agora.cobertura >= 0.8) {
    const lnV = Math.log(agora.visitas / antes.visitas);
    const lnC = Math.log(agora.unidades / agora.visitas / (antes.unidades / antes.visitas));
    return { visitas: parte(lnV), conversao: parte(lnC), unidades: null, preco: parte(lnP) };
  }
  const lnU = Math.log(agora.unidades / antes.unidades);
  return { visitas: null, conversao: null, unidades: parte(lnU), preco: parte(lnP) };
}

/* ── A causa, em palavras ── */
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
/** Sem sinal: o verbo já diz a direção ("caiu 40%", não "caiu -40%"). */
const abs = (v: number) => `${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const pc = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

export function diagnosticar(l: {
  antes: Lado;
  agora: Lado;
  delta: number;
  efeito: LinhaQueda["efeito"];
  diasSemEstoque: number;
  /** Dias com retrato de estoque no período — a base certa para a proporção. */
  diasObservados: number;
  /** Fração da queda que veio de anúncio com estoque acompanhado (0–1). */
  pesoAcompanhado: number;
  status: string | null;
  /** Estoque de hoje, se lido. Diz se a ruptura continua ou já passou. */
  estoqueAtual?: number | null;
  sobEncomenda?: boolean;
  catalogo?: LinhaQueda["catalogo"];
}): { causa: Causa; explicacao: string } {
  const { antes, agora, delta, efeito } = l;
  /*
   * Preço vendido com uma ou duas vendas não é evidência: uma venda com frete
   * embutido ou kit muda a média sozinha. A vitrine não tem esse problema —
   * é o preço anunciado, todo dia.
   */
  const amostraVendida = antes.unidades >= 3 && agora.unidades >= 3;
  const varPreco =
    pctVar(agora.precoVitrine, antes.precoVitrine) ??
    (amostraVendida ? pctVar(agora.precoVendido, antes.precoVendido) : null);
  const qualPreco = agora.precoVitrine != null && antes.precoVitrine != null ? "na vitrine" : "vendido";
  const varConv = pctVar(agora.conversao, antes.conversao);
  const varVis = pctVar(agora.visitas, antes.visitas);
  const varUn = pctVar(agora.unidades, antes.unidades);

  if (delta >= 0) {
    if (delta === 0) return { causa: "estável", explicacao: "Sem mudança no período." };
    return {
      causa: "cresceu",
      explicacao: antes.receita > 0
        ? `Subiu ${brl(delta)} (${pc((delta / antes.receita) * 100)}).`
        : `Começou a vender no período: ${brl(delta)}.`,
    };
  }

  // 1. Faltou produto: nada mais importa se não havia o que vender.
  /*
   * Só é a causa se a queda veio de onde o estoque é acompanhado. Produto
   * que caiu na loja própria com o anúncio do Meli zerado tem o Meli zerado
   * como fato, não como explicação.
   */
  if (l.diasSemEstoque >= 2 && l.diasSemEstoque >= l.diasObservados * 0.5 && l.pesoAcompanhado >= 0.5) {
    /* Se já reabasteceu, a ação é outra: não é repor, é esperar a venda
       voltar (ou cobrar o posicionamento que o anúncio perdeu parado). */
    const hoje = l.sobEncomenda
      ? " Hoje está sob encomenda."
      : l.estoqueAtual == null
        ? ""
        : l.estoqueAtual > 0
          ? ` Hoje já tem ${l.estoqueAtual.toLocaleString("pt-BR")} em estoque.`
          : " Hoje ainda está zerado.";
    return {
      causa: "sem estoque",
      explicacao:
        `Ficou sem estoque em ${l.diasSemEstoque} dos ${l.diasObservados} dias acompanhados. ` +
        `A queda é de disponibilidade, não de demanda.` + hoje,
    };
  }
  if (agora.unidades === 0 && l.status && l.status !== "active" && l.status !== "ativo") {
    return { causa: "pausado", explicacao: `O anúncio está ${l.status === "paused" ? "pausado" : l.status} e não vendeu no período.` };
  }

  /*
   * 2. O preço subiu e a venda caiu: a pergunta que a tela existe para
   *    responder.
   *
   * ── Por que a visita também conta ──
   *
   * A primeira versão exigia que a CONVERSÃO caísse, e lia visita caindo
   * como exposição. Está errado para este canal: no Mercado Livre o preço
   * aparece na BUSCA, antes do clique. Quem acha o produto caro não entra
   * no anúncio — então a visita cai por preço, e a conversão pode até
   * subir, porque sobra só quem já estava decidido a pagar.
   *
   * Pior: no catálogo, preço que perde a disputa tira o anúncio da posição
   * que recebe o tráfego, e a visita despenca sem nada ter piorado na
   * exposição paga. Os dois caminhos levam ao mesmo lugar — mexer no preço
   * —, por isso a causa é a mesma e a frase diz qual deles foi.
   *
   * ── O risco, e o que o contém ──
   *
   * Visita cai por muita coisa que não é preço (verba de anúncio, posição,
   * sazonalidade). Com a disputa do catálogo registrada, ela resolve: ter
   * perdido o primeiro lugar é prova; tê-lo mantido é contraprova, e aí a
   * causa volta a ser exposição. Sem registro nenhum, a frase assume a
   * dúvida em voz alta em vez de afirmar.
   */
  const cat = l.catalogo;
  const fatiaAntes = cat && cat.antes.dias > 0 ? cat.antes.ganhando / cat.antes.dias : null;
  const fatiaAgora = cat && cat.agora.dias > 0 ? cat.agora.ganhando / cat.agora.dias : null;
  /** Perdeu o primeiro lugar do catálogo de um período para o outro. */
  const perdeuCatalogo =
    fatiaAntes != null && fatiaAgora != null && fatiaAntes >= 0.5 && fatiaAgora <= fatiaAntes - 0.3;
  /** Seguiu ganhando: a visita que caiu não foi a posição do catálogo. */
  const manteveCatalogo = fatiaAntes != null && fatiaAgora != null && fatiaAgora >= 0.8;

  const convCaiu = varConv != null && varConv <= -10;
  const visitaCaiu = varVis != null && varVis <= -10;
  const unCaiu = varUn != null && varUn <= -10;
  // Sem visita registrada só restam as unidades, como antes.
  const vendaCaiu = varConv != null ? convCaiu : unCaiu;
  // Clique perdido: visita caiu, conversão não — e o catálogo não desmente.
  const cliquePerdido = visitaCaiu && !convCaiu && !manteveCatalogo;

  if (varPreco != null && varPreco >= 4 && (vendaCaiu || cliquePerdido)) {
    const comoCaiu = convCaiu
      ? visitaCaiu
        ? `a conversão caiu ${abs(varConv!)} e as visitas ${abs(varVis!)}`
        : `a conversão caiu ${abs(varConv!)} com as visitas mantidas`
      : visitaCaiu
        ? `as visitas caíram ${abs(varVis!)} com a conversão mantida`
        : `as unidades caíram ${abs(varUn ?? 0)}`;
    const prova = perdeuCatalogo
      ? ` O anúncio deixou de ganhar o catálogo (${cat!.antes.ganhando} de ${cat!.antes.dias} dias antes, ${cat!.agora.ganhando} de ${cat!.agora.dias} agora): a visita caiu porque o preço perdeu a posição.`
      : cliquePerdido && !convCaiu
        ? " No Mercado Livre o preço aparece na busca: quem achou caro não clicou. Vale conferir se também perdeu posição."
        : " Indício forte de que foi preço.";
    return {
      causa: "preço subiu",
      explicacao: `O preço ${qualPreco} subiu ${pc(varPreco)} e ${comoCaiu}.${prova}`,
    };
  }

  // 3. Recebe visita e não vende.
  if (agora.unidades === 0) {
    return agora.visitas
      ? {
          causa: "parou de vender",
          explicacao: `Recebeu ${agora.visitas.toLocaleString("pt-BR")} visitas e não vendeu nenhuma. Confira preço, frete e concorrente.`,
        }
      : { causa: "parou de vender", explicacao: "Nenhuma venda no período, e sem visita registrada." };
  }

  // 4. O fator que mais pesou.
  const fatores: [Causa, number | null][] = [
    ["perdeu visitas", efeito.visitas],
    ["conversão caiu", efeito.conversao],
    ["vendeu menos", efeito.unidades],
    ["vendeu mais barato", efeito.preco],
  ];
  const [causa] = fatores
    .filter((f): f is [Causa, number] => f[1] != null)
    .sort((a, b) => a[1] - b[1])[0] ?? ["vendeu menos", 0];

  const texto: Record<string, string> = {
    /* Com o catálogo mantido, "perdeu exposição" deixa de ser lista de
       suspeitos e vira conclusão: a posição que dá tráfego continua sendo
       a dele, então o que mudou está fora do catálogo. */
    "perdeu visitas":
      `As visitas caíram ${abs(varVis ?? 0)}${varConv != null && varConv > -10 ? " e a conversão se manteve" : ""}: ` +
      (manteveCatalogo
        ? `o anúncio seguiu ganhando o catálogo (${cat!.agora.ganhando} de ${cat!.agora.dias} dias), então não foi a posição — olhe verba de anúncio, busca e sazonalidade.`
        : "o anúncio perdeu exposição (posição, catálogo, mídia)."),
    "conversão caiu": `A conversão caiu ${abs(varConv ?? 0)} com o preço ${varPreco != null ? `${qualPreco} ${pc(varPreco)}` : "estável"}: concorrente, frete, prazo ou reputação.`,
    "vendeu menos": `Vendeu ${abs(varUn ?? -100)} menos unidades${varPreco != null ? `, com preço ${qualPreco} ${pc(varPreco)}` : ""}. Sem visita registrada, não dá para separar exposição de conversão.`,
    "vendeu mais barato": `O preço ${qualPreco} caiu ${abs(varPreco ?? 0)} e o volume não compensou: desconto ou promoção que não trouxe venda.`,
  };
  return { causa, explicacao: texto[causa] };
}
