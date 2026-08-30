import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "@/lib/dados/paginar";
import { carregarExclusoes, aplicar } from "@/lib/dados/exclusoes";

/**
 * As ferramentas que o Claude usa para consultar a operação.
 *
 * O modelo NÃO recebe os dados no prompt. Recebe estas funções e decide
 * quais chamar. A diferença não é de estilo:
 *
 *  - são 6.500 pedidos e 7.300 itens. Não cabem no contexto, e resumir
 *    antes seria escolher pelo modelo o que ele pode olhar;
 *  - número que vem de consulta é verificável. Número que vem de um
 *    resumo colado no prompt é uma citação de segunda mão, e o modelo não
 *    tem como saber se envelheceu;
 *  - a conversa acompanha o banco. Importou agora, a próxima pergunta já
 *    enxerga.
 *
 * Toda ferramenta respeita as exclusões de análise. Se o chat contasse o
 * lote de 27/08 que as telas descartam, ele e o painel dariam respostas
 * diferentes para a mesma pergunta — e aí não dá para confiar em nenhum
 * dos dois.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

export type Ferramenta = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

export const FERRAMENTAS: Ferramenta[] = [
  {
    name: "contexto_operacao",
    description:
      "Panorama da operação: quais canais e contas existem, qual o período com dados, " +
      "quantos pedidos e anúncios há, e o que está fora da análise. " +
      "Chame ANTES de qualquer outra coisa quando não souber o que existe.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "vendas_por_periodo",
    description:
      "Receita, pedidos, ticket médio e cancelamento em um intervalo, agrupados por dia, " +
      "semana, mês ou canal. Use para tendência, comparação entre períodos e ranking de canal.",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "Data inicial, aaaa-mm-dd" },
        ate: { type: "string", description: "Data final, aaaa-mm-dd" },
        agrupar: {
          type: "string",
          enum: ["dia", "semana", "mes", "canal"],
          description: "Como agrupar o resultado",
        },
        canal: {
          type: "string",
          description: "Nome do canal para filtrar. Omita para todos.",
        },
      },
      required: ["de", "ate", "agrupar"],
      additionalProperties: false,
    },
  },
  {
    name: "produtos_vendidos",
    description:
      "Ranking de SKUs por receita ou unidades num intervalo, com o preço médio praticado " +
      "e em que canais cada um vendeu. Use para curva ABC, concentração e comparação entre canais.",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "Data inicial, aaaa-mm-dd" },
        ate: { type: "string", description: "Data final, aaaa-mm-dd" },
        ordenar: { type: "string", enum: ["receita", "unidades"] },
        limite: { type: "number", description: "Quantos SKUs devolver, até 50" },
        sku: {
          type: "string",
          description: "Um SKU específico. Use para investigar um produto.",
        },
      },
      required: ["de", "ate"],
      additionalProperties: false,
    },
  },
  {
    name: "desempenho_anuncios",
    description:
      "Visitas, vendas, conversão e receita por anúncio do Mercado Livre, por semana. " +
      "Use para entender queda de conversão, tráfego e comparar Clássico com Premium.",
    input_schema: {
      type: "object",
      properties: {
        semanas: {
          type: "number",
          description: "Quantas semanas recentes trazer. Padrão 8.",
        },
        mlb: { type: "string", description: "Código do anúncio, ex.: MLB1234567890" },
        sku: { type: "string", description: "Filtra os anúncios deste SKU" },
        tipo: { type: "string", enum: ["classico", "premium"] },
        ordenar: { type: "string", enum: ["visitas", "vendas", "conversao", "receita"] },
        limite: { type: "number", description: "Quantos anúncios devolver, até 40" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "cancelamentos",
    description:
      "Cancelamento por canal ou por SKU num intervalo: quantidade, valor e taxa. " +
      "Use quando a pergunta for sobre pedido cancelado, devolução ou faturamento que voltou.",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "Data inicial, aaaa-mm-dd" },
        ate: { type: "string", description: "Data final, aaaa-mm-dd" },
        por: { type: "string", enum: ["canal", "sku"] },
      },
      required: ["de", "ate"],
      additionalProperties: false,
    },
  },
];

/* ══════════════════════════════════════════════════════════════
   Execução
   ══════════════════════════════════════════════════════════════ */

export async function executar(
  nome: string,
  entrada: Record<string, unknown>
): Promise<unknown> {
  switch (nome) {
    case "contexto_operacao":
      return contexto();
    case "vendas_por_periodo":
      return vendas(entrada as never);
    case "produtos_vendidos":
      return produtos(entrada as never);
    case "desempenho_anuncios":
      return anuncios(entrada as never);
    case "cancelamentos":
      return cancelamentos(entrada as never);
    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}

type Pedido = {
  id: string;
  data: string;
  cancelado: boolean;
  total: string | number;
  conta_canal_id: string;
};

/** Pedidos já sem o que está excluído da análise, com o canal anotado. */
async function pedidosLimpos(de?: string, ate?: string) {
  const sb = await clienteServidor();

  const [brutos, { data: contasRaw }, exclusoes] = await Promise.all([
    paginar(() => {
      let q = sb
        .from("pedidos")
        .select("id,data,cancelado,total,conta_canal_id")
        .order("data", { ascending: true });
      if (de) q = q.gte("data", de);
      if (ate) q = q.lte("data", ate);
      return q;
    }),
    sb.from("contas_canal").select("id,nome,canal_id,canais(nome)").limit(200),
    carregarExclusoes(),
  ]);

  type Conta = {
    id: string;
    nome: string;
    canal_id: string;
    canais: { nome: string } | null;
  };
  const contas = (contasRaw ?? []) as unknown as Conta[];
  const porConta = new Map(contas.map((c) => [c.id, c]));

  const anotados = (brutos as unknown as Pedido[]).map((p) => {
    const c = porConta.get(p.conta_canal_id);
    return {
      ...p,
      canalId: c?.canal_id ?? null,
      contaCanalId: p.conta_canal_id,
      canal: c?.canais?.nome ?? "Outros",
      conta: c?.nome ?? "",
    };
  });

  const { mantidas, removidas } = aplicar(anotados, exclusoes);
  return { pedidos: mantidas, removidas, exclusoes, contas, sb };
}

async function contexto() {
  const { pedidos, exclusoes, contas, sb } = await pedidosLimpos();

  const [{ count: anunciosQtd }, { count: desempenhoQtd }] = await Promise.all([
    sb.from("anuncios").select("id", { count: "exact", head: true }),
    sb
      .from("anuncio_desempenho_semanal")
      .select("id", { count: "exact", head: true }),
  ]);

  const porCanal = new Map<string, number>();
  for (const p of pedidos) porCanal.set(p.canal, (porCanal.get(p.canal) ?? 0) + 1);

  return {
    periodo: pedidos.length
      ? { de: pedidos[0].data, ate: pedidos[pedidos.length - 1].data }
      : null,
    pedidos: pedidos.length,
    anuncios: anunciosQtd ?? 0,
    semanas_desempenho: desempenhoQtd ?? 0,
    canais: [...porCanal.entries()]
      .map(([canal, qtd]) => ({ canal, pedidos: qtd }))
      .sort((a, b) => b.pedidos - a.pedidos),
    contas_mercado_livre: contas
      .filter((c) => c.canais?.nome === "Mercado Livre")
      .map((c) => c.nome),
    fora_da_analise: exclusoes.map((e) => ({
      de: e.dataInicio,
      ate: e.dataFim,
      canal: e.canal ?? "todos",
      motivo: e.motivo,
    })),
    aviso:
      "Visitas só existem para o Mercado Livre. Os demais canais não têm esse dado, " +
      "então conversão não é calculável para eles. Custo de produto não está cadastrado, " +
      "então margem não é calculável em canal nenhum.",
  };
}

function chaveGrupo(data: string, agrupar: string): string {
  if (agrupar === "mes") return data.slice(0, 7);
  if (agrupar === "semana") {
    const d = new Date(data + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  return data;
}

async function vendas(a: {
  de: string;
  ate: string;
  agrupar: "dia" | "semana" | "mes" | "canal";
  canal?: string;
}) {
  const { pedidos, removidas } = await pedidosLimpos(a.de, a.ate);
  const filtrados = a.canal
    ? pedidos.filter((p) => p.canal.toLowerCase().includes(a.canal!.toLowerCase()))
    : pedidos;

  type G = {
    chave: string;
    pedidos: number;
    receita: number;
    cancelados: number;
    valorCancelado: number;
  };
  const grupos = new Map<string, G>();

  for (const p of filtrados) {
    const chave =
      a.agrupar === "canal" ? p.canal : chaveGrupo(String(p.data).slice(0, 10), a.agrupar);
    const g =
      grupos.get(chave) ??
      { chave, pedidos: 0, receita: 0, cancelados: 0, valorCancelado: 0 };
    g.pedidos += 1;
    g.receita += n(p.total);
    if (p.cancelado) {
      g.cancelados += 1;
      g.valorCancelado += n(p.total);
    }
    grupos.set(chave, g);
  }

  const linhas = [...grupos.values()]
    .map((g) => ({
      ...g,
      receita: r2(g.receita),
      valorCancelado: r2(g.valorCancelado),
      receitaLiquida: r2(g.receita - g.valorCancelado),
      ticketMedio: g.pedidos ? r2(g.receita / g.pedidos) : 0,
      taxaCancelamento: g.receita ? r2((g.valorCancelado * 100) / g.receita) : 0,
    }))
    .sort((x, y) =>
      a.agrupar === "canal" ? y.receita - x.receita : x.chave.localeCompare(y.chave)
    );

  return {
    periodo: { de: a.de, ate: a.ate },
    agrupadoPor: a.agrupar,
    linhas,
    total: {
      pedidos: filtrados.length,
      receita: r2(filtrados.reduce((s, p) => s + n(p.total), 0)),
    },
    linhasExcluidasDaAnalise: removidas,
  };
}

async function produtos(a: {
  de: string;
  ate: string;
  ordenar?: "receita" | "unidades";
  limite?: number;
  sku?: string;
}) {
  const { pedidos, sb } = await pedidosLimpos(a.de, a.ate);
  const validos = pedidos.filter((p) => !p.cancelado);
  const canalDoPedido = new Map(validos.map((p) => [p.id, p.canal]));
  const ids = validos.map((p) => p.id);

  const itens: {
    sku: string | null;
    titulo: string | null;
    quantidade: number;
    total: string | number;
    preco_unitario: string | number;
    pedido_id: string;
  }[] = [];

  for (let i = 0; i < ids.length; i += 200) {
    let q = sb
      .from("pedido_itens")
      .select("sku,titulo,quantidade,total,preco_unitario,pedido_id")
      .in("pedido_id", ids.slice(i, i + 200));
    if (a.sku) q = q.eq("sku", a.sku);
    const { data } = await q;
    itens.push(...((data ?? []) as typeof itens));
  }

  type S = {
    sku: string;
    titulo: string;
    unidades: number;
    receita: number;
    canais: Set<string>;
    somaPreco: number;
  };
  const porSku = new Map<string, S>();

  for (const it of itens) {
    const sku = it.sku ?? "(sem SKU)";
    const s =
      porSku.get(sku) ??
      { sku, titulo: it.titulo ?? "", unidades: 0, receita: 0, canais: new Set<string>(), somaPreco: 0 };
    s.unidades += it.quantidade ?? 0;
    s.receita += n(it.total);
    // Ponderado pela quantidade: média simples deixaria uma venda isolada
    // de liquidação puxar o preço do período inteiro.
    s.somaPreco += n(it.preco_unitario) * (it.quantidade ?? 0);
    const canal = canalDoPedido.get(it.pedido_id);
    if (canal) s.canais.add(canal);
    porSku.set(sku, s);
  }

  const chave = a.ordenar === "unidades" ? "unidades" : "receita";
  const lista = [...porSku.values()]
    .map((s) => ({
      sku: s.sku,
      titulo: s.titulo,
      unidades: s.unidades,
      receita: r2(s.receita),
      precoMedioPraticado: s.unidades ? r2(s.somaPreco / s.unidades) : 0,
      canais: [...s.canais].sort(),
    }))
    .sort((x, y) => (y[chave] as number) - (x[chave] as number));

  const receitaTotal = lista.reduce((s, x) => s + x.receita, 0);

  return {
    periodo: { de: a.de, ate: a.ate },
    skusDistintos: lista.length,
    receitaTotal: r2(receitaTotal),
    concentracaoTop10:
      receitaTotal > 0
        ? r2((lista.slice(0, 10).reduce((s, x) => s + x.receita, 0) * 100) / receitaTotal)
        : 0,
    produtos: lista.slice(0, Math.min(a.limite ?? 20, 50)),
  };
}

async function anuncios(a: {
  semanas?: number;
  mlb?: string;
  sku?: string;
  tipo?: "classico" | "premium";
  ordenar?: "visitas" | "vendas" | "conversao" | "receita";
  limite?: number;
}) {
  const sb = await clienteServidor();

  const [desempenho, cadastro] = await Promise.all([
    paginar(() =>
      sb
        .from("anuncio_desempenho_semanal")
        .select("anuncio_id,visitas,vendas,receita,ano_iso,semana_iso,inicio,fim")
        .order("inicio", { ascending: false })
    ),
    paginar(() =>
      sb
        .from("anuncios")
        .select("id,codigo_externo,titulo,sku_canal,tipo,preco_atual,comissao_atual")
        .order("id")
    ),
  ]);

  type D = {
    anuncio_id: string;
    visitas: number;
    vendas: number;
    receita: string | number;
    semana_iso: number;
    inicio: string;
    fim: string;
  };
  type A = {
    id: string;
    codigo_externo: string;
    titulo: string;
    sku_canal: string | null;
    tipo: string;
    preco_atual: string | number | null;
    comissao_atual: string | number | null;
  };

  const porId = new Map((cadastro as unknown as A[]).map((x) => [x.id, x]));
  const semanas = a.semanas ?? 8;

  const inicios = [
    ...new Set((desempenho as unknown as D[]).map((d) => String(d.inicio).slice(0, 10))),
  ]
    .sort()
    .slice(-semanas);
  const dentro = new Set(inicios);

  const linhas = (desempenho as unknown as D[]).filter((d) =>
    dentro.has(String(d.inicio).slice(0, 10))
  );

  type Acc = {
    mlb: string;
    titulo: string;
    sku: string;
    tipo: string;
    preco: number | null;
    tarifa: number | null;
    visitas: number;
    vendas: number;
    receita: number;
    porSemana: { semana: string; visitas: number; vendas: number; conversao: number }[];
  };
  const acc = new Map<string, Acc>();

  for (const d of linhas) {
    const info = porId.get(d.anuncio_id);
    if (!info) continue;
    if (a.mlb && info.codigo_externo !== a.mlb) continue;
    if (a.sku && info.sku_canal !== a.sku) continue;
    if (a.tipo && info.tipo !== a.tipo) continue;

    const at =
      acc.get(d.anuncio_id) ??
      {
        mlb: info.codigo_externo,
        titulo: info.titulo,
        sku: info.sku_canal ?? "",
        tipo: info.tipo,
        preco: info.preco_atual == null ? null : n(info.preco_atual),
        tarifa: info.comissao_atual == null ? null : n(info.comissao_atual),
        visitas: 0,
        vendas: 0,
        receita: 0,
        porSemana: [],
      };

    at.visitas += d.visitas ?? 0;
    at.vendas += d.vendas ?? 0;
    at.receita += n(d.receita);
    at.porSemana.push({
      semana: `S${d.semana_iso}`,
      visitas: d.visitas ?? 0,
      vendas: d.vendas ?? 0,
      conversao: d.visitas ? r2((d.vendas * 100) / d.visitas) : 0,
    });
    acc.set(d.anuncio_id, at);
  }

  const lista = [...acc.values()].map((x) => ({
    ...x,
    receita: r2(x.receita),
    conversao: x.visitas ? r2((x.vendas * 100) / x.visitas) : 0,
    porSemana: x.porSemana.sort((p, q) => p.semana.localeCompare(q.semana)),
  }));

  const chave = a.ordenar ?? "visitas";
  lista.sort((x, y) => (y[chave] as number) - (x[chave] as number));

  return {
    semanasCobertas: inicios,
    anunciosEncontrados: lista.length,
    anuncios: lista.slice(0, Math.min(a.limite ?? 15, 40)),
    aviso:
      "Visitas e conversão existem só para o Mercado Livre — é o único canal que exporta esse dado.",
  };
}

async function cancelamentos(a: { de: string; ate: string; por?: "canal" | "sku" }) {
  const { pedidos, sb } = await pedidosLimpos(a.de, a.ate);

  if (a.por === "sku") {
    const cancelados = pedidos.filter((p) => p.cancelado);
    const ids = cancelados.map((p) => p.id);
    const itens: { sku: string | null; titulo: string | null; quantidade: number; total: string | number }[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb
        .from("pedido_itens")
        .select("sku,titulo,quantidade,total")
        .in("pedido_id", ids.slice(i, i + 200));
      itens.push(...((data ?? []) as typeof itens));
    }
    const porSku = new Map<string, { sku: string; titulo: string; unidades: number; valor: number }>();
    for (const it of itens) {
      const sku = it.sku ?? "(sem SKU)";
      const s = porSku.get(sku) ?? { sku, titulo: it.titulo ?? "", unidades: 0, valor: 0 };
      s.unidades += it.quantidade ?? 0;
      s.valor += n(it.total);
      porSku.set(sku, s);
    }
    return {
      periodo: { de: a.de, ate: a.ate },
      porSku: [...porSku.values()]
        .map((s) => ({ ...s, valor: r2(s.valor) }))
        .sort((x, y) => y.valor - x.valor)
        .slice(0, 30),
    };
  }

  const porCanal = new Map<
    string,
    { canal: string; pedidos: number; cancelados: number; receita: number; valorCancelado: number }
  >();
  for (const p of pedidos) {
    const g =
      porCanal.get(p.canal) ??
      { canal: p.canal, pedidos: 0, cancelados: 0, receita: 0, valorCancelado: 0 };
    g.pedidos += 1;
    g.receita += n(p.total);
    if (p.cancelado) {
      g.cancelados += 1;
      g.valorCancelado += n(p.total);
    }
    porCanal.set(p.canal, g);
  }

  return {
    periodo: { de: a.de, ate: a.ate },
    porCanal: [...porCanal.values()]
      .map((g) => ({
        ...g,
        receita: r2(g.receita),
        valorCancelado: r2(g.valorCancelado),
        taxaQuantidade: g.pedidos ? r2((g.cancelados * 100) / g.pedidos) : 0,
        taxaValor: g.receita ? r2((g.valorCancelado * 100) / g.receita) : 0,
      }))
      .sort((x, y) => y.valorCancelado - x.valorCancelado),
  };
}
