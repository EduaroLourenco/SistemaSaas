import "server-only";
import { clientePrivilegiado } from "@/lib/supabase/privilegiado";
import { paginar } from "@/lib/dados/paginar";
import { emLotes, r2, type ContextoCanal } from "./diarias";

/**
 * Consolida `anuncio_desempenho_semanal` a partir do que a API já gravou.
 *
 * ── Por que existe ──
 *
 * Nove telas leem a semanal — análise de anúncios, alertas, painel,
 * recomendações, clássico vs premium, evolução, exportações e as
 * ferramentas da IA. E o único lugar que escrevia nela era o importador de
 * planilha: a tabela parou em 07/09, a data da última vez que alguém subiu
 * o arquivo. Não era falha de sincronização; essa tabela nunca teve uma.
 *
 * A diária, essa sim, a API enche todo dia. Somar os dias em semanas tira
 * a dependência de alguém lembrar de subir planilha toda segunda.
 *
 * ── De onde vem cada coluna, e por quê ──
 *
 *     visitas                      da diária, que é o que a API enche
 *     vendas, receita, preço       dos PEDIDOS
 *
 * A separação não é escolha de estilo. A API do canal devolve visita por
 * anúncio e por dia, e não devolve venda: das 11.276 linhas diárias que ela
 * gravou, ZERO têm venda ou receita. Somar a diária para a semana daria
 * visitas certas e vendas zeradas — pior que o dado velho, porque pareceria
 * número real. Venda por anúncio só existe em `pedido_itens`.
 *
 * ── O que se perde ──
 *
 * Nada que existisse. A semanal tem quatro colunas além dessas, e o
 * importador de planilha nunca escreveu nenhuma:
 *
 *     preco_anunciado      0% preenchida
 *     preco_ideal          0% preenchida
 *     preco_praticado     12% — e aqui sai MELHOR, calculado dos pedidos
 *     comissao_negociada  11% — fica como está, não é mexida
 *
 * ── Semana ISO ──
 *
 * Segunda a domingo, o mesmo corte que o importador usava, para a série
 * não dar um salto na semana da virada.
 */

/** Segunda-feira da semana ISO de uma data, em AAAA-MM-DD. */
function segundaDa(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  /* getUTCDay: 0 é domingo. Na ISO a semana começa na segunda. */
  const desloca = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - desloca);
  return d.toISOString().slice(0, 10);
}

/** Ano e número da semana ISO. */
function semanaIso(iso: string): { ano: number; semana: number } {
  const d = new Date(iso + "T12:00:00Z");
  const dia = (d.getUTCDay() + 6) % 7;
  /* A quinta-feira da semana decide a que ano ela pertence. */
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const ano = d.getUTCFullYear();
  const primeira = new Date(Date.UTC(ano, 0, 4));
  const diaPrimeira = (primeira.getUTCDay() + 6) % 7;
  primeira.setUTCDate(primeira.getUTCDate() - diaPrimeira + 3);
  const semana = 1 + Math.round((d.getTime() - primeira.getTime()) / (7 * 86400000));
  return { ano, semana };
}

const maisDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function consolidarSemanais(
  ctx: ContextoCanal,
  de: string,
  ate: string
): Promise<number> {
  const sb = clientePrivilegiado();

  /*
   * A janela é esticada para trás até a segunda-feira da primeira semana.
   * Sem isso, uma sincronização que começa numa quarta gravaria a semana
   * inteira com os dias de quarta a domingo e a série mostraria uma queda
   * que não existiu.
   */
  const deAjustado = segundaDa(de);

  const diarias = await paginar(() =>
    sb
      .from("anuncio_desempenho_diario")
      .select("anuncio_id,data,visitas,vendas,receita,anuncios!inner(conta_canal_id,codigo_externo)")
      .eq("anuncios.conta_canal_id", ctx.contaCanalId)
      .gte("data", deAjustado)
      .lte("data", ate)
      .order("data")
  ).catch((e: Error) => {
    throw new Error(`Falha ao ler o desempenho diário: ${e.message}`);
  });

  type Linha = {
    anuncio_id: string;
    data: string;
    visitas: number | null;
    anuncios: { conta_canal_id: string; codigo_externo: string } | null;
  };

  type Acum = {
    anuncioId: string;
    mlb: string;
    inicio: string;
    visitas: number;
    unidades: number;
    receita: number;
  };
  const porChave = new Map<string, Acum>();

  /* O catálogo da conta, para o pedido achar o anúncio mesmo sem visita. */
  const anuncios = await paginar(() =>
    sb.from("anuncios").select("id,codigo_externo").eq("conta_canal_id", ctx.contaCanalId)
  ).catch(() => [] as unknown[]);
  const idPorMlb = new Map<string, string>(
    (anuncios as unknown as { id: string; codigo_externo: string }[]).map((a) => [
      String(a.codigo_externo).toUpperCase(),
      a.id,
    ])
  );

  const novo = (anuncioId: string, mlb: string, inicio: string): Acum => ({
    anuncioId, mlb, inicio, visitas: 0, unidades: 0, receita: 0,
  });

  for (const l of diarias as unknown as Linha[]) {
    const inicio = segundaDa(String(l.data).slice(0, 10));
    const mlb = String(l.anuncios?.codigo_externo ?? "").toUpperCase();
    const k = `${l.anuncio_id}|${inicio}`;
    const a = porChave.get(k) ?? novo(l.anuncio_id, mlb, inicio);
    a.visitas += Number(l.visitas) || 0;
    porChave.set(k, a);
  }

  /*
   * O item do pedido vem por JUNÇÃO, não por `in(pedido_id)`.
   *
   * A primeira versão lia os pedidos, juntava os ids e pedia os itens com
   * `.in(...)`. Dois meses de venda passam de quinhentos pedidos, a URL
   * estoura o limite do servidor, e o `catch` devolvia lista vazia — a
   * semana saía com visitas certas e uma venda onde havia dezenas. Erro
   * nenhum na tela, só número pequeno.
   *
   * A junção filtra do lado do banco e pagina normalmente. E o erro agora
   * sobe: semana sem venda é um fato, mas semana sem venda POR FALHA DE
   * LEITURA não pode passar por fato.
   */
  const itens = await paginar(() =>
    sb
      .from("pedido_itens")
      .select(
        "codigo_externo,quantidade,preco_unitario,pedidos!inner(data,conta_canal_id,cancelado)"
      )
      .eq("pedidos.conta_canal_id", ctx.contaCanalId)
      .eq("pedidos.cancelado", false)
      .gte("pedidos.data", deAjustado)
      .lte("pedidos.data", ate)
  ).catch((e: Error) => {
    throw new Error(`Falha ao ler os itens de pedido: ${e.message}`);
  });

  /*
   * A venda entra pelo MLB, não pelo `anuncio_id`: o item do pedido guarda
   * o código do anúncio, e é por ele que se chega à linha certa. Anúncio
   * que vendeu numa semana sem visita registrada ganha linha aqui — sem
   * isso a venda sumiria da série.
   */
  for (const it of itens as unknown as {
    codigo_externo: string;
    quantidade: number;
    preco_unitario: number;
    pedidos: { data: string } | null;
  }[]) {
    const dia = it.pedidos?.data ? String(it.pedidos.data).slice(0, 10) : null;
    if (!dia) continue;
    const mlb = String(it.codigo_externo).toUpperCase();
    const anuncioId = idPorMlb.get(mlb);
    if (!anuncioId) continue;
    const inicio = segundaDa(dia);
    const k = `${anuncioId}|${inicio}`;
    const a = porChave.get(k) ?? novo(anuncioId, mlb, inicio);
    const q = Number(it.quantidade) || 0;
    a.unidades += q;
    a.receita += q * (Number(it.preco_unitario) || 0);
    porChave.set(k, a);
  }

  if (!porChave.size) return 0;

  const registros = [...porChave.values()].map((a) => {
    const { ano, semana } = semanaIso(a.inicio);
    return {
      operacao_id: ctx.operacaoId,
      anuncio_id: a.anuncioId,
      ano_iso: ano,
      semana_iso: semana,
      inicio: a.inicio,
      fim: maisDias(a.inicio, 6),
      visitas: Math.max(0, Math.round(a.visitas)),
      /*
       * `vendas` recebe UNIDADES, que é o que a coluna sempre guardou: o
       * importador gravava a venda do relatório do canal, e a diária
       * repetia o mesmo número em `unidades`. A conversão da tela divide
       * isto por visitas.
       */
      vendas: Math.max(0, Math.round(a.unidades)),
      receita: r2(Math.max(0, a.receita)),
      preco_praticado: a.unidades > 0 ? r2(a.receita / a.unidades) : null,
    };
  });

  /*
   * `importacao_id` fica nulo de propósito: esta linha não veio de arquivo
   * nenhum, e apontar para uma importação antiga faria a tela de origem
   * dos dados mentir sobre de onde o número veio.
   */
  await emLotes(registros, 500, async (lote) => {
    const { error } = await sb
      .from("anuncio_desempenho_semanal")
      .upsert(lote, { onConflict: "anuncio_id,ano_iso,semana_iso" });
    if (error) throw new Error(`Falha ao gravar o desempenho semanal: ${error.message}`);
  });

  return registros.length;
}
