import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { parsePerformanceReport } from "@/lib/planilhas/desempenho";
import { lerPedidos } from "@/lib/planilhas/pedidos";
import { lerCatalogo } from "@/lib/planilhas/catalogo";
import type { TipoPlanilha } from "@/lib/planilhas/detectar";
import {
  previsualizar,
  carregarCanais,
  type Previa,
} from "./importar";
import { resolver, type LinhaCanal } from "./resolver-canal";
import { derivarKpisDiarios, type PedidoDerivavel } from "./derivar-kpis";

/**
 * Grava no banco o que a prévia mostrou.
 *
 * Tudo aqui é upsert por chave natural, e a consequência prática é a que
 * governa o uso real do sistema: **subir o mesmo período duas vezes é
 * seguro**. Quem importa todo dia e às vezes volta para cobrir um dia que
 * faltou não corre risco de inflar o faturamento.
 *
 * Com insert, a segunda subida somaria. O total ficaria errado, nada
 * avisaria, e a descoberta viria semanas depois — comparando com o painel
 * do canal e sem saber de onde veio a diferença.
 */

export type Gravacao = {
  importacaoId: string;
  criadas: number;
  atualizadas: number;
  ignoradas: number;
  avisos: string[];
};

type Sb = Awaited<ReturnType<typeof clienteServidor>>;

/** Lotes pequenos o bastante para o PostgREST não recusar o corpo. */
const LOTE = 400;

const TIPO_RELATORIO: Record<string, string> = {
  desempenho: "desempenho_anuncios",
  pedidos: "pedidos",
  catalogo: "catalogo",
};

async function registrar(
  sb: Sb,
  operacaoId: string,
  tipo: TipoPlanilha,
  nomeArquivo: string,
  hash: string,
  periodo: { inicio: string | null; fim: string | null },
  lidas: number,
  validas: number
): Promise<string> {
  const { data, error } = await sb
    .from("importacoes")
    .insert({
      operacao_id: operacaoId,
      tipo: TIPO_RELATORIO[tipo] ?? "consolidado",
      nome_arquivo: nomeArquivo,
      hash_arquivo: hash,
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
      linhas_lidas: lidas,
      linhas_validas: validas,
      status: "concluida",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Não consegui registrar a importação: ${error.message}`);
  }
  return data.id as string;
}

export async function gravar(
  buffer: Buffer,
  nomeArquivo: string,
  operacaoId: string,
  /** Só o catálogo precisa: o arquivo não diz de que conta é. */
  contaCanalId?: string
): Promise<Gravacao> {
  const previa = await previsualizar(buffer, nomeArquivo, operacaoId);

  // As mesmas travas da tela, repetidas aqui de propósito. A tela pode ser
  // contornada; a rota, não. Validação que só existe no front é decoração.
  if (previa.tipo === "desconhecido") {
    throw new Error("Formato não reconhecido. Nada foi gravado.");
  }
  if (previa.naoReconhecidos.length) {
    throw new Error(
      "Há canais sem apelido cadastrado. Cadastre-os antes: gravar na conta " +
        "errada não muda o total e só apareceria muito depois."
    );
  }

  const sb = await clienteServidor();
  const canais = await carregarCanais(operacaoId);

  if (previa.tipo === "catalogo") {
    if (!contaCanalId) throw new Error("Escolha a conta do Mercado Livre.");
    return catalogo(buffer, sb, operacaoId, contaCanalId, canais, previa, nomeArquivo);
  }
  if (previa.tipo === "pedidos") {
    return pedidos(buffer, sb, operacaoId, canais, previa, nomeArquivo);
  }
  return desempenho(buffer, sb, operacaoId, previa, nomeArquivo);
}

/* ── Catálogo ────────────────────────────────────────────────── */

async function catalogo(
  buffer: Buffer,
  sb: Sb,
  operacaoId: string,
  contaCanalId: string,
  canais: LinhaCanal[],
  previa: Previa,
  nomeArquivo: string
): Promise<Gravacao> {
  const conta = canais.find((c) => c.conta_id === contaCanalId);
  if (!conta) throw new Error("Conta de canal não encontrada.");

  const { itens } = await lerCatalogo(buffer);
  const importacaoId = await registrar(
    sb, operacaoId, "catalogo", nomeArquivo, previa.hash,
    { inicio: null, fim: null }, itens.length, itens.length
  );

  const linhas = itens.map((i) => ({
    operacao_id: operacaoId,
    canal_id: conta.canal_id,
    conta_canal_id: contaCanalId,
    codigo_externo: i.mlb,
    titulo: i.titulo || i.mlb,
    sku_canal: i.sku || null,
    tipo: i.tipo,
    status: i.status,
    preco_atual: i.preco,
    comissao_atual: i.tarifa,
    sincronizado_em: new Date().toISOString(),
  }));

  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await sb
      .from("anuncios")
      .upsert(linhas.slice(i, i + LOTE), { onConflict: "canal_id,codigo_externo" });
    if (error) throw new Error(`Falha ao gravar anúncios: ${error.message}`);
  }

  return {
    importacaoId,
    criadas: previa.novas,
    atualizadas: previa.atualizadas,
    ignoradas: 0,
    avisos: [],
  };
}

/* ── Pedidos ─────────────────────────────────────────────────── */

async function pedidos(
  buffer: Buffer,
  sb: Sb,
  operacaoId: string,
  canais: LinhaCanal[],
  previa: Previa,
  nomeArquivo: string
): Promise<Gravacao> {
  const r = await lerPedidos(buffer);
  const importacaoId = await registrar(
    sb, operacaoId, "pedidos", nomeArquivo, previa.hash,
    { inicio: r.inicio, fim: r.fim }, r.linhasLidas, r.pedidos.length
  );

  const avisos: string[] = [];
  let ignoradas = 0;

  const cabecas: Record<string, unknown>[] = [];
  const itensPorChave = new Map<string, (typeof r.pedidos)[number]["itens"]>();
  const derivaveis: PedidoDerivavel[] = [];

  for (const p of r.pedidos) {
    const res = resolver(canais, p.marketplace, p.conta);
    if (!res) {
      ignoradas += 1;
      continue;
    }
    /*
     * A comissão, quando o canal não informa.
     *
     * O hub preenche essa coluna em 33% dos pedidos do Mercado Livre —
     * conferido na planilha de origem, não aqui. Mas "valor a receber"
     * vem em ~100%, e o resto se reconstrói:
     *
     *   total − a receber − frete do vendedor − juros = comissão
     *
     * Os juros do parcelamento entram no `total` e são repasse, não
     * comissão. Sem descontá-los a derivação inflava: em 1.169 pedidos
     * que trazem as duas informações, a fórmula sem juros acertava 68%;
     * com juros, 92,4%.
     *
     * NÃO É CONFIÁVEL NO NÍVEL DO PEDIDO, e isso foi demonstrado depois
     * de construída. No anúncio MLB5397764684:
     *
     *   2.028,90 − 1.840,95 − 187,95 = 0,00      (tarifa zero não existe)
     *   2.834,91 − 1.840,95 − 187,95 = 596,99    (= o frete, não a tarifa)
     *
     * O "valor a receber" não tem significado constante: em uns pedidos
     * já desconta a tarifa, em outros não. Por isso as telas usam SÓ a
     * comissão informada, e `comissao_derivada` marca o que não deve ser
     * apresentado como tarifa.
     *
     * O valor continua sendo gravado porque as parcelas estão no banco e
     * alguém pode achar a regra que faltou. Mas nada o exibe como custo.
     *
     * Deriva só quando falta, nunca por cima do informado — o número do
     * canal é a verdade; o nosso é a melhor aproximação dela.
     */
    let comissao = p.comissao;
    let derivada = false;
    if (comissao == null && p.liquidoRecebido != null) {
      const calculada =
        p.total - p.liquidoRecebido - (p.freteVendedor ?? 0) - (p.juros ?? 0);
      const pct = p.total > 0 ? (calculada * 100) / p.total : 0;

      /*
       * A faixa de plausibilidade é o que separa reconstrução de lixo.
       *
       * Medido contra os 1.169 pedidos que trazem a comissão informada:
       *
       *   ≤ 0%      2.017 pedidos   0/5 exatos    ("a receber" ainda sem a
       *                                             tarifa descontada)
       *   1–5%        206           97% exatos
       *   5–10%       777           99% exatos
       *   10–15%      364           93% exatos
       *   15–20%      107           53% exatos
       *   acima de 20% 69            0% exatos    (é o frete, não a tarifa)
       *
       * Dentro de 1–15% o acerto é ~97%; fora, a conta capturou outra
       * coisa. Sem a faixa, um frete de R$ 597 virava "tarifa de 21%" num
       * anúncio cuja tabela é 11,5% — e ninguém teria como desconfiar.
       */
      if (pct >= 1 && pct <= 15) {
        comissao = Number(calculada.toFixed(2));
        derivada = true;
      }
    }

    cabecas.push({
      operacao_id: operacaoId,
      canal_id: res.canalId,
      conta_canal_id: res.contaCanalId,
      codigo_externo: p.codigoExterno,
      data: p.data,
      fechado_em: p.fechadoEm,
      status: p.status,
      cancelado: p.cancelado,
      total: p.total,
      frete: p.frete,
      comissao,
      comissao_derivada: derivada,
      liquido_recebido: p.liquidoRecebido,
      frete_vendedor: p.freteVendedor,
      /*
       * O juro era usado na derivação da comissão e jogado fora. Agora
       * fica: é um custo real do pedido — repasse ao canal, não receita —
       * e sem ele gravado ninguém consegue conferir a derivação nem
       * separar faturamento de dinheiro que só passou.
       */
      juros: p.juros,
      origem: "planilha",
    });
    itensPorChave.set(`${res.canalId}|${p.codigoExterno}`, p.itens);
    derivaveis.push({
      contaCanalId: res.contaCanalId,
      canalId: res.canalId,
      data: p.data,
      total: p.total,
      cancelado: p.cancelado,
    });
  }

  for (let i = 0; i < cabecas.length; i += LOTE) {
    const { error } = await sb
      .from("pedidos")
      .upsert(cabecas.slice(i, i + LOTE), { onConflict: "canal_id,codigo_externo" });
    if (error) throw new Error(`Falha ao gravar pedidos: ${error.message}`);
  }

  // Descobre o id de cada pedido para prender os itens.
  const codigos = [...itensPorChave.keys()].map((k) => k.split("|")[1]);
  const idPorChave = new Map<string, string>();
  for (let i = 0; i < codigos.length; i += 200) {
    const { data } = await sb
      .from("pedidos")
      .select("id, canal_id, codigo_externo")
      .eq("operacao_id", operacaoId)
      .in("codigo_externo", codigos.slice(i, i + 200));
    for (const p of data ?? []) {
      idPorChave.set(`${p.canal_id}|${p.codigo_externo}`, p.id as string);
    }
  }

  /*
   * Apaga os itens e regrava, em vez de upsert.
   *
   * Não existe chave natural confiável: o mesmo SKU pode aparecer duas
   * vezes no mesmo pedido. E há um motivo mais forte — se um pedido
   * PERDEU um item na origem (cancelamento parcial, correção), o upsert
   * deixaria o item removido para trás e a soma dos itens passaria a
   * ultrapassar o total do pedido, sem nada indicar o porquê.
   */
  const ids = [...idPorChave.values()];
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb
      .from("pedido_itens")
      .delete()
      .in("pedido_id", ids.slice(i, i + 200));
    if (error) throw new Error(`Falha ao limpar itens antigos: ${error.message}`);
  }

  const linhasItem: Record<string, unknown>[] = [];
  for (const [chave, itens] of itensPorChave) {
    const pedidoId = idPorChave.get(chave);
    if (!pedidoId) continue;
    for (const it of itens) {
      linhasItem.push({
        operacao_id: operacaoId,
        pedido_id: pedidoId,
        codigo_externo: it.codigoExterno,
        sku: it.sku || null,
        titulo: it.titulo,
        quantidade: it.quantidade,
        preco_unitario: it.precoUnitario,
        frete: it.frete,
        desconto: it.desconto,
      });
    }
  }

  for (let i = 0; i < linhasItem.length; i += LOTE) {
    const { error } = await sb
      .from("pedido_itens")
      .insert(linhasItem.slice(i, i + LOTE));
    if (error) throw new Error(`Falha ao gravar itens: ${error.message}`);
  }

  // Os KPIs diários saem daqui, não de digitação. Visitas e ADS ficam
  // intocados — são o que a planilha não traz.
  const kpis = await derivarKpisDiarios(sb, operacaoId, derivaveis);
  avisos.push(
    `KPIs diários atualizados: ${kpis.dias} dias em ${kpis.contas} contas de canal. ` +
      "Visitas e investimento em ADS continuam vindo de Lançamentos."
  );

  if (ignoradas) {
    avisos.push(`${ignoradas} pedidos ficaram de fora por canal não resolvido.`);
  }

  return {
    importacaoId,
    criadas: Math.max(0, previa.novas),
    atualizadas: previa.atualizadas,
    ignoradas,
    avisos,
  };
}

/* ── Desempenho ──────────────────────────────────────────────── */

type LinhaDesempenho = {
  mlb: string;
  visitas: number;
  vendas: number;
  receita: number;
  participacao: number;
};

async function desempenho(
  buffer: Buffer,
  sb: Sb,
  operacaoId: string,
  previa: Previa,
  nomeArquivo: string
): Promise<Gravacao> {
  const rel = await parsePerformanceReport(buffer, nomeArquivo);
  const linhas =
    (rel as unknown as { data: LinhaDesempenho[] }).data ?? [];

  if (!rel.inicio) {
    throw new Error(
      "O relatório não tem data legível. Sem data, todas as linhas cairiam no mesmo dia."
    );
  }

  const importacaoId = await registrar(
    sb, operacaoId, "desempenho", nomeArquivo, previa.hash,
    { inicio: rel.inicio, fim: rel.fim ?? rel.inicio }, linhas.length, linhas.length
  );

  // O desempenho se prende a um anúncio que precisa existir. Sem catálogo
  // subido antes, não há onde prender.
  const idPorMlb = new Map<string, string>();
  const mlbs = linhas.map((l) => l.mlb);
  for (let i = 0; i < mlbs.length; i += 200) {
    const { data } = await sb
      .from("anuncios")
      .select("id, codigo_externo")
      .eq("operacao_id", operacaoId)
      .in("codigo_externo", mlbs.slice(i, i + 200));
    for (const a of data ?? []) {
      idPorMlb.set(a.codigo_externo as string, a.id as string);
    }
  }

  /*
   * O Mercado Livre exporta este relatório em dois grãos, e a diferença
   * decide em que tabela ele entra:
   *
   *   "no dia 27 de agosto de 2026"          -> um dia
   *   "de 24 de agosto até 30 de agosto"     -> uma semana
   *
   * Gravar a semana como se fosse o seu primeiro dia era o que este
   * código fazia antes, e o estrago é silencioso: 6.879 visitas de uma
   * semana inteira apareciam como tendo acontecido numa segunda-feira. O
   * total do mês continuaria certo, e só o gráfico diário mentiria — que
   * é justamente onde ninguém procura erro de importação.
   */
  const fim = rel.fim ?? rel.inicio;
  const ehSemanal = fim !== rel.inicio;

  const registros: Record<string, unknown>[] = [];
  let orfaos = 0;
  for (const l of linhas) {
    const anuncioId = idPorMlb.get(l.mlb);
    if (!anuncioId) {
      orfaos += 1;
      continue;
    }

    const comum = {
      operacao_id: operacaoId,
      anuncio_id: anuncioId,
      visitas: Math.max(0, Math.round(l.visitas)),
      vendas: Math.max(0, Math.round(l.vendas)),
      receita: Math.max(0, l.receita),
      importacao_id: importacaoId,
    };

    registros.push(
      ehSemanal
        ? {
            ...comum,
            ano_iso: rel.anoIso,
            semana_iso: rel.semanaIso,
            inicio: rel.inicio,
            fim,
          }
        : {
            ...comum,
            data: rel.inicio,
            unidades: Math.max(0, Math.round(l.vendas)),
            participacao: l.participacao,
          }
    );
  }

  const tabela = ehSemanal
    ? "anuncio_desempenho_semanal"
    : "anuncio_desempenho_diario";
  const chave = ehSemanal ? "anuncio_id,ano_iso,semana_iso" : "anuncio_id,data";

  for (let i = 0; i < registros.length; i += LOTE) {
    const { error } = await sb
      .from(tabela)
      .upsert(registros.slice(i, i + LOTE), { onConflict: chave });
    if (error) throw new Error(`Falha ao gravar desempenho: ${error.message}`);
  }

  const avisos: string[] = [];
  if (orfaos) {
    avisos.push(
      `${orfaos} anúncios do relatório não estão no cadastro e ficaram de fora. ` +
        "Suba o catálogo e reimporte — reimportar é seguro."
    );
  }

  return {
    importacaoId,
    criadas: registros.length,
    atualizadas: 0,
    ignoradas: orfaos,
    avisos,
  };
}
