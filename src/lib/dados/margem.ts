import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";
import { comissaoUtilizavel } from "./comissao-plausivel";

/**
 * Margem, calculada no item do pedido.
 *
 * ── Por que no item, e não por SKU ──
 *
 * A primeira versão calculava margem por SKU, sobre médias do período
 * inteiro: preço médio menos comissão média menos frete médio. O número
 * saía, e estava errado.
 *
 * Preço, comissão e frete variam entre um pedido e outro do MESMO
 * anúncio — campanha numa semana, frete grátis noutra, parcelamento num
 * pedido só. A margem da média não é a média das margens: um SKU que
 * vendeu 10 unidades a R$ 2.000 com 7% e 5 a R$ 1.200 com 14% tem margem
 * bem diferente da que sai de "preço médio R$ 1.733, comissão média
 * 9,3%".
 *
 * Aqui cada item de pedido vira uma linha com todos os componentes
 * resolvidos. Depois se soma por semana, por anúncio, por canal, por
 * período — a agregação é escolha de quem pergunta, e todas partem da
 * mesma base. É o que permite "margem da semana 35 do MLB123" e "margem
 * do mês no Mercado Livre" sem duas implementações da mesma conta.
 *
 * ── A regra da cobertura ──
 *
 * Enquanto um SKU não tiver custo cadastrado, o item dele NÃO entra na
 * margem. Não entra como zero, não entra como estimativa: fica de fora, e
 * a linha informa quanto da receita ficou de fora.
 *
 * Somar margem sobre receita parcial e apresentá-la como margem do
 * período seria o erro mais caro possível aqui — o número desce conforme
 * se cadastra custo, e quem olhasse acharia que a operação piorou.
 *
 * ── O que "praticado" e "tabela" fazem aqui ──
 *
 * Comissão e frete têm as duas faces. O praticado ganha quando existe; a
 * tabela cobre o resto. Cada item guarda de onde veio o seu, e a
 * agregação soma quanto da receita usou cada origem — para que "margem
 * medida" e "margem estimada" nunca se confundam numa média só.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export type OrigemCusto = "praticado" | "tabela";

export type ItemMargem = {
  pedidoId: string;
  data: string;
  mlb: string;
  sku: string;
  produtoId: string | null;
  anuncioTipo: string;
  canalId: string;
  contaCanalId: string;

  quantidade: number;
  receita: number;

  comissao: number | null;
  comissaoOrigem: OrigemCusto | null;
  frete: number | null;
  freteOrigem: OrigemCusto | null;
  juros: number;
  impostos: number | null;
  embalagem: number | null;
  mercadoria: number | null;

  /** Todos os componentes conhecidos: só então a margem existe. */
  completo: boolean;
  margem: number | null;
};

export type Dimensao = "semana" | "mes" | "anuncio" | "sku" | "canal" | "conta";

export type LinhaMargem = {
  chave: string;
  rotulo: string;
  ordem: string;

  unidades: number;
  receita: number;

  /** A parte da receita cujo custo é inteiramente conhecido. */
  receitaApurada: number;
  comissao: number;
  frete: number;
  juros: number;
  impostos: number;
  embalagem: number;
  mercadoria: number;

  margem: number | null;
  /** Sobre a receita apurada, não sobre a total. */
  margemPct: number | null;
  /** Quanto da receita entrou na conta. */
  cobertura: number;
  /** Receita com custo praticado, não estimado por tabela. */
  receitaMedida: number;
};

/* ── Datas ─────────────────────────────────────────────────────────── */

function segundaDe(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function semanaIso(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/* ── Base ──────────────────────────────────────────────────────────── */

export type FiltroMargem = {
  inicio?: string;
  fim?: string;
  canalId?: string;
  mlb?: string;
  sku?: string;
};

export type BaseMargem = {
  itens: ItemMargem[];
  /** Nomes para rotular, sem nova consulta na agregação. */
  nomeCanal: Map<string, string>;
  nomeConta: Map<string, string>;
  /** Quantos pedidos trouxeram juros informados — ver a nota abaixo. */
  cobertura: {
    comissaoPraticada: number;
    fretePraticado: number;
    jurosInformado: number;
    pedidos: number;
  };
};

export async function carregarBaseMargem(
  filtro: FiltroMargem = {}
): Promise<BaseMargem> {
  const sb = await clienteServidor();

  const [produtosRaw, anunciosRaw, pedidosRaw, exclusoes, faixasRaw, contasRaw] =
    await Promise.all([
      paginar(() =>
        sb
          .from("produtos")
          .select("id,sku,custo_unitario,embalagem,aliquota_impostos,peso_kg")
          .order("sku")
      ),
      paginar(() =>
        sb
          .from("anuncios")
          .select("id,produto_id,codigo_externo,tipo,comissao_atual,canal_id")
          .order("codigo_externo")
      ),
      paginar(() =>
        sb
          .from("pedidos")
          .select(
            "id,data,cancelado,total,comissao,frete_vendedor,juros,canal_id,conta_canal_id"
          )
          .order("data")
      ),
      carregarExclusoes(),
      paginar(() =>
        sb
          .from("faixas_frete")
          .select("canal_id,peso_min_kg,peso_max_kg,valor,vigencia_inicio")
          .order("peso_min_kg")
      ),
      sb.from("contas_canal").select("id,nome,canal_id,canais(nome)").limit(200),
    ]);

  type Prod = {
    id: string;
    sku: string;
    custo_unitario: string | number | null;
    embalagem: string | number | null;
    aliquota_impostos: string | number | null;
    peso_kg: string | number | null;
  };
  type Anun = {
    id: string;
    produto_id: string | null;
    codigo_externo: string;
    tipo: string;
    comissao_atual: string | number | null;
    canal_id: string;
  };
  type Ped = {
    id: string;
    data: string;
    cancelado: boolean;
    total: string | number;
    comissao: string | number | null;
    frete_vendedor: string | number | null;
    juros: string | number | null;
    canal_id: string;
    conta_canal_id: string;
  };
  type Conta = {
    id: string;
    nome: string;
    canal_id: string;
    canais: { nome: string } | null;
  };

  const produtos = produtosRaw as unknown as Prod[];
  const anuncios = anunciosRaw as unknown as Anun[];
  const contas = (contasRaw.data ?? []) as unknown as Conta[];

  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const anuncioPorMlb = new Map(anuncios.map((a) => [a.codigo_externo, a]));
  const canalDaConta = new Map(contas.map((c) => [c.id, c.canal_id]));

  const nomeCanal = new Map<string, string>();
  const nomeConta = new Map<string, string>();
  for (const c of contas) {
    if (c.canais?.nome) nomeCanal.set(c.canal_id, c.canais.nome);
    nomeConta.set(c.id, c.nome);
  }

  const faixas = (
    faixasRaw as unknown as {
      canal_id: string | null;
      peso_min_kg: string | number;
      peso_max_kg: string | number;
      valor: string | number;
      vigencia_inicio: string;
    }[]
  ).map((f) => ({
    canalId: f.canal_id,
    min: n(f.peso_min_kg),
    max: n(f.peso_max_kg),
    valor: n(f.valor),
    vigencia: String(f.vigencia_inicio).slice(0, 10),
  }));

  /** A faixa que cobre o peso na data, preferindo a do canal à geral. */
  function freteDeTabela(
    pesoKg: number | null,
    canalId: string,
    data: string
  ): number | null {
    if (pesoKg == null) return null;
    const validas = faixas.filter(
      (f) => pesoKg >= f.min && pesoKg <= f.max && f.vigencia <= data
    );
    if (!validas.length) return null;
    const especifica = validas.filter((f) => f.canalId === canalId);
    // Vigência mais recente que já começou: tabela reajustada não
    // reescreve o frete de um pedido anterior ao reajuste.
    return (especifica.length ? especifica : validas).sort((a, b) =>
      b.vigencia.localeCompare(a.vigencia)
    )[0].valor;
  }

  /* ── Pedidos, com exclusões e filtro ── */

  const { mantidas: pedidos } = aplicar(
    (pedidosRaw as unknown as Ped[]).map((p) => ({
      ...p,
      canalId: canalDaConta.get(p.conta_canal_id) ?? p.canal_id,
      contaCanalId: p.conta_canal_id,
    })),
    exclusoes
  );

  const usaveis = pedidos.filter((p) => {
    if (p.cancelado) return false;
    const dia = String(p.data).slice(0, 10);
    if (filtro.inicio && dia < filtro.inicio) return false;
    if (filtro.fim && dia > filtro.fim) return false;
    if (filtro.canalId && p.canalId !== filtro.canalId) return false;
    return true;
  });
  const pedidoPorId = new Map(usaveis.map((p) => [p.id, p]));

  /* ── Itens ── */

  const itensRaw = await paginar(() =>
    sb
      .from("pedido_itens")
      .select("pedido_id,codigo_externo,quantidade,total")
      .order("pedido_id")
  );
  type ItemBruto = {
    pedido_id: string;
    codigo_externo: string;
    quantidade: number;
    total: string | number;
  };
  const brutos = itensRaw as unknown as ItemBruto[];

  // Denominador do rateio: o custo do pedido se reparte entre os itens
  // pelo valor de cada um. Sem isso, pedido com dois itens joga a
  // comissão inteira no primeiro.
  const totalDoPedido = new Map<string, number>();
  for (const it of brutos) {
    if (!pedidoPorId.has(it.pedido_id)) continue;
    totalDoPedido.set(
      it.pedido_id,
      (totalDoPedido.get(it.pedido_id) ?? 0) + n(it.total)
    );
  }

  const itens: ItemMargem[] = [];
  const pedidosVistos = new Set<string>();
  let comComissaoPraticada = 0;
  let comFretePraticado = 0;
  let comJuros = 0;

  for (const it of brutos) {
    const p = pedidoPorId.get(it.pedido_id);
    if (!p) continue;

    const mlb = String(it.codigo_externo ?? "");
    const a = anuncioPorMlb.get(mlb);
    if (filtro.mlb && mlb !== filtro.mlb) continue;

    const prod = a?.produto_id ? produtoPorId.get(a.produto_id) : undefined;
    if (filtro.sku && prod?.sku !== filtro.sku) continue;

    const qtd = it.quantidade ?? 0;
    const receita = n(it.total);
    const totalPed = totalDoPedido.get(it.pedido_id) ?? 0;
    const fatia = totalPed > 0 ? receita / totalPed : 1;

    if (!pedidosVistos.has(p.id)) {
      pedidosVistos.add(p.id);
      if (comissaoUtilizavel(p.comissao, p.total)) comComissaoPraticada += 1;
      if (n(p.frete_vendedor) > 0) comFretePraticado += 1;
      if (n(p.juros) > 0) comJuros += 1;
    }

    /* Comissão: praticada quando passa na faixa, senão a alíquota do anúncio. */
    let comissao: number | null = null;
    let comissaoOrigem: OrigemCusto | null = null;
    if (comissaoUtilizavel(p.comissao, p.total)) {
      comissao = r2(n(p.comissao) * fatia);
      comissaoOrigem = "praticado";
    } else if (a?.comissao_atual != null) {
      comissao = r2((receita * n(a.comissao_atual)) / 100);
      comissaoOrigem = "tabela";
    }

    /* Frete: o do vendedor quando informado, senão a faixa de peso. */
    let frete: number | null = null;
    let freteOrigem: OrigemCusto | null = null;
    if (n(p.frete_vendedor) > 0) {
      frete = r2(n(p.frete_vendedor) * fatia);
      freteOrigem = "praticado";
    } else {
      const pesoKg = prod?.peso_kg == null ? null : n(prod.peso_kg);
      const tabela = freteDeTabela(pesoKg, p.canalId, String(p.data).slice(0, 10));
      if (tabela != null) {
        frete = r2(tabela * qtd);
        freteOrigem = "tabela";
      }
    }

    /*
     * Juros ausente conta como zero, não como desconhecido.
     *
     * Diferente dos outros: juro só existe em venda parcelada com
     * acréscimo, então a maioria dos pedidos legitimamente não tem. Se
     * ausência bloqueasse a margem, quase nada seria calculável.
     *
     * A contrapartida é que a coluna `pedidos.juros` só passou a ser
     * gravada agora — nos pedidos importados antes, todos vêm vazios. Por
     * isso `cobertura.jurosInformado` é devolvido junto: enquanto for
     * baixo, a margem está otimista pelo valor do juro.
     */
    const juros = r2(n(p.juros) * fatia);

    const impostos =
      prod?.aliquota_impostos == null
        ? null
        : r2((receita * n(prod.aliquota_impostos)) / 100);
    const embalagem =
      prod?.embalagem == null ? null : r2(n(prod.embalagem) * qtd);
    const mercadoria =
      prod?.custo_unitario == null ? null : r2(n(prod.custo_unitario) * qtd);

    const completo =
      comissao != null &&
      frete != null &&
      impostos != null &&
      embalagem != null &&
      mercadoria != null;

    itens.push({
      pedidoId: p.id,
      data: String(p.data).slice(0, 10),
      mlb,
      sku: prod?.sku ?? "",
      produtoId: a?.produto_id ?? null,
      anuncioTipo: a?.tipo ?? "outro",
      canalId: p.canalId,
      contaCanalId: p.contaCanalId,
      quantidade: qtd,
      receita: r2(receita),
      comissao,
      comissaoOrigem,
      frete,
      freteOrigem,
      juros,
      impostos,
      embalagem,
      mercadoria,
      completo,
      margem: completo
        ? r2(receita - comissao! - frete! - juros - impostos! - embalagem! - mercadoria!)
        : null,
    });
  }

  return {
    itens,
    nomeCanal,
    nomeConta,
    cobertura: {
      comissaoPraticada: comComissaoPraticada,
      fretePraticado: comFretePraticado,
      jurosInformado: comJuros,
      pedidos: pedidosVistos.size,
    },
  };
}

/* ── Agregação ─────────────────────────────────────────────────────── */

/**
 * Soma a base por uma dimensão qualquer.
 *
 * Toda tela financeira sai daqui. Semana, mês, anúncio, SKU, canal e
 * conta são a mesma conta somada em ordem diferente — escrever uma
 * consulta por tela é o caminho para elas discordarem entre si.
 */
export function agregar(base: BaseMargem, dimensao: Dimensao): LinhaMargem[] {
  const grupos = new Map<string, LinhaMargem>();

  for (const it of base.itens) {
    let chave: string;
    let rotulo: string;
    let ordem: string;

    switch (dimensao) {
      case "semana": {
        const seg = segundaDe(it.data);
        chave = seg;
        rotulo = `Semana ${semanaIso(it.data)} · ${seg.slice(8, 10)}/${seg.slice(5, 7)}`;
        ordem = seg;
        break;
      }
      case "mes": {
        const mes = it.data.slice(0, 7);
        chave = mes;
        rotulo = `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
        ordem = mes;
        break;
      }
      case "anuncio":
        chave = it.mlb;
        rotulo = it.sku ? `${it.mlb} · ${it.sku}` : it.mlb;
        ordem = it.mlb;
        break;
      case "sku":
        chave = it.sku || "(sem SKU)";
        rotulo = chave;
        ordem = chave;
        break;
      case "canal":
        chave = it.canalId;
        rotulo = base.nomeCanal.get(it.canalId) ?? "—";
        ordem = rotulo;
        break;
      case "conta":
        chave = it.contaCanalId;
        rotulo = base.nomeConta.get(it.contaCanalId) ?? "—";
        ordem = rotulo;
        break;
    }

    const at =
      grupos.get(chave) ??
      {
        chave, rotulo, ordem,
        unidades: 0, receita: 0, receitaApurada: 0,
        comissao: 0, frete: 0, juros: 0,
        impostos: 0, embalagem: 0, mercadoria: 0,
        margem: null, margemPct: null, cobertura: 0, receitaMedida: 0,
      };

    at.unidades += it.quantidade;
    at.receita += it.receita;

    // Só o item completo entra nos custos: somar o que se sabe de um item
    // incompleto produziria um custo parcial sobre uma receita inteira, e
    // a margem sairia alta por falta de dado.
    if (it.completo) {
      at.receitaApurada += it.receita;
      at.comissao += it.comissao!;
      at.frete += it.frete!;
      at.juros += it.juros;
      at.impostos += it.impostos!;
      at.embalagem += it.embalagem!;
      at.mercadoria += it.mercadoria!;
      at.margem = (at.margem ?? 0) + it.margem!;
      if (it.comissaoOrigem === "praticado" && it.freteOrigem === "praticado") {
        at.receitaMedida += it.receita;
      }
    }

    grupos.set(chave, at);
  }

  return [...grupos.values()]
    .map((g) => ({
      ...g,
      receita: r2(g.receita),
      receitaApurada: r2(g.receitaApurada),
      comissao: r2(g.comissao),
      frete: r2(g.frete),
      juros: r2(g.juros),
      impostos: r2(g.impostos),
      embalagem: r2(g.embalagem),
      mercadoria: r2(g.mercadoria),
      margem: g.margem == null ? null : r2(g.margem),
      margemPct:
        g.margem != null && g.receitaApurada > 0
          ? r2((g.margem * 100) / g.receitaApurada)
          : null,
      cobertura: g.receita > 0 ? r2((g.receitaApurada * 100) / g.receita) : 0,
      receitaMedida: r2(g.receitaMedida),
    }))
    .sort((a, b) => a.ordem.localeCompare(b.ordem));
}

/* ── Resultado do período ──────────────────────────────────────────── */

/**
 * O DRE da operação, do bruto ao que sobra.
 *
 *   Receita bruta
 *   − cancelamentos
 *   = Receita líquida
 *   − comissão, frete, juros, impostos, embalagem, mercadoria
 *   = Margem de contribuição          ← o que a venda deixa
 *   − mídia, fixas, variáveis, avulsas
 *   = Resultado                        ← o que a operação deixa
 *
 * A separação entre as duas margens é o ponto. A de contribuição responde
 * "vender mais desta unidade melhora o resultado?", que é uma decisão de
 * preço e anúncio. O resultado responde "a operação fechou no azul?", que
 * é outra pergunta e tem outros responsáveis.
 *
 * Misturar as duas — descontando rateio de custo fixo do preço de um SKU —
 * é o erro clássico: produto de giro alto e margem baixa aparece como
 * prejuízo e é despriorizado, e o custo fixo que ele ajudava a pagar não
 * some junto com ele.
 */
export type Resultado = {
  inicio: string;
  fim: string;

  receitaBruta: number;
  cancelamentos: number;
  receitaLiquida: number;

  comissao: number;
  frete: number;
  juros: number;
  impostos: number;
  embalagem: number;
  mercadoria: number;

  margemContribuicao: number;
  margemPct: number | null;

  ads: number;
  fixaRecorrente: number;
  variavelRecorrente: number;
  variavelAvulsa: number;

  resultado: number;
  resultadoPct: number | null;

  /** Quanto da receita entrou na margem — abaixo de 100%, é parcial. */
  cobertura: number;
  receitaSemCusto: number;
  cadaCoberturaDe: BaseMargem["cobertura"];
};

export async function carregarResultado(
  inicio: string,
  fim: string,
  canalId?: string
): Promise<Resultado> {
  const sb = await clienteServidor();

  const base = await carregarBaseMargem({ inicio, fim, canalId });
  const total = agregar(base, "mes").reduce(
    (s, l) => ({
      receita: s.receita + l.receita,
      receitaApurada: s.receitaApurada + l.receitaApurada,
      comissao: s.comissao + l.comissao,
      frete: s.frete + l.frete,
      juros: s.juros + l.juros,
      impostos: s.impostos + l.impostos,
      embalagem: s.embalagem + l.embalagem,
      mercadoria: s.mercadoria + l.mercadoria,
      margem: s.margem + (l.margem ?? 0),
    }),
    {
      receita: 0, receitaApurada: 0, comissao: 0, frete: 0,
      juros: 0, impostos: 0, embalagem: 0, mercadoria: 0, margem: 0,
    }
  );

  /* Cancelamentos e mídia, do período. */
  const [pedidosRaw, diariasRaw, lancRaw] = await Promise.all([
    paginar(() =>
      sb
        .from("pedidos")
        .select("total,cancelado,data,canal_id")
        .eq("cancelado", true)
        .gte("data", inicio)
        .lte("data", fim)
    ),
    paginar(() =>
      sb
        .from("vendas_diarias")
        .select("investimento_ads,data,canal_id")
        .gte("data", inicio)
        .lte("data", fim)
    ),
    paginar(() =>
      sb
        .from("lancamentos_financeiros")
        .select("valor,natureza,competencia,canal_id")
        .not("natureza", "is", null)
        .gte("competencia", inicio.slice(0, 8) + "01")
        .lte("competencia", fim)
    ),
  ]);

  const doCanal = <T extends { canal_id: string | null }>(linhas: T[]) =>
    canalId ? linhas.filter((l) => l.canal_id === canalId) : linhas;

  const cancelamentos = doCanal(
    pedidosRaw as unknown as { total: string | number; canal_id: string }[]
  ).reduce((s, p) => s + n(p.total), 0);

  const ads = doCanal(
    diariasRaw as unknown as { investimento_ads: string | number; canal_id: string }[]
  ).reduce((s, d) => s + n(d.investimento_ads), 0);

  const porNatureza = { fixa_recorrente: 0, variavel_recorrente: 0, variavel_avulsa: 0 };
  for (const l of doCanal(
    lancRaw as unknown as {
      valor: string | number;
      natureza: keyof typeof porNatureza | "ads";
      canal_id: string | null;
    }[]
  )) {
    if (l.natureza in porNatureza) {
      porNatureza[l.natureza as keyof typeof porNatureza] += n(l.valor);
    }
  }

  const margemContribuicao = r2(total.margem);
  const resultado = r2(
    margemContribuicao -
      ads -
      porNatureza.fixa_recorrente -
      porNatureza.variavel_recorrente -
      porNatureza.variavel_avulsa
  );

  return {
    inicio,
    fim,
    receitaBruta: r2(total.receita),
    cancelamentos: r2(cancelamentos),
    receitaLiquida: r2(total.receita - cancelamentos),
    comissao: r2(total.comissao),
    frete: r2(total.frete),
    juros: r2(total.juros),
    impostos: r2(total.impostos),
    embalagem: r2(total.embalagem),
    mercadoria: r2(total.mercadoria),
    margemContribuicao,
    margemPct:
      total.receitaApurada > 0
        ? r2((margemContribuicao * 100) / total.receitaApurada)
        : null,
    ads: r2(ads),
    fixaRecorrente: r2(porNatureza.fixa_recorrente),
    variavelRecorrente: r2(porNatureza.variavel_recorrente),
    variavelAvulsa: r2(porNatureza.variavel_avulsa),
    resultado,
    resultadoPct:
      total.receitaApurada > 0 ? r2((resultado * 100) / total.receitaApurada) : null,
    cobertura:
      total.receita > 0 ? r2((total.receitaApurada * 100) / total.receita) : 0,
    receitaSemCusto: r2(total.receita - total.receitaApurada),
    cadaCoberturaDe: base.cobertura,
  };
}

/* ── Cruzamento anúncio × semana ───────────────────────────────────── */

export type MargemCelula = {
  receita: number;
  receitaApurada: number;
  margem: number | null;
  margemPct: number | null;
  cobertura: number;
};

/**
 * Margem por anúncio E por semana, na mesma chave.
 *
 * `agregar` soma por uma dimensão de cada vez, e nenhuma delas responde
 * "esse anúncio piorou de uma semana para a outra?" — que é a pergunta
 * que a evolução existe para responder. Um cruzamento de duas dimensões
 * não é caso geral suficiente para complicar `agregar`; é este.
 *
 * Chave: `MLB|segunda-feira`, a mesma que a evolução já usa.
 */
export function agregarAnuncioSemana(
  base: BaseMargem
): Map<string, MargemCelula> {
  const bruto = new Map<
    string,
    { receita: number; apurada: number; margem: number }
  >();

  for (const it of base.itens) {
    const chave = `${it.mlb}|${segundaDe(it.data)}`;
    const at = bruto.get(chave) ?? { receita: 0, apurada: 0, margem: 0 };
    at.receita += it.receita;
    if (it.completo) {
      at.apurada += it.receita;
      at.margem += it.margem!;
    }
    bruto.set(chave, at);
  }

  const saida = new Map<string, MargemCelula>();
  for (const [chave, v] of bruto) {
    saida.set(chave, {
      receita: r2(v.receita),
      receitaApurada: r2(v.apurada),
      // Sem receita apurada não há margem: zero ali seria "margem zero",
      // que é uma afirmação, e a verdade é "não se sabe".
      margem: v.apurada > 0 ? r2(v.margem) : null,
      margemPct: v.apurada > 0 ? r2((v.margem * 100) / v.apurada) : null,
      cobertura: v.receita > 0 ? r2((v.apurada * 100) / v.receita) : 0,
    });
  }
  return saida;
}
