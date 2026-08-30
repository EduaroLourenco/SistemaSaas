import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { paginar } from "./paginar";
import { carregarExclusoes, aplicar, type Exclusao } from "./exclusoes";

/**
 * Alertas que carregam a própria prova.
 *
 * Um alerta que diz "a conversão caiu" e obriga a caçar o motivo em outra
 * tela não é aviso: é trabalho transferido. Quem recebe precisa abrir três
 * telas para descobrir se aquilo merece atenção, e depois de algumas vezes
 * para de abrir.
 *
 * Por isso todo alerta daqui carrega três coisas:
 *
 *   evidencia  — a série que sustenta a afirmação, para desenhar junto
 *   numeros    — o antes e o depois, sem precisar procurar
 *   destino    — onde ir para agir
 *
 * E uma regra de disciplina: alerta só nasce com denominador suficiente.
 * "Conversão caiu 80%" em cima de 3 visitas é ruído com aparência de
 * urgência, e ruído em alerta é o que faz o alerta inteiro ser ignorado.
 */

export type Alerta = {
  id: string;
  severidade: "critico" | "atencao" | "info";
  tipo: "cancelamento" | "conversao" | "estoque" | "preco" | "receita";
  titulo: string;
  /** A frase que explica. Deve bastar sozinha. */
  leitura: string;
  numeros: { rotulo: string; valor: string }[];
  evidencia: { rotulo: string; valor: number }[];
  formato: "moeda" | "numero" | "percentual";
  destino?: { href: string; texto: string };
};

const n = (v: unknown) => (v == null ? 0 : Number(v)) || 0;
const pctBr = (v: number, d = 1) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ── Limiares ──────────────────────────────────────────────────
   Arbitrários, e assumidamente. O que importa é serem os mesmos em
   todo o sistema: um 15% que é "crítico" numa tela e "normal" na outra
   destrói a confiança mais rápido que um corte mal escolhido.          */
const CANCELAMENTO_CRITICO = 15;
const CANCELAMENTO_ATENCAO = 10;
const MIN_PEDIDOS = 20;
const QUEDA_RECEITA = 25;
const MIN_VISITAS_SEMANA = 300;
const QUEDA_CONVERSAO = 30;

export type DadosAlertas = {
  alertas: Alerta[];
  /**
   * As exclusões acompanham os alertas de propósito. Alerta que grita por
   * causa de um lote descartado em outra tela é pior que alerta nenhum:
   * ensina a ignorar a lista inteira.
   */
  exclusoes: Exclusao[];
  removidas: number;
  canaisDisponiveis: { id: string; nome: string }[];
};

export async function carregarAlertas(): Promise<DadosAlertas> {
  const sb = await clienteServidor();
  const alertas: Alerta[] = [];

  const [pedidos, { data: contasRaw }, desempenho, exclusoes] = await Promise.all([
    paginar(() =>
      sb
        .from("pedidos")
        .select("data,cancelado,total,conta_canal_id")
        .order("data", { ascending: true })
    ),
    sb.from("contas_canal").select("id,nome,canal_id,canais(nome)").limit(200),
    paginar(() =>
      sb
        .from("anuncio_desempenho_semanal")
        .select("anuncio_id,visitas,vendas,receita,ano_iso,semana_iso,inicio")
        .order("inicio", { ascending: true })
    ),
    carregarExclusoes(),
  ]);

  type Ped = { data: string; cancelado: boolean; total: string | number; conta_canal_id: string };
  type Conta = { id: string; nome: string; canal_id: string; canais: { nome: string } | null };
  const brutas = pedidos as unknown as Ped[];
  const contas = ((contasRaw ?? []) as unknown as Conta[]);
  const porConta = new Map(contas.map((c) => [c.id, c]));

  // O pedido guarda a conta; a exclusão fala em canal. Anotar antes de
  // testar evita que "excluir 27/08 na Loja própria" derrube o dia inteiro.
  const canalDaConta = new Map(contas.map((c) => [c.id, c.canal_id]));
  const { mantidas: linhas, removidas } = aplicar(
    brutas.map((p) => ({
      ...p,
      canalId: canalDaConta.get(p.conta_canal_id) ?? null,
      contaCanalId: p.conta_canal_id,
    })),
    exclusoes
  );

  const canaisDisponiveis = [
    ...new Map(
      contas.map((c) => [c.canal_id, { id: c.canal_id, nome: c.canais?.nome ?? "Outros" }])
    ).values(),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  /* ── 1. Cancelamento por canal ── */
  const canais = new Map<
    string,
    { nome: string; pedidos: number; cancelados: number; valor: number; porMes: Map<string, number> }
  >();

  for (const p of linhas) {
    const c = porConta.get(p.conta_canal_id);
    if (!c) continue;
    const nome = c.canais?.nome ?? "Outros";
    const at =
      canais.get(nome) ??
      { nome, pedidos: 0, cancelados: 0, valor: 0, porMes: new Map<string, number>() };
    at.pedidos += 1;
    if (p.cancelado) {
      at.cancelados += 1;
      at.valor += n(p.total);
      const mes = String(p.data).slice(0, 7);
      at.porMes.set(mes, (at.porMes.get(mes) ?? 0) + n(p.total));
    }
    canais.set(nome, at);
  }

  for (const c of canais.values()) {
    if (c.pedidos < MIN_PEDIDOS) continue;
    const taxa = (c.cancelados * 100) / c.pedidos;
    if (taxa < CANCELAMENTO_ATENCAO) continue;

    const meses = [...c.porMes.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    alertas.push({
      id: `cancelamento-${c.nome}`,
      severidade: taxa >= CANCELAMENTO_CRITICO ? "critico" : "atencao",
      tipo: "cancelamento",
      titulo: `${c.nome} cancela ${pctBr(taxa)} dos pedidos`,
      leitura:
        `São ${c.cancelados} de ${c.pedidos} pedidos, ${moeda(c.valor)} que ` +
        `entraram no faturamento e voltaram. ` +
        (taxa >= CANCELAMENTO_CRITICO
          ? "Taxa nesse patamar raramente é comportamento de comprador — costuma ser ruptura de estoque ou prazo que o canal não consegue cumprir."
          : "Vale acompanhar: ainda não é ruptura, mas está acima do resto da operação."),
      numeros: [
        { rotulo: "Taxa", valor: pctBr(taxa) },
        { rotulo: "Cancelados", valor: `${c.cancelados} de ${c.pedidos}` },
        { rotulo: "Valor", valor: moeda(c.valor) },
      ],
      evidencia: meses.map(([mes, v]) => ({
        rotulo: new Date(mes + "-15T12:00:00").toLocaleDateString("pt-BR", {
          month: "short",
        }),
        valor: Number(v.toFixed(2)),
      })),
      formato: "moeda",
      destino: { href: "/vendas/cancelamentos", texto: "Ver cancelamentos" },
    });
  }

  /* ── 2. Receita da operação: última semana fechada contra as anteriores ── */
  const porSemana = new Map<string, number>();
  for (const p of linhas) {
    if (p.cancelado) continue;
    const d = new Date(String(p.data) + "T00:00:00Z");
    const dia = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dia);
    const chave = d.toISOString().slice(0, 10);
    porSemana.set(chave, (porSemana.get(chave) ?? 0) + n(p.total));
  }

  const semanas = [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // A última é quase sempre parcial: comparar com ela acusaria queda toda
  // segunda-feira, e alerta que grita sozinho todo começo de semana ensina
  // a ser ignorado.
  const fechadas = semanas.slice(0, -1);

  if (fechadas.length >= 4) {
    const ultima = fechadas[fechadas.length - 1];
    const anteriores = fechadas.slice(-4, -1);
    const media = anteriores.reduce((s, [, v]) => s + v, 0) / anteriores.length;
    const variacao = media ? ((ultima[1] - media) / media) * 100 : 0;

    if (variacao <= -QUEDA_RECEITA) {
      alertas.push({
        id: "receita-queda",
        severidade: variacao <= -40 ? "critico" : "atencao",
        tipo: "receita",
        titulo: `Receita caiu ${pctBr(Math.abs(variacao))} na última semana fechada`,
        leitura:
          `A semana de ${dataBr(ultima[0])} fechou em ${moeda(ultima[1])}, contra ` +
          `${moeda(media)} de média nas três anteriores. A semana em curso não entra na conta — ` +
          `ela está incompleta e acusaria queda todo começo de semana.`,
        numeros: [
          { rotulo: "Última fechada", valor: moeda(ultima[1]) },
          { rotulo: "Média anterior", valor: moeda(media) },
          { rotulo: "Variação", valor: pctBr(variacao) },
        ],
        evidencia: fechadas.slice(-8).map(([s, v]) => ({
          rotulo: dataBr(s).slice(0, 5),
          valor: Number(v.toFixed(2)),
        })),
        formato: "moeda",
        destino: { href: "/vendas/semanal", texto: "Ver semanal" },
      });
    }
  }

  /* ── 3. Conversão por anúncio ── */
  type Des = {
    anuncio_id: string;
    visitas: number;
    vendas: number;
    ano_iso: number;
    semana_iso: number;
    inicio: string;
  };
  const des = desempenho as unknown as Des[];

  const porAnuncio = new Map<string, Des[]>();
  for (const d of des) {
    const lista = porAnuncio.get(d.anuncio_id) ?? [];
    lista.push(d);
    porAnuncio.set(d.anuncio_id, lista);
  }

  const candidatos: { id: string; queda: number; ultima: Des; media: number; serie: Des[] }[] = [];
  for (const [id, lista] of porAnuncio) {
    const ord = [...lista].sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
    if (ord.length < 4) continue;

    const ultima = ord[ord.length - 1];
    if ((ultima.visitas ?? 0) < MIN_VISITAS_SEMANA) continue;

    const conv = (d: Des) => (d.visitas ? (d.vendas * 100) / d.visitas : 0);
    const anteriores = ord.slice(-4, -1);
    const media = anteriores.reduce((s, d) => s + conv(d), 0) / anteriores.length;
    if (media <= 0) continue;

    const queda = ((conv(ultima) - media) / media) * 100;
    if (queda <= -QUEDA_CONVERSAO) {
      candidatos.push({ id, queda, ultima, media, serie: ord.slice(-8) });
    }
  }

  if (candidatos.length) {
    candidatos.sort((a, b) => a.queda - b.queda);
    const piores = candidatos.slice(0, 5);
    const { data: infos } = await sb
      .from("anuncios")
      .select("id,titulo,codigo_externo,sku_canal")
      .in("id", piores.map((c) => c.id));
    const porId = new Map((infos ?? []).map((a) => [a.id as string, a]));

    for (const c of piores) {
      const a = porId.get(c.id);
      const conv = (d: Des) => (d.visitas ? (d.vendas * 100) / d.visitas : 0);
      alertas.push({
        id: `conversao-${c.id}`,
        severidade: "atencao",
        tipo: "conversao",
        titulo: `Conversão caiu ${pctBr(Math.abs(c.queda))} em ${a?.codigo_externo ?? "anúncio"}`,
        leitura:
          `${a?.titulo ?? "Anúncio"} converteu ${pctBr(conv(c.ultima), 2)} na última semana, ` +
          `contra ${pctBr(c.media, 2)} de média nas três anteriores. ` +
          `A visita continuou chegando (${c.ultima.visitas} na semana) e virou menos venda — ` +
          `o que costuma apontar para preço ou concorrência, não para exposição.`,
        numeros: [
          { rotulo: "Conversão atual", valor: pctBr(conv(c.ultima), 2) },
          { rotulo: "Média anterior", valor: pctBr(c.media, 2) },
          { rotulo: "Visitas na semana", valor: String(c.ultima.visitas) },
        ],
        evidencia: c.serie.map((d) => ({
          rotulo: `S${d.semana_iso}`,
          valor: Number(conv(d).toFixed(2)),
        })),
        formato: "percentual",
        destino: a?.codigo_externo
          ? {
              href: `/anuncios/analise?anuncio=${a.codigo_externo}`,
              texto: "Abrir análise",
            }
          : undefined,
      });
    }
  }

  const ordem = { critico: 0, atencao: 1, info: 2 };
  return {
    alertas: alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]),
    exclusoes,
    removidas,
    canaisDisponiveis,
  };
}

function dataBr(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}
