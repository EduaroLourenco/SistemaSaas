import "server-only";
import { createHash } from "node:crypto";
import { clienteServidor } from "@/lib/supabase/servidor";
import { detectar, NOME_TIPO, type TipoPlanilha } from "@/lib/planilhas/detectar";
import { parsePerformanceReport } from "@/lib/planilhas/desempenho";
import { lerPedidos } from "@/lib/planilhas/pedidos";
import { lerVendasMeli } from "@/lib/planilhas/vendas-ml";
import { lerCatalogo } from "@/lib/planilhas/catalogo";
import {
  resolver,
  type LinhaCanal,
  type Resolucao,
} from "./resolver-canal";

export { resolver };
export type { Resolucao, LinhaCanal };

/**
 * Importação de planilha para o banco.
 *
 * Três regras governam tudo aqui, e as três vieram de decisões tomadas
 * olhando os arquivos reais:
 *
 *  1. SOBRESCREVE, NÃO SOMA. Cada linha tem chave natural — pedido pelo
 *     código, desempenho por (anúncio, dia), anúncio pelo MLB. Subir o
 *     mesmo período de novo atualiza; nunca duplica. Sem isso, quem
 *     reimporta para cobrir um dia que faltou infla o faturamento sem
 *     ver.
 *
 *  2. NÃO ADIVINHA CANAL. O que não casar com um apelido cadastrado é
 *     recusado e mostrado. Jogar em "Outros" esconderia venda na conta
 *     errada, e o total continuaria certo — o pior tipo de erro.
 *
 *  3. CONFERE ANTES DE GRAVAR. `previsualizar()` roda a leitura inteira
 *     e devolve o que aconteceria, sem tocar no banco. Importação que só
 *     conta o estrago depois é importação que se desfaz na mão.
 */

export type Previa = {
  tipo: TipoPlanilha;
  evidencia: string;
  nomeArquivo: string;
  hash: string;
  /** Já foi importado antes? Mesmo hash = arquivo idêntico. */
  jaImportado: { em: string; linhas: number } | null;
  periodo: { inicio: string | null; fim: string | null };
  linhas: number;
  /** Quantas linhas seriam criadas vs. atualizadas. */
  novas: number;
  atualizadas: number;
  /** Canais reconhecidos, com contagem. */
  /**
   * `mostrarConta` só é true quando o canal tem mais de uma conta. Repetir
   * "Conta principal" em cada canal de conta única sugere que eles
   * compartilham algo — e a primeira leitura de quem vê é que as vendas
   * estão sendo somadas juntas.
   */
  reconhecidos: {
    canal: string;
    conta: string;
    linhas: number;
    mostrarConta: boolean;
  }[];
  /** O que não casou com nenhum apelido — bloqueia a importação. */
  naoReconhecidos: { marketplace: string; conta: string; linhas: number }[];
  /** Anúncios ou SKUs citados que ainda não existem no cadastro. */
  orfaos: { descricao: string; exemplos: string[]; total: number }[];
  avisos: string[];
  /** Só o catálogo usa: o arquivo não diz de que conta é. */
  contasDisponiveis: { id: string; nome: string }[];
};

export function hashDe(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/* ── Resolução de canal e conta ──────────────────────────────── */

export async function carregarCanais(operacaoId: string): Promise<LinhaCanal[]> {
  const sb = await clienteServidor();
  const { data, error } = await sb
    .from("contas_canal")
    .select(
      "id, nome, apelidos, padrao, canais!inner(id, codigo, nome, apelidos)"
    )
    .eq("operacao_id", operacaoId);

  if (error) throw new Error(`Não consegui ler os canais: ${error.message}`);

  return (data ?? []).map((r) => {
    const c = r.canais as unknown as {
      id: string;
      codigo: string;
      nome: string;
      apelidos: string[];
    };
    return {
      canal_id: c.id,
      canal_codigo: c.codigo,
      canal_nome: c.nome,
      canal_apelidos: c.apelidos ?? [],
      conta_id: r.id as string,
      conta_nome: r.nome as string,
      conta_apelidos: (r.apelidos as string[]) ?? [],
      padrao: r.padrao as boolean,
    };
  });
}

/* ── Prévia ──────────────────────────────────────────────────── */

export async function previsualizar(
  buffer: Buffer,
  nomeArquivo: string,
  operacaoId: string
): Promise<Previa> {
  const hash = hashDe(buffer);
  const det = await detectar(buffer);
  const sb = await clienteServidor();

  const { data: anterior } = await sb
    .from("importacoes")
    .select("criado_em, linhas_validas")
    .eq("operacao_id", operacaoId)
    .eq("hash_arquivo", hash)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const base: Previa = {
    tipo: det.tipo,
    evidencia: det.evidencia,
    nomeArquivo,
    hash,
    jaImportado: anterior
      ? {
          em: anterior.criado_em as string,
          linhas: (anterior.linhas_validas as number) ?? 0,
        }
      : null,
    periodo: { inicio: null, fim: null },
    linhas: 0,
    novas: 0,
    atualizadas: 0,
    reconhecidos: [],
    naoReconhecidos: [],
    orfaos: [],
    avisos: [],
    contasDisponiveis: [],
  };

  if (det.tipo === "desconhecido") {
    base.avisos.push(
      "Não reconheci o formato. Confira se é a exportação certa e se a aba original foi mantida."
    );
    return base;
  }

  const canais = await carregarCanais(operacaoId);

  if (det.tipo === "vendas_ml") return previaVendasMeli(buffer, base, sb);
  if (det.tipo === "pedidos") return previaPedidos(buffer, base, canais, sb);
  if (det.tipo === "catalogo") return previaCatalogo(buffer, base, canais, sb);
  return previaDesempenho(buffer, nomeArquivo, base, sb);
}

type Sb = Awaited<ReturnType<typeof clienteServidor>>;

/**
 * Prévia do relatório de vendas do próprio Mercado Livre.
 *
 * Não resolve canal por apelido: o arquivo é do Meli por definição, e
 * pedir para o usuário confirmar o óbvio é atrito sem informação.
 *
 * Ele também não CRIA pedidos — só melhora os que já existem, trocando a
 * comissão estimada pela cobrada. Um pedido que não veio na listagem do
 * hub aparece como órfão, porque criar cabeça de pedido a partir de um
 * relatório de tarifas produziria pedido sem item nem canal resolvido.
 */
async function previaVendasMeli(
  buffer: Buffer,
  base: Previa,
  sb: Sb
): Promise<Previa> {
  const r = await lerVendasMeli(buffer);
  base.linhas = r.vendas.length;

  const codigos = r.vendas.map((v) => v.codigoExterno);
  const existentes = new Set<string>();
  // Em lotes: a lista de códigos entra na URL, e 681 de uma vez estoura
  // o limite de tamanho do PostgREST.
  for (let i = 0; i < codigos.length; i += 200) {
    const { data } = await sb
      .from("pedidos")
      .select("codigo_externo")
      .in("codigo_externo", codigos.slice(i, i + 200));
    for (const p of data ?? []) existentes.add(p.codigo_externo as string);
  }

  base.atualizadas = r.vendas.filter((v) => existentes.has(v.codigoExterno)).length;
  base.novas = 0;
  const semPedido = r.vendas.filter((v) => !existentes.has(v.codigoExterno));
  base.orfaos = semPedido.length
    ? [
        {
          descricao: "Vendas sem pedido correspondente na base",
          exemplos: semPedido.slice(0, 5).map((v) => v.codigoExterno),
          total: semPedido.length,
        },
      ]
    : [];

  base.avisos.push(
    `Tarifa cobrada em ${r.comTarifa} das ${r.linhasLidas} vendas, ` +
      `desconto de campanha em ${r.comDesconto} e juros em ${r.comJuros}.`
  );
  if (semPedido.length) {
    base.avisos.push(
      `${semPedido.length} vendas não têm pedido correspondente e serão ` +
        "ignoradas. Importe a listagem de pedidos do período antes."
    );
  }
  if (r.conferem < r.linhasLidas) {
    base.avisos.push(
      `Em ${r.linhasLidas - r.conferem} vendas a soma das tarifas não fecha com o ` +
        "total a receber — são tarifas faturadas em outro mês. A comissão delas continua válida."
    );
  }
  if (r.colunasDescartadas) {
    base.avisos.push(
      `${r.colunasDescartadas} colunas do arquivo não foram lidas, incluindo nome, ` +
        "CPF e endereço do comprador."
    );
  }

  return base;
}

async function previaPedidos(
  buffer: Buffer,
  base: Previa,
  canais: LinhaCanal[],
  sb: Sb
): Promise<Previa> {
  const r = await lerPedidos(buffer);
  base.linhas = r.pedidos.length;
  base.periodo = { inicio: r.inicio, fim: r.fim };

  const ok = new Map<
    string,
    { canal: string; conta: string; linhas: number; mostrarConta: boolean }
  >();
  const falta = new Map<string, { marketplace: string; conta: string; linhas: number }>();
  const codigosPorCanal = new Map<string, string[]>();

  for (const p of r.pedidos) {
    const res = resolver(canais, p.marketplace, p.conta);
    if (!res) {
      const k = `${p.marketplace}|${p.conta}`;
      const at = falta.get(k) ?? { marketplace: p.marketplace, conta: p.conta, linhas: 0 };
      at.linhas += 1;
      falta.set(k, at);
      continue;
    }
    const k = res.contaCanalId;
    const contasDoCanal = canais.filter((c) => c.canal_id === res.canalId).length;
    const at =
      ok.get(k) ??
      {
        canal: res.canal,
        conta: res.conta,
        linhas: 0,
        mostrarConta: contasDoCanal > 1,
      };
    at.linhas += 1;
    ok.set(k, at);

    const lista = codigosPorCanal.get(res.canalId) ?? [];
    lista.push(p.codigoExterno);
    codigosPorCanal.set(res.canalId, lista);
  }

  base.reconhecidos = [...ok.values()];
  base.naoReconhecidos = [...falta.values()];

  // Quantos já existem? Diz se a importação cria ou atualiza — e é a
  // diferença entre "subi um dia novo" e "estou reprocessando".
  let existentes = 0;
  for (const [canalId, codigos] of codigosPorCanal) {
    for (let i = 0; i < codigos.length; i += 200) {
      const { count } = await sb
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("canal_id", canalId)
        .in("codigo_externo", codigos.slice(i, i + 200));
      existentes += count ?? 0;
    }
  }
  base.atualizadas = existentes;
  base.novas = base.linhas - base.naoReconhecidos.reduce((s, n) => s + n.linhas, 0) - existentes;

  if (falta.size) {
    base.avisos.push(
      "Há canais ou contas sem apelido cadastrado. A importação fica bloqueada até resolver — " +
        "gravar na conta errada não aparece no total e só se descobre muito depois."
    );
  }

  const semSku = r.pedidos.flatMap((p) => p.itens).filter((i) => !i.sku).length;
  if (semSku) base.avisos.push(`${semSku} itens sem SKU. Entram assim mesmo, mas não casam com produto.`);

  return base;
}

async function previaCatalogo(
  buffer: Buffer,
  base: Previa,
  canais: LinhaCanal[],
  sb: Sb
): Promise<Previa> {
  const r = await lerCatalogo(buffer);
  const itens = Array.isArray(r) ? r : (r as { itens?: unknown[] }).itens ?? [];
  base.linhas = itens.length;

  // O catálogo não diz de qual conta é — o arquivo não carrega essa
  // informação. Quem escolhe é a tela.
  base.avisos.push(
    "O catálogo não identifica a conta. Escolha a conta do Mercado Livre antes de importar."
  );

  const mlbs = (itens as { mlb: string }[]).map((i) => i.mlb);
  const doML = canais.filter((c) => c.canal_codigo === "mercado_livre");
  base.reconhecidos = doML.map((c) => ({
    canal: c.canal_nome,
    conta: c.conta_nome,
    linhas: 0,
    mostrarConta: doML.length > 1,
  }));
  base.contasDisponiveis = doML.map((c) => ({ id: c.conta_id, nome: c.conta_nome }));

  let existentes = 0;
  for (const c of doML.slice(0, 1)) {
    for (let i = 0; i < mlbs.length; i += 200) {
      const { count } = await sb
        .from("anuncios")
        .select("id", { count: "exact", head: true })
        .eq("canal_id", c.canal_id)
        .in("codigo_externo", mlbs.slice(i, i + 200));
      existentes += count ?? 0;
    }
  }
  base.atualizadas = existentes;
  base.novas = base.linhas - existentes;
  return base;
}

async function previaDesempenho(
  buffer: Buffer,
  nomeArquivo: string,
  base: Previa,
  sb: Sb
): Promise<Previa> {
  const r = await parsePerformanceReport(buffer, nomeArquivo);
  const linhas = (r as unknown as { data: { mlb: string }[] }).data ?? [];
  base.linhas = linhas.length;
  base.periodo = { inicio: r.inicio ?? null, fim: r.fim ?? null };

  if (!r.inicio) {
    base.avisos.push(
      "Não consegui ler a data do relatório. Sem data as linhas se empilham num dia só — importação bloqueada."
    );
    return base;
  }

  // O desempenho fala de anúncios que precisam existir. Os que não
  // existirem viram órfãos: suba o catálogo primeiro.
  const mlbs = linhas.map((l) => l.mlb);
  const achados = new Set<string>();
  for (let i = 0; i < mlbs.length; i += 200) {
    const { data } = await sb
      .from("anuncios")
      .select("codigo_externo")
      .in("codigo_externo", mlbs.slice(i, i + 200));
    for (const a of data ?? []) achados.add(a.codigo_externo as string);
  }

  const faltantes = mlbs.filter((m) => !achados.has(m));
  if (faltantes.length) {
    base.orfaos.push({
      descricao: "Anúncios que ainda não estão no cadastro",
      exemplos: faltantes.slice(0, 5),
      total: faltantes.length,
    });
    base.avisos.push(
      `${faltantes.length} anúncios do relatório não existem no cadastro. ` +
        "Suba o catálogo do Mercado Livre primeiro — sem o anúncio, a linha de desempenho não tem onde se prender."
    );
  }

  base.atualizadas = 0;
  base.novas = linhas.length - faltantes.length;
  return base;
}
