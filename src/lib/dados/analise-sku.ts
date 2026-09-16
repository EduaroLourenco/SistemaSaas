import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";
import {
  lerRecorte,
  noRecorte,
  opcoesRecorte,
  nomeRecorte,
  type GrupoRecorte,
} from "@/lib/recorte";
import { carregarContasRecorte } from "./contas-recorte";

/**
 * Desempenho de venda por SKU, mês e canal.
 *
 * ── Por que o SKU vem do ITEM do pedido ──
 *
 * Poderia vir de `anuncios`, mas anúncio só existe onde há catálogo
 * importado — hoje, o Mercado Livre. Pelo item, o SKU está preenchido em
 * 100% das 6.717 linhas de todos os canais, e são 554 SKUs distintos
 * contra os 142 que o catálogo conhece.
 *
 * A diferença não é detalhe: a loja própria vende 462 SKUs e o Meli 171.
 * Ler o desempenho por SKU a partir do catálogo esconderia dois terços do
 * sortimento.
 *
 * ── O que esta análise NÃO traz ──
 *
 * Margem. Aqui é volume e receita — o que vendeu, onde, quando. Margem
 * depende de custo cadastrado e vive em Financeiro; misturar as duas
 * faria metade das linhas ficar vazia por um motivo que nada tem a ver
 * com a pergunta desta tela.
 *
 * ── A curva ABC é por recorte, não fixa ──
 *
 * Um SKU pode ser curva A no Mercado Livre e C na loja própria. Fixar a
 * classificação no produto responderia sempre à mesma pergunta; calculá-la
 * dentro do recorte escolhido é o que permite comparar o papel do mesmo
 * produto em cada canal.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export type Celula = { unidades: number; receita: number; pedidos: number };

export type LinhaSku = {
  sku: string;
  titulo: string;
  unidades: number;
  receita: number;
  pedidos: number;
  /** Preço médio praticado, ponderado pela quantidade. */
  precoMedio: number | null;
  /** Chave "aaaa-mm". */
  porMes: Record<string, Celula>;
  /** Chave: id do canal. */
  porCanal: Record<string, Celula>;
  /**
   * Chave: índice do período comparado (`"0"` é o principal).
   *
   * Existe para responder "este SKU melhorou?" sem trocar de tela. A
   * comparação mês a mês que já havia responde outra coisa: ela mostra a
   * série, e série de doze colunas esconde a única comparação que
   * interessa quando se quer decidir — a de agora contra a de antes.
   */
  porPeriodo: Record<string, Celula>;
  /** Em quantos canais vendeu no recorte. */
  canais: number;
  primeiraVenda: string;
  ultimaVenda: string;
  /** Participação na receita do recorte. */
  participacao: number;
  /** Acumulado até esta linha, ordenando por receita. */
  acumulado: number;
  curva: "A" | "B" | "C";
};

export type CanalSku = { id: string; nome: string };

export type DadosAnaliseSku = {
  vazio: boolean;
  linhas: LinhaSku[];
  meses: string[];
  canais: CanalSku[];
  periodo: { inicio: string; fim: string };
  /**
   * Os períodos comparados, na ordem. O primeiro é sempre o principal —
   * é ele que define curva, totais e concentração; os outros só
   * preenchem colunas.
   */
  periodos: { inicio: string; fim: string; rotulo: string }[];
  limites: { inicio: string; fim: string };
  /** Recorte atual, no formato da URL (`uuid` do canal ou `conta:uuid`). */
  canalId: string | null;
  /** Nome do recorte para o arquivo exportado; nulo sem filtro. */
  rotuloRecorte: string | null;
  opcoes: GrupoRecorte[];
  totais: { unidades: number; receita: number; pedidos: number; skus: number };
  /** Quantos SKUs fazem 50% e 80% da receita. */
  concentracao: { metade: number; oitenta: number };
};

export type FiltroSku = {
  inicio?: string;
  fim?: string;
  canalId?: string;
  /**
   * Até dois períodos EXTRAS, para comparar com o principal.
   *
   * Dois e não mais: com quatro colunas de período a tabela deixa de
   * caber sem rolagem lateral, e a comparação que ninguém consegue ver
   * lado a lado não é comparação.
   */
  comparar?: { inicio: string; fim: string }[];
};

/**
 * Rótulo curto de uma janela, para a coluna da tabela.
 *
 * Um mês inteiro vira "set/26"; o resto vira "12/06 a 11/09". Escrever
 * a data inteira numa coluna de tabela consome largura que os números
 * precisam.
 */
function rotuloJanela(inicio: string, fim: string): string {
  const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const primeiroDoMes = inicio.slice(8) === "01";
  const ultimoDoMes =
    fim.slice(8) ===
    String(new Date(Date.UTC(Number(fim.slice(0,4)), Number(fim.slice(5,7)), 0)).getUTCDate()).padStart(2, "0");
  if (inicio.slice(0, 7) === fim.slice(0, 7) && primeiroDoMes && ultimoDoMes) {
    return `${MES[Number(inicio.slice(5, 7)) - 1]}/${inicio.slice(2, 4)}`;
  }
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return `${dm(inicio)} a ${dm(fim)}`;
}

export async function carregarAnaliseSku(
  filtro: FiltroSku = {}
): Promise<DadosAnaliseSku> {
  const sb = await clienteServidor();

  const recorte = lerRecorte(filtro.canalId);
  const [pedidosRaw, itensRaw, exclusoes, contasRaw, canaisRaw, contasRecorte] =
    await Promise.all([
      paginar(() =>
        sb
          .from("pedidos")
          .select("id,data,cancelado,canal_id,conta_canal_id")
          .order("data")
      ),
      paginar(() =>
        sb
          .from("pedido_itens")
          .select("pedido_id,sku,titulo,quantidade,total")
          .order("pedido_id")
      ),
      carregarExclusoes(),
      sb.from("contas_canal").select("id,canal_id").limit(200),
      sb.from("canais").select("id,nome").order("nome"),
      carregarContasRecorte(),
    ]);

  type Ped = {
    id: string;
    data: string;
    cancelado: boolean;
    canal_id: string;
    conta_canal_id: string;
  };
  type Item = {
    pedido_id: string;
    sku: string | null;
    titulo: string | null;
    quantidade: number;
    total: string | number;
  };

  const canalDaConta = new Map(
    ((contasRaw.data ?? []) as { id: string; canal_id: string }[]).map((c) => [
      c.id,
      c.canal_id,
    ])
  );
  const canaisTodos = (canaisRaw.data ?? []) as CanalSku[];
  const nomeCanal = new Map(canaisTodos.map((c) => [c.id, c.nome]));

  const { mantidas: pedidos } = aplicar(
    (pedidosRaw as unknown as Ped[]).map((p) => ({
      ...p,
      canalId: canalDaConta.get(p.conta_canal_id) ?? p.canal_id,
      contaCanalId: p.conta_canal_id,
    })),
    exclusoes
  );

  const datas = pedidos.map((p) => String(p.data).slice(0, 10)).sort();
  const limites = {
    inicio: datas[0] ?? new Date().toISOString().slice(0, 10),
    fim: datas[datas.length - 1] ?? new Date().toISOString().slice(0, 10),
  };
  const inicio = filtro.inicio ?? limites.inicio;
  const fim = filtro.fim ?? limites.fim;

  /*
   * As janelas, na ordem. A zero é a principal — é dela que saem totais,
   * curva e concentração. As extras existem só para preencher colunas, e
   * por isso NÃO entram no que define a curva: reclassificar o SKU pela
   * união de três períodos responderia uma pergunta que ninguém fez.
   */
  const janelas = [
    { inicio, fim, rotulo: rotuloJanela(inicio, fim) },
    ...(filtro.comparar ?? [])
      .filter((c) => c.inicio && c.fim && c.inicio <= c.fim)
      .slice(0, 2)
      .map((c) => ({ ...c, rotulo: rotuloJanela(c.inicio, c.fim) })),
  ];

  /** Índices das janelas em que o dia cai. Um dia pode cair em mais de uma. */
  const janelasDoDia = (d: string) => {
    const idx: number[] = [];
    for (let i = 0; i < janelas.length; i += 1) {
      if (d >= janelas[i].inicio && d <= janelas[i].fim) idx.push(i);
    }
    return idx;
  };

  /*
   * `dentro` guarda os pedidos de QUALQUER janela, com a lista de janelas
   * a que pertencem. Antes era só a principal; varrer os itens uma vez
   * por período multiplicaria a leitura de 8 mil itens por três.
   */
  const dentro = new Map<string, (typeof pedidos)[number] & { janelas: number[] }>();
  for (const p of pedidos) {
    if (p.cancelado) continue;
    if (!noRecorte(recorte, p)) continue;
    const idx = janelasDoDia(String(p.data).slice(0, 10));
    if (!idx.length) continue;
    dentro.set(p.id, { ...p, janelas: idx });
  }

  /* ── Agrega ── */

  type Ac = {
    titulo: string;
    unidades: number;
    receita: number;
    pedidos: Set<string>;
    porMes: Map<string, Celula>;
    porCanal: Map<string, Celula>;
    porPeriodo: Map<string, Celula>;
    primeira: string;
    ultima: string;
  };
  const porSku = new Map<string, Ac>();
  const mesesVistos = new Set<string>();
  const canaisVistos = new Set<string>();

  const soma = (m: Map<string, Celula>, chave: string, it: Item, pedido: string, vistos: Map<string, Set<string>>) => {
    const c = m.get(chave) ?? { unidades: 0, receita: 0, pedidos: 0 };
    c.unidades += it.quantidade;
    c.receita += n(it.total);
    // Pedidos contados uma vez por chave: dois itens do mesmo SKU no
    // mesmo pedido são um pedido, não dois.
    const jaVi = vistos.get(chave) ?? new Set<string>();
    if (!jaVi.has(pedido)) {
      c.pedidos += 1;
      jaVi.add(pedido);
      vistos.set(chave, jaVi);
    }
    m.set(chave, c);
  };

  const vistosMes = new Map<string, Map<string, Set<string>>>();
  const vistosCanal = new Map<string, Map<string, Set<string>>>();
  const vistosPeriodo = new Map<string, Map<string, Set<string>>>();

  for (const it of itensRaw as unknown as Item[]) {
    const p = dentro.get(it.pedido_id);
    if (!p) continue;

    const sku = (it.sku ?? "").trim();
    // Item sem SKU não vira linha "(sem SKU)": ele existe em zero dos
    // 6.717 itens medidos, e uma linha vazia na tela sugeriria falha de
    // cadastro onde não há.
    if (!sku) continue;

    const dia = String(p.data).slice(0, 10);
    const mes = dia.slice(0, 7);
    /** Está na janela que manda — a que define totais, curva e concentração. */
    const naPrincipal = p.janelas.includes(0);

    if (naPrincipal) {
      mesesVistos.add(mes);
      canaisVistos.add(p.canalId);
    }

    const at =
      porSku.get(sku) ??
      {
        titulo: it.titulo ?? "",
        unidades: 0, receita: 0, pedidos: new Set<string>(),
        porMes: new Map(), porCanal: new Map(), porPeriodo: new Map(),
        primeira: dia, ultima: dia,
      };

    if (!at.titulo && it.titulo) at.titulo = it.titulo;

    /*
     * Os totais do SKU são os da janela PRINCIPAL, não a soma das três.
     *
     * Um item pode cair em duas janelas quando elas se sobrepõem — e
     * somar a receita duas vezes inflaria a curva, a concentração e a
     * participação. A janela principal é a única que conta para isso.
     */
    if (naPrincipal) {
      at.unidades += it.quantidade;
      at.receita += n(it.total);
      at.pedidos.add(it.pedido_id);
      if (dia < at.primeira) at.primeira = dia;
      if (dia > at.ultima) at.ultima = dia;

      if (!vistosMes.has(sku)) vistosMes.set(sku, new Map());
      if (!vistosCanal.has(sku)) vistosCanal.set(sku, new Map());
      soma(at.porMes, mes, it, it.pedido_id, vistosMes.get(sku)!);
      soma(at.porCanal, p.canalId, it, it.pedido_id, vistosCanal.get(sku)!);
    }

    if (!vistosPeriodo.has(sku)) vistosPeriodo.set(sku, new Map());
    for (const idx of p.janelas) {
      soma(at.porPeriodo, String(idx), it, it.pedido_id, vistosPeriodo.get(sku)!);
    }

    porSku.set(sku, at);
  }

  /* ── Curva ABC dentro do recorte ── */

  const receitaTotal = [...porSku.values()].reduce((s, a) => s + a.receita, 0);

  const ordenados = [...porSku.entries()].sort(
    (a, b) => b[1].receita - a[1].receita
  );

  let acumulado = 0;
  const linhas: LinhaSku[] = ordenados.map(([sku, a]) => {
    const participacao = receitaTotal > 0 ? (a.receita * 100) / receitaTotal : 0;
    acumulado += participacao;
    // 80/95 é o corte clássico e o que a operação já usa em `produtos.curva`.
    const curva: LinhaSku["curva"] =
      acumulado <= 80 ? "A" : acumulado <= 95 ? "B" : "C";

    const obj = (m: Map<string, Celula>) =>
      Object.fromEntries(
        [...m.entries()].map(([k, c]) => [
          k,
          { ...c, receita: r2(c.receita) },
        ])
      );

    return {
      sku,
      titulo: a.titulo,
      unidades: a.unidades,
      receita: r2(a.receita),
      pedidos: a.pedidos.size,
      precoMedio: a.unidades > 0 ? r2(a.receita / a.unidades) : null,
      porMes: obj(a.porMes),
      porCanal: obj(a.porCanal),
      porPeriodo: obj(a.porPeriodo),
      canais: a.porCanal.size,
      primeiraVenda: a.primeira,
      ultimaVenda: a.ultima,
      participacao: r2(participacao),
      acumulado: r2(acumulado),
      curva,
    };
  });

  const metade = linhas.findIndex((l) => l.acumulado >= 50) + 1;
  const oitenta = linhas.findIndex((l) => l.acumulado >= 80) + 1;

  return {
    vazio: !linhas.length,
    linhas,
    meses: [...mesesVistos].sort(),
    // Só os canais que venderam no recorte: oferecer filtro para canal
    // sem venda no período devolve uma tela vazia sem dizer por quê.
    canais: canaisTodos.filter((c) => canaisVistos.has(c.id) || c.id === filtro.canalId),
    periodo: { inicio, fim },
    periodos: janelas,
    limites,
    canalId: filtro.canalId ?? null,
    rotuloRecorte: filtro.canalId ? nomeRecorte(recorte, contasRecorte) : null,
    opcoes: opcoesRecorte(contasRecorte),
    totais: {
      unidades: linhas.reduce((s, l) => s + l.unidades, 0),
      receita: r2(receitaTotal),
      pedidos: linhas.reduce((s, l) => s + l.pedidos, 0),
      skus: linhas.length,
    },
    concentracao: { metade: metade || 0, oitenta: oitenta || 0 },
  };
}

/** Nome do canal, para a tela rotular as colunas. */
export function nomeDosCanais(canais: CanalSku[]): Map<string, string> {
  return new Map(canais.map((c) => [c.id, c.nome]));
}
