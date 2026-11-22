import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { operacaoPadrao } from "./operacao";
import { paginar } from "./paginar";
import { carregarQueda, serieDaQueda, type DiaQueda } from "./queda";
import { carregarBaseVendas } from "./vendas";
import { carregarAcontecimentos, type Acontecimento } from "./acontecimentos-semana";
import { carregarSaude } from "./saude";
import { carregarTrafegoPago } from "./trafego-pago";
import { carregarResultadosPlanejamento } from "./planejamento-resultados";
import { diaSP } from "@/lib/promocoes/participacao";
import { avaliarGatilhos, type ConviteQ, type Gatilho, type LadoQ } from "@/lib/acompanhamento/gatilhos";

/**
 * Os gatilhos do Mercado Livre num período, montados dos motores que já
 * existem. Aqui só se junta: quem decide é cada motor e `gatilhos.ts`.
 *
 * A comparação é com o período de mesmo tamanho logo antes — que, para uma
 * semana, é a semana anterior (quarta contra quarta).
 */

export type DadosAcompanhamento = {
  de: string;
  ate: string;
  deAnterior: string;
  ateAnterior: string;
  /** A janela do relatório de mídia usada (o canal manda por janela, não por dia). */
  janelaMidia: string | null;
  gatilhos: Gatilho[];
  aviso: string | null;
  /** Totais do Meli nos dois períodos — os mesmos que os gatilhos usam (pedidos). */
  totais: { antes: LadoQ; agora: LadoQ };
  /**
   * Dia a dia do Meli: posição i do período atual ao lado da posição i do
   * anterior (mesmo dia da semana numa comparação semanal).
   */
  serie: { dia: string; diaAnterior: string; receita: number | null; receitaAnterior: number | null; visitas: number | null; visitasAnterior: number | null }[];
  /** O que aconteceu em cada dia dos dois períodos: preço ≥ 10%, campanha, estoque. */
  acontecimentos: Acontecimento[];
  /** Histórico dos produtos que mais pesaram, nos dois períodos juntos. Chave: SKU. */
  historicos: Record<string, DiaQueda[]>;
  /** Promoções cuja janela medida cruza o período, para a linha do tempo. */
  promocoes: { nome: string; tipo: string | null; origem: string; inicio: string; fim: string; veredito: string; efeito: number | null; participam: number }[];
};

const ladoVazio = (): LadoQ => ({ receita: 0, unidades: 0, pedidos: 0, visitas: null, conversao: null, precoVendido: null, precoVitrine: null });

/**
 * `anterior` escolhe a base: sem ela, o período de mesmo tamanho logo antes.
 * Um dia só se compara com o mesmo dia da semana anterior (sábado não se
 * parece com sexta) — quem chama passa isso.
 */
export async function carregarAcompanhamento(de: string, ate: string, anterior?: { de: string; ate: string }): Promise<DadosAcompanhamento> {
  const op = await operacaoPadrao();
  const sb = await clienteServidor();
  const hoje = diaSP(new Date().toISOString())!;
  if (!op) return { de, ate, deAnterior: "", ateAnterior: "", janelaMidia: null, gatilhos: [], totais: { antes: ladoVazio(), agora: ladoVazio() }, serie: [], acontecimentos: [], historicos: {}, promocoes: [], aviso: "Escolha uma empresa." };
  // Cada operação tem o seu canal "Mercado Livre": é pela conta que se chega a ele.
  const { data: contaMeli } = await sb
    .from("contas_canal")
    .select("canal_id,canais!inner(codigo)")
    .eq("operacao_id", op.id)
    .eq("canais.codigo", "mercado_livre")
    .limit(1)
    .maybeSingle();
  const meli = contaMeli ? { id: contaMeli.canal_id as string } : null;
  if (!meli) return { de, ate, deAnterior: "", ateAnterior: "", janelaMidia: null, gatilhos: [], totais: { antes: ladoVazio(), agora: ladoVazio() }, serie: [], acontecimentos: [], historicos: {}, promocoes: [], aviso: "Sem Mercado Livre nesta empresa." };

  const [queda, saude, resultados, convitesBrutos, midia0, base] = await Promise.all([
    carregarQueda({ de, ate, deAnt: anterior?.de, ateAnt: anterior?.ate, nivel: "produto", canais: meli.id }),
    carregarSaude().catch(() => []),
    carregarResultadosPlanejamento(),
    paginar(() =>
      sb
        .from("promocao_canal_itens")
        .select("codigo_externo,preco_promocional,fim,anuncios(sku_canal),promocoes_canal(nome,tipo,fim)")
        .eq("operacao_id", op.id)
        .eq("status", "candidate")
        .not("preco_promocional", "is", null)
        .order("id")
    ).catch(() => []),
    carregarTrafegoPago(undefined, meli.id).catch(() => null),
    carregarBaseVendas().catch(() => null),
  ]);

  /* A janela de mídia que mais cruza o período escolhido. */
  let midia = midia0;
  if (midia0?.periodos.length) {
    const cruza = (i: string, f: string) => Math.max(0, Date.parse([f, ate].sort()[0]) - Date.parse([i, de].sort()[1]));
    const melhor = [...midia0.periodos].sort((a, b) => cruza(b.inicio, b.fim) - cruza(a.inicio, a.fim))[0];
    const chave = `${melhor.inicio}|${melhor.fim}`;
    if (chave !== midia0.janela && cruza(melhor.inicio, melhor.fim) > 0) midia = await carregarTrafegoPago(chave, meli.id).catch(() => midia0);
  }

  /* Totais do Meli: a soma dos produtos do recorte. */
  const totais = { antes: ladoVazio(), agora: ladoVazio() };
  for (const l of queda.linhas) {
    for (const k of ["antes", "agora"] as const) {
      const t = totais[k];
      t.receita += l[k].receita;
      t.unidades += l[k].unidades;
      t.pedidos += l[k].pedidos;
      if (l[k].visitas != null) t.visitas = (t.visitas ?? 0) + l[k].visitas!;
    }
  }

  type CB = { codigo_externo: string; preco_promocional: number; fim: string | null; anuncios: { sku_canal: string | null } | null; promocoes_canal: { nome: string | null; tipo: string; fim: string | null } | null };
  const convites: ConviteQ[] = (convitesBrutos as CB[])
    .filter((c) => c.anuncios?.sku_canal && c.promocoes_canal)
    .map((c) => ({
      sku: c.anuncios!.sku_canal!,
      mlb: c.codigo_externo,
      promocao: c.promocoes_canal!.nome ?? c.promocoes_canal!.tipo,
      tipo: c.promocoes_canal!.tipo,
      preco: Number(c.preco_promocional),
      fim: diaSP(c.fim) ?? diaSP(c.promocoes_canal!.fim),
    }));

  const gatilhos = avaliarGatilhos({
    de: queda.de,
    ate: queda.ate,
    hoje,
    dias: queda.dias + 1,
    diasAnterior: queda.diasAnterior + 1,
    totais,
    linhas: queda.linhas,
    saude,
    midia: midia?.oportunidades ?? [],
    promocoes: resultados.promocoes,
    convites,
    acoes: resultados.linhas.map((l) => ({ id: l.id, titulo: l.titulo, fim: l.fim, veredito: l.veredito, efeito: l.efeito })),
  });

  /* Dia a dia: posição contra posição. */
  const somaDia = new Map<string, { receita: number; visitas: number }>();
  for (const l of base?.linhas ?? []) {
    if (l.canalReal !== meli.id || l.data < queda.deAnterior || l.data > queda.ate) continue;
    const x = somaDia.get(l.data) ?? { receita: 0, visitas: 0 };
    x.receita += l.receita;
    x.visitas += l.visitas;
    somaDia.set(l.data, x);
  }
  const mais = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const serie: DadosAcompanhamento["serie"] = [];
  for (let i = 0; i <= Math.max(queda.dias, queda.diasAnterior); i++) {
    const dia = mais(queda.de, i);
    const diaAnterior = mais(queda.deAnterior, i);
    // Fora do período (anterior mais curto, ou hoje sem fechar) é nulo, não zero.
    const atual = dia <= queda.ate ? somaDia.get(dia) : undefined;
    const ant = diaAnterior <= queda.ateAnterior ? somaDia.get(diaAnterior) : undefined;
    serie.push({
      dia, diaAnterior,
      receita: dia <= queda.ate ? Math.round(atual?.receita ?? 0) : null,
      receitaAnterior: diaAnterior <= queda.ateAnterior ? Math.round(ant?.receita ?? 0) : null,
      visitas: atual ? atual.visitas : null,
      visitasAnterior: ant ? ant.visitas : null,
    });
  }

  /* Histórico dos produtos que mais pesaram (até 6), para o "por quê". */
  const skusHistorico = [...new Set(gatilhos.filter((g) => g.item && g.lados && ["S3", "S4", "S5"].includes(g.slide)).map((g) => g.item!.sku))].slice(0, 6);
  const [acontecimentos, ...series] = await Promise.all([
    carregarAcontecimentos(sb, queda.deAnterior, queda.ate).catch(() => [] as Acontecimento[]),
    ...skusHistorico.map((sku) => serieDaQueda(`p:${sku}`, queda.deAnterior, queda.ate, meli.id).catch(() => [] as DiaQueda[])),
  ]);
  const skusDaOperacao = new Set(queda.linhas.map((l) => l.sku.toUpperCase()));
  const titulosDoPlano = resultados.linhas.map((l) => l.titulo);
  while (serie.length && serie[serie.length - 1].receita == null && serie[serie.length - 1].receitaAnterior == null) serie.pop();
  const historicos = Object.fromEntries(skusHistorico.map((sku, i) => [sku, series[i]]));

  const promocoes = resultados.promocoes
    .map((p) => ({ p, inicio: p.processadaEm.slice(0, 10), fim: mais(p.processadaEm.slice(0, 10), Math.max(0, p.dias - 1)) }))
    .filter(({ inicio, fim }) => inicio <= queda.ate && fim >= queda.deAnterior)
    .map(({ p, inicio, fim }) => ({ nome: p.nome, tipo: p.tipo ?? null, origem: p.origem ?? "planilha", inicio, fim, veredito: p.veredito, efeito: p.efeito, participam: p.participam }));

  return {
    de: queda.de,
    ate: queda.ate,
    deAnterior: queda.deAnterior,
    ateAnterior: queda.ateAnterior,
    janelaMidia: midia?.janela || null,
    gatilhos,
    aviso: resultados.aviso,
    totais,
    serie,
    /*
     * Só o que é desta operação: SKU do recorte, ou campanha do próprio
     * Planejamento. Na app o RLS já filtra; aqui é a segunda trava (a
     * leitura diária de estoque não filtra por operação).
     */
    acontecimentos: acontecimentos.filter((a) =>
      a.sku ? skusDaOperacao.has(a.sku.toUpperCase()) : titulosDoPlano.some((t) => a.texto.endsWith(`: ${t}`))
    ),
    historicos,
    promocoes,
  };
}
