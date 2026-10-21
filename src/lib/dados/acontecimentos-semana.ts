import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paginar } from "./paginar";

/**
 * O que ACONTECEU na semana, dia a dia.
 *
 * ── Por que existe ──
 *
 * O termômetro diz que a receita caiu 18% e deixa a causa para quem
 * está lendo adivinhar. Mas o sistema já sabe o que aconteceu: na
 * semana de 13 a 20/10 começaram duas campanhas, dezoito anúncios
 * mudaram de preço — um deles caiu 40% — e um produto voltou ao
 * estoque. Esses fatos estavam em três tabelas e em tela nenhuma.
 *
 * A ideia é a queda da quarta encostar no que aconteceu na quarta.
 *
 * ── Os cortes, e por que eles ──
 *
 * Preço: 1% de variação dá 562 acontecimentos numa semana, que é
 * ruído com cara de informação. 10% dá dezoito, e são os que mudam a
 * venda. O corte é por SKU e não por anúncio porque o mesmo colchão
 * tem clássico e premium: sem agrupar, a mesma decisão de preço
 * aparece quatro vezes no mesmo dia.
 *
 * Estoque: acima de 40 mil o canal declara "sem controle" (venda sob
 * encomenda), e tratar isso como quantidade inventaria ruptura onde
 * não houve.
 *
 * Só anúncio ATIVO entra. Preço de anúncio pausado mudou no cadastro,
 * não na vitrine — ninguém viu.
 */

/** Acima disto o canal não controla estoque: é venda sob encomenda. */
const SOB_ENCOMENDA = 40000;

/** Variação de preço que vale como acontecimento. */
const PRECO_MINIMO_PCT = 10;

export type Acontecimento = {
  data: string;
  tipo: "campanha" | "preco" | "estoque";
  /** Um por linha, já pronto para ler. */
  texto: string;
  /** O que isso costuma fazer com a venda: ajuda a ler o gráfico. */
  tom: "up" | "down" | "neutral";
  /** Para a tela poder levar ao produto. */
  sku?: string;
};

type LinhaDiaria = {
  data: string;
  estoque: number | null;
  preco: string | number | null;
  anuncios: {
    codigo_externo: string;
    sku_canal: string | null;
    titulo: string;
    status: string;
  } | null;
};

type ItemPlano = {
  titulo: string;
  inicio: string;
  fim: string;
  natureza: string;
  status: string;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function carregarAcontecimentos(
  sb: SupabaseClient,
  de: string,
  ate: string,
): Promise<Acontecimento[]> {
  const [diarias, plano] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncio_estoque_diario")
        .select("data,estoque,preco,anuncios(codigo_externo,sku_canal,titulo,status)")
        .gte("data", de)
        .lte("data", ate),
    ) as unknown as Promise<LinhaDiaria[]>,
    paginar(() =>
      sb
        .from("planejamento_itens")
        .select("titulo,inicio,fim,natureza,status")
        .or(`and(inicio.gte.${de},inicio.lte.${ate}),and(fim.gte.${de},fim.lte.${ate})`),
    ) as unknown as Promise<ItemPlano[]>,
  ]);

  const saida: Acontecimento[] = [];

  /* ── Campanhas que começaram ou terminaram ── */
  for (const i of plano) {
    if (i.status === "Cancelada") continue;
    const oque = i.natureza === "campanha" ? "Campanha" : "Ação";
    if (i.inicio >= de && i.inicio <= ate) {
      saida.push({
        data: i.inicio,
        tipo: "campanha",
        texto: `${oque} começou: ${i.titulo}`,
        tom: "up",
      });
    }
    if (i.fim >= de && i.fim <= ate) {
      saida.push({
        data: i.fim,
        tipo: "campanha",
        texto: `${oque} terminou: ${i.titulo}`,
        tom: "down",
      });
    }
  }

  /*
   * ── Preço e estoque, por anúncio ──
   *
   * A leitura é diária e pode faltar dia. Comparar leituras CONSECUTIVAS
   * medidas, e não dia de calendário, evita inventar mudança quando a
   * coleta pulou uma quarta.
   */
  const porAnuncio = new Map<
    string,
    { sku: string; titulo: string; dias: { data: string; estoque: number | null; preco: number | null }[] }
  >();
  for (const l of diarias) {
    const a = l.anuncios;
    if (!a || a.status !== "ativo") continue;
    const chave = a.codigo_externo;
    const x = porAnuncio.get(chave) ?? {
      sku: (a.sku_canal ?? "").trim() || a.codigo_externo,
      titulo: a.titulo,
      dias: [],
    };
    x.dias.push({
      data: l.data,
      estoque: l.estoque,
      preco: l.preco == null ? null : Number(l.preco) || null,
    });
    porAnuncio.set(chave, x);
  }

  /*
   * Mudança de preço por SKU, não por anúncio: o mesmo colchão vive em
   * clássico e premium, nas duas contas. Vale a maior variação do dia,
   * porque é dela que a pessoa se lembra.
   */
  const precoPorSkuDia = new Map<
    string,
    { sku: string; titulo: string; de: number; para: number; pct: number }
  >();

  for (const x of porAnuncio.values()) {
    const dias = [...x.dias].sort((a, b) => a.data.localeCompare(b.data));

    const comPreco = dias.filter((d) => d.preco);
    for (let i = 1; i < comPreco.length; i++) {
      const antes = comPreco[i - 1].preco!;
      const agora = comPreco[i].preco!;
      if (antes === agora) continue;
      const pct = ((agora - antes) / antes) * 100;
      if (Math.abs(pct) < PRECO_MINIMO_PCT) continue;
      const chave = `${x.sku}|${comPreco[i].data}`;
      const atual = precoPorSkuDia.get(chave);
      if (!atual || Math.abs(pct) > Math.abs(atual.pct)) {
        precoPorSkuDia.set(chave, { sku: x.sku, titulo: x.titulo, de: antes, para: agora, pct });
      }
    }

    /* Ruptura: só o estoque que o canal controla de verdade. */
    const reais = dias.filter((d) => d.estoque != null && d.estoque < SOB_ENCOMENDA);
    for (let i = 1; i < reais.length; i++) {
      const antes = reais[i - 1].estoque!;
      const agora = reais[i].estoque!;
      if (antes > 0 && agora === 0) {
        saida.push({
          data: reais[i].data,
          tipo: "estoque",
          texto: `${x.sku} acabou o estoque`,
          tom: "down",
          sku: x.sku,
        });
      }
      if (antes === 0 && agora > 0) {
        saida.push({
          data: reais[i].data,
          tipo: "estoque",
          texto: `${x.sku} voltou ao estoque`,
          tom: "up",
          sku: x.sku,
        });
      }
    }
  }

  for (const [chave, p] of precoPorSkuDia) {
    const data = chave.split("|")[1];
    saida.push({
      data,
      tipo: "preco",
      texto:
        `${p.sku} ${p.pct < 0 ? "baixou" : "subiu"} de ${brl(p.de)} para ${brl(p.para)}` +
        ` (${p.pct > 0 ? "+" : ""}${p.pct.toFixed(0)}%)`,
      /* Preço menor costuma puxar venda para cima — é a leitura que
         ajuda a explicar o gráfico, não um juízo sobre a decisão. */
      tom: p.pct < 0 ? "up" : "down",
      sku: p.sku,
    });
  }

  /* Do mais recente para o mais antigo; dentro do dia, campanha antes
     de preço, porque campanha costuma ser a causa do preço. */
  const ordem = { campanha: 0, preco: 1, estoque: 2 };
  return saida.sort(
    (a, b) => b.data.localeCompare(a.data) || ordem[a.tipo] - ordem[b.tipo],
  );
}
