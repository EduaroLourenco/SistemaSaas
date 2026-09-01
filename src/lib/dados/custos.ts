import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarBaseMargem, agregar } from "./margem";

/**
 * O cadastro de custo por SKU: o que preencher, e o que a venda revelou.
 *
 * ── A regra que organiza a tela ──
 *
 * Cada custo tem duas faces: o de TABELA, que vale antes de existir
 * venda, e o PRATICADO, que a venda revelou.
 *
 *   comissão   tabela = alíquota do anúncio (11,5% clássico, 16,5% premium)
 *              praticada = o que o canal reteve nos pedidos
 *
 *   frete      tabela = faixa de peso cadastrada
 *              praticado = frete do vendedor nos pedidos
 *
 * A diferença entre as duas não é erro de medição, é o achado. Tabela de
 * 11,5% com praticada de 7,4% é redução de campanha funcionando. Faixa de
 * R$ 40 com praticado de R$ 145 é prejuízo de logística.
 *
 * ── Os custos que ninguém informa ──
 *
 * Mercadoria, embalagem e alíquota de imposto não vêm de planilha
 * nenhuma. São digitados, ficam em `produtos`, e enquanto faltarem a
 * margem NÃO é calculada — `faltando` diz o que impede.
 *
 * Assumir custo zero produziria uma margem otimista e plausível, que é o
 * pior resultado possível: quem decide preço com ela erra para baixo e
 * não descobre. Margem vazia incomoda; margem errada engana.
 *
 * ── De onde vem a margem ──
 *
 * De `margem.ts`, agregada por SKU — não calculada aqui.
 *
 * A primeira versão fazia a própria conta, sobre as médias do SKU: preço
 * médio menos comissão média menos frete médio. Isso daria um número
 * diferente do da tela de Financeiro para os mesmos dados, porque a
 * margem da média não é a média das margens — preço e comissão variam
 * entre pedidos do mesmo anúncio. Duas telas discordando sobre a margem
 * do mesmo SKU é pior que não ter nenhuma das duas.
 *
 * As médias continuam aqui: são o que se olha para decidir onde cadastrar
 * custo primeiro. Mas quem soma a margem é uma implementação só.
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
  /** Juro do parcelamento, em reais por unidade. */
  jurosUnidade: number | null;

  /* Preenchidos à mão, em `produtos`. */
  custoMercadoria: number | null;
  embalagem: number | null;
  aliquotaImpostos: number | null;
  pesoKg: number | null;

  /* Vindos de margem.ts. */
  margemUnidade: number | null;
  margemPct: number | null;
  faltando: string[];
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

export type DadosCustos = {
  linhas: CustoSku[];
  faixas: FaixaFrete[];
  /** Quantos SKUs já têm margem calculável. */
  completos: number;
  vazio: boolean;
};

export async function carregarCustos(): Promise<DadosCustos> {
  const sb = await clienteServidor();

  const [produtosRaw, anunciosRaw, faixasRaw, base] = await Promise.all([
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
        .from("faixas_frete")
        .select("id,canal_id,peso_min_kg,peso_max_kg,valor,vigencia_inicio,canais(nome)")
        .order("peso_min_kg")
    ),
    carregarBaseMargem(),
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

  /* ── O praticado, dos itens já resolvidos pelo motor ── */

  type Acum = {
    unidades: number;
    receita: number;
    comissao: number;
    receitaComComissao: number;
    frete: number;
    unidadesComFrete: number;
    juros: number;
    unidadesComJuros: number;
    /** Unidades por tipo de anúncio: pondera a tarifa de tabela do SKU. */
    unidadesPorTipo: Map<string, number>;
  };
  const novo = (): Acum => ({
    unidades: 0, receita: 0,
    comissao: 0, receitaComComissao: 0,
    frete: 0, unidadesComFrete: 0,
    juros: 0, unidadesComJuros: 0,
    unidadesPorTipo: new Map(),
  });
  const porProduto = new Map<string, Acum>();

  for (const it of base.itens) {
    if (!it.produtoId) continue;
    const at = porProduto.get(it.produtoId) ?? novo();

    at.unidades += it.quantidade;
    at.receita += it.receita;
    at.unidadesPorTipo.set(
      it.anuncioTipo,
      (at.unidadesPorTipo.get(it.anuncioTipo) ?? 0) + it.quantidade
    );

    /*
     * Só o custo MEDIDO entra na média do praticado.
     *
     * Incluir o estimado por tabela faria a coluna "praticado" repetir a
     * de tabela e sumir com a diferença entre as duas — que é justamente
     * o que a tela existe para mostrar.
     */
    if (it.comissaoOrigem === "praticado" && it.comissao != null) {
      at.comissao += it.comissao;
      at.receitaComComissao += it.receita;
    }
    if (it.freteOrigem === "praticado" && it.frete != null) {
      at.frete += it.frete;
      at.unidadesComFrete += it.quantidade;
    }
    if (it.juros > 0) {
      at.juros += it.juros;
      at.unidadesComJuros += it.quantidade;
    }

    porProduto.set(it.produtoId, at);
  }

  /* ── A margem, agregada por SKU pelo motor ── */

  const margemPorSku = new Map(agregar(base, "sku").map((l) => [l.chave, l]));

  const anunciosPorProduto = new Map<string, Anun[]>();
  for (const a of anuncios) {
    if (!a.produto_id) continue;
    const lista = anunciosPorProduto.get(a.produto_id) ?? [];
    lista.push(a);
    anunciosPorProduto.set(a.produto_id, lista);
  }

  /** Frete de tabela, só para exibir ao lado do praticado. */
  function freteDaFaixa(pesoKg: number | null): number | null {
    if (pesoKg == null) return null;
    const cobrem = faixas.filter((f) => pesoKg >= f.pesoMin && pesoKg <= f.pesoMax);
    if (!cobrem.length) return null;
    return [...cobrem].sort((a, b) =>
      b.vigenciaInicio.localeCompare(a.vigenciaInicio)
    )[0].valor;
  }

  const linhas: CustoSku[] = produtos.map((prod) => {
    const ac = porProduto.get(prod.id);
    const meus = anunciosPorProduto.get(prod.id) ?? [];
    const agregada = margemPorSku.get(prod.sku);

    /*
     * A tarifa de tabela do SKU, ponderada pelo que cada tipo vendeu.
     *
     * A média simples entre os anúncios estava errada: 138 dos 142 SKUs
     * vivem em clássico E premium, e a média de 11,5% com 16,5% dá 14% —
     * uma alíquota que não existe em anúncio nenhum. Se o SKU vende
     * quase tudo no clássico, a tabela dele é 11,5%, não 14%.
     *
     * Sem venda registrada, cai na média simples: não há peso para
     * aplicar, e aí a média entre os tipos é o menos pior.
     */
    const comTarifa = meus.filter((a) => a.comissao_atual != null);
    let comissaoTabela: number | null = null;
    if (comTarifa.length) {
      let peso = 0;
      let soma = 0;
      for (const a of comTarifa) {
        const un = ac?.unidadesPorTipo.get(a.tipo) ?? 0;
        peso += un;
        soma += n(a.comissao_atual) * un;
      }
      comissaoTabela =
        peso > 0
          ? r2(soma / peso)
          : r2(
              comTarifa.reduce((s, a) => s + n(a.comissao_atual), 0) /
                comTarifa.length
            );
    }

    const comissaoPraticada =
      ac && ac.receitaComComissao > 0
        ? r2((ac.comissao * 100) / ac.receitaComComissao)
        : null;

    const pesoKg = prod.peso_kg == null ? null : n(prod.peso_kg);
    const freteTabela = freteDaFaixa(pesoKg);
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
      origem:
        praticado != null ? "praticado" : tabela != null ? "tabela" : "ausente",
      valor: praticado ?? tabela,
    });

    const comissao = resolver(comissaoTabela, comissaoPraticada);
    const frete = resolver(freteTabela, fretePraticado);

    const precoMedio = ac && ac.unidades > 0 ? r2(ac.receita / ac.unidades) : null;
    const custoMercadoria =
      prod.custo_unitario == null ? null : n(prod.custo_unitario);
    const embalagem = prod.embalagem == null ? null : n(prod.embalagem);
    const aliquota =
      prod.aliquota_impostos == null ? null : n(prod.aliquota_impostos);

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
      faltando.push(
        pesoKg == null ? "peso do produto" : "faixa de frete para o peso"
      );
    }

    // Vem do motor, por unidade. Quando ele não a calculou, algum item
    // ficou incompleto — e `faltando` já diz o quê.
    const margemUnidade =
      agregada?.margem != null && agregada.unidades > 0
        ? r2(agregada.margem / agregada.unidades)
        : null;

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
      margemPct: agregada?.margemPct ?? null,
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
