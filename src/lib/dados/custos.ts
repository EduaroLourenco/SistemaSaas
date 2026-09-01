import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";
import { comissaoUtilizavel } from "./comissao-plausivel";

/**
 * A estrutura de custo por SKU: o que falta para fechar margem.
 *
 * ── A regra que organiza tudo ──
 *
 * Cada custo tem duas faces: o de TABELA, que vale antes de existir
 * venda, e o PRATICADO, que a venda revelou. As duas ficam lado a lado.
 *
 *   comissão   tabela = alíquota do anúncio (11,5% clássico, 16,5% premium)
 *              praticada = o que o canal reteve nos pedidos
 *
 *   frete      tabela = faixa de peso cadastrada
 *              praticado = frete do vendedor nos pedidos
 *
 * A diferença entre as duas não é erro de medição, é o achado. Tabela de
 * 11,5% com praticada de 7,4% é redução de campanha funcionando. Faixa de
 * R$ 40 com praticado de R$ 145 é prejuízo de logística que nenhuma tela
 * mostrava.
 *
 * ── Os custos que ninguém informa ──
 *
 * Mercadoria, embalagem e alíquota de imposto não vêm de planilha
 * nenhuma. São digitados, ficam em `produtos`, e enquanto faltarem a
 * margem NÃO é calculada — `faltando` diz o que impede.
 *
 * Essa é a decisão central deste arquivo. Assumir custo zero produziria
 * uma margem otimista e plausível, que é o pior resultado possível: quem
 * decide preço com ela erra para baixo e não descobre. Margem vazia
 * incomoda; margem errada engana.
 *
 * ── Cobertura do praticado ──
 *
 * Frete do vendedor só existe no Mercado Livre: 3.059 dos 3.204 pedidos.
 * Nos outros oito canais, zero. Comissão informada cobre ~33% e sobe
 * para ~73% com a reconstrução dentro da faixa plausível.
 *
 * Onde o praticado não existe, cai para a tabela — e `origem` diz qual
 * dos dois está sendo usado, para que ninguém confunda medição com
 * estimativa.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export type Origem = "praticado" | "tabela" | "ausente";

export type ValorComOrigem = {
  tabela: number | null;
  praticado: number | null;
  /** Qual dos dois a margem usou. */
  origem: Origem;
  /** O usado, já resolvido. */
  valor: number | null;
};

export type CustoSku = {
  produtoId: string;
  sku: string;
  titulo: string;
  anuncios: number;
  unidades: number;
  receita: number;
  precoMedio: number | null;

  /** Em pontos percentuais sobre o preço. */
  comissao: ValorComOrigem;
  /** Em reais por unidade. */
  frete: ValorComOrigem;
  /** Juro do parcelamento, em reais por unidade. Só praticado existe. */
  jurosUnidade: number | null;

  /* Preenchidos à mão, em `produtos`. */
  custoMercadoria: number | null;
  embalagem: number | null;
  aliquotaImpostos: number | null;
  pesoKg: number | null;

  /* Resultado, ou o que falta para tê-lo. */
  margemUnidade: number | null;
  margemPct: number | null;
  faltando: string[];
};

export type DadosCustos = {
  linhas: CustoSku[];
  faixas: FaixaFrete[];
  /** Quantos SKUs já têm margem calculável. */
  completos: number;
  vazio: boolean;
};

export type FaixaFrete = {
  id: string;
  canalId: string | null;
  canalNome: string | null;
  pesoMin: number;
  pesoMax: number;
  valor: number;
  vigenciaInicio: string;
};

/** A faixa que cobre o peso, preferindo a do canal à geral. */
function freteDaFaixa(
  faixas: FaixaFrete[],
  pesoKg: number | null,
  canalId: string | null
): number | null {
  if (pesoKg == null) return null;
  const cobrem = faixas.filter(
    (f) => pesoKg >= f.pesoMin && pesoKg <= f.pesoMax
  );
  if (!cobrem.length) return null;
  // Faixa do canal ganha da geral; entre iguais, a vigência mais recente.
  const especifica = cobrem.filter((f) => f.canalId === canalId);
  const usar = (especifica.length ? especifica : cobrem).sort((a, b) =>
    b.vigenciaInicio.localeCompare(a.vigenciaInicio)
  );
  return usar[0].valor;
}

export async function carregarCustos(): Promise<DadosCustos> {
  const sb = await clienteServidor();

  const [produtosRaw, anunciosRaw, pedidosRaw, exclusoes, faixasRaw, contasRaw] =
    await Promise.all([
      paginar(() =>
        sb
          .from("produtos")
          .select("id,sku,titulo,custo_unitario,embalagem,aliquota_impostos,peso_kg")
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
          .order("id")
      ),
      carregarExclusoes(),
      paginar(() =>
        sb
          .from("faixas_frete")
          .select("id,canal_id,peso_min_kg,peso_max_kg,valor,vigencia_inicio,canais(nome)")
          .order("peso_min_kg")
      ),
      sb.from("contas_canal").select("id,canal_id").limit(200),
    ]);

  type Prod = {
    id: string;
    sku: string;
    titulo: string;
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

  const produtos = produtosRaw as unknown as Prod[];
  const anuncios = anunciosRaw as unknown as Anun[];

  const faixas: FaixaFrete[] = (
    faixasRaw as unknown as {
      id: string;
      canal_id: string | null;
      peso_min_kg: string | number;
      peso_max_kg: string | number;
      valor: string | number;
      vigencia_inicio: string;
      canais: { nome: string } | null;
    }[]
  ).map((f) => ({
    id: f.id,
    canalId: f.canal_id,
    canalNome: f.canais?.nome ?? null,
    pesoMin: n(f.peso_min_kg),
    pesoMax: n(f.peso_max_kg),
    valor: n(f.valor),
    vigenciaInicio: String(f.vigencia_inicio).slice(0, 10),
  }));

  const canalDaConta = new Map(
    ((contasRaw.data ?? []) as { id: string; canal_id: string }[]).map((c) => [
      c.id,
      c.canal_id,
    ])
  );

  const { mantidas: pedidos } = aplicar(
    (pedidosRaw as unknown as Ped[]).map((p) => ({
      ...p,
      canalId: canalDaConta.get(p.conta_canal_id) ?? p.canal_id,
      contaCanalId: p.conta_canal_id,
    })),
    exclusoes
  );
  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]));

  /* ── O praticado, dos itens ── */

  const itens = await paginar(() =>
    sb
      .from("pedido_itens")
      .select("pedido_id,codigo_externo,quantidade,total")
      .order("pedido_id")
  );
  type Item = {
    pedido_id: string;
    codigo_externo: string;
    quantidade: number;
    total: string | number;
  };

  const anuncioPorMlb = new Map(anuncios.map((a) => [a.codigo_externo, a]));

  // Denominador do rateio: sem ele, o custo de um pedido com vários itens
  // iria inteiro para o primeiro.
  const totalDoPedido = new Map<string, number>();
  for (const it of itens as unknown as Item[]) {
    totalDoPedido.set(
      it.pedido_id,
      (totalDoPedido.get(it.pedido_id) ?? 0) + n(it.total)
    );
  }

  type Acum = {
    unidades: number;
    receita: number;
    comissao: number;
    receitaComComissao: number;
    frete: number;
    unidadesComFrete: number;
    juros: number;
    unidadesComJuros: number;
    canais: Set<string>;
  };
  const novo = (): Acum => ({
    unidades: 0, receita: 0,
    comissao: 0, receitaComComissao: 0,
    frete: 0, unidadesComFrete: 0,
    juros: 0, unidadesComJuros: 0,
    canais: new Set(),
  });
  const porProduto = new Map<string, Acum>();

  for (const it of itens as unknown as Item[]) {
    const p = pedidoPorId.get(it.pedido_id);
    if (!p || p.cancelado) continue;

    const a = anuncioPorMlb.get(it.codigo_externo);
    if (!a?.produto_id) continue;

    const at = porProduto.get(a.produto_id) ?? novo();
    const qtd = it.quantidade ?? 0;
    at.unidades += qtd;
    at.receita += n(it.total);
    at.canais.add(p.canal_id);

    const totalPed = totalDoPedido.get(it.pedido_id) ?? 0;
    const fatia = totalPed > 0 ? n(it.total) / totalPed : 1;

    // Só a comissão que passa na faixa entra: ver comissao-plausivel.ts.
    if (comissaoUtilizavel(p.comissao, p.total)) {
      at.comissao += n(p.comissao) * fatia;
      at.receitaComComissao += n(it.total);
    }
    // Frete e juros por UNIDADE, não sobre a receita: são valores fixos
    // por envio, não percentuais. Dividir pelo faturamento faria o frete
    // parecer menor só porque o produto é caro.
    if (p.frete_vendedor != null && n(p.frete_vendedor) > 0) {
      at.frete += n(p.frete_vendedor) * fatia;
      at.unidadesComFrete += qtd;
    }
    if (p.juros != null && n(p.juros) > 0) {
      at.juros += n(p.juros) * fatia;
      at.unidadesComJuros += qtd;
    }

    porProduto.set(a.produto_id, at);
  }

  /* ── Comissão de tabela, ponderada pelos anúncios do SKU ── */

  const anunciosPorProduto = new Map<string, Anun[]>();
  for (const a of anuncios) {
    if (!a.produto_id) continue;
    const lista = anunciosPorProduto.get(a.produto_id) ?? [];
    lista.push(a);
    anunciosPorProduto.set(a.produto_id, lista);
  }

  /* ── Monta ── */

  const linhas: CustoSku[] = produtos.map((prod) => {
    const ac = porProduto.get(prod.id);
    const meus = anunciosPorProduto.get(prod.id) ?? [];

    const comTarifa = meus.filter((a) => a.comissao_atual != null);
    const comissaoTabela = comTarifa.length
      ? r2(
          comTarifa.reduce((s, a) => s + n(a.comissao_atual), 0) /
            comTarifa.length
        )
      : null;

    const comissaoPraticada =
      ac && ac.receitaComComissao > 0
        ? r2((ac.comissao * 100) / ac.receitaComComissao)
        : null;

    const pesoKg = prod.peso_kg == null ? null : n(prod.peso_kg);
    // A faixa de canal só se aplica quando o SKU vende num canal só;
    // vendendo em vários, a geral é a única honesta.
    const canalUnico =
      ac && ac.canais.size === 1 ? [...ac.canais][0] : null;
    const freteTabela = freteDaFaixa(faixas, pesoKg, canalUnico);

    const fretePraticado =
      ac && ac.unidadesComFrete > 0 ? r2(ac.frete / ac.unidadesComFrete) : null;

    const jurosUnidade =
      ac && ac.unidadesComJuros > 0 ? r2(ac.juros / ac.unidadesComJuros) : null;

    const resolver = (
      tabela: number | null,
      praticado: number | null
    ): ValorComOrigem => ({
      tabela,
      praticado,
      origem: praticado != null ? "praticado" : tabela != null ? "tabela" : "ausente",
      valor: praticado ?? tabela,
    });

    const comissao = resolver(comissaoTabela, comissaoPraticada);
    const frete = resolver(freteTabela, fretePraticado);

    const precoMedio = ac && ac.unidades > 0 ? r2(ac.receita / ac.unidades) : null;
    const custoMercadoria = prod.custo_unitario == null ? null : n(prod.custo_unitario);
    const embalagem = prod.embalagem == null ? null : n(prod.embalagem);
    const aliquota = prod.aliquota_impostos == null ? null : n(prod.aliquota_impostos);

    /*
     * O que falta é nomeado, não presumido.
     *
     * Um único item nesta lista já impede a margem. É deliberado: margem
     * com um componente faltando não é margem aproximada, é outro número
     * com o mesmo nome.
     */
    const faltando: string[] = [];
    if (precoMedio == null) faltando.push("sem venda no período");
    if (custoMercadoria == null) faltando.push("custo de mercadoria");
    if (embalagem == null) faltando.push("embalagem");
    if (aliquota == null) faltando.push("alíquota de impostos");
    if (comissao.valor == null) faltando.push("comissão");
    if (frete.valor == null) {
      faltando.push(pesoKg == null ? "peso do produto" : "faixa de frete para o peso");
    }

    let margemUnidade: number | null = null;
    let margemPct: number | null = null;

    if (!faltando.length && precoMedio != null) {
      const custoComissao = (precoMedio * comissao.valor!) / 100;
      const custoImposto = (precoMedio * aliquota!) / 100;
      margemUnidade = r2(
        precoMedio -
          custoComissao -
          custoImposto -
          frete.valor! -
          (jurosUnidade ?? 0) -
          embalagem! -
          custoMercadoria!
      );
      margemPct = r2((margemUnidade * 100) / precoMedio);
    }

    return {
      produtoId: prod.id,
      sku: prod.sku,
      titulo: prod.titulo,
      anuncios: meus.length,
      unidades: ac?.unidades ?? 0,
      receita: r2(ac?.receita ?? 0),
      precoMedio,
      comissao,
      frete,
      jurosUnidade,
      custoMercadoria,
      embalagem,
      aliquotaImpostos: aliquota,
      pesoKg,
      margemUnidade,
      margemPct,
      faltando,
    };
  });

  // Quem vende mais primeiro: é onde preencher custo dá mais retorno.
  linhas.sort((a, b) => b.receita - a.receita);

  return {
    linhas,
    faixas,
    completos: linhas.filter((l) => l.margemUnidade != null).length,
    vazio: !linhas.length,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   Despesas de canal
   ═══════════════════════════════════════════════════════════════════ */

export type NaturezaCusto =
  | "ads"
  | "fixa_recorrente"
  | "variavel_recorrente"
  | "variavel_avulsa";

export type DespesaCanal = {
  id: string;
  canalId: string | null;
  canalNome: string | null;
  natureza: NaturezaCusto;
  descricao: string;
  valor: number;
  competencia: string;
};

export type CanalSimples = { id: string; nome: string };

/**
 * As despesas lançadas e os canais para escolher.
 *
 * A mídia aparece aqui vinda de `vendas_diarias`, não de lançamento
 * digitado: ela já é preenchida todo dia na tela de Lançamentos, com o
 * gasto do dia anterior. Redigitá-la aqui criaria duas versões do mesmo
 * número, e a divergência entre elas não teria como ser resolvida.
 */
export async function carregarDespesasCanal(): Promise<{
  despesas: DespesaCanal[];
  canais: CanalSimples[];
  adsPorMes: { competencia: string; canalNome: string; valor: number }[];
}> {
  const sb = await clienteServidor();

  const [lancRaw, canaisRaw, diariasRaw] = await Promise.all([
    paginar(() =>
      sb
        .from("lancamentos_financeiros")
        .select("id,canal_id,natureza,descricao,valor,competencia,canais(nome)")
        .not("natureza", "is", null)
        .order("competencia", { ascending: false })
    ),
    sb.from("canais").select("id,nome").order("nome"),
    paginar(() =>
      sb
        .from("vendas_diarias")
        .select("data,investimento_ads,canal_id")
        .gt("investimento_ads", 0)
        .order("data", { ascending: false })
    ),
  ]);

  const canais: CanalSimples[] = ((canaisRaw.data ?? []) as CanalSimples[]).map(
    (c) => ({ id: c.id, nome: c.nome })
  );
  const nomeDoCanal = new Map(canais.map((c) => [c.id, c.nome]));

  const despesas: DespesaCanal[] = (
    lancRaw as unknown as {
      id: string;
      canal_id: string | null;
      natureza: NaturezaCusto;
      descricao: string;
      valor: string | number;
      competencia: string;
      canais: { nome: string } | null;
    }[]
  ).map((l) => ({
    id: l.id,
    canalId: l.canal_id,
    canalNome: l.canais?.nome ?? null,
    natureza: l.natureza,
    descricao: l.descricao,
    valor: n(l.valor),
    competencia: String(l.competencia).slice(0, 10),
  }));

  // Mídia agregada por mês e canal, só para exibir ao lado das demais.
  const soma = new Map<string, number>();
  for (const d of diariasRaw as unknown as {
    data: string;
    investimento_ads: string | number;
    canal_id: string;
  }[]) {
    const chave = `${String(d.data).slice(0, 7)}|${d.canal_id}`;
    soma.set(chave, (soma.get(chave) ?? 0) + n(d.investimento_ads));
  }

  const adsPorMes = [...soma.entries()]
    .map(([chave, valor]) => {
      const [mes, canalId] = chave.split("|");
      return {
        competencia: `${mes}-01`,
        canalNome: nomeDoCanal.get(canalId) ?? "—",
        valor: r2(valor),
      };
    })
    .sort((a, b) => b.competencia.localeCompare(a.competencia) || b.valor - a.valor);

  return { despesas, canais, adsPorMes };
}
