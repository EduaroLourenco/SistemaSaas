import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/**
 * Disputa de catálogo: estou ganhando, e por quanto.
 *
 * ── O que estava errado ──
 *
 * A tela "Catálogo" listava anúncios — preço, comissão, histórico. Útil,
 * mas não era disputa de catálogo nenhuma, e o nome prometia a outra
 * coisa: quem abria não descobria se estava ganhando a página do produto.
 *
 * O dado existe desde a migração 21, em `anuncio_catalogo_diario`, e é
 * exatamente o que o Mercado Livre responde por anúncio de catálogo:
 * situação, preço do vencedor, preço que faria ganhar, fatia de visita que
 * a posição dá, e as alavancas fora de preço.
 *
 * ── As três perguntas, nesta ordem ──
 *
 *   1. ganho ou perco HOJE, e em quantos dos dias medidos;
 *   2. quanto falta em reais para ganhar — `preco_para_ganhar` contra o
 *      meu preço, que é a decisão de baixar ou deixar;
 *   3. dá para ganhar SEM baixar preço — as alavancas marcadas como
 *      oportunidade (full, frete grátis, parcelamento) são exatamente isso.
 *
 * ── O que esta tela recusa ──
 *
 * Recomendar baixar preço. A diferença até `preco_para_ganhar` aparece em
 * reais e em percentual, e a decisão depende da margem, que vive em Preço
 * alvo. Dizer "baixe para R$ 1.560" sem olhar custo é o conselho que faz
 * vender no prejuízo com cara de recomendação do sistema.
 */

export type SituacaoDisputa = "ganhando" | "dividindo" | "competindo" | "listado" | "fora";

/** A fatia de visita que a posição dá, como o canal classifica. */
export type Fatia = "maxima" | "alta" | "media" | "baixa" | null;

export type LinhaDisputa = {
  mlb: string;
  sku: string;
  titulo: string;
  conta: string;
  tipo: string;
  estoque: number | null;
  /** O retrato do dia mais recente em que este anúncio foi medido. */
  dia: string;
  situacao: SituacaoDisputa;
  fatia: Fatia;
  /** Quantos vendedores dividem o primeiro lugar, quando dividem. */
  dividindoCom: number | null;
  meuPreco: number | null;
  precoVencedor: number | null;
  precoParaGanhar: number | null;
  /** Quanto o meu preço está acima do que ganharia. Null quando já ganha. */
  faltaReais: number | null;
  faltaPct: number | null;
  diasGanhando: number;
  diasMedidos: number;
  elegivel: boolean;
  motivos: string[];
  /** Alavancas que o canal marca como oportunidade, já traduzidas. */
  alavancas: string[];
};

export type DadosDisputa = {
  vazio: boolean;
  /** O dia mais recente com medição, e desde quando há registro. */
  ultimoDia: string | null;
  primeiroDia: string | null;
  diasNaJanela: number;
  linhas: LinhaDisputa[];
  resumo: {
    ganhando: number;
    dividindo: number;
    competindo: number;
    listado: number;
    fora: number;
    /** Perdendo com preço conhecido para ganhar — a fila de decisão. */
    comCaminhoDePreco: number;
    /** Quanto de receita diária está em anúncio que não ganha. */
    semGanharComEstoque: number;
  };
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

/* A situação vem em inglês, do canal. "losing" nunca apareceu nos dados —
   o canal manda "competing" — mas fica mapeado para não virar "fora" por
   omissão se um dia vier. */
const SITUACOES: Record<string, SituacaoDisputa> = {
  winning: "ganhando",
  sharing_first_place: "dividindo",
  competing: "competindo",
  losing: "competindo",
  listed: "listado",
  not_listed: "fora",
};

const FATIAS: Record<string, Fatia> = {
  maximum: "maxima",
  high: "alta",
  medium: "media",
  low: "baixa",
};

/* Só as alavancas que o canal marca como OPORTUNIDADE entram, e com o nome
   que o lojista usa. As marcadas como `boosted` já estão ligadas: listá-las
   encheria a coluna de coisa que não é ação. */
const ALAVANCAS: Record<string, string> = {
  fulfillment: "Full",
  free_shipping: "frete grátis",
  free_installments: "parcelamento sem juros",
  shipping_collect: "coleta",
  same_day_shipping: "envio no mesmo dia",
};

type Sb = Awaited<ReturnType<typeof clienteServidor>>;

/**
 * Só a situação mais recente de cada anúncio na disputa, por `anuncio_id`.
 *
 * Existe para o Tráfego pago poder marcar a linha com a etiqueta de
 * catálogo sem arrastar a tela de disputa inteira: lê duas colunas, não as
 * onze que `carregarDisputa` precisa.
 *
 * O "mais recente" é por anúncio, e não o último dia do conjunto: anúncio
 * que saiu do catálogo para de ser medido, e usar a data global o deixaria
 * sem etiqueta como se nunca tivesse disputado.
 */
export async function situacaoDeCatalogo(sb: Sb): Promise<Map<string, SituacaoDisputa>> {
  const linhas = await paginar(() =>
    sb.from("anuncio_catalogo_diario").select("anuncio_id,data,situacao").order("data")
  );
  const ultimo = new Map<string, { data: string; situacao: string }>();
  for (const l of linhas as unknown as { anuncio_id: string; data: string; situacao: string }[]) {
    const atual = ultimo.get(l.anuncio_id);
    if (!atual || String(l.data) >= atual.data) ultimo.set(l.anuncio_id, { data: String(l.data), situacao: l.situacao });
  }
  return new Map([...ultimo].map(([id, u]) => [id, SITUACOES[u.situacao] ?? "fora"]));
}

export async function carregarDisputa(): Promise<DadosDisputa> {
  const sb = await clienteServidor();

  type Dia = {
    anuncio_id: string;
    data: string;
    situacao: string;
    preco_atual: string | number | null;
    preco_para_ganhar: string | number | null;
    vencedor_preco: string | number | null;
    fatia_visita: string | null;
    dividindo_primeiro: number | null;
    elegivel: boolean | null;
    motivos: string[] | null;
    alavancas: { id?: string; situacao?: string }[] | null;
  };
  type Anun = {
    id: string;
    codigo_externo: string;
    sku_canal: string | null;
    titulo: string;
    tipo: string;
    estoque: number | null;
    contas_canal: { nome: string; canais: { nome: string } | null } | null;
  };

  const [dias, anuncios] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncio_catalogo_diario")
        .select(
          "anuncio_id,data,situacao,preco_atual,preco_para_ganhar,vencedor_preco,fatia_visita,dividindo_primeiro,elegivel,motivos,alavancas"
        )
        .order("data")
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select("id,codigo_externo,sku_canal,titulo,tipo,estoque,contas_canal(nome,canais(nome))")
        .order("codigo_externo")
    ),
  ]);

  const registros = dias as unknown as Dia[];
  if (!registros.length) {
    return {
      vazio: true,
      ultimoDia: null,
      primeiroDia: null,
      diasNaJanela: 0,
      linhas: [],
      resumo: { ganhando: 0, dividindo: 0, competindo: 0, listado: 0, fora: 0, comCaminhoDePreco: 0, semGanharComEstoque: 0 },
    };
  }

  const datas = [...new Set(registros.map((d) => String(d.data).slice(0, 10)))].sort();
  const ultimoDia = datas[datas.length - 1];
  const primeiroDia = datas[0];

  const info = new Map((anuncios as unknown as Anun[]).map((a) => [a.id, a]));

  /*
   * Um acumulador por anúncio: o retrato MAIS RECENTE dele, e a contagem
   * dos dias em que ganhou.
   *
   * O retrato mais recente é por anúncio e não global: anúncio que saiu do
   * catálogo deixa de ser medido, e usar só o último dia do conjunto o
   * faria desaparecer da tela sem dizer por quê.
   */
  type Ac = { ultimo: Dia; ganhando: number; medidos: number };
  const porAnuncio = new Map<string, Ac>();
  for (const d of registros) {
    const atual = porAnuncio.get(d.anuncio_id);
    const ganhou = d.situacao === "winning" || d.situacao === "sharing_first_place" ? 1 : 0;
    if (!atual) {
      porAnuncio.set(d.anuncio_id, { ultimo: d, ganhando: ganhou, medidos: 1 });
      continue;
    }
    atual.medidos += 1;
    atual.ganhando += ganhou;
    if (String(d.data) >= String(atual.ultimo.data)) atual.ultimo = d;
  }

  const linhas: LinhaDisputa[] = [];
  for (const [anuncioId, ac] of porAnuncio) {
    const a = info.get(anuncioId);
    if (!a) continue; // anúncio apagado: sem SKU nem título, a linha não diria nada
    const u = ac.ultimo;
    const situacao = SITUACOES[u.situacao] ?? "fora";
    const meuPreco = u.preco_atual == null ? null : n(u.preco_atual);
    const paraGanhar = u.preco_para_ganhar == null ? null : n(u.preco_para_ganhar);

    /*
     * A diferença só existe para quem NÃO ganha. O canal continua mandando
     * `preco_para_ganhar` para quem já está na frente, e mostrar "falta
     * R$ 60" para quem ganha seria convidar a baixar preço de graça.
     */
    const ganha = situacao === "ganhando" || situacao === "dividindo";
    const falta =
      !ganha && meuPreco != null && paraGanhar != null && meuPreco > paraGanhar ? r2(meuPreco - paraGanhar) : null;

    linhas.push({
      mlb: a.codigo_externo,
      sku: a.sku_canal ?? "",
      titulo: a.titulo,
      conta: a.contas_canal ? `${a.contas_canal.canais?.nome ?? "Canal"} · ${a.contas_canal.nome}` : "Conta principal",
      tipo: a.tipo === "premium" ? "Premium" : "Clássico",
      estoque: a.estoque,
      dia: String(u.data).slice(0, 10),
      situacao,
      fatia: u.fatia_visita ? FATIAS[u.fatia_visita] ?? null : null,
      dividindoCom: u.dividindo_primeiro,
      meuPreco,
      precoVencedor: u.vencedor_preco == null ? null : n(u.vencedor_preco),
      precoParaGanhar: paraGanhar,
      faltaReais: falta,
      faltaPct: falta != null && meuPreco ? r2((falta * 100) / meuPreco) : null,
      diasGanhando: ac.ganhando,
      diasMedidos: ac.medidos,
      elegivel: u.elegivel !== false,
      motivos: u.motivos ?? [],
      alavancas: (u.alavancas ?? [])
        .filter((l) => l?.situacao === "opportunity" && l.id)
        .map((l) => ALAVANCAS[l.id!] ?? l.id!),
    });
  }

  /* Perdendo e com caminho de preço primeiro, do menor esforço para o
     maior: quem precisa baixar R$ 2 decide antes de quem precisa baixar
     R$ 300. Depois os sem caminho, e por fim os que já ganham. */
  const peso: Record<SituacaoDisputa, number> = { competindo: 0, listado: 1, fora: 2, dividindo: 3, ganhando: 4 };
  linhas.sort(
    (x, y) =>
      peso[x.situacao] - peso[y.situacao] ||
      (x.faltaPct ?? Infinity) - (y.faltaPct ?? Infinity) ||
      x.titulo.localeCompare(y.titulo, "pt-BR")
  );

  const conta = (s: SituacaoDisputa) => linhas.filter((l) => l.situacao === s).length;
  return {
    vazio: false,
    ultimoDia,
    primeiroDia,
    diasNaJanela: datas.length,
    linhas,
    resumo: {
      ganhando: conta("ganhando"),
      dividindo: conta("dividindo"),
      competindo: conta("competindo"),
      listado: conta("listado"),
      fora: conta("fora"),
      comCaminhoDePreco: linhas.filter((l) => l.faltaReais != null).length,
      semGanharComEstoque: linhas.filter((l) => l.faltaReais != null && (l.estoque == null || l.estoque > 0)).length,
    },
  };
}
