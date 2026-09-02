import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";

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
  limites: { inicio: string; fim: string };
  canalId: string | null;
  totais: { unidades: number; receita: number; pedidos: number; skus: number };
  /** Quantos SKUs fazem 50% e 80% da receita. */
  concentracao: { metade: number; oitenta: number };
};

export type FiltroSku = {
  inicio?: string;
  fim?: string;
  canalId?: string;
};

export async function carregarAnaliseSku(
  filtro: FiltroSku = {}
): Promise<DadosAnaliseSku> {
  const sb = await clienteServidor();

  const [pedidosRaw, itensRaw, exclusoes, contasRaw, canaisRaw] =
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

  const dentro = new Map(
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

  /* ── Agrega ── */

  type Ac = {
    titulo: string;
    unidades: number;
    receita: number;
    pedidos: Set<string>;
    porMes: Map<string, Celula>;
    porCanal: Map<string, Celula>;
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
    mesesVistos.add(mes);
    canaisVistos.add(p.canalId);

    const at =
      porSku.get(sku) ??
      {
        titulo: it.titulo ?? "",
        unidades: 0, receita: 0, pedidos: new Set<string>(),
        porMes: new Map(), porCanal: new Map(),
        primeira: dia, ultima: dia,
      };

    at.unidades += it.quantidade;
    at.receita += n(it.total);
    at.pedidos.add(it.pedido_id);
    if (dia < at.primeira) at.primeira = dia;
    if (dia > at.ultima) at.ultima = dia;
    if (!at.titulo && it.titulo) at.titulo = it.titulo;

    if (!vistosMes.has(sku)) vistosMes.set(sku, new Map());
    if (!vistosCanal.has(sku)) vistosCanal.set(sku, new Map());
    soma(at.porMes, mes, it, it.pedido_id, vistosMes.get(sku)!);
    soma(at.porCanal, p.canalId, it, it.pedido_id, vistosCanal.get(sku)!);

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
    limites,
    canalId: filtro.canalId ?? null,
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
