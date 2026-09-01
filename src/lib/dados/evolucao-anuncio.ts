import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar } from "./exclusoes";

/**
 * Evolução semanal por anúncio: quanto vendeu, a quanto, e quanto custou.
 *
 * ── Por que a chave é o MLB e não o SKU ──
 *
 * 138 dos 142 SKUs têm mais de um anúncio — clássico e premium, contas
 * diferentes. Juntar por SKU misturaria anúncios com tarifa e preço
 * distintos, e o resultado pareceria certo.
 *
 * O item de pedido guarda o MLB em `codigo_externo` (3.532 de 3.532 itens
 * do Mercado Livre), então a ligação é direta e sem ambiguidade.
 *
 * ── O que a segunda coluna é, e o que ela NÃO é ──
 *
 * "Tarifa de venda" é o que o canal cobra pelo anúncio. Onde o hub a
 * informa, é esse número — média de 7,4% nos pedidos do Mercado Livre.
 *
 * Onde ele não informa, o sistema reconstrói de
 * `total − a receber − frete − juros`. Isso é TUDO QUE O CANAL RETEVE
 * menos as parcelas que dá para identificar — pode conter retenções que
 * não são tarifa de venda. Por isso a coluna se chama "retido pelo
 * canal", não "tarifa cobrada": nomear o resíduo de tarifa seria afirmar
 * mais do que o dado sustenta.
 *
 * ── Por que a comissão vem em duas colunas ──
 *
 * Comparando a comissão cobrada com a alíquota do catálogo, elas
 * discordam:
 *
 *   PA33096   cobrado  6,50%   catálogo 11,50%
 *   PA35618   cobrado 10,50%   catálogo 11,50%
 *
 * A diferença é real, não erro: campanha com redução de tarifa cobra
 * menos. A alíquota do catálogo é a de TABELA; a cobrada é o que saiu do
 * bolso.
 *
 * Mostrar só uma esconderia a informação mais útil — exatamente onde a
 * redução de tarifa valeu a pena. As duas ficam lado a lado, e a
 * diferença entre elas é o que a campanha economizou.
 *
 * A cobrada só existe onde o canal informou: cerca de 31% dos pedidos do
 * Mercado Livre. Vazio significa não informado, nunca zero.
 */

export type SemanaAnuncio = {
  mlb: string;
  sku: string;
  titulo: string;
  tipo: string;
  conta: string;
  anoIso: number;
  semanaIso: number;
  inicio: string;
  fim: string;
  visitas: number;
  vendas: number;
  unidades: number;
  receita: number;
  conversao: number | null;
  /** Média ponderada pela quantidade do que o cliente pagou. */
  precoPraticado: number | null;
  /** Alíquota de tabela, do catálogo. */
  tarifaTabela: number | null;
  /** Alíquota efetivamente cobrada, quando o canal informou. */
  tarifaCobrada: number | null;
  comissaoReais: number | null;
};

export type DadosEvolucao = {
  linhas: SemanaAnuncio[];
  semanas: string[];
  vazio: boolean;
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const r2 = (v: number) => Number(v.toFixed(2));

/** Segunda-feira da semana ISO de uma data. */
function segundaDe(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export async function carregarEvolucao(
  filtro?: { mlb?: string; sku?: string; semanas?: number }
): Promise<DadosEvolucao> {
  const sb = await clienteServidor();

  const [desempenho, anunciosRaw, pedidosRaw, exclusoes, { data: contasRaw }] =
    await Promise.all([
      paginar(() =>
        sb
          .from("anuncio_desempenho_semanal")
          .select("anuncio_id,ano_iso,semana_iso,inicio,fim,visitas,vendas,receita")
          .order("inicio", { ascending: true })
      ),
      paginar(() =>
        sb
          .from("anuncios")
          .select("id,codigo_externo,titulo,sku_canal,tipo,comissao_atual,conta_canal_id")
          .order("codigo_externo")
      ),
      paginar(() =>
        sb
          .from("pedidos")
          .select("id,data,cancelado,total,comissao,comissao_derivada,conta_canal_id")
          .order("data", { ascending: true })
      ),
      carregarExclusoes(),
      sb.from("contas_canal").select("id,nome,canal_id,canais(codigo)").limit(200),
    ]);

  type Anuncio = {
    id: string;
    codigo_externo: string;
    titulo: string;
    sku_canal: string | null;
    tipo: string;
    comissao_atual: string | number | null;
    conta_canal_id: string;
  };
  type Conta = { id: string; nome: string; canal_id: string; canais: { codigo: string } | null };
  type Ped = {
    id: string;
    data: string;
    cancelado: boolean;
    total: string | number;
    comissao: string | number | null;
    comissao_derivada: boolean;
    conta_canal_id: string;
  };

  const anuncios = anunciosRaw as unknown as Anuncio[];
  const contas = (contasRaw ?? []) as unknown as Conta[];
  const porConta = new Map(contas.map((c) => [c.id, c]));
  const porAnuncioId = new Map(anuncios.map((a) => [a.id, a]));

  const anotados = (pedidosRaw as unknown as Ped[]).map((p) => ({
    ...p,
    canalId: porConta.get(p.conta_canal_id)?.canal_id ?? null,
    contaCanalId: p.conta_canal_id,
  }));
  const { mantidas: pedidos } = aplicar(anotados, exclusoes);
  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]));

  /* ── Preço e comissão por MLB e semana, vindos dos itens ── */

  const itens = await paginar(() =>
    sb
      .from("pedido_itens")
      .select("pedido_id,codigo_externo,quantidade,preco_unitario,total")
      .order("pedido_id")
  );

  type Item = {
    pedido_id: string;
    codigo_externo: string;
    quantidade: number;
    preco_unitario: string | number;
    total: string | number;
  };

  type Agregado = {
    unidades: number;
    somaPreco: number;
    valor: number;
    comissao: number;
    /** Valor dos pedidos em que a comissão veio informada. */
    valorComComissao: number;
  };
  const vendasPorChave = new Map<string, Agregado>();

  // O total do pedido é o denominador do rateio; sem ele a comissão de um
  // pedido com vários itens iria inteira para o primeiro.
  const totalDoPedido = new Map<string, number>();
  for (const it of itens as unknown as Item[]) {
    totalDoPedido.set(
      it.pedido_id,
      (totalDoPedido.get(it.pedido_id) ?? 0) + n(it.total)
    );
  }

  for (const it of itens as unknown as Item[]) {
    const p = pedidoPorId.get(it.pedido_id);
    if (!p || p.cancelado) continue;

    const mlb = String(it.codigo_externo ?? "");
    if (!/^MLB/i.test(mlb)) continue;

    const chave = `${mlb}|${segundaDe(String(p.data))}`;
    const at =
      vendasPorChave.get(chave) ??
      { unidades: 0, somaPreco: 0, valor: 0, comissao: 0, valorComComissao: 0 };

    const qtd = it.quantidade ?? 0;
    at.unidades += qtd;
    // Ponderada pela quantidade: a média simples deixaria uma venda
    // isolada de liquidação puxar a semana inteira.
    at.somaPreco += n(it.preco_unitario) * qtd;
    at.valor += n(it.total);

    // Zero não é tarifa: é ausência gravada como número por uma
    // importação antiga. Entrar na conta puxaria a média para baixo.
    // Derivada fica de fora: ver a nota no topo do arquivo.
    // A faixa vale também na leitura: linhas gravadas antes da guarda
    // continuam no banco e não podem envenenar a tarifa da semana.
    const pctCom = n(p.total) > 0 ? (n(p.comissao) * 100) / n(p.total) : 0;
    if (p.comissao != null && pctCom >= 1 && pctCom <= 15) {
      const totalPed = totalDoPedido.get(it.pedido_id) ?? 0;
      // Rateio pelo valor do item. Em pedido de um item só — a maioria —
      // não há rateio nenhum, é o número exato.
      const fatia = totalPed > 0 ? n(it.total) / totalPed : 1;
      at.comissao += n(p.comissao) * fatia;
      at.valorComComissao += n(it.total);
    }

    vendasPorChave.set(chave, at);
  }

  /* ── Junta com o desempenho ── */

  type Des = {
    anuncio_id: string;
    ano_iso: number;
    semana_iso: number;
    inicio: string;
    fim: string;
    visitas: number;
    vendas: number;
    receita: string | number;
  };

  const linhas: SemanaAnuncio[] = [];

  for (const d of desempenho as unknown as Des[]) {
    const a = porAnuncioId.get(d.anuncio_id);
    if (!a) continue;
    if (filtro?.mlb && a.codigo_externo !== filtro.mlb) continue;
    if (filtro?.sku && a.sku_canal !== filtro.sku) continue;

    const chave = `${a.codigo_externo}|${segundaDe(String(d.inicio))}`;
    const v = vendasPorChave.get(chave);

    const tarifaTabela = a.comissao_atual == null ? null : n(a.comissao_atual);
    const tarifaCobrada =
      v && v.valorComComissao > 0
        ? r2((v.comissao * 100) / v.valorComComissao)
        : null;

    linhas.push({
      mlb: a.codigo_externo,
      sku: a.sku_canal ?? "",
      titulo: a.titulo,
      tipo: a.tipo,
      conta: porConta.get(a.conta_canal_id)?.nome ?? "",
      anoIso: d.ano_iso,
      semanaIso: d.semana_iso,
      inicio: String(d.inicio).slice(0, 10),
      fim: String(d.fim).slice(0, 10),
      visitas: d.visitas ?? 0,
      vendas: d.vendas ?? 0,
      unidades: v?.unidades ?? 0,
      receita: r2(n(d.receita)),
      conversao: d.visitas ? r2((d.vendas * 100) / d.visitas) : null,
      precoPraticado: v && v.unidades ? r2(v.somaPreco / v.unidades) : null,
      tarifaTabela,
      tarifaCobrada,
      comissaoReais: v && v.comissao > 0 ? r2(v.comissao) : null,
    });
  }

  linhas.sort(
    (a, b) =>
      a.mlb.localeCompare(b.mlb) || a.inicio.localeCompare(b.inicio)
  );

  const semanas = [...new Set(linhas.map((l) => l.inicio))].sort();
  const recorte = filtro?.semanas ? semanas.slice(-filtro.semanas) : semanas;
  const dentro = new Set(recorte);

  return {
    linhas: filtro?.semanas ? linhas.filter((l) => dentro.has(l.inicio)) : linhas,
    semanas: recorte,
    vazio: !linhas.length,
  };
}
