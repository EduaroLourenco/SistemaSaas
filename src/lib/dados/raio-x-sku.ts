import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { paginar } from "./paginar";
import { ultimosPrecosDeVenda } from "./preco-atual";
import { situacaoDeCatalogo, type SituacaoDisputa } from "./disputa-catalogo";
import { carregarRecordeSku, type RecordeSku } from "./recorde-sku";

/**
 * O raio-x de um SKU: tudo que se sabe dele, numa resposta só.
 *
 * ── Por que é uma rota, e não vem com a listagem ──
 *
 * A listagem são ~1.000 anúncios. Este raio-x são cinco consultas por
 * SKU. Carregar tudo junto trava a página para preencher gaveta que
 * ninguém vai abrir. Aqui é sob demanda: o drawer abre com o que a
 * listagem já tinha e completa quando esta resposta chega.
 *
 * ── O que ele NÃO busca ──
 *
 * A promoção ao vivo do canal. Ela é uma chamada à API do Mercado Livre
 * por MLB, com cota, e quem a faz é o módulo de Automações. Enquanto não
 * estiver ligada aqui, o bloco de promoção não é mostrado — melhor
 * ausência do que um "sem promoções" que na verdade é "não perguntei".
 */

export type AnuncioDoSku = {
  mlb: string;
  titulo: string;
  tipo: string;
  status: string;
  conta: string;
  /** "fulfillment" (Full) e afins, como o canal informa. */
  logistica: string | null;
  estoque: number | null;
  /** O preço cheio do catálogo — NÃO é o que o comprador paga. */
  precoCheio: number | null;
  /** O último preço de venda lido nos últimos 7 dias, e quando. */
  precoDeVenda: { preco: number; data: string } | null;
  catalogo: SituacaoDisputa | null;
};

export type RaioXSku = {
  sku: string;
  titulo: string;
  anuncios: AnuncioDoSku[];
  recorde: RecordeSku;
  estoque: {
    /** Soma do saldo dos anúncios que o canal controla. */
    saldo: number | null;
    /** Anúncios sob encomenda ficam fora do saldo e são contados aqui. */
    sobEncomenda: number;
    /** Unidades por dia nas últimas 4 semanas fechadas. */
    giroDiario: number | null;
    /** Saldo ÷ giro. Null quando não há giro ou não há saldo. */
    diasDeCobertura: number | null;
    /** Anúncios ativos com saldo zero. */
    zerados: number;
  };
  /** Quando a resposta foi montada, para a tela dizer a procedência. */
  lidoEm: string;
};

/** Acima disto o canal não controla estoque: é anúncio sob encomenda. */
const SOB_ENCOMENDA = 40000;

const maisDias = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Hoje em Brasília: o servidor roda em UTC e viraria o dia às 21h. */
const hojeSP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export async function carregarRaioXSku(sku: string): Promise<RaioXSku | null> {
  const limpo = sku.trim();
  if (!limpo) return null;

  const op = await operacaoPadrao();
  if (!op) return null;
  const sb = await clienteServidor();

  type LinhaAnuncio = {
    id: string;
    codigo_externo: string;
    titulo: string;
    tipo: string;
    status: string;
    estoque: number | null;
    preco_atual: string | number | null;
    logistica: string | null;
    contas_canal: { nome: string } | null;
  };

  const { data: anunciosRaw } = await sb
    .from("anuncios")
    .select("id,codigo_externo,titulo,tipo,status,estoque,preco_atual,logistica,contas_canal(nome)")
    .eq("operacao_id", op.id)
    .eq("sku_canal", limpo);

  const anunciosDb = (anunciosRaw ?? []) as unknown as LinhaAnuncio[];
  if (!anunciosDb.length) return null;

  const [precosDeVenda, catalogo, recorde, giro] = await Promise.all([
    ultimosPrecosDeVenda(sb, op.id),
    situacaoDeCatalogo(sb),
    carregarRecordeSku(limpo),
    giroDiario(sb, op.id, limpo),
  ]);

  const anuncios: AnuncioDoSku[] = anunciosDb.map((a) => ({
    mlb: a.codigo_externo,
    titulo: a.titulo,
    tipo: a.tipo === "premium" ? "Premium" : "Clássico",
    status: a.status,
    conta: a.contas_canal?.nome ?? "Conta principal",
    logistica: a.logistica,
    estoque: a.estoque,
    precoCheio: a.preco_atual == null ? null : Number(a.preco_atual),
    precoDeVenda: precosDeVenda.get(a.id) ?? null,
    /* O mapa de catálogo vem com a chave do BANCO (o uuid do anúncio),
       não o MLB: buscar pelo MLB devolvia null em tudo, calado. */
    catalogo: catalogo.get(a.id) ?? null,
  }));

  /*
   * O saldo soma só o que o canal controla. Anúncio sob encomenda declara
   * um número alto para não ficar sem anúncio: somar afogava o estoque
   * real dos irmãos — um produto com quatro desses aparecia com 160.004.
   */
  const controlados = anuncios.filter((a) => a.estoque != null && a.estoque < SOB_ENCOMENDA);
  const saldo = controlados.length
    ? controlados.reduce((s, a) => s + (a.estoque ?? 0), 0)
    : null;

  return {
    sku: limpo,
    titulo: anunciosDb[0].titulo,
    anuncios,
    recorde,
    estoque: {
      saldo,
      sobEncomenda: anuncios.filter((a) => (a.estoque ?? 0) >= SOB_ENCOMENDA).length,
      giroDiario: giro,
      /* Sem giro não há cobertura: dividir por zero daria "infinitos dias
         de estoque" para o que não vende, que é o oposto da verdade. */
      diasDeCobertura: saldo != null && giro ? Math.round(saldo / giro) : null,
      zerados: anuncios.filter((a) => a.status === "ativo" && a.estoque === 0).length,
    },
    lidoEm: new Date().toISOString(),
  };
}

/**
 * Unidades por dia nas últimas 4 semanas FECHADAS.
 *
 * Fechadas porque a semana em curso tem 2 ou 3 dias dos 7 e puxaria o
 * giro para baixo, inflando os dias de cobertura justamente no começo da
 * semana — o momento em que alguém olha para decidir reposição.
 */
async function giroDiario(
  sb: Awaited<ReturnType<typeof clienteServidor>>,
  operacaoId: string,
  sku: string
): Promise<number | null> {
  const hoje = hojeSP();
  /* Segunda-feira desta semana: o recorte termina no domingo anterior. */
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const fim = maisDias(d.toISOString().slice(0, 10), -1);
  const inicio = maisDias(fim, -27);

  const linhas = (await paginar(() =>
    sb
      .from("pedido_itens")
      .select("quantidade,pedidos!inner(data,cancelado)")
      .eq("operacao_id", operacaoId)
      .eq("sku", sku)
      .gte("pedidos.data", inicio)
      .lte("pedidos.data", fim)
      .order("id")
  )) as unknown as { quantidade: number; pedidos: { data: string; cancelado: boolean } | null }[];

  const unidades = linhas.reduce(
    (s, l) => s + (l.pedidos && !l.pedidos.cancelado ? Number(l.quantidade) || 0 : 0),
    0
  );
  return unidades ? Number((unidades / 28).toFixed(2)) : null;
}
