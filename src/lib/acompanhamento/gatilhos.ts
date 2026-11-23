/**
 * Gatilhos do acompanhamento do Mercado Livre: o que merece ser olhado no
 * período, e por quê.
 *
 * ── O que é e o que não é ──
 *
 * Não calcula nada novo. Lê o que os motores já decidem — a causa da queda
 * (queda-causa.ts), a ação de mídia pela mediana (trafego-oportunidades.ts),
 * o veredito da promoção (planejamento-resultados.ts), a saúde dos dados
 * (saude.ts) — e transforma em itens de pauta, ordenados por impacto em R$.
 * A apresentação e a conversa com IA leem esta lista; nenhuma das duas
 * escreve número que não esteja aqui.
 *
 * ── Regras gerais ──
 *
 *   · Denominador mínimo: item com < 30 visitas e < 3 pedidos no período de
 *     comparação não dispara. "−80%" sobre 3 visitas é ruído.
 *   · Preço é sempre hipótese: coincidência de datas não prova causa.
 *   · Cortes relativos onde o catálogo varia (a mídia já vem pela mediana).
 *
 * Sem banco e sem `server-only`: `scripts/testar-gatilhos.mjs` roda as
 * regras de verdade contra casos já vistos.
 */

export type Slide = "S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10" | "S11" | "S13";

export type Gatilho = {
  id: string;
  nome: string;
  slide: Slide;
  /** Para ordenar: R$ em jogo (positivo), já em módulo. */
  impacto: number;
  item?: { codigo: string; sku: string; titulo: string; curva?: "A" | "B" | "C"; familia?: string | null };
  /** Uma linha, só com números. */
  texto: string;
  numeros: Record<string, number | string | null>;
  destino: string;
  hipotese?: boolean;
  /** Só nos gatilhos de produto. */
  lados?: { antes: LadoQ; agora: LadoQ };
  efeito?: LinhaQ["efeito"];
};

/* ── Entradas: só o pedaço de cada motor que os gatilhos usam ── */

export type LadoQ = {
  receita: number;
  unidades: number;
  pedidos: number;
  visitas: number | null;
  conversao: number | null;
  precoVendido: number | null;
  precoVitrine: number | null;
};
export type LinhaQ = {
  codigo: string;
  sku: string;
  titulo: string;
  curva: "A" | "B" | "C";
  antes: LadoQ;
  agora: LadoQ;
  delta: number;
  deltaPct: number | null;
  diasSemEstoque: number;
  status: string | null;
  precoAtual: number | null;
  estoqueAtual: number | null;
  sobEncomenda: boolean;
  catalogo: { antes: { ganhando: number; dias: number }; agora: { ganhando: number; dias: number } } | null;
  causa: string;
  explicacao: string;
  /** Quanto da diferença em R$ cada fator explica (queda.ts). */
  efeito?: { visitas: number | null; conversao: number | null; unidades: number | null; preco: number };
};
export type SaudeQ = { id: string; pergunta: string; estado: "ok" | "atencao" | "problema"; resposta: string };
export type MidiaQ = {
  mlb: string;
  sku: string;
  titulo: string;
  acao: string;
  motivo: string;
  investimento: number;
  receitaReal: number;
  conversao: number | null;
  visitas: number | null;
};
export type PromoQ = {
  id: string;
  nome: string;
  processadaEm: string;
  dias: number;
  participam: number;
  origem?: string;
  tipo?: string;
  receitaParticipantes: { antes: number; agora: number };
  crescimento: number | null;
  efeito: number | null;
  veredito: string;
};
export type ConviteQ = { sku: string; mlb: string; promocao: string; tipo: string; preco: number; fim: string | null };
/** Taxas da conta como o canal informa (fração: 0,012 = 1,2%). */
export type ReputacaoQ = { nivel: string | null; reclamacoes: number | null; cancelamentos: number | null; atrasos: number | null };
export type ContaReputacaoQ = { conta: string; antes: ReputacaoQ | null; agora: ReputacaoQ | null };
export type CancelamentoQ = { receita: number; cancelado: number; pedidos: number; pedidosCancelados: number };
export type MargemLadoQ = { receita: number; receitaApurada: number; margem: number | null; comissao: number };
export type MargemQ = {
  antes: MargemLadoQ;
  agora: MargemLadoQ;
  porSku: { sku: string; titulo: string; antes: MargemLadoQ; agora: MargemLadoQ }[];
};
export type AcaoQ = { id: string; titulo: string; fim: string; veredito: string; efeito: number | null };

export type EntradaGatilhos = {
  de: string;
  ate: string;
  hoje: string;
  dias: number;
  diasAnterior: number;
  totais: { antes: LadoQ; agora: LadoQ };
  linhas: LinhaQ[];
  saude: SaudeQ[];
  midia: MidiaQ[];
  promocoes: PromoQ[];
  convites: ConviteQ[];
  acoes: AcaoQ[];
  /** Opcionais: o módulo só liga quando a empresa tem o dado. */
  cancelamentos?: { antes: CancelamentoQ; agora: CancelamentoQ };
  reputacao?: ContaReputacaoQ[];
  margem?: MargemQ | null;
  /** SKU → nome da família no Meli (o grupo de tamanhos). */
  familias?: Record<string, string>;
  /**
   * SKU → anúncios que VENDIAM no período anterior e hoje estão pausados ou
   * zerados. O produto soma anúncios "sem controle" (40 mil) que não vendem,
   * e a ruptura do anúncio que vendia some na soma — vira "parou de vender".
   */
  parados?: Record<string, { mlb: string; status: string | null; estoque: number | null; unidadesAntes: number }[]>;
};

/* ── Cortes: um lugar só ── */
export const CORTES = {
  visitasMinimas: 30,
  pedidosMinimos: 3,
  variacaoTotal: 10,
  divergencia: 10,
  coberturaDias: 7,
  /** Acima disto o canal declara "sem controle" (venda sob encomenda). */
  estoqueSemControle: 40000,
  catalogoQueda: 0.3,
  /** Dias medidos no período anterior para dizer "ganhava": 1 de 2 dias não é estado. */
  catalogoDiasMinimos: 3,
  /** Mídia sem retorno abaixo disto é troco, não pauta. */
  midiaMinima: 20,
  /** Convite só "resolve" queda por preço se baixar pelo menos isto (%). */
  conviteDesconto: 3,
  /** Ruptura com perda estimada abaixo disto (R$) não é pauta. */
  perdaMinima: 50,
  /** Promoção com menos que isto de receita antes não dá veredito: base pequena demais. */
  basePromocao: 1000,
  /** Efeito acima disto (p.p.) é base pequena, não resultado: não vira pauta. */
  efeitoMaximo: 150,
  /** Lucro só com pelo menos isto da receita com custo completo. */
  coberturaMargem: 0.7,
  /** Taxa da reputação que dobra (×) e passa deste piso (fração) acende. */
  reputacaoAlta: 1.5,
  reputacaoPiso: 0.01,
};

const pct = (agora: number, antes: number) => (antes > 0 ? ((agora - antes) / antes) * 100 : null);
const r0 = (v: number) => Math.round(v);
const p0 = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}%`);
const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const item = (l: LinhaQ) => ({ codigo: l.codigo, sku: l.sku, titulo: l.titulo, curva: l.curva });
/** O item, com os dois lados e a repartição da diferença: é o que a animação do "por quê" desenha. */
const doItem = (l: LinhaQ) => ({ item: item(l), lados: { antes: l.antes, agora: l.agora }, efeito: l.efeito });
const somar = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Tem base para comparar? */
export const temBase = (l: Pick<LinhaQ, "antes">) =>
  (l.antes.visitas ?? 0) >= CORTES.visitasMinimas || l.antes.pedidos >= CORTES.pedidosMinimos;

const CAUSA_PARA_GATILHO: Record<string, [string, string, string]> = {
  "perdeu visitas": ["G06", "Queda por visita", "/anuncios/trafego-pago"],
  "conversão caiu": ["G07", "Queda por conversão", "/anuncios/analise"],
  "preço subiu": ["G08", "Queda com preço subindo", "/produtos/precificacao"],
  "parou de vender": ["G09", "Parou de vender", "/anuncios/analise"],
  pausado: ["G12", "Pausado", "/anuncios/analise"],
  "vendeu menos": ["G27", "Vendeu menos", "/vendas/queda"],
  "vendeu mais barato": ["G28", "Vendeu mais barato", "/vendas/queda"],
};

export function avaliarGatilhos(e: EntradaGatilhos): Gatilho[] {
  const g: Gatilho[] = [];

  /* S0 — dá para confiar? */
  for (const s of e.saude) {
    // Só o que impede ler o período. "Atenção" (custo faltando, leitura de hoje) desliga módulo, não vira pauta.
    if (s.estado !== "problema") continue;
    g.push({
      id: "G01", nome: "Dado incompleto", slide: "S0", impacto: s.estado === "problema" ? 1e9 : 1e8,
      texto: `${s.pergunta} ${s.resposta}`, numeros: { estado: s.estado, verificacao: s.id }, destino: "/integracoes",
    });
  }
  if (e.ate >= e.hoje) {
    g.push({ id: "G02", nome: "Dia parcial", slide: "S0", impacto: 1e7, texto: `${dm(e.hoje)} ainda está acontecendo: não compare como dia fechado.`, numeros: { dia: e.hoje }, destino: "/vendas/dia" });
  }

  /* S1 / S2 — o total */
  const { antes: ta, agora: tg } = e.totais;
  const vRec = pct(tg.receita, ta.receita);
  const vUn = pct(tg.unidades, ta.unidades);
  if (vRec != null && Math.abs(vRec) >= CORTES.variacaoTotal) {
    const caiu = vRec < 0;
    g.push({
      id: caiu ? "G03" : "G04", nome: caiu ? "Queda do total" : "Alta do total", slide: "S1", impacto: Math.abs(tg.receita - ta.receita),
      texto: `Receita ${p0(vRec)} (${brl(ta.receita)} → ${brl(tg.receita)}) · pedidos ${p0(pct(tg.pedidos, ta.pedidos))} · visitas ${p0(ta.visitas && tg.visitas != null ? pct(tg.visitas, ta.visitas) : null)}`,
      numeros: { receitaAntes: r0(ta.receita), receita: r0(tg.receita), variacao: vRec },
      destino: caiu ? "/vendas/queda" : "/vendas/periodo",
    });
  }
  if (vRec != null && vUn != null && Math.sign(vRec) !== Math.sign(vUn) && Math.abs(vRec - vUn) >= CORTES.divergencia) {
    g.push({
      id: "G05", nome: "Unidade × receita", slide: "S2", impacto: Math.abs(tg.receita - ta.receita),
      texto: `Unidades ${p0(vUn)} e receita ${p0(vRec)}: mudou o preço médio ou o mix.`,
      numeros: { unidades: vUn, receita: vRec, ticketAntes: ta.unidades ? r0(ta.receita / ta.unidades) : null, ticket: tg.unidades ? r0(tg.receita / tg.unidades) : null },
      destino: "/vendas/skus",
    });
  }

  /* S3 / S4 / S5 / S6 / S7 — por produto */
  const convitesPorSku = new Map<string, ConviteQ[]>();
  for (const c of e.convites) {
    if (c.fim && c.fim < e.hoje) continue;
    const k = c.sku.toUpperCase();
    convitesPorSku.set(k, [...(convitesPorSku.get(k) ?? []), c]);
  }

  for (const l of e.linhas) {
    const base = temBase(l);
    const vVis = l.antes.visitas && l.agora.visitas != null ? pct(l.agora.visitas, l.antes.visitas) : null;
    const vConv = l.antes.conversao && l.agora.conversao != null ? pct(l.agora.conversao, l.antes.conversao) : null;

    // O anúncio que vendia parou (pausado ou zerado): é isso, não "parou de vender".
    const parados = e.parados?.[l.sku.toUpperCase()] ?? [];
    if (l.delta < 0 && base && parados.length) {
      g.push({
        id: "G31", nome: "Anúncio que vendia parou", slide: "S7", impacto: -l.delta, ...doItem(l),
        texto: parados.map((p) => `${p.mlb} ${p.status === "pausado" || p.status === "paused" ? "pausado" : "ativo"}, estoque ${p.estoque ?? "—"} · vendeu ${p.unidadesAntes} un. antes`).join(" · "),
        numeros: { anuncios: parados.length, delta: r0(l.delta) }, destino: "/anuncios/analise",
      });
    }
    // Queda com causa
    else if (l.delta < 0 && base && l.causa !== "sem estoque" && CAUSA_PARA_GATILHO[l.causa]) {
      const [id, nome, destino] = CAUSA_PARA_GATILHO[l.causa];
      g.push({
        id, nome, slide: id === "G08" ? "S5" : "S3", impacto: -l.delta, ...doItem(l),
        // Zerou: "conversão −100%" não diz nada; o que diz é se ainda tinha gente vendo.
        texto: l.agora.unidades === 0
          ? `vendia ${l.antes.unidades} un. (${brl(l.antes.receita)}), não vendeu nenhuma` + (l.agora.visitas ? ` · ${l.agora.visitas.toLocaleString("pt-BR")} visitas sem compra (${p0(vVis)})` : " · sem visitas registradas") +
            (l.antes.precoVitrine && l.agora.precoVitrine ? ` · vitrine ${p0(pct(l.agora.precoVitrine, l.antes.precoVitrine))}` : "")
          : `${brl(l.antes.receita)} → ${brl(l.agora.receita)} · visitas ${p0(vVis)} · conversão ${p0(vConv)}` +
          (l.antes.precoVitrine && l.agora.precoVitrine ? ` · vitrine ${p0(pct(l.agora.precoVitrine, l.antes.precoVitrine))}` : ""),
        numeros: { delta: r0(l.delta), varVisitas: vVis, varConversao: vConv, causa: l.causa },
        destino, hipotese: id === "G08" || undefined,
      });
    }

    // Ruptura no período (curva A/B que vendia)
    if (l.diasSemEstoque > 0 && l.curva !== "C" && l.antes.unidades > 0) {
      const porDia = l.antes.receita / Math.max(1, e.diasAnterior);
      const perdida = porDia * l.diasSemEstoque;
      if (perdida >= CORTES.perdaMinima) g.push({
        id: "G10", nome: "Ruptura", slide: "S7", impacto: perdida, ...doItem(l),
        texto: `${l.diasSemEstoque} dia(s) sem estoque · ~${brl(perdida)} de venda perdida (estimativa pelo ritmo anterior)`,
        numeros: { diasSemEstoque: l.diasSemEstoque, vendaPerdidaEstimada: r0(perdida) }, destino: "/integracoes/estoques",
      });
    }

    // Ruptura iminente
    const ritmo = l.agora.unidades / Math.max(1, e.dias);
    if (
      l.curva !== "C" && !l.sobEncomenda && l.estoqueAtual != null && l.estoqueAtual > 0 &&
      l.estoqueAtual < CORTES.estoqueSemControle && ritmo > 0 && l.estoqueAtual / ritmo < CORTES.coberturaDias
    ) {
      const cobertura = l.estoqueAtual / ritmo;
      g.push({
        id: "G11", nome: "Ruptura iminente", slide: "S7", impacto: (l.agora.receita / Math.max(1, e.dias)) * (CORTES.coberturaDias - cobertura), ...doItem(l),
        texto: `${l.estoqueAtual} un. no anúncio · vende ${ritmo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia · acaba em ~${Math.max(0, Math.floor(cobertura))} dia(s)`,
        numeros: { estoque: l.estoqueAtual, ritmoDia: Math.round(ritmo * 10) / 10, coberturaDias: Math.round(cobertura * 10) / 10 }, destino: "/integracoes/estoques",
      });
    }

    // Perdeu catálogo
    if (l.catalogo && l.catalogo.antes.dias >= CORTES.catalogoDiasMinimos && l.catalogo.agora.dias >= CORTES.catalogoDiasMinimos) {
      const ra = l.catalogo.antes.ganhando / l.catalogo.antes.dias;
      const rg = l.catalogo.agora.ganhando / l.catalogo.agora.dias;
      if (ra - rg >= CORTES.catalogoQueda) {
        g.push({
          id: "G13", nome: "Perdeu catálogo", slide: "S6", impacto: Math.max(0, -l.delta) || l.antes.receita * (ra - rg), ...doItem(l),
          texto: `Ganhava ${l.catalogo.antes.ganhando}/${l.catalogo.antes.dias} dias, agora ${l.catalogo.agora.ganhando}/${l.catalogo.agora.dias}`,
          numeros: { antes: ra, agora: rg }, destino: "/anuncios/catalogo",
        });
      }
    }

    // Convite que resolve: queda por preço/conversão e há convite abaixo do preço atual
    if (l.delta < 0 && base && (l.causa === "preço subiu" || l.causa === "conversão caiu") && l.precoAtual) {
      const melhor = (convitesPorSku.get(l.sku.toUpperCase()) ?? []).filter((c) => c.preco <= l.precoAtual! * (1 - CORTES.conviteDesconto / 100)).sort((a, b) => a.preco - b.preco)[0];
      if (melhor) {
        g.push({
          id: "G18", nome: "Convite que resolve", slide: "S5", impacto: -l.delta, ...doItem(l),
          texto: `Convite ${melhor.tipo} "${melhor.promocao}" a ${brl(melhor.preco)} (hoje ${brl(l.precoAtual)})${melhor.fim ? ` até ${dm(melhor.fim)}` : ""} · piso não conferido`,
          numeros: { precoConvite: melhor.preco, precoAtual: l.precoAtual, mlb: melhor.mlb }, destino: "/automacoes", hipotese: true,
        });
      }
    }

    // Alta
    if (l.delta > 0 && base && l.curva !== "C") {
      g.push({
        id: "G29", nome: "Puxou para cima", slide: "S4", impacto: l.delta, ...doItem(l),
        texto: `${brl(l.antes.receita)} → ${brl(l.agora.receita)} · visitas ${p0(vVis)} · conversão ${p0(vConv)}`,
        numeros: { delta: r0(l.delta) }, destino: "/vendas/skus",
      });
    }
  }

  /* S9 — mídia (a classificação já vem pela mediana e por família) */
  const MIDIA: Record<string, [string, string]> = { entrar: ["G14", "Potencial escondido"], desligar: ["G16", "Mídia sem retorno"], escalar: ["G17", "Mídia escalável"] };
  for (const m of e.midia) {
    const x = MIDIA[m.acao];
    if (!x || (m.acao === "desligar" && m.investimento < CORTES.midiaMinima)) continue;
    g.push({
      id: x[0], nome: x[1], slide: x[0] === "G14" ? "S4" : "S9", impacto: m.acao === "desligar" ? m.investimento : m.receitaReal,
      item: { codigo: m.mlb, sku: m.sku, titulo: m.titulo }, texto: m.motivo,
      numeros: { investimento: r0(m.investimento), receita: r0(m.receitaReal), conversao: m.conversao, visitas: m.visitas }, destino: "/anuncios/trafego-pago",
    });
  }

  /* S8 — promoções cuja janela medida cruza o período */
  for (const p of e.promocoes) {
    const fimJanela = somar(p.processadaEm.slice(0, 10), Math.max(0, p.dias - 1));
    if (p.processadaEm.slice(0, 10) > e.ate || fimJanela < e.de) continue;
    if (!["deu certo", "neutra", "não deu certo"].includes(p.veredito)) continue;
    if (p.receitaParticipantes.antes < CORTES.basePromocao) continue;
    if (p.efeito != null && Math.abs(p.efeito) > CORTES.efeitoMaximo) continue;
    const certo = p.veredito === "deu certo";
    g.push({
      id: certo ? "G19" : "G20", nome: certo ? "Promoção deu certo" : "Promoção sem efeito", slide: "S8",
      // O que se atribui à promoção: o efeito (p.p. acima ou abaixo do controle) sobre a receita de antes.
      impacto: Math.abs(((p.efeito ?? 0) / 100) * p.receitaParticipantes.antes),
      texto: `${p.nome}${p.tipo ? ` (${p.tipo})` : ""} · ${p.participam} anúncios entraram · ${p.efeito == null ? p.veredito : `cresceram ${Math.abs(Math.round(p.efeito))} pontos ${p.efeito > 0 ? "acima" : "abaixo"} de quem ficou de fora`}`,
      numeros: { efeito: p.efeito, crescimento: p.crescimento, desde: p.processadaEm.slice(0, 10), dias: p.dias }, destino: "/planejamento/resultados",
    });
  }

  /* S11 — reputação: nível que caiu, ou taxa que subiu 50% e passou de 1% */
  const NIVEL: Record<string, string> = { "5_green": "verde", "4_light_green": "verde-claro", "3_yellow": "amarelo", "2_orange": "laranja", "1_red": "vermelho" };
  const nivelNum = (n: string | null) => (n ? Number(n.split("_")[0]) || null : null);
  for (const c of e.reputacao ?? []) {
    if (!c.agora) continue;
    const motivos: string[] = [];
    const na = nivelNum(c.antes?.nivel ?? null), ng = nivelNum(c.agora.nivel);
    if (na != null && ng != null && ng < na) motivos.push(`nível ${NIVEL[c.antes!.nivel!] ?? c.antes!.nivel} → ${NIVEL[c.agora.nivel!] ?? c.agora.nivel}`);
    for (const [k, rot] of [["reclamacoes", "reclamações"], ["cancelamentos", "cancelamentos"], ["atrasos", "atrasos"]] as const) {
      const a = c.antes?.[k] ?? null, b = c.agora[k];
      if (b != null && b >= CORTES.reputacaoPiso && (a == null || a === 0 || b >= a * CORTES.reputacaoAlta)) {
        motivos.push(`${rot} ${a == null ? "—" : (a * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%"} → ${(b * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
      }
    }
    if (motivos.length) {
      g.push({ id: "G24", nome: "Reputação em risco", slide: "S11", impacto: 5e6, texto: `${c.conta}: ${motivos.join(" · ")}`, numeros: { conta: c.conta }, destino: "/mercado-livre" });
    }
  }

  /* S11 — cancelamento: taxa que dobrou e subiu pelo menos 1 p.p. */
  if (e.cancelamentos) {
    const tx = (c: CancelamentoQ) => (c.receita + c.cancelado > 0 ? c.cancelado / (c.receita + c.cancelado) : 0);
    const a = tx(e.cancelamentos.antes), b = tx(e.cancelamentos.agora);
    if (b >= 2 * a && b - a >= 0.01) {
      g.push({
        id: "G25", nome: "Cancelamento alto", slide: "S11", impacto: e.cancelamentos.agora.cancelado,
        texto: `${(a * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% → ${(b * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da receita · ${brl(e.cancelamentos.agora.cancelado)} em ${e.cancelamentos.agora.pedidosCancelados} pedidos`,
        numeros: { antes: a, agora: b }, destino: "/vendas/cancelamentos",
      });
    }
  }

  /* S10 — lucro, só com cobertura de custo suficiente */
  const m = e.margem;
  const cobre = (l: MargemLadoQ) => l.receita > 0 && l.receitaApurada / l.receita >= CORTES.coberturaMargem;
  if (m && cobre(m.agora) && m.agora.margem != null) {
    g.push({
      id: "G30", nome: "Margem do período", slide: "S10", impacto: Math.abs(m.agora.margem),
      texto: `Contribuição ${brl(m.agora.margem)}${m.antes.margem != null && cobre(m.antes) ? ` (antes ${brl(m.antes.margem)})` : ""} · custo conhecido em ${Math.round((m.agora.receitaApurada / m.agora.receita) * 100)}% da receita`,
      numeros: { margem: r0(m.agora.margem), margemAntes: m.antes.margem == null ? null : r0(m.antes.margem), cobertura: m.agora.receitaApurada / m.agora.receita },
      destino: "/financeiro",
    });
    for (const p of m.porSku) {
      if (!cobre(p.agora) || !cobre(p.antes) || p.agora.margem == null || p.antes.margem == null) continue;
      if (p.agora.receita > p.antes.receita && p.antes.margem - p.agora.margem >= CORTES.perdaMinima) {
        g.push({
          id: "G23", nome: "Vendeu mais, sobrou menos", slide: "S10", impacto: p.antes.margem - p.agora.margem,
          item: { codigo: p.sku, sku: p.sku, titulo: p.titulo },
          texto: `Receita ${brl(p.antes.receita)} → ${brl(p.agora.receita)} · contribuição ${brl(p.antes.margem)} → ${brl(p.agora.margem)}`,
          numeros: { margemAntes: r0(p.antes.margem), margem: r0(p.agora.margem) }, destino: "/produtos/precificacao",
        });
      }
    }
  }

  /* S13 — ações do Planejamento que terminaram no período */
  for (const a of e.acoes) {
    if (a.fim < e.de || a.fim > e.ate || a.veredito === "futura") continue;
    g.push({ id: "G26", nome: "Ação terminou", slide: "S13", impacto: 0, texto: `${a.titulo} · ${a.veredito}`, numeros: { efeito: a.efeito }, destino: "/planejamento/resultados" });
  }

  if (e.familias) for (const x of g) if (x.item) x.item.familia = e.familias[x.item.sku.toUpperCase()] ?? null;
  return g.sort((a, b) => b.impacto - a.impacto);
}
