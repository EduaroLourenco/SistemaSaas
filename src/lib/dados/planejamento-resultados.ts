import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { carregarVendasPlanejamento } from "./planejamento-vendas";
import { detalhesVazios, type Item } from "@/lib/planejamento/modelo";
import { estrategiaDe } from "@/lib/planejamento/estrategia";
import { periodosDoResultado, resumirVendas, temRecorte, type ResumoVendas } from "@/lib/planejamento/resultados";

/**
 * Deu certo? Todas as ações do planejamento, de uma vez.
 *
 * ── A comparação que decide ──
 *
 * "Os SKUs da campanha venderam 20% a mais que no período anterior" não
 * diz se a campanha funcionou: se o canal inteiro cresceu 20% no mesmo
 * período (Dia das Crianças, frete grátis do canal, concorrente fora do
 * ar), a campanha não fez nada. Então cada ação é medida contra o RESTO
 * do mesmo canal nas mesmas datas — o que não estava na campanha. A
 * diferença entre os dois crescimentos é o efeito que dá para atribuir a
 * ela.
 *
 * Ação sem canal compara com o resto da operação inteira.
 */

export type Veredito = "deu certo" | "neutra" | "não deu certo" | "sem base" | "futura" | "sem recorte";

export type LinhaResultado = {
  id: string;
  titulo: string;
  natureza: "campanha" | "acao";
  tipo: string;
  status: string;
  inicio: string;
  fim: string;
  skus: number;
  parcial: boolean;
  atual: ResumoVendas | null;
  anterior: ResumoVendas | null;
  /** Crescimento da ação e do resto do canal, em %. */
  crescimento: number | null;
  crescimentoResto: number | null;
  /** Diferença entre os dois, em pontos percentuais. */
  efeito: number | null;
  veredito: Veredito;
  leitura: string;
};

export type DadosResultados = {
  linhas: LinhaResultado[];
  aviso: string | null;
};

const pct = (agora: number, antes: number) => (antes > 0 ? ((agora - antes) / antes) * 100 : null);
/** Diferença entre dois crescimentos: pontos percentuais, sem sinal (o verbo diz a direção). */
const pp = (v: number) => `${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} p.p.`;
const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

/** O limiar de efeito: abaixo disto a diferença cabe no ruído de semana a semana. */
const LIMIAR_PP = 10;

export async function carregarResultadosPlanejamento(): Promise<DadosResultados> {
  const op = await operacaoPadrao();
  if (!op) return { linhas: [], aviso: "Escolha uma operação." };
  const sb = await clienteServidor();
  const { data, error } = await sb
    .from("planejamento_itens")
    .select("*")
    .eq("operacao_id", op.id)
    .neq("status", "Cancelada")
    .order("inicio", { ascending: false })
    .limit(300);
  if (error) return { linhas: [], aviso: "O planejamento não está disponível." };

  const itens = ((data ?? []) as Item[]).map((i) => ({ ...i, detalhes: { ...detalhesVazios(), ...i.detalhes } }));
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  // Só o último ano: além disso o período anterior cairia fora do histórico útil.
  const umAno = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const mediveis = itens
    .map((i) => ({ i, p: periodosDoResultado(i, hoje) }))
    .filter((x) => x.p && temRecorte(x.i) && x.i.inicio >= umAno);

  let vendas: Awaited<ReturnType<typeof carregarVendasPlanejamento>> | null = null;
  let aviso: string | null = null;
  if (mediveis.length) {
    const de = mediveis.map((x) => x.p!.anteriorInicio).sort()[0];
    const ate = mediveis.map((x) => x.p!.fim).sort().at(-1)!;
    try {
      vendas = await carregarVendasPlanejamento(op.id, de, ate);
    } catch (e) {
      aviso = (e as Error).message;
    }
  }

  const linhas: LinhaResultado[] = itens.map((item) => {
    const base = {
      id: item.id,
      titulo: item.titulo,
      natureza: item.natureza,
      tipo: item.tipo,
      status: item.status,
      inicio: item.inicio,
      fim: item.fim,
      skus: item.skus.length,
      parcial: item.fim >= hoje,
      atual: null,
      anterior: null,
      crescimento: null,
      crescimentoResto: null,
      efeito: null,
    };
    const p = periodosDoResultado(item, hoje);
    if (!p) return { ...base, veredito: "futura" as const, leitura: `Começa em ${item.inicio.split("-").reverse().join("/")}.` };
    if (!temRecorte(item))
      return { ...base, veredito: "sem recorte" as const, leitura: "Sem produto, canal ou anúncio escolhido: não há o que medir." };
    if (!vendas) return { ...base, veredito: "sem base" as const, leitura: aviso ?? "Fora do último ano." };

    const atual = resumirVendas(vendas.vendas, item, p.inicio, p.fim, vendas.exclusoes);
    const anterior = resumirVendas(vendas.vendas, item, p.anteriorInicio, p.anteriorFim, vendas.exclusoes);
    /*
     * Contra o quê. Ação que escolhe produto ou anúncio se mede contra o
     * resto do MESMO canal (o canal sem os produtos dela). Ação de canal
     * inteiro se mede contra o resto da operação (os outros canais).
     */
    const delimitaProduto = item.skus.length > 0 || estrategiaDe(item).anuncios.length > 0;
    const referencia: Item = delimitaProduto
      ? { ...item, skus: [], detalhes: { ...item.detalhes, estrategia: undefined } }
      : { ...item, canais: [], contas: [], skus: [], detalhes: { ...item.detalhes, estrategia: undefined } };
    const refAtual = resumirVendas(vendas.vendas, referencia, p.inicio, p.fim, vendas.exclusoes);
    const refAnterior = resumirVendas(vendas.vendas, referencia, p.anteriorInicio, p.anteriorFim, vendas.exclusoes);
    const crescimento = pct(atual.receita, anterior.receita);
    const crescimentoResto = pct(refAtual.receita - atual.receita, refAnterior.receita - anterior.receita);
    const nomeResto = delimitaProduto ? "o resto do canal" : "os outros canais";
    const efeito = crescimento != null && crescimentoResto != null ? crescimento - crescimentoResto : null;

    let veredito: Veredito;
    let leitura: string;
    if (crescimento == null) {
      veredito = "sem base";
      leitura = atual.receita > 0 ? "Não vendia no período anterior: não há base de comparação." : "Sem venda nos dois períodos.";
    } else if (efeito == null) {
      veredito = crescimento >= LIMIAR_PP ? "deu certo" : crescimento <= -LIMIAR_PP ? "não deu certo" : "neutra";
      leitura = `Vendeu ${fmt(crescimento)} contra o período anterior; ${nomeResto} não teve venda para comparar.`;
    } else {
      veredito = efeito >= LIMIAR_PP ? "deu certo" : efeito <= -LIMIAR_PP ? "não deu certo" : "neutra";
      leitura =
        `${delimitaProduto ? "Os produtos da ação" : "O canal da ação"} foram ${fmt(crescimento)}; ${nomeResto}, ${fmt(crescimentoResto!)}. ` +
        (veredito === "deu certo"
          ? `Ficou ${pp(efeito)} acima do movimento geral.`
          : veredito === "não deu certo"
            ? `Ficou ${pp(efeito)} abaixo ${delimitaProduto ? "do resto do canal" : "dos outros canais"}.`
            : `Andou junto com ${nomeResto}: o efeito da ação não se distingue do movimento geral.`);
    }
    if (base.parcial) leitura += " Ação em andamento: o número ainda muda.";
    return { ...base, atual, anterior, crescimento, crescimentoResto, efeito, veredito, leitura };
  });

  return { linhas, aviso };
}
