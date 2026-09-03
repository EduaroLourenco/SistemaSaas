import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";

/**
 * Performance de preço: a que preço cada SKU vende melhor.
 *
 * ── A conta, e por que ela não é "o preço que mais vendeu" ──
 *
 * O preço praticado por mais tempo vende mais unidades por exposição, não
 * por mérito. Um preço que ficou 60 dias no ar sempre ganharia de um que
 * ficou 5, e a resposta seria "o preço de sempre é o melhor" — sempre.
 *
 * A medida é UNIDADES POR DIA em que aquele preço esteve valendo. Aí um
 * preço testado duas semanas pode ganhar de um praticado dois meses, que
 * é exatamente o achado que interessa.
 *
 * ── Por que a faixa é percentual ──
 *
 * Preço quase nunca se repete ao centavo: promoção, frete embutido e
 * arredondamento produzem dezenas de valores distintos. Agrupar em faixas
 * é obrigatório, e a régua tem que ser proporcional — R$ 10 é uma faixa
 * grosseira num produto de R$ 36 e fina demais num de R$ 2.700.
 *
 * 2,5% do preço mediano do próprio SKU. Medido nos dados reais, isso
 * transforma as 35 faixas de R$ 10 do PA85351 em 24 utilizáveis.
 *
 * ── O piso de evidência ──
 *
 * Sem ele, a resposta para o PA85351 seria "R$ 1.370" — cinco unidades
 * num único dia, um pedido grande de um cliente só. Com o piso de 3 dias
 * e 3 unidades por faixa, a resposta vira R$ 1.740,82 com 59 unidades em
 * 20 dias, que é uma afirmação que se sustenta.
 *
 * SKU que não atinge o piso em faixa nenhuma não recebe "melhor preço":
 * recebe "sem evidência". Nos 90 dias, 70 dos 334 SKUs com venda passam
 * — e é honesto que a maioria não passe, porque a maioria praticou um
 * preço só.
 *
 * ── Vitrine e praticado são coisas diferentes ──
 *
 * `anuncios.preco_atual` é o preço de VITRINE; `pedido_itens.preco_unitario`
 * é o que o cliente pagou, já com desconto e campanha. Os dois convivem e
 * divergem muito: o PA65751 tem vitrine de R$ 1.179 e nunca foi vendido
 * acima de R$ 759 em 144 vendas.
 *
 * A vitrine também não é UMA: o PA85351 tem quatro anúncios, dois
 * clássicos a R$ 4.211 e dois premium a R$ 5.229. Escolher o primeiro da
 * lista pegava o premium por acaso. Agora escolhe a do anúncio que MAIS
 * VENDEU no período — a vitrine que a maioria dos compradores viu.
 *
 * ── Último preço e média: os dois, e cada um serve a uma coisa ──
 *
 * A média de 14 dias é estável mas dilui: um preço mudado anteontem
 * aparece misturado com doze dias do preço anterior, e a variação sai
 * menor do que é. O ÚLTIMO preço vendido é o que está valendo agora, e é
 * ele que a comparação usa.
 *
 * A média fica ao lado porque uma venda isolada pode ser atípica —
 * negociação, frete embutido, erro de digitação no anúncio. Ver os dois
 * juntos mostra na hora se o último preço é o novo patamar ou um ponto
 * fora da curva.
 *
 * A primeira versão comparava a vitrine com a faixa de melhor praticado e
 * anunciava "+126%, subiu o preço" — comparando duas réguas diferentes.
 * A comparação usa o PRATICADO recente, na mesma janela em que o ritmo de
 * venda é medido, para que preço e volume falem do mesmo período. A
 * vitrine fica numa coluna à parte, porque a distância entre ela e o
 * praticado é informação própria: é o desconto que a operação vem dando.
 *
 * ── O que isto NÃO prova ──
 *
 * Correlação. O preço mais barato costuma coincidir com campanha, e
 * campanha traz tráfego que venderia mais a qualquer preço. A tela diz
 * isso; o número sozinho não pode ser lido como "baixe para este preço e
 * venderá mais".
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

/** Piso de evidência por faixa de preço. */
const MIN_DIAS = 3;
const MIN_UNIDADES = 3;
/** Largura da faixa, como fração do preço mediano do SKU. */
const FAIXA_PCT = 0.025;
/** Janela recente para medir o efeito do preço de agora. */
const DIAS_RECENTE = 14;

export type FaixaPreco = {
  preco: number;
  unidades: number;
  dias: number;
  /** Unidades por dia em que este preço esteve valendo. */
  unDia: number;
  receita: number;
  /** É a faixa vencedora do período. */
  melhor: boolean;
  /** O preço de hoje cai nesta faixa. */
  atual: boolean;
};

export type Situacao =
  | "sem_evidencia"
  | "no_melhor"
  | "subiu_e_caiu"
  | "subiu"
  | "abaixo"
  | "estavel";

export type LinhaPreco = {
  sku: string;
  titulo: string;
  mlbs: { mlb: string; tipo: string }[];
  curva: "A" | "B" | "C";
  canais: number;

  unidades: number;
  receita: number;
  participacao: number;

  /** A faixa de melhor desempenho no período. */
  melhor: FaixaPreco | null;
  /** Preço de vitrine do catálogo. Não é o que o cliente pagou. */
  precoVitrine: number | null;
  /** Média ponderada praticada na janela recente. */
  precoRecente: number | null;
  /** O preço do último pedido — é o que se compara com o melhor. */
  precoUltimo: number | null;
  /** Data desse último pedido. */
  dataUltimo: string | null;
  /** Média ponderada praticada nos últimos 7 dias. */
  preco7: number | null;
  /** Média ponderada do período inteiro. */
  precoPeriodo: number | null;

  /** Preço de hoje contra o de melhor desempenho, em %. */
  variacao: number | null;
  /** Unidades por dia nos últimos 14 dias. */
  unDiaRecente: number | null;
  /** unDiaRecente contra o do melhor preço, em %. */
  impacto: number | null;

  situacao: Situacao;
  faixas: FaixaPreco[];
};

export type DadosPerformancePreco = {
  vazio: boolean;
  linhas: LinhaPreco[];
  canais: { id: string; nome: string }[];
  canalId: string | null;
  dias: number;
  periodo: { inicio: string; fim: string };
  resumo: {
    comEvidencia: number;
    subiuECaiu: number;
    acimaDoMelhor: number;
    total: number;
  };
};

export async function carregarPerformancePreco(filtro: {
  dias?: number;
  canalId?: string;
}): Promise<DadosPerformancePreco> {
  const sb = await clienteServidor();
  const dias = [7, 30, 90].includes(filtro.dias ?? 90) ? filtro.dias! : 90;

  const [pedidosRaw, itensRaw, anunciosRaw, contasRaw, canaisRaw, exclusoes] =
    await Promise.all([
      paginar(() =>
        sb.from("pedidos").select("id,data,cancelado,canal_id,conta_canal_id").order("data")
      ),
      paginar(() =>
        sb
          .from("pedido_itens")
          .select("pedido_id,sku,titulo,codigo_externo,quantidade,preco_unitario,total")
          .order("pedido_id")
      ),
      paginar(() =>
        sb
          .from("anuncios")
          .select("codigo_externo,sku_canal,tipo,preco_atual,canal_id")
          .order("codigo_externo")
      ),
      sb.from("contas_canal").select("id,canal_id").limit(200),
      sb.from("canais").select("id,nome").order("nome"),
      carregarExclusoes(),
    ]);

  type Ped = { id: string; data: string; cancelado: boolean; canal_id: string; conta_canal_id: string };
  type Item = {
    pedido_id: string;
    sku: string | null;
    titulo: string | null;
    codigo_externo: string;
    quantidade: number;
    preco_unitario: string | number;
    total: string | number;
  };
  type Anun = {
    codigo_externo: string;
    sku_canal: string | null;
    tipo: string;
    preco_atual: string | number | null;
    canal_id: string;
  };

  const canalDaConta = new Map(
    ((contasRaw.data ?? []) as { id: string; canal_id: string }[]).map((c) => [c.id, c.canal_id])
  );

  const { mantidas } = aplicar(
    (pedidosRaw as unknown as Ped[]).map((p) => ({
      ...p,
      canalId: canalDaConta.get(p.conta_canal_id) ?? p.canal_id,
      contaCanalId: p.conta_canal_id,
    })),
    exclusoes
  );
  const pedidos = mantidas as unknown as (Ped & { canalId: string })[];

  if (!pedidos.length) {
    return vazio(dias, (canaisRaw.data ?? []) as { id: string; nome: string }[], filtro.canalId);
  }

  const fim = pedidos.map((p) => String(p.data).slice(0, 10)).sort().slice(-1)[0];
  const corte = new Date(`${fim}T00:00:00Z`);
  corte.setUTCDate(corte.getUTCDate() - (dias - 1));
  const inicio = corte.toISOString().slice(0, 10);

  const recorte = new Map(
    pedidos
      .filter((p) => {
        if (p.cancelado) return false;
        const d = String(p.data).slice(0, 10);
        if (d < inicio || d > fim) return false;
        if (filtro.canalId && p.canalId !== filtro.canalId) return false;
        return true;
      })
      .map((p) => [p.id, p])
  );

  const seteDias = new Date(`${fim}T00:00:00Z`);
  seteDias.setUTCDate(seteDias.getUTCDate() - 6);
  const desde7 = seteDias.toISOString().slice(0, 10);

  const recente = new Date(`${fim}T00:00:00Z`);
  recente.setUTCDate(recente.getUTCDate() - (DIAS_RECENTE - 1));
  const desdeRecente = recente.toISOString().slice(0, 10);

  /* ── Vendas por SKU ── */

  type Venda = { data: string; preco: number; un: number; total: number; canal: string; mlb: string };
  const porSku = new Map<string, { titulo: string; vendas: Venda[] }>();

  for (const it of itensRaw as unknown as Item[]) {
    const p = recorte.get(it.pedido_id);
    if (!p) continue;
    const sku = (it.sku ?? "").trim();
    if (!sku) continue;

    const at = porSku.get(sku) ?? { titulo: it.titulo ?? "", vendas: [] };
    if (!at.titulo && it.titulo) at.titulo = it.titulo;
    at.vendas.push({
      data: String(p.data).slice(0, 10),
      preco: n(it.preco_unitario),
      un: it.quantidade ?? 0,
      total: n(it.total),
      canal: p.canalId,
      mlb: it.codigo_externo,
    });
    porSku.set(sku, at);
  }

  /* ── Catálogo: preço de hoje e MLBs do SKU ── */

  const anuncios = anunciosRaw as unknown as Anun[];
  const catalogoPorSku = new Map<string, Anun[]>();
  for (const a of anuncios) {
    const sku = (a.sku_canal ?? "").trim();
    if (!sku) continue;
    if (filtro.canalId && a.canal_id !== filtro.canalId) continue;
    const lista = catalogoPorSku.get(sku) ?? [];
    lista.push(a);
    catalogoPorSku.set(sku, lista);
  }

  /* ── Monta ── */

  const receitaTotal = [...porSku.values()].reduce(
    (s, a) => s + a.vendas.reduce((t, v) => t + v.total, 0),
    0
  );

  const cruas = [...porSku.entries()].map(([sku, { titulo, vendas }]) => {
    const unidades = vendas.reduce((s, v) => s + v.un, 0);
    const receita = vendas.reduce((s, v) => s + v.total, 0);

    /* Faixas de preço */
    const precos = vendas.map((v) => v.preco).sort((a, b) => a - b);
    const mediana = precos[Math.floor(precos.length / 2)] || 1;
    const passo = Math.max(1, mediana * FAIXA_PCT);

    type Bruta = { un: number; dias: Set<string>; soma: number; qtd: number; receita: number };
    const brutas = new Map<number, Bruta>();
    for (const v of vendas) {
      const chave = Math.round(v.preco / passo);
      const b =
        brutas.get(chave) ?? { un: 0, dias: new Set<string>(), soma: 0, qtd: 0, receita: 0 };
      b.un += v.un;
      b.dias.add(v.data);
      // O preço da faixa é a média ponderada do que se vendeu nela, não o
      // centro do balde: o centro é um número que ninguém praticou.
      b.soma += v.preco * v.un;
      b.qtd += v.un;
      b.receita += v.total;
      brutas.set(chave, b);
    }

    const catalogo = catalogoPorSku.get(sku) ?? [];

    /*
     * A vitrine do anúncio que mais vendeu, não a do primeiro da lista.
     *
     * Um SKU costuma ter quatro anúncios — dois clássicos e dois premium —
     * com preços de lista diferentes. Pegar qualquer um mistura a vitrine
     * do premium com o praticado do clássico, e a diferença entre os dois
     * vira ruído em cima da comparação que interessa.
     */
    const unPorMlb = new Map<string, number>();
    for (const v of vendas) {
      unPorMlb.set(v.mlb, (unPorMlb.get(v.mlb) ?? 0) + v.un);
    }
    const comPreco = catalogo.filter((a) => a.preco_atual != null);
    const escolhido =
      comPreco.length > 1
        ? comPreco.reduce((m, a) =>
            (unPorMlb.get(a.codigo_externo) ?? 0) > (unPorMlb.get(m.codigo_externo) ?? 0)
              ? a
              : m
          )
        : comPreco[0];
    const precoAtual = escolhido ? r2(n(escolhido.preco_atual)) : null;

    const faixas: FaixaPreco[] = [...brutas.values()]
      .map((b) => ({
        preco: r2(b.soma / (b.qtd || 1)),
        unidades: b.un,
        dias: b.dias.size,
        unDia: r2(b.un / b.dias.size),
        receita: r2(b.receita),
        melhor: false,
        atual: false,
      }))
      .sort((a, b) => a.preco - b.preco);

    const qualificadas = faixas.filter(
      (f) => f.dias >= MIN_DIAS && f.unidades >= MIN_UNIDADES
    );
    const melhor =
      qualificadas.length > 0
        ? qualificadas.reduce((m, f) => (f.unDia > m.unDia ? f : m))
        : null;
    if (melhor) melhor.melhor = true;



    /* Preços de referência */
    const media = (lista: Venda[]) => {
      const q = lista.reduce((s, v) => s + v.un, 0);
      return q > 0 ? r2(lista.reduce((s, v) => s + v.preco * v.un, 0) / q) : null;
    };
    const preco7 = media(vendas.filter((v) => v.data >= desde7));
    const precoPeriodo = media(vendas);

    /* Efeito recente */
    const vendasRecentes = vendas.filter((v) => v.data >= desdeRecente);
    const precoRecente = media(vendasRecentes);

    /*
     * O último preço vendido, do pedido mais recente do SKU.
     *
     * Sem recorte de janela: se o SKU não vende há 40 dias, o último
     * preço ainda é a informação certa — é o preço com que ele parou.
     * Vazio ali diria "não se sabe", quando se sabe.
     */
    const ordenadas = [...vendas].sort((a, b) => a.data.localeCompare(b.data));
    const ultima = ordenadas[ordenadas.length - 1];
    const precoUltimo = ultima ? r2(ultima.preco) : null;
    const dataUltimo = ultima ? ultima.data : null;
    const diasRecentes = new Set(vendasRecentes.map((v) => v.data)).size;
    const unDiaRecente =
      diasRecentes > 0
        ? r2(vendasRecentes.reduce((s, v) => s + v.un, 0) / diasRecentes)
        : null;

    /*
     * A referência é o ÚLTIMO preço vendido, nunca a vitrine.
     *
     * A média de 14 dias dilui uma mudança recente; o último preço é o
     * que está valendo. E a vitrine está fora porque é preço de lista —
     * dizer "subiu o preço" comparando com ela seria falar de um número
     * que nenhum cliente pagou.
     */
    const referencia = precoUltimo;
    const variacao =
      melhor && referencia != null && melhor.preco > 0
        ? r2(((referencia - melhor.preco) / melhor.preco) * 100)
        : null;
    // A faixa em que o preço recente cai, para o gráfico marcar onde a
    // operação está agora.
    if (precoUltimo != null && faixas.length) {
      const perto = faixas.reduce((m, f) =>
        Math.abs(f.preco - precoUltimo) < Math.abs(m.preco - precoUltimo) ? f : m
      );
      if (Math.abs(perto.preco - precoUltimo) <= passo) perto.atual = true;
    }

    const impacto =
      melhor && unDiaRecente != null && melhor.unDia > 0
        ? r2(((unDiaRecente - melhor.unDia) / melhor.unDia) * 100)
        : null;

    /*
     * A situação é o que transforma duas colunas de número numa decisão.
     *
     * "subiu_e_caiu" é a que o usuário pediu: o preço saiu do de melhor
     * desempenho para cima E o ritmo de venda caiu. As duas condições
     * juntas, porque preço que subiu sem cair venda não é problema, e
     * venda que caiu sem preço mudar tem outra causa.
     */
    let situacao: Situacao = "sem_evidencia";
    if (melhor) {
      const subiu = variacao != null && variacao > 2;
      const abaixo = variacao != null && variacao < -2;
      const caiu = impacto != null && impacto < -20;
      situacao = subiu && caiu ? "subiu_e_caiu" : subiu ? "subiu" : abaixo ? "abaixo" : caiu ? "estavel" : "no_melhor";
    }

    return {
      sku,
      titulo,
      mlbs: catalogo.map((a) => ({ mlb: a.codigo_externo, tipo: a.tipo })),
      curva: "C" as const,
      canais: new Set(vendas.map((v) => v.canal)).size,
      unidades,
      receita: r2(receita),
      participacao: receitaTotal > 0 ? r2((receita * 100) / receitaTotal) : 0,
      melhor,
      precoVitrine: precoAtual,
      precoRecente,
      precoUltimo,
      dataUltimo,
      preco7,
      precoPeriodo,
      variacao,
      unDiaRecente,
      impacto,
      situacao,
      faixas,
    };
  });

  /* Curva ABC dentro do recorte */
  cruas.sort((a, b) => b.receita - a.receita);
  let acumulado = 0;
  const linhas: LinhaPreco[] = cruas.map((l) => {
    acumulado += l.participacao;
    return { ...l, curva: acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C" };
  });

  return {
    vazio: !linhas.length,
    linhas,
    canais: (canaisRaw.data ?? []) as { id: string; nome: string }[],
    canalId: filtro.canalId ?? null,
    dias,
    periodo: { inicio, fim },
    resumo: {
      comEvidencia: linhas.filter((l) => l.melhor).length,
      subiuECaiu: linhas.filter((l) => l.situacao === "subiu_e_caiu").length,
      acimaDoMelhor: linhas.filter((l) => l.variacao != null && l.variacao > 2).length,
      total: linhas.length,
    },
  };
}

function vazio(
  dias: number,
  canais: { id: string; nome: string }[],
  canalId?: string
): DadosPerformancePreco {
  return {
    vazio: true,
    linhas: [],
    canais,
    canalId: canalId ?? null,
    dias,
    periodo: { inicio: "", fim: "" },
    resumo: { comEvidencia: 0, subiuECaiu: 0, acimaDoMelhor: 0, total: 0 },
  };
}
