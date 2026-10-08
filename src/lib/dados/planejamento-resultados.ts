import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { paginar } from "./paginar";
import { carregarVendasPlanejamento } from "./planejamento-vendas";
import { detalhesVazios, somarDias, diasEntre, type Item } from "@/lib/planejamento/modelo";
import { estrategiaDe } from "@/lib/planejamento/estrategia";
import {
  filtroDaAcao,
  periodosDoResultado,
  resumirVendas,
  temRecorte,
  type LinhaVenda,
  type ResumoVendas,
} from "@/lib/planejamento/resultados";

/**
 * Deu certo? As ações do planejamento e as promoções do Mercado Livre.
 *
 * ── A comparação que decide ──
 *
 * "Vendeu 20% a mais que no período anterior" não diz se a campanha
 * funcionou: se o canal inteiro cresceu 20% (data comemorativa, frete grátis
 * do canal), ela não fez nada. Então cada ação é medida contra o RESTO do
 * mesmo canal nas mesmas datas, e cada promoção do Meli contra os anúncios
 * que ficaram FORA dela — a mesma campanha, os mesmos dias, só a decisão de
 * participar mudando. A diferença entre os dois crescimentos é o efeito.
 */

export type Veredito = "deu certo" | "neutra" | "não deu certo" | "sem base" | "futura" | "sem recorte" | "cedo demais";

/** O que foi planejado e registrado: o "o que foi feito" da ação. */
export type Feito = {
  tipo: string;
  status: string;
  etapa: string;
  ideia: string;
  foco: string;
  hipotese: string;
  canais: string[];
  responsavel: string;
  orcamento: number | null;
  meta: string;
  checklist: { texto: string; feito: boolean }[];
  fechamento: { funcionou: string; problemas: string; proximoPasso: string };
};

export type ProdutoResultado = {
  chave: string;
  titulo: string;
  antes: { receita: number; unidades: number; preco: number | null };
  agora: { receita: number; unidades: number; preco: number | null };
};

export type LinhaResultado = {
  id: string;
  titulo: string;
  natureza: "campanha" | "acao";
  inicio: string;
  fim: string;
  anteriorInicio: string | null;
  anteriorFim: string | null;
  skus: number;
  parcial: boolean;
  feito: Feito;
  atual: ResumoVendas | null;
  anterior: ResumoVendas | null;
  restoAtual: number | null;
  restoAnterior: number | null;
  crescimento: number | null;
  crescimentoResto: number | null;
  efeito: number | null;
  veredito: Veredito;
  leitura: string;
  /** Produtos da ação; sem produto escolhido, os que mais venderam no recorte. */
  produtos: ProdutoResultado[];
  produtosSaoDoCanal: boolean;
  serie: { data: string; acao: number; resto: number }[];
};

export type AnuncioPromo = {
  codigo: string;
  titulo: string;
  precoOferta: number | null;
  precoTabela: number | null;
  antes: number;
  agora: number;
  unidadesAgora: number;
};

export type LinhaPromocao = {
  id: string;
  nome: string;
  processadaEm: string;
  comReducao: boolean;
  dias: number;
  participam: number;
  fora: number;
  /** Contra quem se compara: os de fora da mesma campanha, ou o resto do Meli. */
  controle: "fora da campanha" | "resto do Mercado Livre";
  receitaParticipantes: { antes: number; agora: number };
  receitaFora: { antes: number; agora: number };
  crescimento: number | null;
  crescimentoFora: number | null;
  efeito: number | null;
  veredito: Veredito;
  leitura: string;
  anuncios: AnuncioPromo[];
};

export type DadosResultados = {
  linhas: LinhaResultado[];
  promocoes: LinhaPromocao[];
  aviso: string | null;
};

const pct = (agora: number, antes: number) => (antes > 0 ? ((agora - antes) / antes) * 100 : null);
const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const pp = (v: number) => `${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} p.p.`;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** O limiar de efeito: abaixo disto a diferença cabe no ruído de semana a semana. */
const LIMIAR_PP = 10;
/** Janela de medição das promoções do Meli, em dias depois do processamento. */
const JANELA_PROMO = 14;

function veredito(efeito: number | null, crescimento: number | null): Veredito {
  const v = efeito ?? crescimento;
  if (v == null) return "sem base";
  return v >= LIMIAR_PP ? "deu certo" : v <= -LIMIAR_PP ? "não deu certo" : "neutra";
}

export async function carregarResultadosPlanejamento(): Promise<DadosResultados> {
  const op = await operacaoPadrao();
  if (!op) return { linhas: [], promocoes: [], aviso: "Escolha uma operação." };
  const sb = await clienteServidor();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const [itensR, campanhas, campItens, anuncios, produtos, contas] = await Promise.all([
    sb.from("planejamento_itens").select("*").eq("operacao_id", op.id).neq("status", "Cancelada").order("inicio", { ascending: false }).limit(300),
    paginar(() => sb.from("campanhas").select("id,nome,tem_reducao_tarifa").eq("operacao_id", op.id).order("id")).catch(() => []),
    paginar(() =>
      sb
        .from("campanha_itens")
        .select("campanha_id,anuncio_id,decisao,preco_oferta,preco_tabela,decidido_em")
        .eq("operacao_id", op.id)
        .order("id")
    ).catch(() => []),
    paginar(() => sb.from("anuncios").select("id,codigo_externo,titulo,sku_canal").eq("operacao_id", op.id).order("id")),
    paginar(() => sb.from("produtos").select("sku,titulo").eq("operacao_id", op.id).order("id")),
    paginar(() => sb.from("contas_canal").select("id,nome,canal_id,canais(nome)").eq("operacao_id", op.id).order("id")),
  ]);
  if (itensR.error) return { linhas: [], promocoes: [], aviso: "O planejamento não está disponível." };

  type An = { id: string; codigo_externo: string; titulo: string; sku_canal: string | null };
  type Ct = { id: string; nome: string; canal_id: string; canais: { nome: string } | null };
  type Ci = { campanha_id: string; anuncio_id: string; decisao: string; preco_oferta: number | null; preco_tabela: number | null; decidido_em: string | null };
  const anuncioPorId = new Map((anuncios as An[]).map((a) => [a.id, a]));
  const tituloSku = new Map((produtos as { sku: string; titulo: string }[]).map((p) => [p.sku.toUpperCase(), p.titulo]));
  for (const a of anuncios as An[]) {
    const k = (a.sku_canal ?? "").toUpperCase();
    if (k && !tituloSku.has(k)) tituloSku.set(k, a.titulo);
  }
  const nomeConta = new Map<string, string>();
  const nomeCanal = new Map<string, string>();
  for (const c of contas as unknown as Ct[]) {
    const canal = c.canais?.nome ?? "Canal";
    nomeCanal.set(c.canal_id, canal);
    nomeConta.set(c.id, c.nome && c.nome !== "Conta principal" ? `${canal} · ${c.nome}` : canal);
  }

  const itens = ((itensR.data ?? []) as Item[]).map((i) => ({ ...i, detalhes: { ...detalhesVazios(), ...i.detalhes } }));
  const umAno = somarDias(hoje, -365);

  // Promoções: a data é a do processamento (a planilha não traz a da campanha).
  const porCampanha = new Map<string, Ci[]>();
  for (const ci of campItens as Ci[]) {
    if (!ci.anuncio_id) continue;
    const l = porCampanha.get(ci.campanha_id) ?? [];
    l.push(ci);
    porCampanha.set(ci.campanha_id, l);
  }
  const promos = (campanhas as { id: string; nome: string; tem_reducao_tarifa: boolean | null }[])
    .map((c) => {
      const lista = porCampanha.get(c.id) ?? [];
      const datas = lista.map((x) => (x.decidido_em ?? "").slice(0, 10)).filter(Boolean).sort();
      return { c, lista, inicio: datas[0] ?? null };
    })
    .filter((p) => p.lista.length && p.inicio && p.inicio >= umAno);

  // Uma leitura de vendas para tudo: do começo mais antigo até hoje.
  const inicios = [
    ...itens.map((i) => periodosDoResultado(i, hoje)?.anteriorInicio).filter((x): x is string => !!x && x >= umAno),
    ...promos.map((p) => somarDias(p.inicio!, -JANELA_PROMO)),
  ].sort();
  let vendas: LinhaVenda[] = [];
  let exclusoes: Awaited<ReturnType<typeof carregarVendasPlanejamento>>["exclusoes"] = [];
  let aviso: string | null = null;
  if (inicios.length) {
    try {
      const v = await carregarVendasPlanejamento(op.id, inicios[0], hoje);
      vendas = v.vendas;
      exclusoes = v.exclusoes;
    } catch (e) {
      aviso = (e as Error).message;
    }
  }
  const validas = vendas.filter((l) => !l.cancelado);

  /* ── Ações do planejamento ── */
  const linhas: LinhaResultado[] = itens.map((item) => {
    const est = estrategiaDe(item);
    const d = item.detalhes;
    const feito: Feito = {
      tipo: item.natureza === "campanha" ? "Campanha" : item.tipo || "Ação",
      status: item.status,
      etapa: item.etapa,
      ideia: d.briefing || d.objetivo || "",
      foco: est.foco ?? "",
      hipotese: est.hipotese ?? "",
      canais: [
        ...item.canais.map((c) => nomeCanal.get(c) ?? "Canal"),
        ...item.contas.map((c) => nomeConta.get(c) ?? "Conta"),
      ],
      responsavel: d.responsavel,
      orcamento: d.orcamento,
      meta: d.meta,
      checklist: d.checklist ?? [],
      fechamento: {
        funcionou: est.fechamento?.funcionou ?? "",
        problemas: est.fechamento?.problemas ?? "",
        proximoPasso: est.fechamento?.proximoPasso ?? "",
      },
    };
    const base = {
      id: item.id,
      titulo: item.titulo,
      natureza: item.natureza,
      inicio: item.inicio,
      fim: item.fim,
      anteriorInicio: null,
      anteriorFim: null,
      skus: item.skus.length,
      parcial: item.fim >= hoje,
      feito,
      atual: null,
      anterior: null,
      restoAtual: null,
      restoAnterior: null,
      crescimento: null,
      crescimentoResto: null,
      efeito: null,
      produtos: [],
      produtosSaoDoCanal: false,
      serie: [],
    };
    const p0 = periodosDoResultado(item, hoje);
    /*
     * Ação curta (menos de uma semana) se compara com os MESMOS dias da
     * semana anterior, não com os dias logo antes: uma quarta contra uma
     * terça mede o dia da semana, não a ação.
     */
    const curta = p0 ? diasEntre(p0.inicio, p0.fim) + 1 < 7 : false;
    const p = p0 && curta ? { ...p0, anteriorInicio: somarDias(p0.inicio, -7), anteriorFim: somarDias(p0.fim, -7) } : p0;
    if (!p) return { ...base, veredito: "futura" as const, leitura: `Começa em ${item.inicio.split("-").reverse().join("/")}. O resultado aparece quando o período começar.` };

    /*
     * Sem produto nem canal escolhido, a ação não delimita venda nenhuma —
     * mas o período existe. Mede-se a operação inteira, como referência, e
     * a tela diz que é referência: "o que aconteceu na loja enquanto a ação
     * estava no ar", não "o resultado da ação".
     */
    const recorte = temRecorte(item);
    const delimitaProduto = item.skus.length > 0 || est.anuncios.length > 0;
    const daAcao = filtroDaAcao(item);
    const referencia: Item = delimitaProduto
      ? { ...item, skus: [], detalhes: { ...item.detalhes, estrategia: undefined } }
      : { ...item, canais: [], contas: [], skus: [], detalhes: { ...item.detalhes, estrategia: undefined } };
    const daReferencia = filtroDaAcao(referencia);

    const atual = resumirVendas(vendas, item, p.inicio, p.fim, exclusoes);
    const anterior = resumirVendas(vendas, item, p.anteriorInicio, p.anteriorFim, exclusoes);
    const refAtual = resumirVendas(vendas, referencia, p.inicio, p.fim, exclusoes);
    const refAnterior = resumirVendas(vendas, referencia, p.anteriorInicio, p.anteriorFim, exclusoes);
    const restoAtual = recorte ? r2(refAtual.receita - atual.receita) : null;
    const restoAnterior = recorte ? r2(refAnterior.receita - anterior.receita) : null;
    const crescimento = pct(atual.receita, anterior.receita);
    const crescimentoResto = restoAtual != null && restoAnterior != null ? pct(restoAtual, restoAnterior) : null;
    const efeito = recorte && crescimento != null && crescimentoResto != null ? crescimento - crescimentoResto : null;

    // Produto a produto: os da ação, ou os que mais venderam no recorte.
    const chaveDe = (l: LinhaVenda) => (est.anuncios.length ? l.anuncio : l.sku.toUpperCase());
    const porProduto = new Map<string, ProdutoResultado>();
    for (const l of validas) {
      if (l.data < p.anteriorInicio || l.data > p.fim || !daAcao(l)) continue;
      const k = chaveDe(l) || "sem código";
      const pr =
        porProduto.get(k) ??
        {
          chave: est.anuncios.length ? anuncioPorId.get(k)?.codigo_externo ?? k : k,
          titulo: est.anuncios.length ? anuncioPorId.get(k)?.titulo ?? "" : tituloSku.get(k) ?? "",
          antes: { receita: 0, unidades: 0, preco: null },
          agora: { receita: 0, unidades: 0, preco: null },
        };
      const lado = l.data >= p.inicio ? pr.agora : pr.antes;
      lado.receita += l.receita;
      lado.unidades += l.quantidade;
      porProduto.set(k, pr);
    }
    const listaProdutos = [...porProduto.values()]
      .map((pr) => ({
        ...pr,
        antes: { ...pr.antes, receita: r2(pr.antes.receita), preco: pr.antes.unidades ? r2(pr.antes.receita / pr.antes.unidades) : null },
        agora: { ...pr.agora, receita: r2(pr.agora.receita), preco: pr.agora.unidades ? r2(pr.agora.receita / pr.agora.unidades) : null },
      }))
      .sort((a, b) => b.agora.receita + b.antes.receita - (a.agora.receita + a.antes.receita))
      .slice(0, 40);

    // Dia a dia: a ação e o resto, do começo do período anterior ao fim.
    const dias = new Map<string, { acao: number; resto: number }>();
    for (let dia = p.anteriorInicio; dia <= p.fim; dia = somarDias(dia, 1)) dias.set(dia, { acao: 0, resto: 0 });
    for (const l of validas) {
      const x = dias.get(l.data);
      if (!x) continue;
      if (daAcao(l)) x.acao += l.receita;
      else if (daReferencia(l)) x.resto += l.receita;
    }
    const serie = [...dias.entries()].map(([data, x]) => ({ data, acao: r2(x.acao), resto: r2(x.resto) }));

    let v: Veredito;
    let leitura: string;
    const nomeResto = delimitaProduto ? "o resto do canal" : "os outros canais";
    if (!recorte) {
      v = "sem recorte";
      leitura =
        `Sem produto, canal ou anúncio escolhido, a ação não delimita venda: os números abaixo são da loja inteira no período, como referência` +
        (crescimento != null ? ` (${fmt(crescimento)} contra o período anterior).` : ".") +
        " Para medir o efeito, escolha os produtos ou o canal da ação no Planejamento.";
    } else if (crescimento == null) {
      v = "sem base";
      leitura = atual.receita > 0 ? "Não vendia no período anterior: não há base de comparação." : "Sem venda nos dois períodos.";
    } else if (efeito == null) {
      v = veredito(null, crescimento);
      leitura = `Vendeu ${fmt(crescimento)} contra o período anterior; ${nomeResto} não teve venda para comparar.`;
    } else {
      v = veredito(efeito, crescimento);
      leitura =
        `${delimitaProduto ? "Os produtos da ação" : "O canal da ação"} foram ${fmt(crescimento)}; ${nomeResto}, ${fmt(crescimentoResto!)}. ` +
        (v === "deu certo"
          ? `Ficou ${pp(efeito)} acima do movimento geral.`
          : v === "não deu certo"
            ? `Ficou ${pp(efeito)} abaixo ${delimitaProduto ? "do resto do canal" : "dos outros canais"}.`
            : `Andou junto com ${nomeResto}: o efeito da ação não se distingue do movimento geral.`);
    }
    if (curta && recorte) leitura += " Ação curta: comparada com os mesmos dias da semana anterior.";
    if (base.parcial) leitura += " Ação em andamento: o número ainda muda.";

    return {
      ...base,
      anteriorInicio: p.anteriorInicio,
      anteriorFim: p.anteriorFim,
      atual,
      anterior,
      restoAtual,
      restoAnterior,
      crescimento,
      crescimentoResto,
      efeito,
      veredito: v,
      leitura,
      produtos: listaProdutos,
      produtosSaoDoCanal: !delimitaProduto,
      serie,
    };
  });

  /* ── Promoções do Mercado Livre: quem entrou contra quem ficou de fora ── */
  const vendaPorAnuncio = new Map<string, LinhaVenda[]>();
  for (const l of validas) {
    if (!l.anuncio) continue;
    const x = vendaPorAnuncio.get(l.anuncio) ?? [];
    x.push(l);
    vendaPorAnuncio.set(l.anuncio, x);
  }
  const somar = (ids: string[], de: string, ate: string) => {
    let receita = 0;
    let unidades = 0;
    for (const id of ids)
      for (const l of vendaPorAnuncio.get(id) ?? [])
        if (l.data >= de && l.data <= ate) {
          receita += l.receita;
          unidades += l.quantidade;
        }
    return { receita: r2(receita), unidades };
  };

  const promocoes: LinhaPromocao[] = promos
    .map(({ c, lista, inicio }) => {
      const ini = inicio!;
      // Até ontem: hoje ainda não fechou, e um dia pela metade puxaria o "depois" para baixo.
      const fimJanela = [somarDias(ini, JANELA_PROMO - 1), somarDias(hoje, -1)].sort()[0];
      const dias = Math.max(0, diasEntre(ini, fimJanela) + 1);
      const antesIni = somarDias(ini, -dias);
      const antesFim = somarDias(ini, -1);
      // Um anúncio que aparece duas vezes na mesma planilha conta uma: vale a última decisão.
      const decisao = new Map<string, Ci>();
      for (const x of lista) decisao.set(x.anuncio_id, x);
      const dentro = [...decisao.values()].filter((x) => x.decisao === "participar");
      const foraLista = [...decisao.values()].filter((x) => x.decisao !== "participar");
      const pA = somar(dentro.map((x) => x.anuncio_id), antesIni, antesFim);
      const pD = somar(dentro.map((x) => x.anuncio_id), ini, fimJanela);
      /*
       * Controle: os que ficaram de fora DESTA campanha, que é a comparação
       * mais justa. Quando ninguém ficou de fora (ou os de fora não vendiam),
       * vale o resto do Mercado Livre — os anúncios que não estavam nela.
       * Sem controle nenhum, "cresceu 35%" seria lido como efeito da
       * campanha quando pode ser só a semana.
       */
      let controleIds = foraLista.map((x) => x.anuncio_id);
      let controle: LinhaPromocao["controle"] = "fora da campanha";
      if (somar(controleIds, antesIni, antesFim).receita <= 0) {
        const naCampanha = new Set(decisao.keys());
        controleIds = [...vendaPorAnuncio.keys()].filter(
          (id) => !naCampanha.has(id) && (anuncioPorId.get(id)?.codigo_externo ?? "").toUpperCase().startsWith("MLB")
        );
        controle = "resto do Mercado Livre";
      }
      const fA = somar(controleIds, antesIni, antesFim);
      const fD = somar(controleIds, ini, fimJanela);
      const nomeControle = controle === "fora da campanha" ? `os ${foraLista.length} que ficaram de fora` : "o resto do Mercado Livre (anúncios fora da campanha)";
      const crescimento = pct(pD.receita, pA.receita);
      const crescimentoFora = pct(fD.receita, fA.receita);
      const efeito = crescimento != null && crescimentoFora != null ? crescimento - crescimentoFora : null;

      let v: Veredito;
      let leitura: string;
      // Uma semana inteira, no mínimo: menos que isso o fim de semana sozinho muda o número.
      if (dias < 7) {
        v = "cedo demais";
        leitura = `Processada há ${dias} dia(s) completos. O resultado aparece com 7 dias: antes disso, o fim de semana sozinho muda o número.`;
      } else if (crescimento == null) {
        v = "sem base";
        leitura = "Os anúncios que entraram não venderam nos dias antes: não há base de comparação.";
      } else if (efeito == null) {
        v = "sem base";
        leitura = `Os ${dentro.length} anúncios que entraram foram ${fmt(crescimento)}, mas não há com o que comparar: sem controle, não dá para separar a campanha do movimento da semana.`;
      } else {
        v = veredito(efeito, crescimento);
        leitura =
          `Nos ${dias} dias depois do processamento, os ${dentro.length} anúncios que entraram foram ${fmt(crescimento)}; ` +
          `${nomeControle}, ${fmt(crescimentoFora!)}. ` +
          (v === "deu certo"
            ? `Entrar rendeu ${pp(efeito)} a mais.`
            : v === "não deu certo"
              ? `Quem entrou ficou ${pp(efeito)} atrás.`
              : "Entrar ou não entrar deu praticamente no mesmo.");
      }

      const anunciosLista: AnuncioPromo[] = dentro
        .map((x) => {
          const a = anuncioPorId.get(x.anuncio_id);
          const an = somar([x.anuncio_id], antesIni, antesFim);
          const ag = somar([x.anuncio_id], ini, fimJanela);
          return {
            codigo: a?.codigo_externo ?? "—",
            titulo: a?.titulo ?? "",
            precoOferta: x.preco_oferta != null ? Number(x.preco_oferta) : null,
            precoTabela: x.preco_tabela != null ? Number(x.preco_tabela) : null,
            antes: an.receita,
            agora: ag.receita,
            unidadesAgora: ag.unidades,
          };
        })
        .sort((a, b) => b.agora + b.antes - (a.agora + a.antes))
        .slice(0, 25);

      // "1_Com_reducao_de_tarifas_2026_09_04-13_28 | De 28..." → "Com reducao de tarifas"
      const nome = c.nome
        .replace(/^\d+_/, "")
        .split("|")[0]
        .replace(/[_-]\d{4}_\d{2}_\d{2}.*$/, "")
        .replace(/-[0-9a-f]{8}-.*$/i, "")
        .replace(/_/g, " ")
        .trim();

      return {
        id: c.id,
        nome: nome || c.nome,
        processadaEm: ini,
        comReducao: !!c.tem_reducao_tarifa,
        dias,
        participam: dentro.length,
        fora: foraLista.length,
        controle,
        receitaParticipantes: { antes: pA.receita, agora: pD.receita },
        receitaFora: { antes: fA.receita, agora: fD.receita },
        crescimento,
        crescimentoFora,
        // Cedo demais não mostra efeito: o número existiria, mas induziria a uma conclusão.
        efeito: v === "cedo demais" ? null : efeito,
        veredito: v,
        leitura,
        anuncios: anunciosLista,
      };
    })
    .sort((a, b) => b.processadaEm.localeCompare(a.processadaEm));

  return { linhas, promocoes, aviso };
}
