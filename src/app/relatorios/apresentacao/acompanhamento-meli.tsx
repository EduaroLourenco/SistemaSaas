"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, ArrowUpRight } from "lucide-react";
import { money, moneyShort, count, shortDate } from "@/lib/format";
import type { DadosAcompanhamento } from "@/lib/dados/acompanhamento";
import type { Gatilho } from "@/lib/acompanhamento/gatilhos";

/**
 * Apresentação de acompanhamento do Mercado Livre, animada.
 *
 * Cada slide é uma pergunta e anda em PASSOS: o primeiro clique mostra o
 * número, o próximo traz a comparação, o seguinte aponta o porquê, e o
 * último diz onde agir. A faixa de baixo explica o passo em uma linha —
 * no lugar da narração dos vídeos do site.
 *
 * Nada aqui calcula: tudo vem de `gatilhos.ts` e do carregador. Slide sem
 * gatilho não existe, e o "por quê" de preço sai sempre como hipótese.
 */

type Dados = DadosAcompanhamento;
type SlideDef = { id: string; kicker: string; titulo: string; passos: string[]; corpo: (passo: number) => React.ReactNode };

const pctTxt = (v: number | null | undefined, sinal = true) =>
  v == null || !Number.isFinite(v) ? "—" : `${sinal && v > 0 ? "+" : ""}${Math.round(v).toLocaleString("pt-BR")}%`;
const variacao = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? ((a - b) / b) * 100 : null);
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (iso: string) => DIA[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/* ── Peças animadas ─────────────────────────────────────────── */

/** Mostra a partir do passo `n`; antes disso fica invisível (ocupa o lugar, a tela não pula). */
function P({ n, passo, apagar, className, children }: { n: number; passo: number; apagar?: number; className?: string; children: React.ReactNode }) {
  return (
    <div data-passo data-oculto={passo < n ? "1" : "0"} data-apagado={apagar != null && passo >= apagar ? "1" : "0"} className={className}>
      {children}
    </div>
  );
}

/** Número que conta até o valor. Com "reduzir movimento", aparece direto. */
function Contador({ valor, formato = "money" }: { valor: number; formato?: "money" | "count" | "pct" }) {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(valor);
    let id = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setV(valor * (1 - Math.pow(1 - k, 3)));
      if (k < 1) id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [valor]);
  return <>{formato === "money" ? money(v) : formato === "pct" ? pctTxt(v) : count(Math.round(v))}</>;
}

function Delta({ v, inverso }: { v: number | null; inverso?: boolean }) {
  if (v == null) return <span className="text-ink-3">sem base</span>;
  const bom = inverso ? v < 0 : v > 0;
  return <span className={Math.abs(v) < 1 ? "text-ink-3" : bom ? "text-up" : "text-down"}>{pctTxt(v)}</span>;
}

const destinoRotulo: Record<string, string> = {
  "/anuncios/analise": "Abrir análise do anúncio",
  "/anuncios/trafego-pago": "Abrir tráfego pago",
  "/anuncios/catalogo": "Abrir catálogo",
  "/produtos/precificacao": "Abrir precificação",
  "/automacoes": "Abrir promoções",
  "/integracoes/estoques": "Abrir estoques",
  "/integracoes": "Abrir integrações",
  "/planejamento/resultados": "Abrir resultados",
  "/vendas/queda": "Abrir Por que caiu",
  "/vendas/skus": "Abrir produtos",
  "/vendas/periodo": "Abrir período",
  "/vendas/dia": "Abrir o dia",
};
function Ir({ g }: { g: Pick<Gatilho, "destino"> }) {
  return (
    <a href={g.destino} className="inline-flex min-h-11 self-start items-center gap-1.5 rounded-r1 border border-brand-edge bg-brand-wash px-3 text-[14px] font-semibold text-brand-2 hover:border-brand">
      {destinoRotulo[g.destino] ?? "Abrir"} <ArrowUpRight className="h-4 w-4" />
    </a>
  );
}

/** Largura real do quadro: o gráfico desenha 1 unidade = 1 pixel, e o texto não encolhe no telefone. */
function useLargura(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(640);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ── Gráfico do período: a linha se desenha, a anterior entra em cinza, os dias com acontecimento acendem ── */
function GraficoPeriodo({ d, passo }: { d: Dados; passo: number }) {
  const [ref, W] = useLargura();
  const H = W < 500 ? 200 : 240, pl = 22, pr = 80, pt = 16, pb = 34;
  const s = d.serie;
  const max = Math.max(1, ...s.map((x) => Math.max(x.receita ?? 0, x.receitaAnterior ?? 0)));
  const x = (i: number) => pl + (i * (W - pl - pr)) / Math.max(1, s.length - 1);
  const y = (v: number) => pt + (1 - v / max) * (H - pt - pb);
  const linha = (k: "receita" | "receitaAnterior") =>
    s.map((p, i) => (p[k] == null ? null : `${x(i)},${y(p[k]!)}`)).filter(Boolean).join(" L ");
  const ultimo = [...s].reverse().find((p) => p.receita != null);
  const iUlt = ultimo ? s.indexOf(ultimo) : -1;
  const eventosDia = (dia: string) => d.acontecimentos.filter((a) => a.data === dia);
  return (
    <div ref={ref}><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Receita por dia, período atual e anterior">
      <line x1={pl} x2={W - pr} y1={H - pb} y2={H - pb} stroke="var(--line)" />
      {s.map((p, i) => (
        <text key={p.dia} x={x(i)} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--ink-3)">
          {W < 500 ? p.dia.slice(8, 10) : `${diaSemana(p.dia)} ${p.dia.slice(8, 10)}`}
        </text>
      ))}
      {passo >= 1 && (
        <path key="ant" d={`M ${linha("receitaAnterior")}`} fill="none" stroke="var(--line-2)" strokeWidth="2.5" pathLength={1} className="acm-traco" />
      )}
      <path d={`M ${linha("receita")}`} fill="none" stroke="var(--brand)" strokeWidth="3.5" strokeLinejoin="round" pathLength={1} className="acm-traco" />
      {ultimo && (
        <g className="acm-pop" style={{ animationDelay: "1.2s" }}>
          <circle cx={x(iUlt)} cy={y(ultimo.receita!)} r="5" fill="var(--brand)" />
          <text x={x(iUlt) + 10} y={y(ultimo.receita!) + 4} fontSize="13" fontWeight="700" fill="var(--brand)">{moneyShort(ultimo.receita!)}</text>
        </g>
      )}
      {passo >= 2 &&
        s.map((p, i) => {
          const ev = eventosDia(p.dia);
          if (!ev.length) return null;
          return (
            <g key={`ev${p.dia}`} className="acm-pop" style={{ animationDelay: `${i * 0.08}s` }}>
              <line x1={x(i)} x2={x(i)} y1={pt} y2={H - pb} stroke="var(--warn)" strokeOpacity=".35" />
              <circle cx={x(i)} cy={H - pb} r="9" fill="var(--warn-wash)" stroke="var(--warn)" />
              <text x={x(i)} y={H - pb + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--warn)">{ev.length}</text>
            </g>
          );
        })}
    </svg></div>
  );
}

/* ── Cascata: de onde veio a diferença (visitas × conversão × preço, a conta sem resto do queda.ts) ── */
function Cascata({ g }: { g: Gatilho }) {
  const a = g.lados!.antes.receita, b = g.lados!.agora.receita, e = g.efeito!;
  const fatores = (
    [
      ["Visitas", e.visitas],
      ["Conversão", e.conversao],
      ["Unidades", e.visitas == null && e.conversao == null ? e.unidades : null],
      ["Preço", e.preco],
    ] as [string, number | null][]
  ).filter((f): f is [string, number] => f[1] != null && Math.abs(f[1]) >= 0.5);
  let corrente = a;
  const linhas: { rotulo: string; de: number; ate: number; tipo: "base" | "up" | "down" | "fim" }[] = [{ rotulo: "Antes", de: 0, ate: a, tipo: "base" }];
  for (const [rotulo, v] of fatores) {
    linhas.push({ rotulo, de: corrente, ate: corrente + v, tipo: v < 0 ? "down" : "up" });
    corrente += v;
  }
  linhas.push({ rotulo: "Agora", de: 0, ate: b, tipo: "fim" });
  const max = Math.max(1, ...linhas.map((l) => Math.max(l.de, l.ate)));
  const pior = fatores.length ? fatores.reduce((m, f) => (f[1] < m[1] ? f : m)) : null;
  return (
    <div className="flex flex-col gap-2">
      {linhas.map((l, i) => {
        const esq = (Math.min(l.de, l.ate) / max) * 100, larg = (Math.abs(l.ate - l.de) / max) * 100;
        const cor = l.tipo === "base" ? "var(--line-2)" : l.tipo === "fim" ? "var(--brand)" : l.tipo === "down" ? "var(--down)" : "var(--up)";
        const destaque = pior && l.rotulo === pior[0];
        return (
          <div key={l.rotulo} className="grid grid-cols-[92px_1fr_auto] items-center gap-3 acm-sobe" style={{ animationDelay: `${i * 0.35}s` }}>
            <span className={`text-[14px] ${destaque ? "font-bold text-ink" : "text-ink-2"}`}>{l.rotulo}</span>
            <div className="relative h-7 rounded-[6px] bg-panel-2">
              <div className="absolute inset-y-0 rounded-[6px] acm-cresce-x" style={{ left: `${esq}%`, width: `${Math.max(larg, 0.6)}%`, background: cor, animationDelay: `${i * 0.35 + 0.1}s`, outline: destaque ? "2px solid var(--ink)" : undefined, outlineOffset: 2 }} />
            </div>
            <span className={`num text-[14px] font-semibold ${l.tipo === "down" ? "text-down" : l.tipo === "up" ? "text-up" : "text-ink"}`}>
              {l.tipo === "base" || l.tipo === "fim" ? money(l.ate) : `${l.ate - l.de > 0 ? "+" : "−"}${money(Math.abs(l.ate - l.de))}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Histórico do produto: barras por dia, o período atual na cor; o preço num gráfico próprio (nunca dois eixos) ── */
function Historico({ dias, de, eventos }: { dias: NonNullable<Dados["historicos"][string]>; de: string; eventos: Dados["acontecimentos"] }) {
  const [ref, W] = useLargura();
  if (!dias.length) return <p className="text-[14px] text-ink-3">sem histórico diário</p>;
  const H = 150, pb = 22;
  const max = Math.max(1, ...dias.map((x) => x.receita));
  const bw = W / dias.length;
  const precos = dias.map((x) => x.precoVitrine ?? x.precoVendido);
  const pv = precos.filter((p): p is number => p != null);
  const pMin = Math.min(...pv), pMax = Math.max(...pv);
  const yP = (p: number) => (pMax === pMin ? 30 : 8 + (1 - (p - pMin) / (pMax - pMin)) * 44);
  const iDiv = dias.findIndex((x) => x.data >= de);
  const pts = precos.map((p, i) => (p == null ? null : `${i * bw + bw / 2},${yP(p)}`)).filter(Boolean);
  return (
    <div ref={ref} className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Receita do produto por dia">
        {dias.map((x, i) => {
          const h = (x.receita / max) * (H - pb - 8);
          return (
            <g key={x.data}>
              <rect x={i * bw + 3} y={H - pb - h} width={bw - 6} height={Math.max(h, x.receita ? 2 : 0)} rx="3" fill={x.data >= de ? "var(--brand)" : "var(--line-2)"} className="acm-cresce-y" style={{ animationDelay: `${i * 0.06}s` }} />
              {x.estoque === 0 && <circle cx={i * bw + bw / 2} cy={H - pb - 5} r="4" fill="var(--down)"><title>sem estoque</title></circle>}
              <text x={i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{x.data.slice(8, 10)}</text>
            </g>
          );
        })}
        {iDiv > 0 && <line x1={iDiv * bw} x2={iDiv * bw} y1="0" y2={H - pb} stroke="var(--ink-3)" strokeWidth="1" />}
      </svg>
      {dias.some((x) => x.estoque === 0) && <span className="text-[12px] text-down">● dia sem estoque</span>}
      {pv.length > 1 && (
        <>
          <span className="label">Preço anunciado · {money(pMin)} a {money(pMax)}</span>
          <svg viewBox={`0 0 ${W} 60`} width={W} height={60} className="block max-w-full" role="img" aria-label="Preço anunciado por dia">
            <path d={`M ${pts.join(" L ")}`} fill="none" stroke="var(--ink-2)" strokeWidth="2.5" pathLength={1} className="acm-traco" style={{ animationDelay: ".6s" }} />
            {dias.map((x, i) => {
              const ev = eventos.find((e) => e.data === x.data && e.tipo === "preco");
              const p = precos[i];
              return ev && p != null ? <circle key={x.data} cx={i * bw + bw / 2} cy={yP(p)} r="6" fill={ev.tom === "down" ? "var(--down)" : "var(--up)"} className="acm-pop" style={{ animationDelay: `${1.2 + i * 0.05}s` }} /> : null;
            })}
          </svg>
        </>
      )}
    </div>
  );
}

/* ── Linha do tempo das promoções ── */
function Gantt({ d, passo }: { d: Dados; passo: number }) {
  const ini = d.deAnterior, fim = d.ate;
  const total = (Date.parse(fim) - Date.parse(ini)) / 864e5 + 1;
  const pos = (iso: string) => Math.min(100, Math.max(0, (((Date.parse(iso) - Date.parse(ini)) / 864e5) / total) * 100));
  const div = pos(d.de);
  const lista = [...d.promocoes].sort((a, b) => (b.efeito != null ? 1 : 0) - (a.efeito != null ? 1 : 0) || b.participam - a.participam).slice(0, 8);
  const tom = (v: string) => (v === "deu certo" ? "text-up bg-up-wash" : v === "não deu certo" ? "text-down bg-down-wash" : "text-ink-2 bg-panel-3");
  return (
    <div className="flex flex-col gap-2">
      <div className="relative ml-0 h-5 text-[12px] text-ink-3 md:ml-[38%]">
        <span className="absolute left-0">{shortDate(ini)}</span>
        <span className="absolute -translate-x-1/2 font-semibold text-ink" style={{ left: `${div}%` }}>{shortDate(d.de)}</span>
        <span className="absolute right-0">{shortDate(fim)}</span>
      </div>
      {lista.map((p, i) => {
        const a = pos(p.inicio < ini ? ini : p.inicio), b = pos(p.fim > fim ? fim : p.fim);
        return (
          <div key={`${p.nome}${p.inicio}${i}`} className="grid grid-cols-1 gap-1 md:grid-cols-[38%_1fr] md:items-center md:gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 text-[14px] font-semibold text-ink">{p.nome}</span>
              <span className="shrink-0 text-[12px] text-ink-3">{p.tipo ?? "planilha"} · {p.participam}</span>
            </div>
            <div className="relative h-8 rounded-[6px] bg-panel-2">
              <div className="absolute inset-y-0 w-px bg-ink-3" style={{ left: `${div}%` }} />
              <div className="absolute inset-y-1 rounded-[5px] bg-brand acm-cresce-x" style={{ left: `${a}%`, width: `${Math.max(b - a, 1.5)}%`, animationDelay: `${i * 0.15}s`, opacity: 0.85 }} />
              {passo >= 1 && (
                <span className={`absolute right-1 top-1 rounded-[4px] px-1.5 py-0.5 text-[12px] font-semibold acm-pop ${tom(p.veredito)}`} style={{ animationDelay: `${i * 0.12}s` }}>
                  {p.veredito}{p.efeito != null ? ` ${p.efeito > 0 ? "+" : ""}${Math.round(p.efeito)} p.p.` : ""}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Lista de itens com barra proporcional ao R$ ── */
function Ranking({ itens, cor, passo, nDetalhe = 1 }: { itens: Gatilho[]; cor: string; passo: number; nDetalhe?: number }) {
  const max = Math.max(1, ...itens.map((g) => g.impacto));
  return (
    <ol className="flex flex-col gap-3">
      {itens.map((g, i) => (
        <li key={`${g.id}${g.item?.sku}${i}`} className="acm-sobe" style={{ animationDelay: `${i * 0.12}s` }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-[15px] font-semibold text-ink">
              {g.item?.curva && <span className="mr-1.5 rounded-[4px] bg-panel-3 px-1.5 text-[12px] text-ink-2">{g.item.curva}</span>}
              {g.item?.titulo ?? g.nome}
            </span>
            <span className="num shrink-0 text-[15px] font-bold" style={{ color: cor }}>{money(g.impacto)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-panel-2">
            <div className="h-full rounded-full acm-cresce-x" style={{ width: `${(g.impacto / max) * 100}%`, background: cor, animationDelay: `${0.2 + i * 0.12}s` }} />
          </div>
          {passo >= nDetalhe && (
            <p className="mt-1 text-[13px] text-ink-2 acm-sobe">
              <span className="font-semibold text-ink">{g.nome}</span>{g.hipotese ? " (hipótese)" : ""} · {g.texto}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ── Montagem do roteiro a partir dos gatilhos ───────────────── */

const ACAO: Record<string, string> = {
  G06: "Recuperar visitas", G07: "Rever oferta, frete e prazo", G08: "Testar o preço anterior", G09: "Descobrir por que parou",
  G10: "Repor estoque", G11: "Repor antes de acabar", G12: "Reativar o anúncio", G13: "Retomar o catálogo", G14: "Pôr verba",
  G16: "Cortar a mídia", G17: "Subir a verba", G18: "Avaliar o convite", G19: "Repetir a promoção", G20: "Não renovar a promoção",
  G27: "Investigar a queda", G28: "Conferir descontos e mix",
};

export function montarSlides(d: Dados): SlideDef[] {
  const g = d.gatilhos;
  const por = (s: string) => g.filter((x) => x.slide === s);
  // Os números vêm dos pedidos (os mesmos dos gatilhos); a série diária dá só a forma da linha.
  const recA = d.totais.agora.receita, recB = d.totais.antes.receita;
  const visA = d.totais.agora.visitas, visB = d.totais.antes.visitas;
  const vRec = variacao(recA, recB);
  const slides: SlideDef[] = [];
  const periodo = `${dataBr(d.de)} a ${dataBr(d.ate)}`;
  const anterior = `${dataBr(d.deAnterior)} a ${dataBr(d.ateAnterior)}`;
  const n = (k: number) => String(k).padStart(2, "0");

  /* Capa */
  const pontos = g.filter((x) => x.slide !== "S0").length;
  slides.push({
    id: "capa", kicker: "Acompanhamento · Mercado Livre", titulo: periodo,
    passos: [`Comparado com ${anterior}, os mesmos dias da semana.`, `${pontos} pontos para olhar, do maior impacto em R$ ao menor.`],
    corpo: (passo) => (
      <div className="flex flex-col gap-8">
        <div className="acm-sobe">
          <span className="label">Receita no período</span>
          <div className="num text-[44px] font-bold leading-none text-ink md:text-[64px]"><Contador valor={recA} /></div>
          <div className="mt-2 text-[18px]"><Delta v={vRec} /> <span className="text-ink-3">contra {money(recB)}</span></div>
        </div>
        <P n={1} passo={passo} className="flex flex-wrap gap-2">
          {["S3", "S4", "S5", "S6", "S7", "S8", "S9"].map((s, i) => {
            const k = por(s).length;
            if (!k) return null;
            const rot: Record<string, string> = { S3: "quedas", S4: "altas e potencial", S5: "preço", S6: "catálogo", S7: "estoque", S8: "promoções", S9: "mídia" };
            return (
              <span key={s} className="rounded-full border border-line bg-panel px-3 py-1.5 text-[14px] text-ink-2 acm-pop" style={{ animationDelay: `${i * 0.08}s` }}>
                <b className="num text-ink">{k}</b> {rot[s]}
              </span>
            );
          })}
        </P>
      </div>
    ),
  });

  /* Confiança */
  const s0 = por("S0");
  if (s0.length) {
    slides.push({
      id: "confianca", kicker: `${n(slides.length)} · Antes de tudo`, titulo: "Dá para confiar nestes números?",
      passos: ["O que está faltando nos dados deste período."],
      corpo: () => (
        <ul className="flex flex-col gap-3">
          {s0.map((x, i) => (
            <li key={i} className="rounded-r2 border border-warn bg-warn-wash p-4 text-[15px] text-ink acm-sobe" style={{ animationDelay: `${i * 0.2}s` }}>
              {x.texto} <div className="mt-2"><Ir g={x} /></div>
            </li>
          ))}
        </ul>
      ),
    });
  }

  /* Como foi o período */
  if (d.serie.length) {
    const top = [...d.acontecimentos].sort((a, b) => (b.tipo === "campanha" ? 1 : 0) - (a.tipo === "campanha" ? 1 : 0) || Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)).filter((a) => a.data >= d.de).slice(0, 4);
    slides.push({
      id: "periodo", kicker: `${n(slides.length)} · O período`, titulo: vRec == null ? "Como foi o período?" : vRec < 0 ? `Caiu ${pctTxt(Math.abs(vRec), false)}. Em que dia?` : `Subiu ${pctTxt(vRec, false)}. Em que dia?`,
      passos: [
        "A linha roxa é a receita de cada dia deste período.",
        "A cinza é a semana anterior, no mesmo dia da semana.",
        top.length ? "Os pontos amarelos marcam dias em que algo mudou: preço, campanha ou estoque." : "Nenhum acontecimento registrado nos dias do período.",
      ],
      corpo: (passo) => (
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px]">
              <span><b className="num text-ink">{money(recA)}</b> <Delta v={vRec} /></span>
              <span className="text-ink-3">visitas <Delta v={variacao(visA, visB)} /></span>
            </div>
            <GraficoPeriodo d={d} passo={passo} />
          </div>
          <P n={2} passo={passo} className="flex flex-col gap-2">
            {top.map((a, i) => (
              <div key={i} className="rounded-r1 border-l-4 bg-panel-2 px-3 py-2 text-[13px] text-ink acm-sobe" style={{ borderColor: a.tom === "down" ? "var(--down)" : a.tom === "up" ? "var(--up)" : "var(--line-2)", animationDelay: `${i * 0.15}s` }}>
                <span className="font-semibold">{diaSemana(a.data)} {shortDate(a.data)}</span> · {a.texto}
              </div>
            ))}
          </P>
        </div>
      ),
    });
  }

  /* O que puxou para baixo */
  const quedas = [...por("S3"), ...por("S5").filter((x) => x.id === "G08")].filter((x) => x.item).sort((a, b) => b.impacto - a.impacto);
  if (quedas.length) {
    slides.push({
      id: "quedas", kicker: `${n(slides.length)} · Quedas`, titulo: "O que puxou para baixo?",
      passos: ["Os produtos que mais perderam receita, em R$.", "O sinal principal de cada um, tirado dos números."],
      corpo: (passo) => <Ranking itens={quedas.slice(0, 5)} cor="var(--down)" passo={passo} />,
    });
  }

  /* Por que caiu: um slide por produto (até 3) — o histórico e o porquê */
  for (const q of quedas.filter((x) => x.lados && x.efeito).slice(0, 3)) {
    const sku = q.item!.sku;
    const vis = variacao(q.lados!.agora.visitas, q.lados!.antes.visitas);
    const conv = variacao(q.lados!.agora.conversao, q.lados!.antes.conversao);
    const eventos = d.acontecimentos.filter((a) => a.sku?.toUpperCase() === sku.toUpperCase());
    slides.push({
      id: `porque-${sku}`, kicker: `${n(slides.length)} · Por que caiu`, titulo: q.item!.titulo,
      passos: [
        `${money(q.lados!.antes.receita)} → ${money(q.lados!.agora.receita)}: a diferença repartida entre visitas, conversão e preço.`,
        "O dia a dia: cinza é o período anterior, roxo o atual. Embaixo, o preço anunciado.",
        `Sinal principal: ${q.nome.toLowerCase()}${q.hipotese ? " — hipótese, coincidência de datas não prova causa" : ""}.`,
      ],
      corpo: (passo) => (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 text-[13px]">
              <span className="rounded-full bg-panel-3 px-2.5 py-1">{sku}</span>
              {q.item!.curva && <span className="rounded-full bg-panel-3 px-2.5 py-1">curva {q.item!.curva}</span>}
              <span className="rounded-full bg-panel-3 px-2.5 py-1">visitas <Delta v={vis} /></span>
              <span className="rounded-full bg-panel-3 px-2.5 py-1">conversão <Delta v={conv} /></span>
            </div>
            <Cascata g={q} />
          </div>
          <div className="flex flex-col gap-4">
            <P n={1} passo={passo}>
              {passo >= 1 && <Historico dias={d.historicos[sku] ?? []} de={d.de} eventos={eventos} />}
            </P>
            <P n={2} passo={passo} className="rounded-r2 border border-line bg-panel-2 p-4">
              <div className="text-[15px] font-semibold text-ink">{q.nome}{q.hipotese ? " · hipótese" : ""}</div>
              <p className="mt-1 text-[14px] text-ink-2">{q.texto}</p>
              <div className="mt-3"><Ir g={q} /></div>
            </P>
          </div>
        </div>
      ),
    });
  }

  /* Altas e potencial */
  const altas = por("S4").filter((x) => x.id === "G29");
  const potencial = por("S4").filter((x) => x.id === "G14");
  if (altas.length || potencial.length) {
    slides.push({
      id: "altas", kicker: `${n(slides.length)} · O que funcionou`, titulo: "O que puxou para cima, e o que pode vender mais?",
      passos: ["Os produtos que mais ganharam receita.", "Potencial escondido: convertem bem acima da mediana, mas recebem poucas visitas."],
      corpo: (passo) => (
        <div className="grid gap-6 md:grid-cols-2">
          <div>{altas.length ? <Ranking itens={altas.slice(0, 5)} cor="var(--up)" passo={9} /> : <p className="text-ink-3">nenhuma alta relevante</p>}</div>
          <P n={1} passo={passo} className="flex flex-col gap-3">
            {potencial.slice(0, 5).map((x, i) => (
              <div key={i} className="rounded-r1 border border-line bg-panel p-3 acm-sobe" style={{ animationDelay: `${i * 0.12}s` }}>
                <div className="text-[14px] font-semibold text-ink">{x.item?.titulo}</div>
                <div className="text-[13px] text-ink-2">{x.texto}</div>
              </div>
            ))}
            {potencial[0] && <Ir g={potencial[0]} />}
          </P>
        </div>
      ),
    });
  }

  /* Preço */
  const precos = por("S5").filter((x) => x.lados?.antes.precoVitrine && x.lados?.agora.precoVitrine);
  const convites = por("S5").filter((x) => x.id === "G18");
  if (precos.length || convites.length) {
    const linhas = [...new Map([...precos, ...convites].filter((x) => x.lados).map((x) => [x.item!.sku, x])).values()].slice(0, 5);
    slides.push({
      id: "preco", kicker: `${n(slides.length)} · Preço`, titulo: "O preço mudou. E as vendas?",
      passos: ["O ponto anda do preço anterior para o atual.", "A conversão no mesmo período, ao lado.", convites.length ? "Onde há convite de promoção abaixo do preço de hoje." : "Nenhum convite abaixo do preço de hoje."],
      corpo: (passo) => (
        <div className="flex flex-col gap-4">
          {linhas.map((x, i) => {
            const pa = x.lados!.antes.precoVitrine ?? x.lados!.antes.precoVendido ?? 0;
            const pg = x.lados!.agora.precoVitrine ?? x.lados!.agora.precoVendido ?? 0;
            const conv = convites.find((c) => c.item?.sku === x.item?.sku);
            const pc = conv ? Number(conv.numeros.precoConvite) : null;
            // Escala por linha com folga de 15%: mudança pequena parece pequena.
            const lo = Math.min(pa, pg, pc ?? Infinity) * 0.85, hi = Math.max(pa, pg) * 1.15;
            const p = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
            const vp = variacao(pg, pa);
            return (
              <div key={i} className="grid gap-1 md:grid-cols-[34%_1fr] md:items-center md:gap-4 acm-sobe" style={{ animationDelay: `${i * 0.15}s` }}>
                <span className="text-[14px] font-semibold text-ink">{x.item?.titulo}</span>
                <div>
                  <div className="relative h-6 rounded-full bg-panel-2">
                    <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-2" style={{ left: p(pa) }} />
                    <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand acm-move-x" style={{ ["--de" as string]: p(pa), ["--para" as string]: p(pg), animationDelay: `${0.3 + i * 0.15}s` } as React.CSSProperties} />
                    {passo >= 2 && pc != null && <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-up bg-up-wash acm-pop" style={{ left: p(pc) }} />}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-ink-2">
                    <span className="num">{money(pa)} → <b className="text-ink">{money(pg)}</b> {Math.abs(vp ?? 0) < 1 ? "· preço igual" : <Delta v={vp} inverso />}</span>
                    {passo >= 1 && <span className="acm-sobe">conversão <Delta v={variacao(x.lados!.agora.conversao, x.lados!.antes.conversao)} /></span>}
                    {passo >= 2 && pc != null && <span className="text-up acm-sobe">convite {money(pc)} ({pctTxt(variacao(pc, pg))})</span>}
                  </div>
                </div>
              </div>
            );
          })}
          <P n={2} passo={passo}>{convites[0] ? <Ir g={convites[0]} /> : null}</P>
        </div>
      ),
    });
  }

  /* Catálogo */
  const cat = por("S6");
  if (cat.length) {
    slides.push({
      id: "catalogo", kicker: `${n(slides.length)} · Vitrine`, titulo: "Perdeu o catálogo?",
      passos: ["Fatia dos dias em que o anúncio ganhava o catálogo: antes e agora."],
      corpo: () => (
        <div className="flex flex-col gap-4">
          {cat.slice(0, 6).map((x, i) => {
            const a = Number(x.numeros.antes), b = Number(x.numeros.agora);
            return (
              <div key={i} className="acm-sobe" style={{ animationDelay: `${i * 0.12}s` }}>
                <div className="flex justify-between gap-3 text-[14px]"><span className="font-semibold text-ink">{x.item?.titulo}</span><span className="num text-down">{Math.round(a * 100)}% → {Math.round(b * 100)}%</span></div>
                <div className="relative mt-1 h-3 rounded-full bg-panel-2">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-brand acm-esvazia" style={{ width: `${a * 100}%`, ["--fica" as string]: String(a ? b / a : 0), animationDelay: `${0.3 + i * 0.12}s` } as React.CSSProperties} />
                </div>
              </div>
            );
          })}
          <Ir g={cat[0]} />
        </div>
      ),
    });
  }

  /* Estoque */
  const est = por("S7");
  if (est.length) {
    slides.push({
      id: "estoque", kicker: `${n(slides.length)} · Estoque`, titulo: "Faltou produto, ou vai faltar?",
      passos: ["Rupturas no período e o que deve acabar nos próximos 7 dias, no ritmo atual."],
      corpo: () => (
        <div className="flex flex-col gap-4">
          {est.slice(0, 6).map((x, i) => {
            const cob = x.id === "G11" ? Number(x.numeros.coberturaDias) : 0;
            return (
              <div key={i} className="rounded-r2 border border-line bg-panel p-4 acm-sobe" style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="flex flex-wrap justify-between gap-2"><span className="text-[15px] font-semibold text-ink">{x.item?.titulo}</span><span className={`text-[13px] font-semibold ${x.id === "G10" ? "text-down" : "text-warn"}`}>{x.nome}</span></div>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }, (_, k) => {
                    const vazio = x.id === "G10" ? k < Number(x.numeros.diasSemEstoque) : k >= Math.floor(cob);
                    return <span key={k} className={`h-6 rounded-[4px] acm-pop ${vazio ? "bg-down-wash border border-down" : "bg-up-wash"}`} style={{ animationDelay: `${0.3 + k * 0.08 + i * 0.15}s` }} />;
                  })}
                </div>
                <p className="mt-2 text-[13px] text-ink-2">{x.texto}</p>
              </div>
            );
          })}
          <Ir g={est[0]} />
        </div>
      ),
    });
  }

  /* Promoções */
  if (d.promocoes.length) {
    const certo = d.promocoes.filter((p) => p.veredito === "deu certo").length;
    const errado = d.promocoes.filter((p) => p.veredito === "não deu certo").length;
    slides.push({
      id: "promocoes", kicker: `${n(slides.length)} · Promoções`, titulo: "As promoções funcionaram?",
      passos: [
        "Cada barra é o tempo medido de uma promoção. A linha marca o início deste período.",
        `Quem entrou contra quem ficou de fora, nas mesmas datas: ${certo} deram certo, ${errado} não.`,
      ],
      corpo: (passo) => (
        <div className="flex flex-col gap-4">
          <Gantt d={d} passo={passo} />
          <P n={1} passo={passo}><Ir g={{ destino: "/planejamento/resultados" }} /></P>
        </div>
      ),
    });
  }

  /* Mídia */
  const midia = por("S9");
  if (midia.length) {
    const cortar = midia.filter((x) => x.id === "G16"), subir = midia.filter((x) => x.id === "G17");
    slides.push({
      id: "midia", kicker: `${n(slides.length)} · Mídia`, titulo: "A mídia pagou?",
      passos: ["Onde a verba sobra depois da margem: dá para subir.", "Onde gastou sem vender: confira antes de cortar (catálogo e família vendem juntos)."],
      corpo: (passo) => (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <span className="label text-up">Subir verba</span>
            {subir.length ? subir.slice(0, 4).map((x, i) => <div key={i} className="rounded-r1 border border-line bg-panel p-3 acm-sobe" style={{ animationDelay: `${i * 0.12}s` }}><div className="text-[14px] font-semibold">{x.item?.titulo}</div><div className="text-[13px] text-ink-2">{x.texto}</div></div>) : <p className="text-[14px] text-ink-3">nenhum anúncio com folga clara</p>}
          </div>
          <P n={1} passo={passo} className="flex flex-col gap-3">
            <span className="label text-down">Gastou sem vender</span>
            {cortar.slice(0, 4).map((x, i) => <div key={i} className="rounded-r1 border border-line bg-panel p-3 acm-sobe" style={{ animationDelay: `${i * 0.12}s` }}><div className="text-[14px] font-semibold">{x.item?.titulo}</div><div className="text-[13px] text-ink-2">{x.texto}</div></div>)}
            <Ir g={midia[0]} />
          </P>
        </div>
      ),
    });
  }

  /* O que fazer agora: uma ação por produto, a de maior impacto */
  const vistos = new Set<string>();
  const candidatas = g
    .filter((x) => ACAO[x.id])
    .filter((x) => {
      const k = x.item?.sku ?? x.texto;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    ;
  // Produto primeiro (até 5): é onde se age; promoção e regra geral entram no máximo duas.
  const acoes = [...candidatas.filter((x) => x.item).slice(0, 5), ...candidatas.filter((x) => !x.item).slice(0, 2)];
  const feitas = por("S13");
  if (acoes.length || feitas.length) {
    slides.push({
      id: "agora", kicker: `${n(slides.length)} · Próximos passos`, titulo: "O que fazer agora?",
      passos: ["Uma ação por produto, do maior valor em jogo ao menor. Cada uma abre a tela onde se resolve."],
      corpo: () => (
        <ol className="flex flex-col gap-2">
          {acoes.map((x, i) => (
            <li key={i} className="grid grid-cols-[28px_1fr] items-start gap-3 rounded-r1 border border-line bg-panel p-3 acm-sobe md:grid-cols-[28px_1fr_auto] md:items-center" style={{ animationDelay: `${i * 0.18}s` }}>
              <span className="num flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-brand-ink acm-pop" style={{ animationDelay: `${i * 0.18 + 0.1}s` }}>{i + 1}</span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-ink">{ACAO[x.id]}{x.item ? ` · ${x.item.titulo}` : ""}</div>
                <div className="text-[13px] text-ink-2">{x.texto}{x.hipotese ? " (hipótese)" : ""}</div>
              </div>
              <div className="col-start-2 md:col-start-auto"><Ir g={x} /></div>
            </li>
          ))}
          {feitas.map((x, i) => <li key={`f${i}`} className="text-[13px] text-ink-2 acm-sobe">Ação do planejamento: {x.texto}</li>)}
        </ol>
      ),
    });
  }

  return slides;
}

/* ── O palco ─────────────────────────────────────────────────── */

export default function DeckAcompanhamento({ dados }: { dados: Dados }) {
  const slides = React.useMemo(() => montarSlides(dados), [dados]);
  const [i, setI] = React.useState(0);
  const [passo, setPasso] = React.useState(0);
  const [cheia, setCheia] = React.useState(false);
  const palco = React.useRef<HTMLDivElement>(null);
  const s = slides[Math.min(i, slides.length - 1)];

  React.useEffect(() => { setI(0); setPasso(0); }, [dados]);

  const avancar = React.useCallback(() => {
    if (!s) return;
    if (passo < s.passos.length - 1) setPasso(passo + 1);
    else if (i < slides.length - 1) { setI(i + 1); setPasso(0); }
  }, [s, passo, i, slides.length]);
  const voltar = React.useCallback(() => {
    if (passo > 0) setPasso(passo - 1);
    else if (i > 0) { setI(i - 1); setPasso(slides[i - 1].passos.length - 1); }
  }, [passo, i, slides]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,select,textarea")) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); avancar(); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); voltar(); }
    };
    const onFs = () => setCheia(document.fullscreenElement === palco.current);
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFs); };
  }, [avancar, voltar]);

  /* Deslizar no telefone. */
  const toque = React.useRef<number | null>(null);

  if (!s) return <p className="p-6 text-ink-3">Sem dados do Mercado Livre neste período.</p>;

  return (
    <div
      ref={palco}
      className={`acm-palco flex flex-col overflow-hidden rounded-r3 border border-line bg-panel ${cheia ? "h-screen rounded-none border-0" : "min-h-[560px] md:min-h-[640px]"}`}
      onPointerDown={(e) => { toque.current = e.clientX; }}
      onPointerUp={(e) => {
        if (toque.current == null) return;
        const dx = e.clientX - toque.current;
        toque.current = null;
        if (Math.abs(dx) > 60) (dx < 0 ? avancar : voltar)();
      }}
    >
      {/* Progresso: um traço por slide, preenchendo conforme os passos. */}
      <div className="flex gap-1 px-4 pt-3 md:px-8">
        {slides.map((x, k) => (
          <button key={x.id} aria-label={`Ir para ${x.titulo}`} onClick={() => { setI(k); setPasso(0); }} className="flex h-6 flex-1 items-center">
            <span className="block h-1 w-full overflow-hidden rounded-full bg-panel-3">
              <span className="block h-full bg-brand transition-[width] duration-500" style={{ width: k < i ? "100%" : k > i ? "0%" : `${((passo + 1) / x.passos.length) * 100}%` }} />
            </span>
          </button>
        ))}
      </div>

      <div key={s.id} className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 pt-3 md:px-8 md:pt-5">
        <div className="acm-sobe">
          <span className="label text-brand">{s.kicker}</span>
          <h2 className="mt-1 text-[24px] font-bold leading-tight text-ink md:text-[34px]">{s.titulo}</h2>
        </div>
        <div className="flex-1">{s.corpo(passo)}</div>
      </div>

      {/* A explicação do passo — o lugar da narração. */}
      <div className="flex items-center gap-3 border-t border-line bg-panel-2 px-4 py-3 md:px-8">
        <button onClick={voltar} disabled={i === 0 && passo === 0} aria-label="Voltar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-panel disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button>
        <p key={`${s.id}-${passo}`} className="min-w-0 flex-1 text-[14px] leading-snug text-ink md:text-[16px] acm-sobe">
          <span className="num mr-2 text-ink-3">{passo + 1}/{s.passos.length}</span>{s.passos[passo]}
        </p>
        <button
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : palco.current?.requestFullscreen?.())}
          aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}
          className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-panel md:flex"
        >
          {cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button onClick={avancar} disabled={i === slides.length - 1 && passo === s.passos.length - 1} aria-label="Avançar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
