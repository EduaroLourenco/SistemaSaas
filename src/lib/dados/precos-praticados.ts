import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";

/**
 * Preço praticado por SKU, do que foi de fato vendido.
 *
 * A fonte é `pedido_itens`: cada linha é uma venda com preço unitário e
 * data. Não é o preço da vitrine — é o que o cliente pagou, que é o
 * número que interessa para saber se a margem se sustentou.
 *
 * O preço do mês é a MÉDIA PONDERADA pela quantidade, não a média simples.
 * Duas vendas a R$ 1.000 e uma a R$ 500 dão R$ 833, não R$ 750: a média
 * simples deixaria uma venda isolada de liquidação puxar o mês inteiro.
 */

export type VendaSku = {
  data: string;
  canalId: string;
  canal: string;
  quantidade: number;
  precoUnitario: number;
};

export type SkuPreco = {
  sku: string;
  titulo: string;
  /** MLBs em que este SKU é vendido. */
  anuncios: { mlb: string; tipo: string }[];
  curva: "A" | "B" | "C";
  receita: number;
  unidades: number;
  precoMedio: number;
  precoMin: number;
  precoMax: number;
  /** Amplitude sobre o menor preço, em %. */
  amplitude: number;
  vendas: VendaSku[];
};

export type DadosPrecos = {
  skus: SkuPreco[];
  canais: { id: string; nome: string; cor: string }[];
  primeiraData: string;
  ultimaData: string;
  vazio: boolean;
};

type LinhaItem = {
  sku: string | null;
  titulo: string | null;
  quantidade: number;
  preco_unitario: string;
  anuncio_id: string | null;
  pedidos: { data: string; canal_id: string; cancelado: boolean } | null;
};

export async function carregarPrecosPraticados(): Promise<DadosPrecos> {
  const sb = await clienteServidor();

  const [itens, canaisBanco, anuncios] = await Promise.all([
    paginar(() =>
      sb
        .from("pedido_itens")
        .select(
          "sku,titulo,quantidade,preco_unitario,anuncio_id,pedidos(data,canal_id,cancelado)"
        )
    ),
    sb.from("canais").select("id,nome,cor_serie").order("ordem"),
    paginar(() => sb.from("anuncios").select("id,codigo_externo,tipo,sku_canal")),
  ]);

  const linhas = itens as unknown as LinhaItem[];
  const nomeCanal = new Map(
    (canaisBanco.data ?? []).map((c) => [c.id as string, c.nome as string])
  );
  const corCanal = new Map(
    (canaisBanco.data ?? []).map((c) => [
      c.id as string,
      `var(--s${(c.cor_serie as number) ?? 1})`,
    ])
  );

  const anuncioPorId = new Map(
    (anuncios as { id: string; codigo_externo: string; tipo: string }[]).map((a) => [
      a.id,
      { mlb: a.codigo_externo, tipo: a.tipo === "premium" ? "Premium" : "Clássico" },
    ])
  );

  const mapa = new Map<string, SkuPreco>();
  const datas: string[] = [];
  const canaisComVenda = new Set<string>();

  for (const l of linhas) {
    const p = l.pedidos;
    // Cancelado fora: o preço de uma venda que não se concretizou não
    // representa preço praticado.
    if (!p || p.cancelado) continue;
    const sku = (l.sku ?? "").trim();
    if (!sku) continue;

    const preco = Number(l.preco_unitario) || 0;
    if (preco <= 0) continue;

    datas.push(p.data);
    canaisComVenda.add(p.canal_id);

    const g =
      mapa.get(sku) ??
      ({
        sku,
        titulo: l.titulo ?? sku,
        anuncios: [],
        curva: "C",
        receita: 0,
        unidades: 0,
        precoMedio: 0,
        precoMin: Infinity,
        precoMax: 0,
        amplitude: 0,
        vendas: [],
      } as SkuPreco);

    const qtd = l.quantidade || 1;
    g.receita += preco * qtd;
    g.unidades += qtd;
    g.precoMin = Math.min(g.precoMin, preco);
    g.precoMax = Math.max(g.precoMax, preco);
    if (!g.titulo || g.titulo === sku) g.titulo = l.titulo ?? g.titulo;

    const info = l.anuncio_id ? anuncioPorId.get(l.anuncio_id) : null;
    if (info && !g.anuncios.some((a) => a.mlb === info.mlb)) g.anuncios.push(info);

    g.vendas.push({
      data: p.data,
      canalId: p.canal_id,
      canal: nomeCanal.get(p.canal_id) ?? "Outros",
      quantidade: qtd,
      precoUnitario: preco,
    });

    mapa.set(sku, g);
  }

  const lista = [...mapa.values()];
  if (!lista.length) {
    return { skus: [], canais: [], primeiraData: "", ultimaData: "", vazio: true };
  }

  for (const g of lista) {
    g.precoMedio = g.unidades ? g.receita / g.unidades : 0;
    if (g.precoMin === Infinity) g.precoMin = 0;
    g.amplitude = g.precoMin ? ((g.precoMax - g.precoMin) / g.precoMin) * 100 : 0;
  }

  lista.sort((a, b) => b.receita - a.receita);

  /*
   * Curva ABC por Pareto sobre a receita — a MESMA regra da análise de
   * anúncios, de propósito. Duas definições de curva A no mesmo sistema
   * fariam a mesma peça aparecer como A numa tela e B na outra.
   */
  const total = lista.reduce((s, x) => s + x.receita, 0);
  let acumulado = 0;
  for (const item of lista) {
    acumulado += item.receita;
    const p = total ? (acumulado / total) * 100 : 100;
    item.curva = p <= 80 ? "A" : p <= 95 ? "B" : "C";
  }

  datas.sort();
  const canais = [...canaisComVenda]
    .map((id) => ({
      id,
      nome: nomeCanal.get(id) ?? "Outros",
      cor: corCanal.get(id) ?? "var(--s1)",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return {
    skus: lista,
    canais,
    primeiraData: datas[0],
    ultimaData: datas[datas.length - 1],
    vazio: false,
  };
}
