import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { paginar } from "@/lib/dados/paginar";
import {
  CONTAS,
  catalogoCompleto,
  pedidos as buscarPedidos,
  completarFretes,
  visitasPorAnuncio,
  vendedor,
  type Conta,
  type AnuncioCompleto,
  type Pedido,
} from "./cliente";

/**
 * Traz do Mercado Livre para o banco.
 *
 * ── O que substitui ──
 *
 * Quatro das cinco planilhas de importação: catálogo, listagem de pedidos,
 * tarifas (Vendas BR) e desempenho por anúncio. A quinta — Product Ads —
 * fica de fora por enquanto: a API só devolve as campanhas de venda, e as
 * de marca dependem de habilitação que a conta ainda não tem. Gravar só
 * uma parte faria o investimento cair sem que ninguém tivesse cortado
 * mídia, e o TACOS mentiria para baixo.
 *
 * ── Chave natural em tudo ──
 *
 * Toda gravação é upsert por chave natural, nunca insert cego. Rodar a
 * sincronização duas vezes no mesmo período tem que dar o mesmo resultado
 * — se somasse, a segunda execução dobraria o faturamento do mês e o erro
 * só apareceria semanas depois, num total que ninguém consegue explicar.
 *
 * ── Vazio é vazio ──
 *
 * Campo que a API não informou fica nulo, não zero. Frete que falhou de
 * consultar é `null`, e a margem daquele item simplesmente não fecha —
 * que é a verdade. Zero seria "frete de graça", uma afirmação que
 * ninguém fez.
 */

type Resumo = {
  anuncios: { lidos: number; gravados: number };
  produtos: { pesoPreenchido: number };
  pedidos: { lidos: number; gravados: number; itens: number; comComissao: number; comFrete: number };
  visitas: { anuncios: number; linhas: number; falharam: number };
  diarias: { dias: number };
  avisos: string[];
};

const r2 = (v: number) => Number(v.toFixed(2));

/** Lotes de 500: o PostgREST aceita mais, mas o payload fica grande demais. */
async function emLotes<T>(linhas: T[], tamanho: number, fn: (lote: T[]) => Promise<void>) {
  for (let i = 0; i < linhas.length; i += tamanho) {
    await fn(linhas.slice(i, i + tamanho));
  }
}

/**
 * Resolve a conta do canal no banco a partir do vendedor do Meli.
 *
 * O casamento é pelo `codigo_externo` da conta, que guarda o user_id do
 * Meli. Sem ele não há como saber em qual das duas contas gravar — e
 * gravar na errada misturaria pronta entrega com venda a prazo, que é o
 * corte que mais importa nesta operação.
 */
async function resolverConta(conta: Conta) {
  const sb = clientePrivilegiado();
  const v = await vendedor(conta);

  const { data: todas, error } = await sb
    .from("contas_canal")
    .select("id,operacao_id,canal_id,nome,identificador");

  if (error) throw new Error(`Não consegui ler contas_canal: ${error.message}`);

  type Linha = {
    id: string; operacao_id: string; canal_id: string;
    nome: string; identificador: string | null;
  };
  const lista = (todas ?? []) as Linha[];

  /*
   * Casa primeiro pelo identificador (o user_id do Meli). É exato.
   *
   * Quando ainda está vazio — que é o estado de quem nunca sincronizou —
   * cai para o nome que `CONTAS` declara. É frouxo de propósito e só na
   * primeira vez: logo abaixo o identificador é gravado, e a partir daí
   * o casamento passa a ser pelo id.
   */
  const esperado = CONTAS.find((c) => c.slug === conta)?.nome ?? "";
  const achada =
    lista.find((c) => c.identificador && String(c.identificador) === String(v.id)) ??
    lista.find((c) => c.nome.trim().toLowerCase() === esperado.trim().toLowerCase());

  if (!achada) {
    throw new Error(
      `Não achei a conta de canal do vendedor ${v.id} (${v.nickname}). ` +
        `Esperava identificador = ${v.id} ou uma conta chamada "${esperado}".`
    );
  }

  // Grava o identificador para a próxima execução não depender do nome.
  if (String(achada.identificador ?? "") !== String(v.id)) {
    const { error: e } = await sb
      .from("contas_canal")
      .update({ identificador: String(v.id) })
      .eq("id", achada.id);
    if (e) {
      console.warn(`[meli] não consegui gravar o identificador: ${e.message}`);
    }
  }

  return {
    contaCanalId: achada.id,
    operacaoId: achada.operacao_id,
    canalId: achada.canal_id,
    nome: achada.nome,
    conta,
    vendedor: v,
  };
}

/* ══ Catálogo ══════════════════════════════════════════════════ */

async function gravarCatalogo(
  ctx: Awaited<ReturnType<typeof resolverConta>>,
  itens: AnuncioCompleto[],
  resumo: Resumo
) {
  const sb = clientePrivilegiado();

  const linhas = itens.map((a) => ({
    operacao_id: ctx.operacaoId,
    canal_id: ctx.canalId,
    conta_canal_id: ctx.contaCanalId,
    codigo_externo: a.mlb,
    titulo: a.titulo,
    sku_canal: a.sku,
    tipo: a.tipo === "outro" ? "outro" : a.tipo,
    status:
      a.status === "active"
        ? "ativo"
        : a.status === "paused"
          ? "pausado"
          : a.status === "closed"
            ? "finalizado"
            : "sob_revisao",
    preco_atual: a.preco,
    url: a.link,
    sincronizado_em: new Date().toISOString(),
  }));

  await emLotes(linhas, 500, async (lote) => {
    const { error } = await sb
      .from("anuncios")
      .upsert(lote, { onConflict: "canal_id,codigo_externo" });
    if (error) throw new Error(`Falha ao gravar anúncios: ${error.message}`);
  });

  resumo.anuncios = { lidos: itens.length, gravados: linhas.length };

  /*
   * O peso vai para `produtos`, e SÓ onde ainda está vazio.
   *
   * O peso do pacote é dado do canal e serve de partida para a faixa de
   * frete. Mas quem digitou um peso à mão fez isso por algum motivo —
   * pesagem própria, embalagem diferente — e sobrescrever apagaria a
   * correção sem avisar. Preenche o buraco, não corrige o preenchido.
   */
  const porSku = new Map<string, number>();
  for (const a of itens) {
    if (!a.sku || a.pesoKg == null) continue;
    // Dois anúncios do mesmo SKU podem divergir; fica o maior, que é o
    // que a transportadora cobraria.
    const atual = porSku.get(a.sku.toUpperCase());
    if (atual == null || a.pesoKg > atual) porSku.set(a.sku.toUpperCase(), a.pesoKg);
  }

  if (porSku.size) {
    const { data: produtos, error } = await sb
      .from("produtos")
      .select("id,sku,peso_kg")
      .eq("operacao_id", ctx.operacaoId);

    if (error) {
      resumo.avisos.push(`Não consegui ler produtos para o peso: ${error.message}`);
    } else {
      const alvo: { id: string; peso: number }[] = [];
      for (const p of produtos ?? []) {
        if (p.peso_kg != null) continue;
        const peso = porSku.get(String(p.sku).toUpperCase());
        if (peso != null) alvo.push({ id: p.id as string, peso });
      }

      /*
       * UPDATE, não upsert.
       *
       * O upsert manda um INSERT com ON CONFLICT, e o Postgres confere as
       * restrições da linha PROPOSTA antes de decidir que vai atualizar.
       * Com só `id`, `operacao_id` e `peso_kg` no payload, `sku` chega
       * nulo e o NOT NULL derruba a gravação inteira — mesmo que a linha
       * já exista e o efeito final fosse só mexer no peso.
       *
       * Agrupa por valor de peso para não fazer uma consulta por produto:
       * pesos se repetem entre SKUs da mesma linha de produto.
       */
      const porPeso = new Map<number, string[]>();
      for (const x of alvo) {
        const lista = porPeso.get(x.peso) ?? [];
        lista.push(x.id);
        porPeso.set(x.peso, lista);
      }

      for (const [peso, ids] of porPeso) {
        await emLotes(ids, 200, async (lote) => {
          const { error: e2 } = await sb
            .from("produtos")
            .update({ peso_kg: peso })
            .in("id", lote);
          if (e2) throw new Error(`Falha ao gravar peso: ${e2.message}`);
        });
      }
      resumo.produtos.pesoPreenchido = alvo.length;
    }
  }

  /* Casa anúncio com produto pelo SKU, para a margem enxergar o custo. */
  await casarAnuncioComProduto(ctx, resumo);
}

/**
 * Liga `anuncios.produto_id` ao produto de mesmo SKU.
 *
 * Sem esse elo a margem não acha o custo de mercadoria do anúncio e o SKU
 * inteiro cai fora do cálculo — silenciosamente, porque o item existe e a
 * venda também.
 */
async function casarAnuncioComProduto(
  ctx: Awaited<ReturnType<typeof resolverConta>>,
  resumo: Resumo
) {
  const sb = clientePrivilegiado();
  const [an, pr] = await Promise.all([
    sb
      .from("anuncios")
      .select("id,sku_canal,produto_id")
      .eq("conta_canal_id", ctx.contaCanalId)
      .is("produto_id", null),
    sb.from("produtos").select("id,sku").eq("operacao_id", ctx.operacaoId),
  ]);

  if (an.error || pr.error) {
    resumo.avisos.push("Não consegui casar anúncio com produto pelo SKU.");
    return;
  }

  const porSku = new Map(
    (pr.data ?? []).map((p) => [String(p.sku).toUpperCase(), p.id as string])
  );
  const ligar = (an.data ?? [])
    .filter((a) => a.sku_canal)
    .map((a) => ({ id: a.id as string, produto: porSku.get(String(a.sku_canal).toUpperCase()) }))
    .filter((x): x is { id: string; produto: string } => Boolean(x.produto));

  if (!ligar.length) return;

  // UPDATE pelo mesmo motivo do peso: `anuncios` tem NOT NULL em canal_id,
  // conta_canal_id, codigo_externo e titulo, e o upsert os exigiria todos.
  const porProduto = new Map<string, string[]>();
  for (const x of ligar) {
    const lista = porProduto.get(x.produto) ?? [];
    lista.push(x.id);
    porProduto.set(x.produto, lista);
  }

  for (const [produtoId, ids] of porProduto) {
    const { error } = await sb
      .from("anuncios")
      .update({ produto_id: produtoId })
      .in("id", ids);
    if (error) {
      resumo.avisos.push(`Falha ao ligar anúncio ao produto: ${error.message}`);
      return;
    }
  }
}

/* ══ Pedidos ═══════════════════════════════════════════════════ */

async function gravarPedidos(
  ctx: Awaited<ReturnType<typeof resolverConta>>,
  lista: Pedido[],
  resumo: Resumo
) {
  const sb = clientePrivilegiado();
  if (!lista.length) return;

  const cabecalhos = lista.map((p) => ({
    operacao_id: ctx.operacaoId,
    canal_id: ctx.canalId,
    conta_canal_id: ctx.contaCanalId,
    codigo_externo: String(p.id),
    data: p.data,
    status: p.status,
    cancelado: p.cancelado,
    total: p.total,
    // Nulo quando a consulta de custo falhou. Zero seria "frete de graça".
    frete: p.fretePago ?? 0,
    frete_vendedor: p.fretePago,
    comissao: p.comissao,
    comissao_origem: p.comissao == null ? null : "canal",
    juros: p.juros,
    origem: "api",
  }));

  await emLotes(cabecalhos, 300, async (lote) => {
    const { error } = await sb
      .from("pedidos")
      .upsert(lote, { onConflict: "canal_id,codigo_externo" });
    if (error) throw new Error(`Falha ao gravar pedidos: ${error.message}`);
  });

  /* Os itens precisam do id do pedido, que só existe depois do upsert. */
  const codigos = lista.map((p) => String(p.id));
  const idPorCodigo = new Map<string, string>();
  await emLotes(codigos, 300, async (lote) => {
    const { data, error } = await sb
      .from("pedidos")
      .select("id,codigo_externo")
      .eq("canal_id", ctx.canalId)
      .in("codigo_externo", lote);
    if (error) throw new Error(`Falha ao reler pedidos: ${error.message}`);
    for (const p of data ?? []) {
      idPorCodigo.set(String(p.codigo_externo), p.id as string);
    }
  });

  const { data: anunciosDb } = await sb
    .from("anuncios")
    .select("id,codigo_externo")
    .eq("conta_canal_id", ctx.contaCanalId);
  const anuncioPorMlb = new Map(
    (anunciosDb ?? []).map((a) => [String(a.codigo_externo).toUpperCase(), a.id as string])
  );

  const itens: Record<string, unknown>[] = [];
  for (const p of lista) {
    const pedidoId = idPorCodigo.get(String(p.id));
    if (!pedidoId) continue;
    for (const it of p.itens) {
      itens.push({
        operacao_id: ctx.operacaoId,
        pedido_id: pedidoId,
        anuncio_id: anuncioPorMlb.get(it.mlb.toUpperCase()) ?? null,
        codigo_externo: it.mlb,
        sku: it.sku,
        titulo: it.titulo,
        quantidade: it.quantidade,
        preco_unitario: it.precoUnitario,
      });
    }
  }

  /*
   * Os itens do pedido são reescritos, não acrescentados.
   *
   * `pedido_itens` não tem chave natural — o mesmo anúncio pode aparecer
   * duas vezes no mesmo pedido legitimamente. Sem apagar antes, cada nova
   * sincronização duplicaria as linhas e a quantidade vendida dobraria.
   */
  const ids = [...idPorCodigo.values()];
  await emLotes(ids, 300, async (lote) => {
    const { error } = await sb.from("pedido_itens").delete().in("pedido_id", lote);
    if (error) throw new Error(`Falha ao limpar itens: ${error.message}`);
  });

  await emLotes(itens, 500, async (lote) => {
    const { error } = await sb.from("pedido_itens").insert(lote);
    if (error) throw new Error(`Falha ao gravar itens: ${error.message}`);
  });

  resumo.pedidos = {
    lidos: lista.length,
    gravados: cabecalhos.length,
    itens: itens.length,
    comComissao: lista.filter((p) => p.comissao != null).length,
    comFrete: lista.filter((p) => p.fretePago != null).length,
  };
}

/* ══ Visitas ═══════════════════════════════════════════════════ */

async function gravarVisitas(
  ctx: Awaited<ReturnType<typeof resolverConta>>,
  mlbs: string[],
  dias: number,
  resumo: Resumo
) {
  const sb = clientePrivilegiado();
  const r = await visitasPorAnuncio({ mlbs, dias, conta: ctx.conta });

  const { data: anunciosDb } = await sb
    .from("anuncios")
    .select("id,codigo_externo")
    .eq("conta_canal_id", ctx.contaCanalId);
  const anuncioPorMlb = new Map(
    (anunciosDb ?? []).map((a) => [String(a.codigo_externo).toUpperCase(), a.id as string])
  );

  const linhas = r.linhas
    .map((l) => {
      const anuncioId = anuncioPorMlb.get(l.mlb.toUpperCase());
      if (!anuncioId) return null;
      return {
        operacao_id: ctx.operacaoId,
        anuncio_id: anuncioId,
        data: l.data,
        visitas: l.visitas,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  /*
   * Só as visitas. `vendas`, `unidades` e `receita` ficam de fora do
   * upsert de propósito: quem sabe disso é o pedido, e sobrescrever com
   * zero apagaria o que a importação de pedidos já preencheu.
   */
  await emLotes(linhas, 500, async (lote) => {
    const { error } = await sb
      .from("anuncio_desempenho_diario")
      .upsert(lote, { onConflict: "anuncio_id,data" });
    if (error) throw new Error(`Falha ao gravar visitas: ${error.message}`);
  });

  resumo.visitas = {
    anuncios: mlbs.length,
    linhas: linhas.length,
    falharam: r.falharam.length,
  };
}

/* ══ Diárias ═══════════════════════════════════════════════════ */

/**
 * Consolida `vendas_diarias` a partir do que já está no banco.
 *
 * Deriva de `pedidos` e `anuncio_desempenho_diario` em vez de somar o que
 * a API devolveu: assim a linha diária nunca discorda dos pedidos que a
 * sustentam. Somar em paralelo criaria duas verdades para o mesmo dia.
 *
 * `investimento_ads` NÃO é tocado — continua vindo do lançamento manual,
 * que hoje é o único lugar com Product Ads e Brand Ads somados.
 */
async function consolidarDiarias(
  ctx: Awaited<ReturnType<typeof resolverConta>>,
  de: string,
  ate: string,
  resumo: Resumo
) {
  const sb = clientePrivilegiado();

  /*
   * As duas leituras são PAGINADAS, e não é detalhe.
   *
   * O PostgREST corta a resposta em 1000 linhas por padrão. Trinta e cinco
   * dias de visita em 468 anúncios são ~16 mil linhas: sem paginar, voltam
   * as mil primeiras e a soma sai truncada — sem erro, sem aviso, só um
   * número menor. Foi exatamente o que aconteceu no teste, e o sintoma
   * enganou: 09/09 mostrou 781 visitas numa execução e 370 na seguinte,
   * com o mesmo dado do lado do canal.
   */
  const peds = await paginar(() =>
    sb
      .from("pedidos")
      .select("data,total,cancelado")
      .eq("conta_canal_id", ctx.contaCanalId)
      .gte("data", de)
      .lte("data", ate)
      .order("data")
  ).catch((e: Error) => {
    throw new Error(`Falha ao ler pedidos para consolidar: ${e.message}`);
  });

  const vis = await paginar(() =>
    sb
      .from("anuncio_desempenho_diario")
      .select("data,visitas,anuncios!inner(conta_canal_id)")
      .eq("anuncios.conta_canal_id", ctx.contaCanalId)
      .gte("data", de)
      .lte("data", ate)
      .order("data")
  ).catch(() => [] as unknown[]);

  type Acum = {
    receita: number;
    pedidos: number;
    cancelados: number;
    valorCancelado: number;
    visitas: number;
  };
  const porDia = new Map<string, Acum>();
  const novo = (): Acum => ({
    receita: 0, pedidos: 0, cancelados: 0, valorCancelado: 0, visitas: 0,
  });

  for (const p of peds as unknown as { data: string; total: number; cancelado: boolean }[]) {
    const d = String(p.data).slice(0, 10);
    const a = porDia.get(d) ?? novo();
    const total = Number(p.total) || 0;
    // `pedidos` conta tudo, cancelado incluído — é a convenção que a
    // plataforma já usa e que o ticket médio divide depois.
    a.pedidos += 1;
    a.receita += total;
    if (p.cancelado) {
      a.cancelados += 1;
      a.valorCancelado += total;
    }
    porDia.set(d, a);
  }

  // Guarda QUAIS dias têm visita medida. Um dia pode ter linha de visita
  // somando zero, e isso é diferente de não ter linha nenhuma.
  const diasComVisita = new Set<string>();
  for (const v of vis as unknown as { data: string; visitas: number }[]) {
    const d = String(v.data).slice(0, 10);
    const a = porDia.get(d) ?? novo();
    a.visitas += Number(v.visitas) || 0;
    porDia.set(d, a);
    diasComVisita.add(d);
  }

  /*
   * Dias SEM visita coletada não levam a coluna `visitas` no payload.
   *
   * Isto custou um dia de dado no teste: a janela de visitas era de 7 dias
   * e a consolidação, de 30. Nos 23 dias sem coleta o campo ia como zero e
   * SOBRESCREVIA o que já estava lá — 01/09 tinha 1.011 visitas e virou 0.
   *
   * Ausência de coleta não é ausência de visita. Como o upsert só atualiza
   * as colunas que estão no payload, basta omitir `visitas` nesses dias
   * para o valor anterior sobreviver. Por isso são duas gravações: uma
   * para os dias com visita medida, outra para os sem.
   */
  const comum = (data: string, a: Acum) => ({
    operacao_id: ctx.operacaoId,
    canal_id: ctx.canalId,
    conta_canal_id: ctx.contaCanalId,
    data,
    pedidos: a.pedidos,
    receita: r2(a.receita),
    pedidos_cancelados: a.cancelados,
    valor_cancelado: r2(a.valorCancelado),
  });

  const comVisita: Record<string, unknown>[] = [];
  const semVisita: Record<string, unknown>[] = [];
  for (const [data, a] of porDia) {
    if (diasComVisita.has(data)) comVisita.push({ ...comum(data, a), visitas: a.visitas });
    else semVisita.push(comum(data, a));
  }

  for (const grupo of [comVisita, semVisita]) {
    await emLotes(grupo, 500, async (lote) => {
      const { error: e } = await sb
        .from("vendas_diarias")
        .upsert(lote, { onConflict: "conta_canal_id,data" });
      if (e) throw new Error(`Falha ao consolidar vendas diárias: ${e.message}`);
    });
  }

  resumo.diarias = { dias: porDia.size };
}

/* ══ Orquestração ══════════════════════════════════════════════ */

export type OpcoesSincronizacao = {
  conta?: Conta;
  /** Data inicial dos pedidos. Padrão: 30 dias atrás. */
  de?: string;
  ate?: string;
  /** Janela de visitas, em dias. Máximo 150. */
  diasVisitas?: number;
  /** Desliga etapas, para rodar só o que interessa. */
  etapas?: { catalogo?: boolean; pedidos?: boolean; visitas?: boolean; diarias?: boolean };
};

function hoje() {
  return new Date().toISOString().slice(0, 10);
}
function diasAtras(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export async function sincronizarMeli(
  opcoes: OpcoesSincronizacao = {}
): Promise<Resumo & { conta: string; periodo: { de: string; ate: string } }> {
  const conta = opcoes.conta ?? "principal";

  const de = opcoes.de ?? diasAtras(30);
  const ate = opcoes.ate ?? hoje();
  const diasVisitas = Math.min(150, Math.max(1, opcoes.diasVisitas ?? 30));
  const etapas = {
    catalogo: true, pedidos: true, visitas: true, diarias: true,
    ...(opcoes.etapas ?? {}),
  };

  const resumo: Resumo = {
    anuncios: { lidos: 0, gravados: 0 },
    produtos: { pesoPreenchido: 0 },
    pedidos: { lidos: 0, gravados: 0, itens: 0, comComissao: 0, comFrete: 0 },
    visitas: { anuncios: 0, linhas: 0, falharam: 0 },
    diarias: { dias: 0 },
    avisos: [],
  };

  const ctx = await resolverConta(conta);

  let mlbs: string[] = [];

  if (etapas.catalogo) {
    const itens = await catalogoCompleto({ conta });
    mlbs = itens.map((i) => i.mlb);
    await gravarCatalogo(ctx, itens, resumo);
  }

  if (etapas.pedidos) {
    const lista = await buscarPedidos({ de, ate, conta });
    await completarFretes(lista, conta);
    await gravarPedidos(ctx, lista, resumo);
  }

  if (etapas.visitas) {
    if (!mlbs.length) {
      const sb = clientePrivilegiado();
      const { data } = await sb
        .from("anuncios")
        .select("codigo_externo")
        .eq("conta_canal_id", ctx.contaCanalId);
      mlbs = (data ?? []).map((a) => String(a.codigo_externo));
    }
    await gravarVisitas(ctx, mlbs, diasVisitas, resumo);
  }

  if (etapas.diarias) {
    // A janela das diárias cobre a maior das duas: pedidos e visitas.
    const inicio = [de, diasAtras(diasVisitas)].sort()[0];
    await consolidarDiarias(ctx, inicio, ate, resumo);
  }

  return { ...resumo, conta: ctx.nome, periodo: { de, ate } };
}
