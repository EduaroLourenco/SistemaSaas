import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { paginar } from "@/lib/dados/paginar";

/**
 * O relatório da operação, montado inteiro no servidor.
 *
 * Uma função, um objeto de saída. A tela não calcula nada — só mostra,
 * abre e fecha. Quando dois lugares calculam a mesma métrica, eles
 * divergem no primeiro ajuste, e a diretoria vê dois números para a mesma
 * pergunta.
 *
 * As regras de método estão em `docs/agents/inteligencia-de-mercado.md`.
 * Três valem repetir aqui porque o código as aplica direto:
 *
 *  - Visita existe no Mercado Livre. Não existe na Loja própria nem nos
 *    canais de planilha, e onde não existe a conversão vem `null`, nunca
 *    zero.
 *  - Dia em andamento não entra em média. Ele aparece marcado à parte.
 *  - Estoque e posição de catálogo vêm do BANCO: `anuncios.estoque` e
 *    `anuncio_catalogo_diario`, a linha mais recente de cada anúncio. Vinham
 *    de um arquivo gerado à mão, e ficaram uma semana atrasados sem avisar.
 */

/* ══════════════════════════════════════════════════════════════
   Tipos
   ══════════════════════════════════════════════════════════════ */

export type Variacao = {
  atual: number;
  anterior: number | null;
  media4: number | null;
  melhor: number | null;
  melhorQuando: string | null;
  /** Fração, não porcentagem. `null` quando não há base de comparação. */
  contraAnterior: number | null;
  contraMedia4: number | null;
  contraMelhor: number | null;
};

export type Metricas = {
  receita: Variacao;
  pedidos: Variacao;
  unidades: Variacao;
  ticket: Variacao;
  cancelamento: Variacao;
  /** `null` no canal sem medição de visita. */
  visitas: Variacao | null;
  conversao: Variacao | null;
};

export type BlocoCanal = {
  id: string;
  nome: string;
  canal: string;
  temVisita: boolean;
  metricas: Metricas;
  participacao: number;
  serie: { dia: string; receita: number; pedidos: number; visitas: number | null }[];
};

export type LinhaProduto = {
  sku: string | null;
  mlb: string;
  titulo: string;
  conta: string;
  tipo: string;
  curva: "A" | "B" | "C";
  receita90: number;
  unidades90: number;
  /** Receita e unidades da janela do relatório. */
  receitaPeriodo: number;
  unidadesPeriodo: number;
  precoVitrine: number | null;
  precoVisivel: number | null;
  emCampanha: boolean;
  precoMinimo: number | null;
  melhorPreco: number | null;
  melhorPorDia: number | null;
  melhorPeriodo: string | null;
  melhorAmostraFraca: boolean;
  estoque: number | null;
  situacao: string | null;
  coberturaDias: number | null;
  vendaDia: number;
  visitas: number | null;
  visitasDia: number | null;
  conversao: number | null;
  melhorConversao: number | null;
  custoUnitario: number | null;
  margemUnitaria: number | null;
  catalogo: {
    situacao: string;
    precoParaGanhar: number | null;
    fatiaVisita: string | null;
    alavancasAbertas: string[];
  } | null;
  elegivelForaCatalogo: boolean;
  diasSemVenda: number | null;
};

export type Pendencia = {
  titulo: string;
  detalhe: string;
  impacto: string;
  quem: "eduardo" | "sistema";
};

export type Prioridade = {
  titulo: string;
  numero: string;
  detalhe: string;
  onde: string;
  prazo: "semana" | "longo";
};

export type FonteEstado = {
  fonte: string;
  ate: string | null;
  atrasoDias: number | null;
  situacao: "ok" | "atencao" | "parado" | "ausente";
  detalhe: string;
};

export type CanalDoSku = {
  canal: string;
  contaId: string;
  temVisita: boolean;
  anuncios: number;
  pausados: number;
  situacao: "vendendo" | "parado" | "pausado" | "sem estoque" | "encerrado";
  preco: number | null;
  precoMinimo: number | null;
  estoque: number | null;
  semControleEstoque: boolean;
  emCampanha: boolean;
  unidades: number;
  unidadesAnterior: number;
  receita: number;
  visitas: number | null;
  conversao: number | null;
  /** O que separa este canal do que mais vende. Vazio no próprio líder. */
  diagnostico: string | null;
};

export type SkuMulticanal = {
  sku: string;
  titulo: string;
  canais: CanalDoSku[];
  /** Canal com mais unidades na janela; empate resolve pela receita. */
  lider: string | null;
  precoLider: number | null;
  /** Diferença entre o maior e o menor preço entre canais, em fração. */
  dispersao: number | null;
  unidades: number;
  unidadesAnterior: number;
  /** Receita que o canal parado fazia antes e deixou de fazer. */
  receitaEmRisco: number;
};

export type Relatorio = {
  geradoEm: string;
  /** Recorte ativo. `null` quando o relatório é da operação inteira. */
  canalAtivo: { id: string; nome: string; temVisita: boolean } | null;
  canaisDisponiveis: { id: string; nome: string; receita: number; temVisita: boolean }[];
  instantaneoEm: string;
  periodo: { de: string; ate: string; dias: number; hoje: string };
  /** O dia em andamento, à parte: não entra em nenhuma comparação. */
  hojeAteAgora: { data: string; receita: number; pedidos: number; unidades: number };
  janelas: { anterior: { de: string; ate: string }; media4: string; melhor: string };
  estadoDados: FonteEstado[];
  operacao: Metricas;
  canais: BlocoCanal[];
  produtos: LinhaProduto[];
  catalogo: {
    ganhando: number;
    dividindo: number;
    perdendo: number;
    fora: number;
    elegiveisFora: number;
    consultados: number;
    perdendoLista: { mlb: string; sku: string | null; titulo: string; precoAtual: number | null; precoParaGanhar: number | null; conta: string }[];
    alavancas: { id: string; abertas: number; rotulo: string }[];
  };
  estoque: {
    rupturaCurvaA: LinhaProduto[];
    encerradosCurvaA: LinhaProduto[];
    criticos: LinhaProduto[];
    parados: LinhaProduto[];
    pausados: { conta: string; quantidade: number }[];
  };
  multicanal: {
    /**
     * O mesmo SKU, loja a loja. É a análise que não tem recorte: ela existe
     * justamente para comparar os canais entre si.
     */
    skus: SkuMulticanal[];
    resumo: {
      skusEmMaisDeUmCanal: number;
      comPrecoDiferente: number;
      comCanalParado: number;
      receitaEmRisco: number;
    };
  };
  financeiro: {
    coberturaCusto: number;
    receitaComCusto: number;
    receitaTotal: number;
    margemApurada: number | null;
    produtosComCusto: number;
    produtosTotal: number;
  };
  trafegoPago: {
    temDado: boolean;
    de: string | null;
    ate: string | null;
    /** O dado cobre a mesma janela do relatório, ou é de outro período. */
    mesmaJanela: boolean;
    investimento: number;
    cliques: number;
    impressoes: number;
    receitaAtribuida: number;
    acos: number | null;
    anunciosNoVermelho: { sku: string | null; mlb: string; investimento: number; receita: number }[];
  };
  alavancas: { alavanca: string; ganho: number; detalhe: string }[];
  metas: {
    mes: string;
    meta: number;
    realizado: number;
    gap: number;
    diasRestantes: number;
    ritmoNecessario: number;
    ritmoAtual: number;
    decomposicao: { alavanca: string; ganho: number; detalhe: string }[];
  } | null;
  prioridades: Prioridade[];
  pendencias: Pendencia[];
  anotacoes: Record<string, string>;
  reputacao: { conta: string; nivel: string | null; categoria: string | null; reclamacoes: number | null; cancelamentos: number | null; perguntas: number | null }[];
  /**
   * Promoções: o que já foi decidido e o que sobrou de espaço.
   *
   * Sai de `processamentos_promocao` e `historico_promocoes`, que é o
   * registro do que a tela de Processar decidiu. Não é proposta — é o que
   * foi enviado ao canal.
   */
  promocoes: {
    ultimo: {
      quando: string;
      lidos: number;
      aprovados: number;
      reprovados: number;
      descontoExtra: number;
      taxa: number;
    } | null;
    /** Os processamentos da janela, para ver a taxa de aprovação andar. */
    historico: { quando: string; lidos: number; aprovados: number; taxa: number }[];
    porTipo: { tipo: string; aprovados: number; reprovados: number; taxa: number }[];
    /** Por que o canal recusou, agrupado. É a lista de trabalho. */
    motivos: { motivo: string; quantidade: number }[];
    /**
     * Onde o preço de tabela ficou ACIMA do que o canal propôs: a oferta não
     * cabe na margem, e é aqui que está a conversa com o consultor.
     */
    semEspaco: { mlb: string; sku: string | null; tabela: number; oferta: number; falta: number; campanha: string }[];
    /** Quanto a decisão cobriu da receita da janela. */
    cobertura: { anunciosDecididos: number; receitaCoberta: number; fatiaDaReceita: number } | null;
  };
};

/* ══════════════════════════════════════════════════════════════
   Ajudantes de data e conta
   ══════════════════════════════════════════════════════════════ */

const DIA = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const maisDias = (data: string, n: number) => iso(new Date(Date.parse(data + "T12:00:00Z") + n * DIA));
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DIA);

/** Hoje em Brasília: o servidor roda em UTC e viraria o dia às 21h. */
function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const divide = (a: number, b: number) => (b ? a / b : 0);
const r2 = (v: number) => Number(v.toFixed(2));
/** Taxas e fatias: quatro casas, para 12,34% não virar 12%. */
const r4 = (v: number) => Number(v.toFixed(4));
const reaisCurto = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

function variacao(
  atual: number,
  anterior: number | null,
  media4: number | null,
  melhor: { valor: number; quando: string } | null
): Variacao {
  const rel = (base: number | null) => (base != null && base !== 0 ? (atual - base) / base : null);
  return {
    atual: r2(atual),
    anterior: anterior == null ? null : r2(anterior),
    media4: media4 == null ? null : r2(media4),
    melhor: melhor ? r2(melhor.valor) : null,
    melhorQuando: melhor?.quando ?? null,
    contraAnterior: rel(anterior),
    contraMedia4: rel(media4),
    contraMelhor: rel(melhor?.valor ?? null),
  };
}

/**
 * A forma do retrato por conta e anúncio.
 *
 * Era `typeof` de um JSON de 672 KB, importado só para servir de tipo — e o
 * arquivo inteiro ia para o pacote por causa disso. Agora é declarado, e o
 * dado vem do banco.
 */
type AnuncioInstantaneo = {
  mlb: string;
  sku: string | null;
  titulo: string;
  tipo: string;
  /** Vocabulário do canal: active | paused | closed | encerrado. */
  situacao: string;
  estoque: number | null;
  vendidos: number | null;
  precoVitrine?: number | null;
  precoVisivel?: number | null;
  campanha?: string | null;
  emCatalogo?: boolean;
  elegivelCatalogo?: boolean | null;
  catalogo?: {
    status: string | null;
    precoParaGanhar: number | null;
    precoAtual: number | null;
    fatiaVisita: string | null;
    dividindoPrimeiro: number | null;
    motivo: string[];
    vencedorPreco: number | null;
    alavancas: { id: string; situacao: string }[];
  };
};

type Instantaneo = {
  geradoEm: string;
  contas: Record<
    string,
    {
      nome: string;
      seller: number;
      visitasConta: { dia: string; total: number }[];
      anuncios: AnuncioInstantaneo[];
      reputacao: {
        nivel: string | null;
        categoria: string | null;
        reclamacoes: number | null;
        cancelamentos: number | null;
      };
      perguntasSemResposta: number | null;
    }
  >;
};

const ROTULO_ALAVANCA: Record<string, string> = {
  fulfillment: "Envios Full",
  free_installments: "Parcelamento sem juros",
  free_shipping: "Frete grátis",
  shipping_collect: "Envio com coleta",
  same_day_shipping: "Envio no mesmo dia",
};

/* ══════════════════════════════════════════════════════════════
   O relatório
   ══════════════════════════════════════════════════════════════ */

export async function montarRelatorio(
  opcoes: { dias?: number; canal?: string | null } = {}
): Promise<Relatorio> {
  const sb = clientePrivilegiado();
  const hoje = hojeSP();
  const dias = opcoes.dias ?? 7;

  /*
   * A janela termina ONTEM, no último dia completo.
   *
   * Incluir hoje comparava um dia pela metade com sete dias inteiros, e a
   * conta saía torta para baixo em tudo: na medição de 28/09 a queda de
   * visita aparecia como 12% quando, por dia completo, era 6%. O dia em
   * andamento continua na tela, separado, porque ele interessa — só não
   * entra em média nem em comparação.
   */
  const ate = maisDias(hoje, -1);
  const de = maisDias(ate, -(dias - 1));
  const anteriorAte = maisDias(de, -1);
  const anteriorDe = maisDias(anteriorAte, -(dias - 1));
  const inicioAno = `${hoje.slice(0, 4)}-01-01`;

  /* ── Leitura ── */
  const [contas, pedidos, itens, visitasItem, anunciosDb, produtos, precosMinimos, metas, anotacoesDb, ads] =
    await Promise.all([
      sb.from("contas_canal").select("id,nome,identificador,operacao_id,canal_id,canais(nome,codigo)").then((r) => r.data ?? []),
      paginar<{ id: string; conta_canal_id: string; data: string; total: number; cancelado: boolean }>(() =>
        sb.from("pedidos").select("id,conta_canal_id,data,total,cancelado").gte("data", inicioAno).order("data")
      ),
      paginar<{
        pedido_id: string; codigo_externo: string; sku: string | null; quantidade: number; preco_unitario: number;
      }>(() =>
        sb.from("pedido_itens").select("pedido_id,codigo_externo,sku,quantidade,preco_unitario").order("pedido_id")
      ),
      paginar<{ anuncio_id: string; data: string; visitas: number }>(() =>
        sb.from("anuncio_desempenho_diario").select("anuncio_id,data,visitas").gte("data", maisDias(hoje, -120)).order("data")
      ),
      paginar<{
        id: string; codigo_externo: string; titulo: string; tipo: string; conta_canal_id: string;
        sku_canal: string | null; produto_id: string | null; sincronizado_em: string | null;
        status: string | null; estoque: number | null; preco_atual: number | null;
        vendidos_total: number | null;
      }>(() =>
        sb.from("anuncios").select("id,codigo_externo,titulo,tipo,conta_canal_id,sku_canal,produto_id,sincronizado_em,status,estoque,preco_atual,vendidos_total")
      ),
      paginar<{ id: string; sku: string; titulo: string; custo_unitario: number | null; embalagem: number | null; aliquota_impostos: number | null; curva: string | null }>(() =>
        sb.from("produtos").select("id,sku,titulo,custo_unitario,embalagem,aliquota_impostos,curva")
      ),
      paginar<{ chave_tipo: string; chave: string; preco: number; vigente_de: string }>(() =>
        sb.from("formula_base_precos").select("chave_tipo,chave,preco,vigente_de").eq("comissao", 0.045).order("vigente_de", { ascending: false })
      ),
      sb.from("metas").select("ano,mes,receita_meta,canal_id").then((r) => r.data ?? []),
      sb.from("anotacoes").select("entidade_id,texto").eq("entidade", "relatorio").then((r) => r.data ?? []),
      paginar<{ codigo_externo: string; inicio: string; fim: string; investimento: number; cliques: number; impressoes: number; receita: number }>(() =>
        sb.from("anuncio_ads").select("codigo_externo,inicio,fim,investimento,cliques,impressoes,receita").order("fim", { ascending: false })
      ),
    ]);

  /*
   * ── Catálogo, estoque e visita da conta: do BANCO ──
   *
   * Isto vinha de `instantaneo-meli.json`, um arquivo gerado à mão e
   * commitado. O comentário do topo dizia "enquanto a migração 21 não
   * rodou" — ela rodou, e o arquivo continuou sendo a fonte. Resultado: a
   * seção de estoque e a de catálogo mostravam o retrato de 28/09 enquanto
   * `anuncio_catalogo_diario` já tinha 1.957 linhas, a mais recente de hoje.
   *
   * O dado velho não se anuncia: a página dizia "ruptura na curva A" com
   * estoque de uma semana atrás, e quem lesse ia repor o que já foi
   * reposto.
   */
  const [catalogoDiario, visitasConta, processamentos, historicoPromo, reputacaoDiaria] = await Promise.all([
    paginar<{
      anuncio_id: string; data: string; situacao: string; preco_atual: number | null;
      preco_para_ganhar: number | null; fatia_visita: string | null; dividindo_primeiro: number | null;
      vencedor_preco: number | null; elegivel: boolean | null; motivos: string[] | null;
      alavancas: { id: string; situacao: string }[] | null;
    }>(() =>
      sb
        .from("anuncio_catalogo_diario")
        .select("anuncio_id,data,situacao,preco_atual,preco_para_ganhar,fatia_visita,dividindo_primeiro,vencedor_preco,elegivel,motivos,alavancas")
        .gte("data", maisDias(hoje, -14))
        .order("data", { ascending: false })
    ),
    paginar<{ conta_canal_id: string; data: string; visitas: number }>(() =>
      sb
        .from("vendas_diarias")
        .select("conta_canal_id,data,visitas")
        .gte("data", maisDias(hoje, -120))
        .order("data")
    ),
    paginar<{ executado_em: string; itens_lidos: number; itens_aprovados: number; itens_reprovados: number; desconto_extra: number | null }>(() =>
      sb
        .from("processamentos_promocao")
        .select("executado_em,itens_lidos,itens_aprovados,itens_reprovados,desconto_extra")
        .order("executado_em", { ascending: false })
    ),
    paginar<{ mlb: string; sku: string | null; campanha: string | null; tipo_campanha: string | null; status_aprovacao: string | null; motivo: string | null; preco_tabela: number | null; preco_oferta: number | null; data_processamento: string | null }>(() =>
      sb
        .from("historico_promocoes")
        .select("mlb,sku,campanha,tipo_campanha,status_aprovacao,motivo,preco_tabela,preco_oferta,data_processamento")
        .order("data_processamento", { ascending: false })
        .limit(4000)
    ),
    paginar<{ conta_canal_id: string; data: string; nivel: string | null; categoria: string | null; reclamacoes_taxa: number | null; cancelamentos_taxa: number | null; perguntas_sem_resposta: number | null }>(() =>
      sb
        .from("conta_reputacao_diaria")
        .select("conta_canal_id,data,nivel,categoria,reclamacoes_taxa,cancelamentos_taxa,perguntas_sem_resposta")
        .order("data", { ascending: false })
    ),
  ]);

  /*
   * O instantâneo, montado do banco com a MESMA FORMA do arquivo antigo.
   *
   * Trocar só a fonte, e não a estrutura, mantém os vinte pontos que a
   * consomem funcionando sem alteração. Reescrever cada um deles para ler
   * do banco direto seria um diff dez vezes maior, com dez vezes mais
   * chance de errar um campo.
   */
  const catalogoPorAnuncio = new Map<string, (typeof catalogoDiario)[number]>();
  for (const c of catalogoDiario) {
    // A lista vem com a data mais recente primeiro: o primeiro que chega vence.
    if (!catalogoPorAnuncio.has(c.anuncio_id)) catalogoPorAnuncio.set(c.anuncio_id, c);
  }

  /* A leitura mais recente de cada conta: a lista vem em ordem decrescente. */
  const reputacaoPorConta = new Map<string, (typeof reputacaoDiaria)[number]>();
  for (const r of reputacaoDiaria) {
    if (!reputacaoPorConta.has(r.conta_canal_id)) reputacaoPorConta.set(r.conta_canal_id, r);
  }

  const visitasPorConta = new Map<string, { dia: string; total: number }[]>();
  for (const v of visitasConta) {
    const lista = visitasPorConta.get(v.conta_canal_id) ?? [];
    lista.push({ dia: String(v.data).slice(0, 10), total: Number(v.visitas) || 0 });
    visitasPorConta.set(v.conta_canal_id, lista);
  }

  const instantaneo = {
    geradoEm: new Date().toISOString(),
    contas: Object.fromEntries(
      (contas as Record<string, unknown>[]).map((c) => {
        const id = String(c.id);
        const doBanco = anunciosDb.filter((a) => a.conta_canal_id === id);
        return [
          id,
          {
            nome: String(c.nome),
            // O `seller` do arquivo era o user_id do Meli; aqui vem do cadastro.
            seller: Number(c.identificador ?? 0),
            visitasConta: visitasPorConta.get(id) ?? [],
            reputacao: {
              nivel: reputacaoPorConta.get(id)?.nivel ?? null,
              categoria: reputacaoPorConta.get(id)?.categoria ?? null,
              reclamacoes: reputacaoPorConta.get(id)?.reclamacoes_taxa ?? null,
              cancelamentos: reputacaoPorConta.get(id)?.cancelamentos_taxa ?? null,
            },
            perguntasSemResposta: reputacaoPorConta.get(id)?.perguntas_sem_resposta ?? null,
            anuncios: doBanco.map((a) => {
              const cat = catalogoPorAnuncio.get(a.id);
              return {
                mlb: String(a.codigo_externo),
                sku: a.sku_canal,
                titulo: a.titulo,
                tipo: a.tipo === "premium" ? "Premium" : a.tipo === "classico" ? "Clássico" : "—",
                // O banco grava 'ativo'/'pausado'; o arquivo usava o rótulo do canal.
                situacao:
                  a.status === "ativo" ? "active"
                    : a.status === "pausado" ? "paused"
                      : a.status === "finalizado" ? "closed"
                        : "encerrado",
                estoque: a.estoque,
                vendidos: a.vendidos_total,
                precoVitrine: a.preco_atual,
                precoVisivel: a.preco_atual,
                campanha: null as string | null,
                /*
                 * "Está no catálogo" é ter linha em `anuncio_catalogo_diario`
                 * competindo: `not_listed` é elegível e FORA, que é
                 * justamente a oportunidade que a seção aponta.
                 */
                emCatalogo: Boolean(cat && cat.situacao !== "not_listed"),
                elegivelCatalogo: cat?.elegivel ?? null,
                catalogo: cat
                  ? {
                      status: cat.situacao,
                      precoParaGanhar: cat.preco_para_ganhar,
                      precoAtual: cat.preco_atual,
                      fatiaVisita: cat.fatia_visita,
                      dividindoPrimeiro: cat.dividindo_primeiro,
                      motivo: cat.motivos ?? [],
                      vencedorPreco: cat.vencedor_preco,
                      alavancas: cat.alavancas ?? [],
                    }
                  : undefined,
              };
            }),
          },
        ];
      })
    ),
  } as unknown as Instantaneo;

  /* ── Índices ── */
  type Conta = { id: string; nome: string; canal: string; codigo: string; temVisita: boolean };
  const contaDe = new Map<string, Conta>();
  for (const c of contas as Record<string, unknown>[]) {
    const canal = Array.isArray(c.canais) ? c.canais[0] : c.canais;
    const nomeCanal = String((canal as { nome?: string })?.nome ?? "");
    const codigo = String((canal as { codigo?: string })?.codigo ?? "");
    contaDe.set(String(c.id), {
      id: String(c.id),
      nome: String(c.nome),
      canal: nomeCanal,
      codigo,
      // Só o Mercado Livre entrega visita por anúncio hoje.
      temVisita: codigo === "mercado_livre",
    });
  }

  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]));
  const anuncioPorId = new Map(anunciosDb.map((a) => [a.id, a]));
  const anuncioPorCodigo = new Map(anunciosDb.map((a) => [String(a.codigo_externo).toUpperCase(), a]));
  const produtoPorSku = new Map(produtos.map((p) => [String(p.sku).toUpperCase(), p]));
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));

  /** Preço mínimo da Fórmula base vigente, por SKU e por MLB. */
  const minimoPorChave = new Map<string, number>();
  for (const p of precosMinimos) {
    const k = `${p.chave_tipo}:${String(p.chave).toUpperCase()}`;
    if (!minimoPorChave.has(k)) minimoPorChave.set(k, Number(p.preco));
  }
  const minimoDe = (sku: string | null, mlb: string) =>
    minimoPorChave.get(`sku:${String(sku ?? "").toUpperCase()}`) ??
    minimoPorChave.get(`mlb:${mlb.toUpperCase()}`) ??
    null;

  /** Instantâneo por MLB, das duas contas. */
  const instPorMlb = new Map<string, AnuncioInstantaneo & { contaNome: string }>();
  for (const [, dados] of Object.entries(instantaneo.contas)) {
    for (const a of dados.anuncios as AnuncioInstantaneo[]) {
      instPorMlb.set(a.mlb.toUpperCase(), { ...a, contaNome: dados.nome });
    }
  }

  /* ── Itens por pedido, com data e conta ── */
  type Venda = { data: string; conta: string; mlb: string; sku: string | null; q: number; preco: number; cancelado: boolean };
  const vendas: Venda[] = [];
  for (const it of itens) {
    const p = pedidoPorId.get(it.pedido_id);
    if (!p) continue;
    vendas.push({
      data: String(p.data).slice(0, 10),
      conta: p.conta_canal_id,
      mlb: String(it.codigo_externo).toUpperCase(),
      sku: it.sku ? String(it.sku).toUpperCase() : null,
      q: Number(it.quantidade) || 0,
      preco: Number(it.preco_unitario) || 0,
      cancelado: p.cancelado,
    });
  }

  /* ── Visitas por conta e por dia ──
   *
   * Duas fontes: o instantâneo traz visita da CONTA (o total que o canal
   * informa, 60 dias) e `anuncio_desempenho_diario` traz por anúncio. A
   * conta usa a primeira, que é a verdade do canal; o produto usa a
   * segunda, que é a única com grão de anúncio.
   */
  const visitaContaPorDia = new Map<string, Map<string, number>>();
  const idPorSeller = new Map<number, string>();
  for (const c of contaDe.values()) {
    const inst = Object.values(instantaneo.contas).find((x) => x.nome === c.nome);
    if (inst) idPorSeller.set(inst.seller, c.id);
  }
  for (const [, dados] of Object.entries(instantaneo.contas)) {
    const contaId = idPorSeller.get(dados.seller);
    if (!contaId) continue;
    const m = new Map<string, number>();
    for (const v of dados.visitasConta) m.set(v.dia, (m.get(v.dia) ?? 0) + v.total);
    visitaContaPorDia.set(contaId, m);
  }

  const visitaAnuncioPorDia = new Map<string, Map<string, number>>();
  for (const v of visitasItem) {
    const a = anuncioPorId.get(v.anuncio_id);
    if (!a) continue;
    const k = String(a.codigo_externo).toUpperCase();
    const m = visitaAnuncioPorDia.get(k) ?? new Map<string, number>();
    m.set(v.data, (m.get(v.data) ?? 0) + (Number(v.visitas) || 0));
    visitaAnuncioPorDia.set(k, m);
  }

  /* ══ Métricas de um recorte de conta e janela ══ */
  function metricasDe(contasAlvo: Set<string> | null, ini: string, fim: string) {
    const ped = pedidos.filter((p) => (!contasAlvo || contasAlvo.has(p.conta_canal_id)) && p.data >= ini && p.data <= fim);
    const validos = ped.filter((p) => !p.cancelado);
    const receita = soma(validos.map((p) => Number(p.total) || 0));
    const cancelados = ped.filter((p) => p.cancelado);
    const un = soma(
      vendas.filter((v) => !v.cancelado && (!contasAlvo || contasAlvo.has(v.conta)) && v.data >= ini && v.data <= fim).map((v) => v.q)
    );
    let visitas: number | null = null;
    const contasComVisita = new Set<string>();
    for (const [contaId, m] of visitaContaPorDia) {
      if (contasAlvo && !contasAlvo.has(contaId)) continue;
      contasComVisita.add(contaId);
      for (const [d, n] of m) if (d >= ini && d <= fim) visitas = (visitas ?? 0) + n;
    }

    /*
     * Conversão só conta a venda de quem tem visita medida.
     *
     * Somar as unidades dos oito canais e dividir pelas visitas das duas
     * contas do Mercado Livre daria uma conversão inventada — e alta, já
     * que a Loja própria faz 88% da receita e não mede visita. O
     * denominador manda no numerador.
     */
    const unidadesComVisita = soma(
      vendas
        .filter((v) => !v.cancelado && contasComVisita.has(v.conta) && v.data >= ini && v.data <= fim)
        .map((v) => v.q)
    );

    return {
      receita,
      pedidos: validos.length,
      unidades: un,
      ticket: divide(receita, validos.length),
      cancelamento: divide(cancelados.length, ped.length),
      visitas,
      conversao: visitas ? divide(unidadesComVisita, visitas) : null,
    };
  }

  /** As 52 semanas do ano, para achar a melhor. */
  function semanasDoAno(contasAlvo: Set<string> | null) {
    const out: { de: string; ate: string; m: ReturnType<typeof metricasDe> }[] = [];
    for (let fim = maisDias(ate, -dias); fim >= inicioAno; fim = maisDias(fim, -dias)) {
      const ini = maisDias(fim, -(dias - 1));
      if (ini < inicioAno) break;
      out.push({ de: ini, ate: fim, m: metricasDe(contasAlvo, ini, fim) });
    }
    return out;
  }

  function montarMetricas(contasAlvo: Set<string> | null, temVisita: boolean): Metricas {
    const atual = metricasDe(contasAlvo, de, ate);
    const anterior = metricasDe(contasAlvo, anteriorDe, anteriorAte);
    const semanas = semanasDoAno(contasAlvo);
    const quatro = semanas.slice(0, 4);
    const media = (f: (m: ReturnType<typeof metricasDe>) => number | null) => {
      const vs = quatro.map((s) => f(s.m)).filter((v): v is number => v != null);
      return vs.length ? soma(vs) / vs.length : null;
    };
    const melhorDe = (f: (m: ReturnType<typeof metricasDe>) => number | null) => {
      let best: { valor: number; quando: string } | null = null;
      for (const s of semanas) {
        const v = f(s.m);
        if (v == null) continue;
        if (!best || v > best.valor) best = { valor: v, quando: `${s.de.slice(8)}/${s.de.slice(5, 7)} a ${s.ate.slice(8)}/${s.ate.slice(5, 7)}` };
      }
      return best;
    };

    const campo = <K extends keyof ReturnType<typeof metricasDe>>(k: K) =>
      variacao(Number(atual[k] ?? 0), anterior[k] == null ? null : Number(anterior[k]), media((m) => m[k] as number | null), melhorDe((m) => m[k] as number | null));

    return {
      receita: campo("receita"),
      pedidos: campo("pedidos"),
      unidades: campo("unidades"),
      ticket: campo("ticket"),
      // Cancelamento: menor é melhor, então "melhor" aqui é o MENOR.
      cancelamento: (() => {
        const v = campo("cancelamento");
        let best: { valor: number; quando: string } | null = null;
        for (const s of semanas) {
          if (!s.m.pedidos) continue;
          if (!best || s.m.cancelamento < best.valor) best = { valor: s.m.cancelamento, quando: `${s.de.slice(8)}/${s.de.slice(5, 7)}` };
        }
        return { ...v, melhor: best ? r2(best.valor) : null, melhorQuando: best?.quando ?? null, contraMelhor: best && best.valor ? (v.atual - best.valor) / best.valor : null };
      })(),
      visitas: temVisita ? campo("visitas") : null,
      conversao: temVisita ? campo("conversao") : null,
    };
  }

  /*
   * O recorte vale para tudo, menos para a seção multicanal.
   *
   * Sem recorte, a operação soma os canais; com recorte, todo número da
   * página é daquele canal — KPI, produto, estoque, catálogo, mídia. A
   * comparação entre canais fica no lugar onde ela é o assunto.
   */
  const contaEscolhida = opcoes.canal ? contaDe.get(opcoes.canal) ?? null : null;
  const alvoOperacao = contaEscolhida ? new Set([contaEscolhida.id]) : null;
  const operacao = montarMetricas(alvoOperacao, contaEscolhida ? contaEscolhida.temVisita : true);

  /* ══ Canais ══ */
  const canais: BlocoCanal[] = [];
  for (const c of contaDe.values()) {
    const alvo = new Set([c.id]);
    const m = montarMetricas(alvo, c.temVisita);
    if (!m.receita.atual && !m.pedidos.atual && !m.receita.media4) continue;
    const serie: BlocoCanal["serie"] = [];
    for (let d = de; d <= ate; d = maisDias(d, 1)) {
      const dia = metricasDe(alvo, d, d);
      serie.push({ dia: d, receita: r2(dia.receita), pedidos: dia.pedidos, visitas: c.temVisita ? dia.visitas : null });
    }
    canais.push({
      id: c.id,
      nome: c.nome === "Conta principal" ? c.canal : `${c.canal} · ${c.nome}`,
      canal: c.canal,
      temVisita: c.temVisita,
      metricas: m,
      participacao: divide(m.receita.atual, operacao.receita.atual),
      serie,
    });
  }
  canais.sort((a, b) => b.metricas.receita.atual - a.metricas.receita.atual);

  /* ══ Produtos: curva, preço, estoque, catálogo ══ */
  const noventa = maisDias(hoje, -89);
  type Agregado = { receita90: number; unidades90: number; receitaPeriodo: number; unidadesPeriodo: number; porPreco: Map<number, { q: number; primeira: string; ultima: string }>; ultimaVenda: string | null };
  const porMlb = new Map<string, Agregado>();
  for (const v of vendas) {
    if (v.cancelado) continue;
    const a = porMlb.get(v.mlb) ?? { receita90: 0, unidades90: 0, receitaPeriodo: 0, unidadesPeriodo: 0, porPreco: new Map(), ultimaVenda: null };
    if (v.data >= noventa) { a.receita90 += v.q * v.preco; a.unidades90 += v.q; }
    if (v.data >= de && v.data <= ate) { a.receitaPeriodo += v.q * v.preco; a.unidadesPeriodo += v.q; }
    const p = Math.round(v.preco * 100) / 100;
    const g = a.porPreco.get(p) ?? { q: 0, primeira: v.data, ultima: v.data };
    g.q += v.q;
    if (v.data < g.primeira) g.primeira = v.data;
    if (v.data > g.ultima) g.ultima = v.data;
    a.porPreco.set(p, g);
    if (!a.ultimaVenda || v.data > a.ultimaVenda) a.ultimaVenda = v.data;
    porMlb.set(v.mlb, a);
  }

  const linhas: LinhaProduto[] = [];
  for (const [mlb, a] of porMlb) {
    if (contaEscolhida) {
      const anuncioDoRecorte = anuncioPorCodigo.get(mlb);
      if (!anuncioDoRecorte || anuncioDoRecorte.conta_canal_id !== contaEscolhida.id) continue;
    }
    const anuncio = anuncioPorCodigo.get(mlb);
    const inst = instPorMlb.get(mlb);
    const contaId = anuncio?.conta_canal_id;
    const conta = contaId ? contaDe.get(contaId) : null;
    const sku =
      (anuncio?.produto_id ? produtoPorId.get(anuncio.produto_id)?.sku : null) ??
      anuncio?.sku_canal ??
      inst?.sku ??
      vendas.find((v) => v.mlb === mlb && v.sku)?.sku ??
      null;
    const skuU = sku ? String(sku).toUpperCase() : null;
    const produto = skuU ? produtoPorSku.get(skuU) : undefined;

    /* Melhor preço: velocidade, e nunca em cima de uma venda só. */
    const grupos = [...a.porPreco.entries()].map(([preco, g]) => {
      const d = Math.max(1, diasEntre(g.primeira, g.ultima) + 1);
      return { preco, q: g.q, porDia: g.q / d, primeira: g.primeira, ultima: g.ultima };
    });
    const firmes = grupos.filter((g) => g.q >= 2).sort((x, y) => y.porDia - x.porDia);
    const melhor = firmes[0] ?? [...grupos].sort((x, y) => y.q - x.q)[0] ?? null;

    /*
     * Venda por dia da janela, e cobertura de estoque.
     *
     * Anúncio que vendeu no ano mas não aparece no instantâneo foi
     * ENCERRADO no canal. Não é estoque zero nem falta de leitura: a
     * receita dele existiu e o anúncio não existe mais. Sem esta
     * distinção, encerrado entra na lista de ruptura e manda repor
     * estoque de um anúncio que ninguém pode comprar.
     */
    const vendaDia = a.unidadesPeriodo / dias;
    const situacao = inst?.situacao ?? "encerrado";
    const estoque = inst ? inst.estoque : null;
    const cobertura = estoque != null && vendaDia > 0 ? estoque / vendaDia : null;

    const visitasJanela = (() => {
      const m = visitaAnuncioPorDia.get(mlb);
      if (!m) return null;
      let t = 0, achou = false;
      for (const [d, n] of m) if (d >= de && d <= ate) { t += n; achou = true; }
      return achou ? t : null;
    })();

    const melhorConversao = (() => {
      const m = visitaAnuncioPorDia.get(mlb);
      if (!m || !melhor) return null;
      let vis = 0;
      for (const [d, n] of m) if (d >= melhor.primeira && d <= melhor.ultima) vis += n;
      return vis >= 30 ? melhor.q / vis : null;
    })();

    const custo = produto?.custo_unitario != null ? Number(produto.custo_unitario) : null;
    const precoVisivel = inst?.precoVisivel ?? inst?.precoVitrine ?? null;
    const margem = custo != null && precoVisivel != null
      ? precoVisivel - custo - precoVisivel * Number(produto?.aliquota_impostos ?? 0) - Number(produto?.embalagem ?? 0)
      : null;

    linhas.push({
      sku: skuU,
      mlb,
      titulo: inst?.titulo ?? anuncio?.titulo ?? produto?.titulo ?? mlb,
      conta: conta ? (conta.nome === "Conta principal" ? conta.canal : `${conta.canal} · ${conta.nome}`) : "—",
      tipo: inst?.tipo ?? (anuncio?.tipo === "premium" ? "Premium" : anuncio?.tipo === "classico" ? "Clássico" : "—"),
      curva: "C",
      receita90: r2(a.receita90),
      unidades90: a.unidades90,
      receitaPeriodo: r2(a.receitaPeriodo),
      unidadesPeriodo: a.unidadesPeriodo,
      precoVitrine: inst?.precoVitrine ?? null,
      precoVisivel,
      emCampanha: Boolean(inst?.campanha),
      precoMinimo: minimoDe(skuU, mlb),
      melhorPreco: melhor?.preco ?? null,
      melhorPorDia: melhor ? r2(melhor.porDia) : null,
      melhorPeriodo: melhor ? `${melhor.primeira.slice(8)}/${melhor.primeira.slice(5, 7)} a ${melhor.ultima.slice(8)}/${melhor.ultima.slice(5, 7)}` : null,
      melhorAmostraFraca: !firmes.length,
      estoque,
      situacao,
      coberturaDias: cobertura == null ? null : Math.round(cobertura),
      vendaDia: r2(vendaDia),
      visitas: visitasJanela,
      visitasDia: visitasJanela == null ? null : r2(visitasJanela / dias),
      conversao: visitasJanela ? divide(a.unidadesPeriodo, visitasJanela) : null,
      melhorConversao,
      custoUnitario: custo,
      margemUnitaria: margem == null ? null : r2(margem),
      catalogo: inst?.catalogo?.status
        ? {
            situacao: inst.catalogo.status,
            precoParaGanhar: inst.catalogo.precoParaGanhar,
            fatiaVisita: inst.catalogo.fatiaVisita,
            alavancasAbertas: (inst.catalogo.alavancas ?? []).filter((x) => x.situacao === "opportunity").map((x) => ROTULO_ALAVANCA[x.id] ?? x.id),
          }
        : null,
      elegivelForaCatalogo: Boolean(inst?.elegivelCatalogo && !inst?.emCatalogo),
      diasSemVenda: a.ultimaVenda ? diasEntre(a.ultimaVenda, hoje) : null,
    });
  }

  /* Curva ABC por receita de 90 dias, dentro da operação. */
  linhas.sort((x, y) => y.receita90 - x.receita90);
  const totalReceita90 = soma(linhas.map((l) => l.receita90));
  let acumulado = 0;
  for (const l of linhas) {
    acumulado += l.receita90;
    const p = divide(acumulado, totalReceita90);
    l.curva = p <= 0.8 ? "A" : p <= 0.95 ? "B" : "C";
  }

  /* ══ Catálogo ══ */
  const comCatalogo = linhas.filter((l) => l.catalogo);
  const contaSituacao = (s: string) => comCatalogo.filter((l) => l.catalogo!.situacao === s).length;
  const alavancasAbertas = new Map<string, number>();
  for (const l of comCatalogo) for (const a of l.catalogo!.alavancasAbertas) alavancasAbertas.set(a, (alavancasAbertas.get(a) ?? 0) + 1);

  /* ══ Estoque ══ */
  const rupturaCurvaA = linhas.filter((l) => l.curva === "A" && (l.estoque === 0 || l.situacao === "paused"));
  /*
   * Encerrado só interessa enquanto a venda é recente.
   *
   * Anúncio fechado há meses que vendeu em julho não é decisão desta
   * semana — e havia 146 assim, o que afogava a lista. Com corte de 30
   * dias sobra o que ainda dá para republicar aproveitando a demanda.
   */
  const encerradosCurvaA = linhas.filter(
    (l) => l.curva === "A" && l.situacao === "encerrado" && (l.diasSemVenda ?? 999) <= 30
  );
  const criticos = linhas.filter((l) => l.coberturaDias != null && l.coberturaDias <= 14 && l.estoque! > 0);
  const parados = linhas.filter((l) => l.curva !== "C" && (l.diasSemVenda ?? 0) >= 14 && (l.estoque ?? 0) > 0);
  /*
   * Pausados só das contas que TÊM anúncio.
   *
   * O retrato passou a nascer do cadastro inteiro, e o cadastro tem uma
   * conta de canal por canal sem API — dezessete linhas chamadas "Conta
   * principal", todas com zero. Além de não informar nada, o React reclamava
   * de chave repetida vinte e oito vezes, porque a chave era o nome.
   */
  const pausados = Object.values(instantaneo.contas)
    .filter((c) => c.anuncios.length > 0)
    .filter((c) => !contaEscolhida || c.nome === contaEscolhida.nome)
    .map((c) => ({
      conta: c.nome,
      quantidade: c.anuncios.filter((a) => a.situacao === "paused").length,
    }));

  /* ══ Multicanal ══
   *
   * O mesmo SKU visto loja a loja, e o motivo de ele vender numa e não na
   * outra. É a única seção que ignora o filtro de canal — comparar canais
   * é justamente o que ela faz.
   *
   * O diagnóstico compara cada canal com o LÍDER, que é o canal que mais
   * vendeu peças na janela. Não afirma causa: diz o que está diferente no
   * canal parado. Preço maior, anúncio pausado, sem estoque e fora de
   * campanha são fatos; qual deles pesou é decisão de quem lê.
   */
  type Agrupado = {
    unidades: number; unidadesAnterior: number; receita: number;
    anuncios: number; pausados: number; encerrados: number; ativos: number;
    preco: number | null; precoMinimo: number | null;
    estoque: number; semControle: boolean; emCampanha: boolean;
    visitas: number; temVisita: boolean;
  };
  const novo = (): Agrupado => ({
    unidades: 0, unidadesAnterior: 0, receita: 0,
    anuncios: 0, pausados: 0, encerrados: 0, ativos: 0,
    preco: null, precoMinimo: null, estoque: 0, semControle: false, emCampanha: false,
    visitas: 0, temVisita: false,
  });

  const porSkuCanal = new Map<string, Map<string, Agrupado>>();
  const tituloDoSku = new Map<string, string>();

  /* Um anúncio por vez, inclusive os que não venderam: o canal parado só
     aparece se o anúncio dele entrar na conta. */
  for (const a of anunciosDb) {
    const conta = contaDe.get(a.conta_canal_id);
    if (!conta) continue;
    const mlb = String(a.codigo_externo).toUpperCase();
    const inst = instPorMlb.get(mlb);
    const sku =
      (a.produto_id ? produtoPorId.get(a.produto_id)?.sku : null) ?? a.sku_canal ?? inst?.sku ?? null;
    if (!sku) continue;
    const skuU = String(sku).toUpperCase();
    if (!tituloDoSku.get(skuU)) tituloDoSku.set(skuU, inst?.titulo ?? a.titulo ?? skuU);

    const nomeCanal = conta.nome === "Conta principal" ? conta.canal : `${conta.canal} · ${conta.nome}`;
    const m = porSkuCanal.get(skuU) ?? new Map<string, Agrupado>();
    const g = m.get(nomeCanal) ?? novo();
    g.anuncios += 1;
    g.temVisita = g.temVisita || conta.temVisita;
    if (!inst) g.encerrados += 1;
    else if (inst.situacao === "paused") g.pausados += 1;
    else {
      g.ativos += 1;
      // 40 mil é o marcador de "sem controle de estoque" do canal, e somar
      // isso daria 160 mil peças de um colchão.
      if ((inst.estoque ?? 0) >= 40_000) g.semControle = true;
      else g.estoque += inst.estoque ?? 0;
      const p = inst.precoVisivel ?? inst.precoVitrine;
      if (p != null) g.preco = g.preco == null ? p : Math.min(g.preco, p);
      if (inst.campanha) g.emCampanha = true;
    }
    const min = minimoDe(skuU, mlb);
    if (min != null) g.precoMinimo = g.precoMinimo == null ? min : Math.min(g.precoMinimo, min);

    if (conta.temVisita) {
      const vis = visitaAnuncioPorDia.get(mlb);
      if (vis) for (const [d, n] of vis) if (d >= de && d <= ate) g.visitas += n;
    }
    m.set(nomeCanal, g);
    porSkuCanal.set(skuU, m);
  }

  /* Vendas das duas janelas, no mesmo agrupamento. */
  for (const v of vendas) {
    if (v.cancelado) continue;
    const anuncio = anuncioPorCodigo.get(v.mlb);
    const conta = anuncio ? contaDe.get(anuncio.conta_canal_id) : contaDe.get(v.conta);
    if (!conta) continue;
    const sku =
      (anuncio?.produto_id ? produtoPorId.get(anuncio.produto_id)?.sku : null) ??
      v.sku ?? anuncio?.sku_canal ?? instPorMlb.get(v.mlb)?.sku ?? null;
    if (!sku) continue;
    const skuU = String(sku).toUpperCase();
    const nomeCanal = conta.nome === "Conta principal" ? conta.canal : `${conta.canal} · ${conta.nome}`;
    const m = porSkuCanal.get(skuU) ?? new Map<string, Agrupado>();
    const g = m.get(nomeCanal) ?? novo();
    if (v.data >= de && v.data <= ate) { g.unidades += v.q; g.receita += v.q * v.preco; }
    if (v.data >= anteriorDe && v.data <= anteriorAte) g.unidadesAnterior += v.q;
    if (!tituloDoSku.get(skuU)) tituloDoSku.set(skuU, instPorMlb.get(v.mlb)?.titulo ?? skuU);
    m.set(nomeCanal, g);
    porSkuCanal.set(skuU, m);
  }

  const skusMulticanal: SkuMulticanal[] = [];
  for (const [sku, canaisDoSku] of porSkuCanal) {
    if (canaisDoSku.size < 2) continue;

    /*
     * Canal sem anúncio e sem venda nas duas janelas não entra.
     *
     * Antes, um canal que vendeu o SKU há três meses aparecia como
     * "parado" com preço e estoque vazios — três linhas de ruído em cada
     * produto, e nenhuma delas acionável.
     */
    const bruto = [...canaisDoSku.entries()]
      .filter(([, g]) => g.anuncios > 0 || g.unidades > 0 || g.unidadesAnterior > 0)
      .map(([canal, g]) => {
      /* Canal sem anúncio cadastrado — a Loja própria e os marketplaces
         de planilha — só tem venda. Aí a situação vem da venda, não do
         estoque, que ninguém mediu. */
      const semCadastro = g.anuncios === 0;
      const situacao: CanalDoSku["situacao"] =
        g.unidades > 0 ? "vendendo"
        : semCadastro ? "parado"
        : g.ativos === 0 && g.pausados > 0 ? "pausado"
        : g.ativos === 0 && g.encerrados > 0 ? "encerrado"
        : g.ativos > 0 && !g.semControle && g.estoque === 0 ? "sem estoque"
        : "parado";
      return {
        canal,
        contaId: [...contaDe.values()].find((c) => (c.nome === "Conta principal" ? c.canal : `${c.canal} · ${c.nome}`) === canal)?.id ?? "",
        temVisita: g.temVisita,
        anuncios: g.anuncios,
        pausados: g.pausados,
        situacao,
        preco: g.preco,
        precoMinimo: g.precoMinimo,
        estoque: semCadastro || (g.semControle && !g.estoque) ? null : g.estoque,
        semControleEstoque: g.semControle,
        emCampanha: g.emCampanha,
        unidades: g.unidades,
        unidadesAnterior: g.unidadesAnterior,
        receita: r2(g.receita),
        visitas: g.temVisita ? g.visitas : null,
        conversao: g.temVisita && g.visitas ? g.unidades / g.visitas : null,
        diagnostico: null as string | null,
      };
    });

    const lider = [...bruto].sort(
      (a, b) => b.unidades - a.unidades || b.unidadesAnterior - a.unidadesAnterior || b.receita - a.receita
    )[0];
    if (!lider || (lider.unidades === 0 && lider.unidadesAnterior === 0)) continue;

    for (const c of bruto) {
      if (c.canal === lider.canal) continue;
      if (c.unidades > 0) continue;
      const motivos: string[] = [];
      if (c.anuncios === 0) motivos.push("sem anúncio cadastrado no sistema");
      if (c.situacao === "pausado") motivos.push("anúncio pausado");
      if (c.situacao === "sem estoque") motivos.push("sem estoque");
      if (c.situacao === "encerrado") motivos.push("anúncio encerrado");
      if (c.preco != null && lider.preco != null && c.preco > lider.preco * 1.05) {
        motivos.push(`preço ${Math.round(((c.preco - lider.preco) / lider.preco) * 100)}% acima de ${lider.canal}`);
      }
      if (!c.emCampanha && lider.emCampanha) motivos.push("fora da campanha que o outro canal tem");
      if (c.preco != null && c.precoMinimo != null && c.preco > c.precoMinimo * 1.05 && !motivos.length) {
        motivos.push(`${Math.round(((c.preco - c.precoMinimo) / c.preco) * 100)}% acima do próprio mínimo`);
      }
      if (!motivos.length && c.unidadesAnterior > 0) motivos.push("vendia na janela anterior e parou, sem mudança visível");
      c.diagnostico = motivos.length ? motivos.join(" · ") : null;
    }

    const precos = bruto.map((c) => c.preco).filter((p): p is number => p != null);
    const receitaEmRisco = soma(
      bruto.filter((c) => c.unidades === 0 && c.unidadesAnterior > 0 && c.preco != null).map((c) => c.unidadesAnterior * (c.preco as number))
    );

    skusMulticanal.push({
      sku,
      titulo: tituloDoSku.get(sku) ?? sku,
      canais: bruto.sort((a, b) => b.unidades - a.unidades || (a.preco ?? Infinity) - (b.preco ?? Infinity)),
      lider: lider.canal,
      precoLider: lider.preco,
      dispersao: precos.length > 1 ? divide(Math.max(...precos) - Math.min(...precos), Math.min(...precos)) : null,
      unidades: soma(bruto.map((c) => c.unidades)),
      unidadesAnterior: soma(bruto.map((c) => c.unidadesAnterior)),
      receitaEmRisco: r2(receitaEmRisco),
    });
  }

  /* Primeiro o que tem receita parada; depois o que só tem preço diferente. */
  skusMulticanal.sort(
    (a, b) => b.receitaEmRisco - a.receitaEmRisco || (b.dispersao ?? 0) - (a.dispersao ?? 0)
  );

  /* ══ Financeiro: cobertura de custo ══ */
  const receitaJanela = soma(linhas.map((l) => l.receitaPeriodo));
  const receitaComCusto = soma(linhas.filter((l) => l.custoUnitario != null).map((l) => l.receitaPeriodo));
  const produtosComCusto = produtos.filter((p) => Number(p.custo_unitario) > 0).length;

  /* ══ Metas do mês ══ */
  const mesAtual = Number(hoje.slice(5, 7));
  const anoAtual = Number(hoje.slice(0, 4));
  const metasMes = (metas as { ano: number; mes: number; receita_meta: number }[]).filter((m) => m.ano === anoAtual && m.mes === mesAtual);
  const metaTotal = soma(metasMes.map((m) => Number(m.receita_meta) || 0));
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const realizadoMes = metricasDe(null, inicioMes, hoje).receita;
  const diasNoMes = new Date(anoAtual, mesAtual, 0).getDate();
  const diasCorridos = Number(hoje.slice(8, 10));
  const diasRestantes = Math.max(1, diasNoMes - diasCorridos);
  const gap = metaTotal - realizadoMes;

  /* Decomposição do gap nas três alavancas, com os números da janela. */
  const at = metricasDe(null, de, ate);
  const conversaoAtual = at.conversao ?? 0;
  const melhorConversaoOperacao = (() => {
    const cs = semanasDoAno(null).map((s) => s.m.conversao).filter((v): v is number => v != null && v > 0);
    return cs.length ? Math.max(...cs) : null;
  })();
  const decomposicao: { alavanca: string; ganho: number; detalhe: string }[] = [];
  {
    if (melhorConversaoOperacao && conversaoAtual && melhorConversaoOperacao > conversaoAtual && at.visitas) {
      const ganhoUnidades = at.visitas * (melhorConversaoOperacao - conversaoAtual);
      decomposicao.push({
        alavanca: "Voltar à melhor conversão do ano",
        ganho: r2(ganhoUnidades * at.ticket * (30 / dias)),
        detalhe: `conversão de ${(conversaoAtual * 100).toFixed(2)}% para ${(melhorConversaoOperacao * 100).toFixed(2)}%, com as visitas de hoje`,
      });
    }
    const receitaPerdidaRuptura = soma(rupturaCurvaA.map((l) => (l.receita90 / 90) * 30));
    if (receitaPerdidaRuptura > 0) {
      decomposicao.push({
        alavanca: "Repor o que está em ruptura na curva A",
        ganho: r2(receitaPerdidaRuptura),
        detalhe: `${rupturaCurvaA.length} anúncios sem estoque ou pausados, no ritmo que vendiam em 90 dias`,
      });
    }
    const ganhoCatalogo = soma(
      comCatalogo
        .filter((l) => l.catalogo!.situacao !== "winning" && l.receita90 > 0)
        .map((l) => (l.receita90 / 90) * 30 * 0.3)
    );
    if (ganhoCatalogo > 0) {
      decomposicao.push({
        alavanca: "Recuperar posição de catálogo",
        ganho: r2(ganhoCatalogo),
        detalhe: "estimativa conservadora de 30% sobre o ritmo atual dos anúncios que não estão ganhando a página",
      });
    }
  }

  /* ══ Tráfego pago ══
   *
   * O Product Ads entra por planilha e a última importação foi de um
   * período fechado — por isso o bloco mostra ATÉ QUANDO o dado vai, em
   * vez de fingir que é da janela do relatório. Google Ads do site não
   * existe no banco; a pendência diz isso.
   */
  /*
   * Prefere a linha que cobre EXATAMENTE a janela do relatório.
   *
   * A mesma campanha é gravada em janelas diferentes — a do relatório e a
   * dos últimos 60 dias, por exemplo. Misturar as duas somaria o mesmo
   * gasto duas vezes; pegar a mais recente por data de fim traria o
   * período longo e diria que é da semana.
   */
  const daJanela = ads.filter((a) => a.inicio === de && a.fim === ate);
  const ultimoFimAds = daJanela.length ? ate : ads.length ? ads.map((a) => a.fim).sort().at(-1)! : null;
  const doRecorte = (codigo: string) => {
    if (!contaEscolhida) return true;
    const a = anuncioPorCodigo.get(String(codigo).toUpperCase());
    return Boolean(a && a.conta_canal_id === contaEscolhida.id);
  };
  const adsUltimoPeriodo = (daJanela.length
    ? daJanela
    : ultimoFimAds
      ? ads.filter((a) => a.fim === ultimoFimAds)
      : []
  ).filter((a) => doRecorte(a.codigo_externo));
  const adsInicio = adsUltimoPeriodo.length ? adsUltimoPeriodo[0].inicio : null;
  const investimentoAds = soma(adsUltimoPeriodo.map((a) => Number(a.investimento) || 0));
  const receitaAds = soma(adsUltimoPeriodo.map((a) => Number(a.receita) || 0));
  const porAnuncioAds = new Map<string, { investimento: number; receita: number }>();
  for (const a of adsUltimoPeriodo) {
    const k = String(a.codigo_externo).toUpperCase();
    const v = porAnuncioAds.get(k) ?? { investimento: 0, receita: 0 };
    v.investimento += Number(a.investimento) || 0;
    v.receita += Number(a.receita) || 0;
    porAnuncioAds.set(k, v);
  }
  const trafegoPago = {
    temDado: adsUltimoPeriodo.length > 0,
    de: adsInicio,
    ate: ultimoFimAds,
    mesmaJanela: daJanela.length > 0,
    investimento: r2(investimentoAds),
    cliques: soma(adsUltimoPeriodo.map((a) => Number(a.cliques) || 0)),
    impressoes: soma(adsUltimoPeriodo.map((a) => Number(a.impressoes) || 0)),
    receitaAtribuida: r2(receitaAds),
    acos: receitaAds ? divide(investimentoAds, receitaAds) : null,
    anunciosNoVermelho: [...porAnuncioAds.entries()]
      /* Metade da receita atribuída em mídia já é caro; sem receita
         atribuída nenhuma, é dinheiro sem retorno medido. */
      .filter(([, v]) => v.investimento > 20 && (v.receita === 0 || v.investimento > v.receita * 0.5))
      .sort((a, b) => b[1].investimento - a[1].investimento)
      .slice(0, 8)
      .map(([mlb, v]) => ({ mlb, sku: anuncioPorCodigo.get(mlb)?.sku_canal ?? null, investimento: r2(v.investimento), receita: r2(v.receita) })),
  };

  /* ══ Prioridades ══ */
  const prioridades: Prioridade[] = [];
  if (rupturaCurvaA.length) {
    prioridades.push({
      titulo: "Repor estoque da curva A",
      numero: `${rupturaCurvaA.length} anúncios · ${reaisCurto(soma(rupturaCurvaA.map((l) => l.receita90)))} em 90 dias`,
      detalhe: rupturaCurvaA.slice(0, 5).map((l) => `${l.sku ?? l.mlb} (${l.conta})`).join(", "),
      onde: "Estoque",
      prazo: "semana",
    });
  }
  const abaixoMinimo = linhas.filter((l) => l.precoMinimo != null && l.precoVisivel != null && l.precoVisivel < l.precoMinimo * 0.99 && l.curva !== "C");
  if (abaixoMinimo.length) {
    prioridades.push({
      titulo: "Corrigir preço abaixo do mínimo",
      numero: `${abaixoMinimo.length} anúncios`,
      detalhe: abaixoMinimo.slice(0, 5).map((l) => `${l.sku ?? l.mlb}: R$ ${l.precoVisivel?.toFixed(2)} contra mínimo de R$ ${l.precoMinimo?.toFixed(2)}`).join(" · "),
      onde: "Preço",
      prazo: "semana",
    });
  }
  const elegiveis = linhas.filter((l) => l.elegivelForaCatalogo);
  if (elegiveis.length) {
    prioridades.push({
      titulo: "Inscrever no catálogo quem é elegível e está fora",
      numero: `${elegiveis.length} anúncios`,
      detalhe: elegiveis.slice(0, 5).map((l) => l.sku ?? l.mlb).join(", "),
      onde: "Catálogo",
      prazo: "semana",
    });
  }
  if (encerradosCurvaA.length) {
    prioridades.push({
      titulo: "Anúncios encerrados que faturavam",
      numero: `${encerradosCurvaA.length} anúncios · ${reaisCurto(soma(encerradosCurvaA.map((l) => l.receita90)))} em 90 dias`,
      detalhe: "Venderam nos últimos 90 dias e não existem mais no canal. Republicar recupera histórico de posição; deixar assim, não.",
      onde: "Estoque",
      prazo: "longo",
    });
  }

  const totalPausados = soma(pausados.map((p) => p.quantidade));
  if (totalPausados) {
    prioridades.push({
      titulo: "Revisar anúncios pausados",
      numero: `${totalPausados} pausados`,
      detalhe: pausados.map((p) => `${p.conta}: ${p.quantidade}`).join(" · "),
      onde: "Catálogo",
      prazo: "longo",
    });
  }
  if (produtosComCusto < produtos.length) {
    prioridades.push({
      titulo: "Cadastrar custo do restante dos produtos",
      numero: `${produtos.length - produtosComCusto} de ${produtos.length} sem custo`,
      detalhe: `Com custo, a margem cobre ${(divide(receitaComCusto, receitaJanela) * 100).toFixed(0)}% da receita da janela`,
      onde: "Financeiro",
      prazo: "longo",
    });
  }
  const caros = linhas.filter((l) => l.curva !== "C" && l.melhorPreco != null && l.precoVisivel != null && l.precoVisivel > l.melhorPreco * 1.1 && !l.melhorAmostraFraca);
  if (caros.length) {
    prioridades.push({
      titulo: "Rever preço acima do que mais vendeu",
      numero: `${caros.length} anúncios de curva A e B`,
      detalhe: caros.slice(0, 5).map((l) => `${l.sku ?? l.mlb}: R$ ${l.precoVisivel?.toFixed(0)} contra R$ ${l.melhorPreco?.toFixed(0)}`).join(" · "),
      onde: "Preço",
      prazo: "semana",
    });
  }

  /* ══ Estado dos dados ══ */
  const ultimaSincronizacao = anunciosDb.reduce<string | null>((max, a) => (a.sincronizado_em && (!max || a.sincronizado_em > max) ? a.sincronizado_em : max), null);
  const ultimoPedido = pedidos.length ? pedidos[pedidos.length - 1].data : null;
  const ultimaVisita = visitasItem.length ? visitasItem[visitasItem.length - 1].data : null;
  const estado = (fonte: string, ateData: string | null, detalhe: string): FonteEstado => {
    const atraso = ateData ? diasEntre(ateData, hoje) : null;
    return {
      fonte,
      ate: ateData,
      atrasoDias: atraso,
      situacao: ateData == null ? "ausente" : atraso! <= 1 ? "ok" : atraso! <= 3 ? "atencao" : "parado",
      detalhe,
    };
  };
  const estadoDados: FonteEstado[] = [
    estado("Pedidos do Mercado Livre", ultimoPedido, "API, as duas contas"),
    estado("Visitas por anúncio", ultimaVisita, "API do Mercado Livre; começou em 06/08/2026"),
    estado("Estoque e catálogo", instantaneo.geradoEm.slice(0, 10), `instantâneo de ${new Date(instantaneo.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`),
    estado("Loja própria (VTEX)", pedidos.filter((p) => contaDe.get(p.conta_canal_id)?.codigo === "vtex").at(-1)?.data ?? null, "API da VTEX, só pedido pago"),
    {
      fonte: "Sincronização do catálogo",
      ate: ultimaSincronizacao ? ultimaSincronizacao.slice(0, 10) : null,
      atrasoDias: ultimaSincronizacao ? diasEntre(ultimaSincronizacao.slice(0, 10), hoje) : null,
      situacao: ultimaSincronizacao && diasEntre(ultimaSincronizacao.slice(0, 10), hoje) <= 1 ? "ok" : "atencao",
      detalhe: "manual, do computador do Eduardo — o agendamento não está ligado",
    },
  ];

  /* ══ Pendências ══ */
  const pendencias: Pendencia[] = [
    {
      titulo: "Visitas da Loja própria não existem",
      detalhe: "A VTEX não está conectada ao Analytics, então não há sessão nem visita da loja.",
      impacto: "Conversão e taxa de abandono da Loja própria ficam sem medição. Receita e pedido estão completos.",
      quem: "eduardo",
    },
    {
      titulo: "Sincronização automática desligada",
      detalhe: "Falta CRON_SECRET, MELI_APP_ID, MELI_CLIENT_SECRET e a autorização nova na Vercel.",
      impacto: "Hoje os dados só entram quando rodo à mão. Sem isso o relatório envelhece sozinho.",
      quem: "eduardo",
    },
    {
      titulo: `Custo cadastrado em ${produtosComCusto} de ${produtos.length} produtos`,
      detalhe: "Os 8 primeiros saíram do relatório de rentabilidade por anúncio. Falta o resto, e falta embalagem em todos.",
      impacto: `A margem cobre ${(divide(receitaComCusto, receitaJanela) * 100).toFixed(0)}% da receita da janela. Resultado por produto fica parcial.`,
      quem: "eduardo",
    },
    {
      titulo: "Mídia do Google Ads não entra",
      detalhe: "Não há tabela nem tela para a mídia do site. O Product Ads do Mercado Livre já vem por API, anúncio por anúncio.",
      impacto: "A leitura de tráfego pago cobre o Mercado Livre e deixa de fora a mídia que leva gente à Loja própria, que é 88% da receita.",
      quem: "eduardo",
    },
    {
      titulo: "Pedidos da Vtrina só por exportação manual",
      detalhe: "A API configurada da Vtrina só tem produto e catálogo; o token está criptografado para outro perfil do Windows.",
      impacto: "Casas Bahia, Magalu, Madeira Madeira e WebContinental entram por arquivo, e só até a data da última exportação.",
      quem: "eduardo",
    },
  ];

  /* ══ Anotações salvas ══ */
  const anotacoes: Record<string, string> = {};
  for (const a of anotacoesDb as { entidade_id: string; texto: string }[]) anotacoes[a.entidade_id] = a.texto;

  /* ══ Promoções: o que foi decidido, e onde não houve espaço ══
   *
   * Tudo aqui é REGISTRO, não proposta: `processamentos_promocao` guarda o
   * que a tela de Processar enviou ao canal, e `historico_promocoes` a
   * decisão de cada anúncio. A seção existe porque a decisão de promoção é
   * a alavanca de preço mais usada na operação e não aparecia em lugar
   * nenhum do relatório — ficava só no arquivo que foi enviado.
   */
  const ultimoProc = processamentos[0] ?? null;
  const promoUltimo = ultimoProc
    ? {
        quando: String(ultimoProc.executado_em),
        lidos: Number(ultimoProc.itens_lidos) || 0,
        aprovados: Number(ultimoProc.itens_aprovados) || 0,
        reprovados: Number(ultimoProc.itens_reprovados) || 0,
        descontoExtra: Number(ultimoProc.desconto_extra) || 0,
        taxa: r4(divide(Number(ultimoProc.itens_aprovados) || 0, Number(ultimoProc.itens_lidos) || 0)),
      }
    : null;

  const promoHistorico = processamentos.slice(0, 12).map((p) => ({
    quando: String(p.executado_em).slice(0, 10),
    lidos: Number(p.itens_lidos) || 0,
    aprovados: Number(p.itens_aprovados) || 0,
    taxa: r4(divide(Number(p.itens_aprovados) || 0, Number(p.itens_lidos) || 0)),
  }));

  /*
   * O recorte é o ÚLTIMO dia de processamento, não a janela do relatório.
   *
   * Promoção se decide em lote: olhar "os últimos sete dias" misturaria a
   * rodada de hoje com a de terça e somaria o mesmo anúncio duas vezes com
   * decisões diferentes. O que interessa é o estado da última decisão.
   */
  const diaUltimoProc = historicoPromo[0]?.data_processamento
    ? String(historicoPromo[0].data_processamento).slice(0, 10)
    : null;
  const promoDaRodada = diaUltimoProc
    ? historicoPromo.filter((h) => String(h.data_processamento).slice(0, 10) === diaUltimoProc)
    : [];

  const porTipoMap = new Map<string, { aprovados: number; reprovados: number }>();
  for (const h of promoDaRodada) {
    const k = h.tipo_campanha ?? "—";
    const a = porTipoMap.get(k) ?? { aprovados: 0, reprovados: 0 };
    if (h.status_aprovacao === "aprovado") a.aprovados += 1;
    else a.reprovados += 1;
    porTipoMap.set(k, a);
  }
  const promoPorTipo = [...porTipoMap]
    .map(([tipo, v]) => ({ tipo, ...v, taxa: r4(divide(v.aprovados, v.aprovados + v.reprovados)) }))
    .sort((a, b) => b.aprovados + b.reprovados - (a.aprovados + a.reprovados));

  /*
   * O motivo, quando o motor não escreveu nenhum.
   *
   * Na campanha COM redução a recusa é por tolerância: o motor compara e
   * devolve a ação, sem texto. "Sem motivo registrado" em 471 linhas não
   * informa nada — e o motivo está nos próprios números, que estão ali ao
   * lado.
   */
  const motivoMap = new Map<string, number>();
  for (const h of promoDaRodada) {
    if (h.status_aprovacao === "aprovado") continue;
    let m = (h.motivo ?? "").trim();
    if (!m) {
      const t = h.preco_tabela == null ? null : Number(h.preco_tabela);
      const o = h.preco_oferta == null ? null : Number(h.preco_oferta);
      m =
        t == null || o == null
          ? "sem preço de tabela para comparar"
          : t > o
            ? "proposta do canal abaixo do preço de tabela"
            : "fora da tolerância do canal";
    }
    motivoMap.set(m, (motivoMap.get(m) ?? 0) + 1);
  }
  const promoMotivos = [...motivoMap]
    .map(([motivo, quantidade]) => ({ motivo, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 8);

  /*
   * Sem espaço: a tabela pede mais do que o canal propôs.
   *
   * Ordenado pela FALTA, não pelo preço: o que está R$ 700 abaixo da margem
   * é outra conversa do que o que está R$ 5 abaixo, e é a primeira que vale
   * levar ao consultor.
   */
  /**
   * O nome da campanha legível.
   *
   * O que vem gravado é `<arquivo do canal> | <vigência>`, e o arquivo
   * carrega uuid e carimbo de hora — 74 caracteres que não dizem nada na
   * tela. Fica a vigência, que é o que identifica a campanha para quem lê.
   */
  const nomeCampanha = (bruto: string) => {
    const partes = bruto.split("|").map((x) => x.trim()).filter(Boolean);
    const legivel = partes.find((x) => !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(x) && !/^d|_/.test(x));
    return (legivel ?? partes.at(-1) ?? bruto).slice(0, 60);
  };

  const promoSemEspaco = promoDaRodada
    .filter(
      (h) =>
        h.status_aprovacao !== "aprovado" &&
        h.preco_tabela != null &&
        h.preco_oferta != null &&
        Number(h.preco_tabela) > Number(h.preco_oferta)
    )
    .map((h) => ({
      mlb: String(h.mlb),
      sku: h.sku,
      tabela: Number(h.preco_tabela),
      oferta: Number(h.preco_oferta),
      falta: r2(Number(h.preco_tabela) - Number(h.preco_oferta)),
      campanha: h.campanha ? nomeCampanha(h.campanha) : "—",
    }))
    .sort((a, b) => b.falta - a.falta)
    /*
     * Um anúncio por linha. Ele aparece numa candidata por campanha — um
     * deles cinco vezes — e repetido assim a lista mostrava cinco vezes o
     * mesmo problema em vez dos cinco maiores.
     */
    .filter((x, i, l) => l.findIndex((y) => y.mlb === x.mlb) === i)
    .slice(0, 15);

  /*
   * Quanto a rodada cobriu da receita: decisão em mil anúncios que não
   * vendem vale menos que em vinte que sustentam o mês.
   */
  const mlbsDecididos = new Set(promoDaRodada.map((h) => String(h.mlb).toUpperCase()));
  const receitaCoberta = soma(
    linhas.filter((l) => mlbsDecididos.has(l.mlb.toUpperCase())).map((l) => l.receitaPeriodo ?? 0)
  );
  const receitaDaJanela = soma(linhas.map((l) => l.receitaPeriodo ?? 0));
  const promoCobertura = mlbsDecididos.size
    ? {
        anunciosDecididos: mlbsDecididos.size,
        receitaCoberta: r2(receitaCoberta),
        fatiaDaReceita: r4(divide(receitaCoberta, receitaDaJanela)),
      }
    : null;

  return {
    geradoEm: new Date().toISOString(),
    canalAtivo: contaEscolhida
      ? { id: contaEscolhida.id, nome: contaEscolhida.nome === "Conta principal" ? contaEscolhida.canal : `${contaEscolhida.canal} · ${contaEscolhida.nome}`, temVisita: contaEscolhida.temVisita }
      : null,
    canaisDisponiveis: canais.map((c) => ({ id: c.id, nome: c.nome, receita: c.metricas.receita.atual, temVisita: c.temVisita })),
    instantaneoEm: instantaneo.geradoEm,
    periodo: { de, ate, dias, hoje },
    hojeAteAgora: (() => {
      const m = metricasDe(null, hoje, hoje);
      return { data: hoje, receita: r2(m.receita), pedidos: m.pedidos, unidades: m.unidades };
    })(),
    janelas: {
      anterior: { de: anteriorDe, ate: anteriorAte },
      media4: "média das 4 janelas anteriores",
      melhor: `melhor janela de ${dias} dias desde ${inicioAno.slice(8)}/${inicioAno.slice(5, 7)}`,
    },
    estadoDados,
    operacao,
    canais,
    produtos: linhas.filter((l) => l.curva !== "C" || l.unidadesPeriodo > 0),
    catalogo: {
      ganhando: contaSituacao("winning"),
      dividindo: contaSituacao("sharing_first_place"),
      perdendo: contaSituacao("losing"),
      fora: comCatalogo.filter((l) => ["not_listed", "listed"].includes(l.catalogo!.situacao)).length,
      elegiveisFora: elegiveis.length,
      consultados: comCatalogo.length,
      perdendoLista: comCatalogo
        .filter((l) => ["losing", "sharing_first_place"].includes(l.catalogo!.situacao))
        .map((l) => ({ mlb: l.mlb, sku: l.sku, titulo: l.titulo, precoAtual: l.precoVisivel, precoParaGanhar: l.catalogo!.precoParaGanhar, conta: l.conta })),
      alavancas: [...alavancasAbertas.entries()].map(([rotulo, abertas]) => ({ id: rotulo, rotulo, abertas })).sort((a, b) => b.abertas - a.abertas),
    },
    estoque: { rupturaCurvaA, encerradosCurvaA, criticos, parados, pausados },
    multicanal: {
      skus: skusMulticanal.slice(0, 60),
      resumo: {
        skusEmMaisDeUmCanal: skusMulticanal.length,
        comPrecoDiferente: skusMulticanal.filter((x) => (x.dispersao ?? 0) > 0.05).length,
        comCanalParado: skusMulticanal.filter((x) => x.canais.some((c) => c.diagnostico)).length,
        receitaEmRisco: r2(soma(skusMulticanal.map((x) => x.receitaEmRisco))),
      },
    },
    financeiro: {
      coberturaCusto: divide(receitaComCusto, receitaJanela),
      receitaComCusto: r2(receitaComCusto),
      receitaTotal: r2(receitaJanela),
      margemApurada: receitaComCusto
        ? divide(soma(linhas.filter((l) => l.margemUnitaria != null).map((l) => l.margemUnitaria! * l.unidadesPeriodo)), receitaComCusto)
        : null,
      produtosComCusto,
      produtosTotal: produtos.length,
    },
    metas: metaTotal > 0
      ? {
          mes: `${hoje.slice(5, 7)}/${hoje.slice(0, 4)}`,
          meta: r2(metaTotal),
          realizado: r2(realizadoMes),
          gap: r2(gap),
          diasRestantes,
          ritmoNecessario: r2(gap / diasRestantes),
          ritmoAtual: r2(realizadoMes / Math.max(1, diasCorridos)),
          decomposicao,
        }
      : null,
    trafegoPago,
    alavancas: decomposicao,
    prioridades,
    pendencias,
    anotacoes,
    reputacao: Object.values(instantaneo.contas)
      /*
       * Só conta com anúncio e leitura de reputação. As demais linhas de
       * `contas_canal` são de canal sem API — entravam como "Conta
       * principal" com tudo vazio, quinze vezes, porque o retrato agora
       * nasce do cadastro inteiro e não de duas contas fixas.
       */
      .filter((c) => c.anuncios.length > 0 && c.reputacao.nivel != null)
      .filter((c) => !contaEscolhida || c.nome === contaEscolhida.nome)
      .map((c) => ({
      conta: c.nome,
      nivel: c.reputacao.nivel,
      categoria: c.reputacao.categoria,
      reclamacoes: c.reputacao.reclamacoes,
      cancelamentos: c.reputacao.cancelamentos,
      perguntas: c.perguntasSemResposta,
    })),
    promocoes: {
      ultimo: promoUltimo,
      historico: promoHistorico,
      porTipo: promoPorTipo,
      motivos: promoMotivos,
      semEspaco: promoSemEspaco,
      cobertura: promoCobertura,
    },
  };
}
