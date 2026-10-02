import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { paginar } from "@/lib/dados/paginar";
import {
  catalogoCompleto,
  pedidos as buscarPedidos,
  completarFretes,
  visitasPorAnuncio,
  vendedor,
  disputaCatalogo,
  perguntasSemResposta,
  type Conta,
  type AnuncioCompleto,
  type Pedido,
} from "./cliente";
import { iniciarRegistro, concluirRegistro, type Origem, type Registro } from "./historico";
import { integracaoDa, vincularIntegracao } from "./tokens";
import { consolidarDiarias, emLotes, r2 } from "@/lib/sync/diarias";

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
  estoque: { linhas: number };
  catalogo: { consultados: number; gravados: number };
  reputacao: { gravada: boolean };
  diarias: { dias: number };
  avisos: string[];
};

/**
 * Carrega a conta de canal e confere com quem o token diz que somos.
 *
 * `conta` já é o id de `contas_canal`, então achar a linha é direto. O que
 * esta função ainda faz de útil é a CONFERÊNCIA: pergunta ao Meli "quem
 * sou eu" e compara com o `identificador` gravado. Divergir significa que
 * o token daquela linha é de outro vendedor, e seguir gravaria o catálogo
 * de uma empresa dentro da operação de outra — o pior erro possível aqui.
 */
async function resolverConta(conta: Conta) {
  const sb = clientePrivilegiado();

  const { data: achada, error } = await sb
    .from("contas_canal")
    .select("id,operacao_id,canal_id,nome,identificador")
    .eq("id", conta)
    .maybeSingle();

  if (error) throw new Error(`Não consegui ler contas_canal: ${error.message}`);
  if (!achada) throw new Error(`Conta de canal ${conta} não existe.`);

  const v = await vendedor(conta);
  const gravado = String(achada.identificador ?? "");

  if (gravado && gravado !== String(v.id)) {
    throw new Error(
      `A conta "${achada.nome}" está gravada como vendedor ${gravado}, mas o token ` +
        `autenticou como ${v.id} (${v.nickname}). Não vou gravar: os dados iriam ` +
        "para a conta errada. Reconecte a integração dessa conta."
    );
  }

  // Primeira sincronização da conta: registra de quem é o token.
  if (!gravado) {
    const { error: e } = await sb
      .from("contas_canal")
      .update({ identificador: String(v.id) })
      .eq("id", achada.id);
    if (e) {
      console.warn(`[meli] não consegui gravar o identificador: ${e.message}`);
    }
  }

  return {
    contaCanalId: achada.id as string,
    operacaoId: achada.operacao_id as string,
    canalId: achada.canal_id as string,
    nome: achada.nome as string,
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
    /*
     * Estoque e logística vinham sendo lidos e jogados fora.
     *
     * Nulo é "o canal não informou", que é diferente de zero. Zero é
     * ruptura, e é o que a cobertura de estoque precisa distinguir.
     */
    estoque: a.estoque,
    vendidos_total: a.vendidos,
    frete_gratis: a.freteGratis,
    logistica: a.logistica,
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
/* ══ Séries do relatório ═══════════════════════════════════════ */

/**
 * Uma linha de estoque por anúncio por dia.
 *
 * `anuncios.estoque` responde "quanto tem agora" e é sobrescrito a cada
 * sincronização. A pergunta do relatório é outra — há quantos dias está
 * zerado, quanto caiu na semana — e só uma série responde.
 *
 * Roda depois de `gravarCatalogo`, que é quem garante que todo anúncio
 * tem linha em `anuncios` e portanto id para referenciar.
 */
async function gravarEstoqueDiario(
  ctx: Awaited<ReturnType<typeof resolverConta>>,
  itens: AnuncioCompleto[],
  resumo: Resumo
) {
  const comEstoque = itens.filter((a) => a.estoque != null && a.estoque >= 0);
  if (!comEstoque.length) return;

  const sb = clientePrivilegiado();
  const { data: cadastrados, error } = await sb
    .from("anuncios")
    .select("id,codigo_externo")
    .eq("conta_canal_id", ctx.contaCanalId);
  if (error) {
    resumo.avisos.push(`Não consegui ler anúncios para o estoque: ${error.message}`);
    return;
  }
  const idPorMlb = new Map(
    (cadastrados ?? []).map((a) => [String(a.codigo_externo).toUpperCase(), a.id as string])
  );

  const dia = hoje();
  const linhas = comEstoque
    .map((a) => {
      const id = idPorMlb.get(a.mlb.toUpperCase());
      if (!id) return null;
      return {
        operacao_id: ctx.operacaoId,
        anuncio_id: id,
        data: dia,
        /* 40.000 e acima é o marcador de "sem controle de estoque" do
           canal, não estoque de verdade. Somá-lo daria centenas de
           milhares de peças que não existem. */
        estoque: a.estoque! >= 40_000 ? 0 : a.estoque!,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  await emLotes(linhas, 500, async (lote) => {
    const { error: e } = await sb
      .from("anuncio_estoque_diario")
      .upsert(lote, { onConflict: "anuncio_id,data" });
    if (e) throw new Error(`Falha ao gravar estoque diário: ${e.message}`);
  });
  resumo.estoque = { linhas: linhas.length };
}

/**
 * A disputa do catálogo, um anúncio por dia.
 *
 * Só para quem está ou pode estar no catálogo: é um pedido por anúncio, e
 * perguntar por quem nunca disputou gastaria a cota do canal à toa.
 *
 * Falha de um anúncio não derruba os outros — `disputaCatalogo` devolve
 * null e a linha simplesmente não entra.
 */
async function gravarCatalogoDiario(
  ctx: Awaited<ReturnType<typeof resolverConta>>,
  itens: AnuncioCompleto[],
  conta: Conta,
  resumo: Resumo
) {
  const candidatos = itens.filter((a) => a.catalogo && a.status === "active");
  if (!candidatos.length) return;

  const sb = clientePrivilegiado();
  const { data: cadastrados } = await sb
    .from("anuncios")
    .select("id,codigo_externo")
    .eq("conta_canal_id", ctx.contaCanalId);
  const idPorMlb = new Map(
    (cadastrados ?? []).map((a) => [String(a.codigo_externo).toUpperCase(), a.id as string])
  );

  const dia = hoje();
  const linhas: Record<string, unknown>[] = [];
  /* Em série, e não em paralelo: o limitador do canal é por segundo, e
     disparar 300 de uma vez volta como 429 para metade delas. */
  for (const a of candidatos) {
    const id = idPorMlb.get(a.mlb.toUpperCase());
    if (!id) continue;
    const d = await disputaCatalogo(a.mlb, conta);
    resumo.catalogo.consultados++;
    if (!d) continue;
    linhas.push({
      operacao_id: ctx.operacaoId,
      anuncio_id: id,
      data: dia,
      situacao: d.situacao ?? "desconhecida",
      preco_atual: d.precoAtual,
      preco_para_ganhar: d.precoParaGanhar,
      fatia_visita: d.fatiaVisita,
      dividindo_primeiro: d.dividindoPrimeiro,
      vencedor_preco: d.vencedorPreco,
      catalogo_produto_id: null,
      elegivel: true,
      motivos: d.motivos,
      alavancas: d.alavancas,
    });
  }

  await emLotes(linhas, 300, async (lote) => {
    const { error } = await sb
      .from("anuncio_catalogo_diario")
      .upsert(lote, { onConflict: "anuncio_id,data" });
    if (error) throw new Error(`Falha ao gravar catálogo diário: ${error.message}`);
  });
  resumo.catalogo.gravados = linhas.length;
}

/**
 * Reputação da conta no dia.
 *
 * Vem de `/users/me`, que a sincronização já chama para descobrir o
 * vendedor — a reputação viaja junto na mesma resposta.
 */
async function gravarReputacao(
  ctx: Awaited<ReturnType<typeof resolverConta>>,
  conta: Conta,
  resumo: Resumo
) {
  const rep = ctx.vendedor.seller_reputation;
  if (!rep) return;
  const m = rep.metrics ?? {};
  const sb = clientePrivilegiado();
  const { error } = await sb.from("conta_reputacao_diaria").upsert(
    {
      operacao_id: ctx.operacaoId,
      conta_canal_id: ctx.contaCanalId,
      data: hoje(),
      nivel: rep.level_id ?? null,
      categoria: rep.power_seller_status ?? null,
      reclamacoes_taxa: m.claims?.rate ?? null,
      cancelamentos_taxa: m.cancellations?.rate ?? null,
      atrasos_taxa: m.delayed_handling_time?.rate ?? null,
      vendas_60d: m.sales?.completed ?? null,
      perguntas_sem_resposta: await perguntasSemResposta(ctx.vendedor.id, conta),
    },
    { onConflict: "conta_canal_id,data" }
  );
  if (error) {
    resumo.avisos.push(`Não consegui gravar a reputação: ${error.message}`);
    return;
  }
  resumo.reputacao = { gravada: true };
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
  etapas?: {
    catalogo?: boolean;
    pedidos?: boolean;
    visitas?: boolean;
    diarias?: boolean;
    /** A disputa do catálogo é um pedido por anúncio; pesa mais que as outras. */
    disputa?: boolean;
  };
  /** Deixa registro em `sincronizacoes`. Sem isto, a execução não é anotada. */
  registro?: { origem: Origem; turno?: string };
};

/*
 * O dia é o de São Paulo, não o do relógio do servidor.
 *
 * `toISOString()` devolve UTC, e das 21h em diante o Brasil já está num
 * dia e o UTC no seguinte. A série diária de estoque saiu com data de
 * 30/09 numa execução das 21h44 do dia 29 — o dia seguinte receberia a
 * segunda leitura e sobrescreveria a primeira, e o dia 29 ficaria sem
 * nenhuma. A Vercel roda em UTC, então isto vale lá também.
 *
 * `en-CA` é o atalho para AAAA-MM-DD sem montar a string à mão.
 */
const DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

function hoje() {
  return DIA_SP.format(new Date());
}
function diasAtras(n: number) {
  return DIA_SP.format(new Date(Date.now() - n * 86_400_000));
}

type Resultado = Resumo & {
  conta: string;
  periodo: { de: string; ate: string };
  /* Quem chama depois — a publicidade, por exemplo — precisa saber em
     qual operação e conta de canal gravar, e descobrir de novo custaria
     outra ida ao banco. */
  operacaoId: string;
  contaCanalId: string;
};

/**
 * O registro é aberto o quanto antes — ANTES do token, se a integração já
 * existe. A falha mais comum de uma rotina agendada é justamente o token,
 * e registro aberto só depois dele nunca a veria.
 *
 * Na primeira execução da conta a integração ainda não existe; aí o
 * registro abre logo depois de `vincularIntegracao` criá-la.
 */
type RegistroVivo = { atual: Registro };

export async function sincronizarMeli(opcoes: OpcoesSincronizacao = {}): Promise<Resultado> {
  const conta = opcoes.conta;
  if (!conta) {
    throw new Error("Diga qual conta sincronizar — o id em `contas_canal`.");
  }
  const reg: RegistroVivo = { atual: null };
  if (opcoes.registro) {
    const integ = await integracaoDa(conta);
    if (integ) {
      reg.atual = await iniciarRegistro(integ, opcoes.registro.origem, opcoes.registro.turno);
    }
  }
  try {
    const r = await executar(opcoes, conta, reg);
    await concluirRegistro(reg.atual, {
      ok: true,
      registros: r.anuncios.gravados + r.pedidos.gravados + r.visitas.linhas,
      resumo: r,
    });
    return r;
  } catch (e) {
    await concluirRegistro(reg.atual, {
      ok: false,
      erro: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

async function executar(
  opcoes: OpcoesSincronizacao,
  conta: Conta,
  reg: RegistroVivo
): Promise<Resultado> {
  const de = opcoes.de ?? diasAtras(30);
  const ate = opcoes.ate ?? hoje();
  const diasVisitas = Math.min(150, Math.max(1, opcoes.diasVisitas ?? 30));
  const etapas = {
    catalogo: true, pedidos: true, visitas: true, diarias: true, disputa: true,
    ...(opcoes.etapas ?? {}),
  };

  const resumo: Resumo = {
    anuncios: { lidos: 0, gravados: 0 },
    produtos: { pesoPreenchido: 0 },
    pedidos: { lidos: 0, gravados: 0, itens: 0, comComissao: 0, comFrete: 0 },
    visitas: { anuncios: 0, linhas: 0, falharam: 0 },
    estoque: { linhas: 0 },
    catalogo: { consultados: 0, gravados: 0 },
    reputacao: { gravada: false },
    diarias: { dias: 0 },
    avisos: [],
  };

  const ctx = await resolverConta(conta);
  // Primeiro momento em que se sabe operação e conta de canal: cria a
  // integração se falta e grava o token que a renovação deixou pendente.
  const integ = await vincularIntegracao(ctx);
  if (opcoes.registro && !reg.atual && integ) {
    reg.atual = await iniciarRegistro(integ, opcoes.registro.origem, opcoes.registro.turno);
  }

  let mlbs: string[] = [];

  if (etapas.catalogo) {
    const itens = await catalogoCompleto({ conta });
    mlbs = itens.map((i) => i.mlb);
    await gravarCatalogo(ctx, itens, resumo);
    /* Depois de `gravarCatalogo`: as três dependem de o anúncio já ter
       linha em `anuncios` para referenciar por id. */
    await gravarEstoqueDiario(ctx, itens, resumo);
    await gravarReputacao(ctx, conta, resumo);
    if (etapas.disputa) await gravarCatalogoDiario(ctx, itens, conta, resumo);
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
    resumo.diarias = { dias: await consolidarDiarias(ctx, inicio, ate) };
  }

  return { ...resumo, conta: ctx.nome, periodo: { de, ate }, operacaoId: ctx.operacaoId, contaCanalId: ctx.contaCanalId };
}
