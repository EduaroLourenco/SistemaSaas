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
  "/vendas/cancelamentos": "Abrir cancelamentos",
  "/mercado-livre": "Abrir termômetro",
  "/financeiro": "Abrir financeiro",
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

/** Abre a conversa com a pergunta já escrita (a pessoa revisa e envia). */
function PerguntarIA({ pergunta }: { pergunta: string }) {
  return (
    <a href={`/conversa?pergunta=${encodeURIComponent(pergunta)}`} className="inline-flex min-h-11 self-start items-center gap-1.5 rounded-r1 border border-line bg-panel px-3 text-[14px] font-semibold text-ink-2 hover:border-brand">
      Perguntar à IA
    </a>
  );
}

const NIVEL: Record<string, string> = { "5_green": "verde", "4_light_green": "verde-claro", "3_yellow": "amarelo", "2_orange": "laranja", "1_red": "vermelho" };
const nivel = (n: string | null | undefined) => (n ? NIVEL[n] ?? n : "—");
const pctFrac = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/* ── Gráfico do período: a linha se desenha, a anterior entra em cinza, os dias com acontecimento acendem ── */
function GraficoPeriodo({ d, passo, destaque }: { d: Dados; passo: number; destaque?: number }) {
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
      {passo >= 1 && destaque != null && s[destaque] && (
        <g className="acm-pop" style={{ animationDelay: ".6s" }}>
          <rect x={x(destaque) - 14} y={pt} width="28" height={H - pt - pb} rx="6" fill="var(--warn-wash)" />
          <line x1={x(destaque)} x2={x(destaque)} y1={y(s[destaque].receita ?? 0)} y2={y(s[destaque].receitaAnterior ?? 0)} stroke="var(--down)" strokeWidth="3" strokeDasharray="4 3" />
        </g>
      )}
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
const pct1 = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: v < 10 ? 2 : 1, maximumFractionDigits: v < 10 ? 2 : 1 })}%`);
const sinalR = (v: number) => `${v > 0 ? "+" : "−"}${money(Math.abs(v))}`;

/**
 * Antes → agora de cada fator, e quanto ele mexeu na receita.
 * A coluna da direita é a conta sem resto do queda.ts: somada, dá a diferença.
 */
type LadoF = { receita: number; unidades: number; visitas: number | null; conversao: number | null; precoVendido: number | null };
function Fatores({ lados, efeito, rotuloReceita = "Receita", extras = [], total }: { lados: { antes: LadoF; agora: LadoF }; efeito: NonNullable<Gatilho["efeito"]>; rotuloReceita?: string; extras?: { rotulo: string; antes: number; agora: number; ef: number }[]; total?: { antes: number; agora: number } }) {
  const { antes: A, agora: B } = lados;
  const temVisita = A.visitas != null || B.visitas != null || efeito.visitas != null;
  const linhas: { rotulo: string; a: string; b: string; v: number | null; ef: number | null }[] = [
    ...(temVisita ? [
      { rotulo: "Visitas", a: A.visitas == null ? "sem dado" : count(A.visitas), b: B.visitas == null ? "sem dado" : count(B.visitas), v: variacao(B.visitas, A.visitas), ef: efeito.visitas },
      { rotulo: "Conversão", a: pct1(A.conversao), b: pct1(B.conversao), v: variacao(B.conversao, A.conversao), ef: efeito.conversao },
    ] : []),
    // Unidades e visitas × conversão são exclusivas por produto (queda-causa.ts): o efeito aqui é dos que não têm visita.
    { rotulo: "Unidades", a: count(A.unidades), b: count(B.unidades), v: variacao(B.unidades, A.unidades), ef: efeito.unidades },
    { rotulo: "Preço médio pago", a: A.precoVendido == null ? "—" : money(A.precoVendido), b: B.precoVendido == null ? "não vendeu" : money(B.precoVendido), v: variacao(B.precoVendido, A.precoVendido), ef: efeito.preco },
  ];
  const maxEf = Math.max(1, ...linhas.map((l) => Math.abs(l.ef ?? 0)));
  const pior = linhas.reduce<(typeof linhas)[number] | null>((m, l) => (l.ef != null && l.ef < (m?.ef ?? 0) ? l : m), null);
  const th = "pb-1 text-[12px] font-medium text-ink-3";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] border-collapse text-[14px]">
        <thead>
          <tr><th className={`${th} text-left`} /><th className={`${th} text-right`}>Antes</th><th className={`${th} text-right`}>Agora</th><th className={`${th} text-right`}>Var.</th><th className={`${th} text-right`}>Na receita</th></tr>
        </thead>
        <tbody>
          <tr className="border-t border-line">
            <td className="py-2 font-semibold text-ink">{rotuloReceita}</td>
            <td className="num py-2 text-right text-ink-2">{money(A.receita)}</td>
            <td className="num py-2 text-right font-semibold text-ink">{money(B.receita)}</td>
            <td className="py-2 text-right"><Delta v={variacao(B.receita, A.receita)} /></td>
            <td className={`num py-2 text-right font-bold ${B.receita < A.receita ? "text-down" : "text-up"}`}>{sinalR(B.receita - A.receita)}</td>
          </tr>
          {linhas.map((l, i) => (
            <tr key={l.rotulo} className="border-t border-line acm-sobe" style={{ animationDelay: `${(i + 1) * 0.2}s` }}>
              <td className={`py-2 pl-4 ${pior === l ? "font-bold text-ink" : "text-ink-2"}`}>{l.rotulo}</td>
              <td className="num py-2 text-right text-ink-2">{l.a}</td>
              <td className="num py-2 text-right font-semibold text-ink">{l.b}</td>
              <td className="py-2 text-right">{l.v == null ? <span className="text-ink-3">—</span> : <Delta v={l.v} />}</td>
              <td className="py-2 pl-2 text-right">
                {l.ef == null || Math.abs(l.ef) < 0.5 ? <span className="text-ink-3">—</span> : (
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="hidden h-2 w-16 rounded-full bg-panel-2 sm:block"><span className="ml-auto block h-2 rounded-full" style={{ width: `${(Math.abs(l.ef) / maxEf) * 100}%`, background: l.ef < 0 ? "var(--down)" : "var(--up)" }} /></span>
                    <span className={`num font-semibold ${l.ef < 0 ? "text-down" : "text-up"}`}>{sinalR(l.ef)}</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
          {extras.map((x) => (
            <tr key={x.rotulo} className="border-t border-line">
              <td className="py-2 font-semibold text-ink">{x.rotulo}</td>
              <td className="num py-2 text-right text-ink-2">{money(x.antes)}</td>
              <td className="num py-2 text-right font-semibold text-ink">{money(x.agora)}</td>
              <td className="py-2 text-right"><Delta v={variacao(x.agora, x.antes)} /></td>
              <td className={`num py-2 text-right font-bold ${x.ef < 0 ? "text-down" : "text-up"}`}>{sinalR(x.ef)}</td>
            </tr>
          ))}
          {total && (
            <tr className="border-t-2 border-ink">
              <td className="py-2 font-bold text-ink">Total Meli</td>
              <td className="num py-2 text-right text-ink-2">{money(total.antes)}</td>
              <td className="num py-2 text-right font-bold text-ink">{money(total.agora)}</td>
              <td className="py-2 text-right"><Delta v={variacao(total.agora, total.antes)} /></td>
              <td className={`num py-2 text-right font-bold ${total.agora < total.antes ? "text-down" : "text-up"}`}>{sinalR(total.agora - total.antes)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Cascata({ g }: { g: Gatilho }) {
  return <Fatores lados={g.lados!} efeito={g.efeito!} />;
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
  const pMin0 = Math.min(...pv), pMax0 = Math.max(...pv);
  // Faixa mínima de 20% do preço: variação de 3% não pode parecer um tombo.
  const folga = Math.max(0, pMax0 * 0.2 - (pMax0 - pMin0)) / 2;
  const pMin = pMin0 - folga, pMax = pMax0 + folga;
  const yP = (p: number) => (pMax === pMin ? 30 : 8 + (1 - (p - pMin) / (pMax - pMin)) * 44);
  const iDiv = dias.findIndex((x) => x.data >= de);
  const pts = precos.map((p, i) => (p == null ? null : `${i * bw + bw / 2},${yP(p)}`)).filter(Boolean);
  const soma = (f: (x: (typeof dias)[number]) => boolean) => dias.filter(f).reduce((s, x) => ({ r: s.r + x.receita, u: s.u + x.unidades }), { r: 0, u: 0 });
  const sAnt = soma((x) => x.data < de), sAtu = soma((x) => x.data >= de);
  const iP0 = precos.findIndex((p) => p != null);
  const iP1 = precos.length - 1 - [...precos].reverse().findIndex((p) => p != null);
  const rotuloUn = bw >= 18;
  return (
    <div ref={ref} className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
        <span className="text-ink-2">antes <b className="num text-ink">{money(sAnt.r)}</b> · <span className="num">{count(sAnt.u)} un.</span></span>
        <span className="text-ink-2">agora <b className="num text-brand">{money(sAtu.r)}</b> · <span className="num">{count(sAtu.u)} un.</span></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Receita do produto por dia">
        {dias.map((x, i) => {
          const h = (x.receita / max) * (H - pb - 22);
          return (
            <g key={x.data}>
              <rect x={i * bw + 3} y={H - pb - h} width={bw - 6} height={Math.max(h, x.receita ? 2 : 0)} rx="3" fill={x.data >= de ? "var(--brand)" : "var(--line-2)"} className="acm-cresce-y" style={{ animationDelay: `${i * 0.06}s` }} />
              {rotuloUn && x.unidades > 0 && <text x={i * bw + bw / 2} y={H - pb - h - 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink-2)">{x.unidades}</text>}
              {x.estoque === 0 && <circle cx={i * bw + bw / 2} cy={H - pb - 5} r="4" fill="var(--down)"><title>sem estoque</title></circle>}
              <text x={i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{x.data.slice(8, 10)}</text>
            </g>
          );
        })}
        {iDiv > 0 && <line x1={iDiv * bw} x2={iDiv * bw} y1="0" y2={H - pb} stroke="var(--ink-3)" strokeWidth="1" />}
      </svg>
      <span className="text-[12px] text-ink-3">número em cima da barra = unidades{dias.some((x) => x.estoque === 0) && <span className="text-down"> · ● dia sem estoque</span>}</span>
      {pv.length > 1 && (
        <>
          <span className="label">Preço anunciado · {shortDate(dias[iP0].data)} {money(precos[iP0]!)} → {shortDate(dias[iP1].data)} {money(precos[iP1]!)} ({pctTxt(variacao(precos[iP1], precos[iP0]))})</span>
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
              <span className="min-w-0 text-[14px] font-semibold text-ink">{p.nome} <span className="font-normal text-ink-3">{shortDate(p.inicio)}</span></span>
              <span className="shrink-0 text-[12px] text-ink-3">{p.tipo ?? "planilha"} · {p.participam}</span>
            </div>
            <div className="relative h-8 rounded-[6px] bg-panel-2">
              <div className="absolute inset-y-0 w-px bg-ink-3" style={{ left: `${div}%` }} />
              <div className="absolute inset-y-1 rounded-[5px] bg-brand acm-cresce-x" style={{ left: `${a}%`, width: `${Math.max(b - a, 1.5)}%`, animationDelay: `${i * 0.15}s`, opacity: 0.85 }} />
              {passo >= 1 && (
                <span className={`absolute right-1 top-1 rounded-[4px] px-1.5 py-0.5 text-[12px] font-semibold acm-pop ${tom(p.veredito)}`} style={{ animationDelay: `${i * 0.12}s` }}>
                  {p.veredito}{efeitoTxt(p.efeito)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Efeito de promoção em palavras: p.p. sozinho não diz nada a ninguém. */
const efeitoTxt = (e: number | null) =>
  e == null ? "" : Math.abs(e) > 150 ? " · base pequena, não conclua" : ` · ${e > 0 ? "+" : "−"}${Math.abs(Math.round(e))} pts sobre quem ficou de fora`;

type ChaveP = NonNullable<Dados["ponte"]>["partes"][number]["chave"];
const ROTULO_P: Record<ChaveP, string> = { estoque: "Faltou produto ou anúncio parado", zerou: "Pararam de vender", novos: "Passaram a vender", visitas: "Visitas", conversao: "Conversão", unidades: "Unidades (sem dado de visita)", preco: "Preço" };
const FRASE_P: Record<ChaveP, [string, string]> = {
  estoque: ["faltou produto ou o anúncio que vendia parou", "produto voltou ao estoque"],
  zerou: ["produtos que vendiam não venderam nada", "produtos que vendiam não venderam nada"],
  novos: ["produtos que não vendiam passaram a vender", "produtos que não vendiam passaram a vender"],
  visitas: ["menos gente viu os anúncios", "mais gente viu os anúncios"],
  conversao: ["quem viu comprou menos", "quem viu comprou mais"],
  unidades: ["vendeu menos unidades", "vendeu mais unidades"],
  preco: ["vendeu mais barato", "vendeu mais caro"],
};
const fraseP = (p: { chave: ChaveP; valor: number }) => FRASE_P[p.chave][p.valor < 0 ? 0 : 1];

/* ── Ponte: do total de antes ao de agora, parte por parte ── */
function Ponte({ d, passo }: { d: Dados; passo: number }) {
  const pt = d.ponte!;
  const parte = (k: ChaveP) => pt.partes.find((p) => p.chave === k)?.valor ?? null;
  const efeito = { visitas: parte("visitas"), conversao: parte("conversao"), unidades: parte("unidades"), preco: parte("preco") ?? 0 };
  const extras = (["estoque", "zerou", "novos"] as const).flatMap((k) => (pt.grupos[k] && parte(k) ? [{ rotulo: ROTULO_P[k], ...pt.grupos[k]!, ef: parte(k)! }] : []));
  const comTop = pt.partes.filter((p) => p.top.length);
  return (
    <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
      <Fatores lados={pt.seguiram} efeito={efeito} rotuloReceita={`Venderam nos dois (${pt.seguiram.produtos})`} extras={extras} total={{ antes: pt.antes, agora: pt.agora }} />
      <P n={1} passo={passo} className="flex flex-col gap-4">
        {comTop.map((p) => (
          <div key={p.chave}>
            <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1">
              <span className="text-[14px] font-semibold text-ink">{ROTULO_P[p.chave]}</span>
              <span className={`num text-[14px] font-bold ${p.valor < 0 ? "text-down" : "text-up"}`}>{sinalR(p.valor)} · {p.produtos} prod.</span>
            </div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {p.top.map((t) => (
                <li key={t.sku} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 text-ink-2"><span className="text-ink-3">{t.sku}</span> {t.titulo}</span>
                  <span className={`num shrink-0 ${t.valor < 0 ? "text-down" : "text-up"}`}>{sinalR(t.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </P>
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
              {g.item?.familia && <span className="ml-2 text-[12px] font-normal text-ink-3">família {g.item.familia}</span>}
            </span>
            <span className="num shrink-0 text-[15px] font-bold" style={{ color: cor }}>{money(g.impacto)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-panel-2">
            <div className="h-full rounded-full acm-cresce-x" style={{ width: `${(g.impacto / max) * 100}%`, background: cor, animationDelay: `${0.2 + i * 0.12}s` }} />
          </div>
          {passo >= nDetalhe && (
            <p className="mt-1 text-[13px] text-ink-2 acm-sobe">
              <span className="font-semibold text-ink">{g.nome}</span>{g.hipotese ? " (hipótese)" : ""} · {g.texto}
              {g.lados && g.lados.agora.unidades > 0 && <span className="num"> · {g.lados.antes.unidades} → {g.lados.agora.unidades} un.</span>}
              {g.lados && g.impacto > 0 && g.lados.antes.unidades <= 3 && g.lados.agora.unidades < g.lados.antes.unidades && <span className="ml-1 rounded-[4px] bg-panel-3 px-1.5 text-[12px] text-ink-3">poucas vendas: pode ser acaso</span>}
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
  G27: "Investigar a queda", G28: "Conferir descontos e mix", G31: "Reativar ou repor o anúncio que vendia",
  G23: "Rever preço e custo", G24: "Cuidar da reputação", G25: "Ver os cancelamentos",
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
  const caiu = recA < recB;
  const dif = recA - recB;

  /*
   * O dia que mais pesou: se um dia só faz 40% ou mais da diferença, é a
   * primeira coisa a dizer (ex.: a semana anterior teve o 11.11).
   */
  const difs = d.serie.map((p) => (p.receita ?? 0) - (p.receitaAnterior ?? 0));
  const difSerie = difs.reduce((a, b) => a + b, 0);
  const iDia = difs.length ? difs.indexOf(caiu ? Math.min(...difs) : Math.max(...difs)) : -1;
  const parteDia = iDia >= 0 && difSerie ? difs[iDia] / difSerie : 0;
  const diaChave = iDia >= 0 && parteDia >= 0.4 && Math.abs(difSerie) > 0 ? d.serie[iDia] : null;
  const semDia = diaChave
    ? variacao(
        d.serie.reduce((a, p) => a + (p.receita ?? 0), 0) - (diaChave.receita ?? 0),
        d.serie.reduce((a, p) => a + (p.receitaAnterior ?? 0), 0) - (diaChave.receitaAnterior ?? 0)
      )
    : null;
  const maiorParte = d.ponte?.partes.find((p) => (caiu ? p.valor < 0 : p.valor > 0)) ?? null;

  /* Capa */
  const pontos = g.filter((x) => x.slide !== "S0").length;
  slides.push({
    id: "capa", kicker: "Acompanhamento · Mercado Livre", titulo: periodo,
    passos: [
      `Comparado com ${anterior}, os mesmos dias da semana.`,
      diaChave ? `${Math.round(parteDia * 100)}% da diferença está num dia só: ${diaSemana(diaChave.diaAnterior)} ${shortDate(diaChave.diaAnterior)} contra ${diaSemana(diaChave.dia)} ${shortDate(diaChave.dia)}.` : maiorParte ? `O que mais pesou: ${fraseP(maiorParte)}.` : `${pontos} pontos para olhar.`,
      `${pontos} pontos para olhar, do maior impacto em R$ ao menor.`,
    ],
    corpo: (passo) => (
      <div className="flex flex-col gap-8">
        <div className="acm-sobe">
          <span className="label">Receita no período</span>
          <div className="num text-[44px] font-bold leading-none text-ink md:text-[64px]"><Contador valor={recA} /></div>
          <div className="mt-2 text-[18px]"><Delta v={vRec} /> <span className="text-ink-3">contra {money(recB)} · {dif < 0 ? "−" : "+"}{moneyShort(Math.abs(dif))}</span></div>
        </div>
        <P n={1} passo={passo} className="max-w-[720px] text-[20px] font-semibold leading-snug text-ink md:text-[24px]">
          {diaChave ? (
            <>{Math.round(parteDia * 100)}% da {caiu ? "queda" : "alta"} está num dia só: {diaSemana(diaChave.diaAnterior)} {shortDate(diaChave.diaAnterior)} vendeu {moneyShort(diaChave.receitaAnterior ?? 0)}, {diaSemana(diaChave.dia)} {shortDate(diaChave.dia)} vendeu {moneyShort(diaChave.receita ?? 0)}.{semDia != null && <span className="text-ink-2"> Sem esse dia, o período ficou <Delta v={semDia} />.</span>}</>
          ) : maiorParte ? (
            <>O que mais pesou: {fraseP(maiorParte)} ({maiorParte.valor < 0 ? "−" : "+"}{moneyShort(Math.abs(maiorParte.valor))}).</>
          ) : null}
        </P>
        <P n={2} passo={passo} className="flex flex-wrap gap-2">
          {["S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11"].map((s, i) => {
            const k = por(s).length;
            if (!k) return null;
            const rot: Record<string, string> = { S3: "quedas", S4: "altas e potencial", S5: "preço", S6: "catálogo", S7: "estoque", S8: "promoções", S9: "mídia", S10: "lucro", S11: "operação" };
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
    const doDia = diaChave ? d.acontecimentos.filter((a) => a.data === diaChave.dia || a.data === diaChave.diaAnterior).slice(0, 4) : [];
    const top = doDia.length ? doDia : [...d.acontecimentos].sort((a, b) => (b.tipo === "campanha" ? 1 : 0) - (a.tipo === "campanha" ? 1 : 0) || Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)).filter((a) => a.data >= d.de).slice(0, 4);
    slides.push({
      id: "periodo", kicker: `${n(slides.length)} · O período`,
      titulo: diaChave ? `${diaSemana(diaChave.diaAnterior)} ${shortDate(diaChave.diaAnterior)} vendeu ${moneyShort(diaChave.receitaAnterior ?? 0)}; ${diaSemana(diaChave.dia)} ${shortDate(diaChave.dia)}, ${moneyShort(diaChave.receita ?? 0)}` : vRec == null ? "Como foi o período?" : vRec < 0 ? `Caiu ${pctTxt(Math.abs(vRec), false)}, espalhado pelos dias` : `Subiu ${pctTxt(vRec, false)}, espalhado pelos dias`,
      passos: [
        "A linha roxa é a receita de cada dia deste período.",
        diaChave ? `A cinza é a semana anterior. Em ${shortDate(diaChave.diaAnterior)} ela vendeu ${moneyShort(diaChave.receitaAnterior ?? 0)}; em ${shortDate(diaChave.dia)}, ${moneyShort(diaChave.receita ?? 0)}.${semDia != null ? ` Sem esse dia, ${pctTxt(semDia)}.` : ""}` : "A cinza é a semana anterior, no mesmo dia da semana.",
        top.length ? (doDia.length ? "O que aconteceu nesses dois dias." : "Os pontos amarelos marcam dias em que algo mudou: preço, campanha ou estoque.") : "Nenhum acontecimento registrado nos dias do período.",
      ],
      corpo: (passo) => (
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px]">
              <span><b className="num text-ink">{money(recA)}</b> <Delta v={vRec} /></span>
              <span className="text-ink-3">visitas <Delta v={variacao(visA, visB)} /></span>
            </div>
            <GraficoPeriodo d={d} passo={passo} destaque={diaChave ? iDia : undefined} />
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

  /* Para onde foi o dinheiro: a diferença inteira, repartida */
  if (d.ponte && maiorParte) {
    const pt = d.ponte;
    const c = pt.concentracao;
    slides.push({
      id: "ponte", kicker: `${n(slides.length)} · ${caiu ? "Para onde foi" : "De onde veio"}`,
      titulo: `${caiu ? "−" : "+"}${moneyShort(Math.abs(dif))}: ${fraseP(maiorParte)}`,
      passos: [
        "Antes e agora do Meli. A coluna da direita é quanto cada coisa mexeu na receita: somada, dá a diferença.",
        c ? `${c.produtos} produto${c.produtos === 1 ? "" : "s"} faz${c.produtos === 1 ? "" : "em"} 80% da ${caiu ? "queda" : "alta"}, de ${c.de} que ${caiu ? "caíram" : "subiram"}. São os próximos slides.` : "Os produtos vêm a seguir.",
      ],
      corpo: (passo) => <Ponte d={d} passo={passo} />,
    });
  }

  /* O que puxou para baixo */
  const quedas = [...por("S3"), ...por("S5").filter((x) => x.id === "G08")].filter((x) => x.item).sort((a, b) => b.impacto - a.impacto);
  if (quedas.length) {
    slides.push({
      id: "quedas", kicker: `${n(slides.length)} · Quedas`, titulo: `Os ${Math.min(5, quedas.length)} que mais caíram tiraram ${moneyShort(quedas.slice(0, 5).reduce((a, x) => a + x.impacto, 0))}`,
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
              {q.item!.familia && <span className="rounded-full bg-panel-3 px-2.5 py-1">família {q.item!.familia}</span>}
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
              <div className="mt-3 flex flex-wrap gap-2"><Ir g={q} /><PerguntarIA pergunta={`Por que as vendas de ${q.item!.titulo} (${sku}) caíram entre ${dataBr(d.de)} e ${dataBr(d.ate)}? O sinal foi: ${q.texto}`} /></div>
            </P>
          </div>
        </div>
      ),
    });
  }

  /* Preço no canal: tabela, vitrine, vendido, onde vende mais e comissão */
  if (d.precos.length) {
    const comTabela = d.precos.filter((p) => p.tabela && p.vitrineHoje);
    const fora = comTabela.filter((p) => Math.abs((p.vitrineHoje! - p.tabela!.preco) / p.tabela!.preco) > 0.02).length;
    slides.push({
      id: "preco-canal", kicker: `${n(slides.length)} · Preço no canal`, titulo: comTabela.length ? (fora ? `${fora} de ${comTabela.length} produtos com preço fora da tabela` : "O preço do Meli está igual à tabela") : "A que preço vende mais?",
      passos: [
        comTabela.length ? `A tabela (Fórmula base) contra a vitrine de hoje no Meli: ${fora} de ${comTabela.length} fora da tabela.` : "Sem Fórmula base para estes produtos: só a vitrine do Meli.",
        "O que o cliente pagou, antes e agora, e quantas unidades.",
        "Onde vende mais: o preço com mais unidades nestes dias e na melhor semana da história. Ao lado, a comissão.",
      ],
      corpo: (passo) => (
        <div className="grid gap-4 md:grid-cols-2">
          {d.precos.slice(0, 6).map((p, i) => {
            const difTab = p.tabela && p.vitrineHoje ? (p.vitrineHoje - p.tabela.preco) / p.tabela.preco : null;
            const vals = [p.tabela?.preco, p.vitrineHoje, p.vendidoAgora, p.maisVendeu?.preco, p.pico?.preco].filter((v): v is number => v != null && v > 0);
            const lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.05;
            const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
            const marca = (v: number | null | undefined, cor: string, n0: number, atraso: number) =>
              v != null && passo >= n0 ? <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel acm-pop" style={{ left: pos(v), background: cor, animationDelay: `${atraso}s` }} /> : null;
            const cel = (rotulo: string, valor: React.ReactNode, sub: React.ReactNode, n0: number) => (
              <P n={n0} passo={passo} className="min-w-0">
                <div className="label">{rotulo}</div>
                <div className="num text-[17px] font-bold text-ink">{valor}</div>
                <div className="text-[12px] text-ink-2">{sub}</div>
              </P>
            );
            return (
              <div key={p.sku} className="rounded-r2 border border-line bg-panel p-4 acm-sobe" style={{ animationDelay: `${i * 0.12}s` }}>
                <div className="text-[15px] font-semibold text-ink">{p.titulo}</div>
                <div className="relative my-3 h-5 rounded-full bg-panel-2">
                  {marca(p.tabela?.preco, "var(--line-2)", 0, 0.2 + i * 0.1)}
                  {marca(p.vitrineHoje, "var(--brand)", 0, 0.4 + i * 0.1)}
                  {marca(p.vendidoAgora, "var(--ink)", 1, 0.1)}
                  {marca(p.maisVendeu?.preco, "var(--up)", 2, 0.1)}
                  {marca(p.pico?.preco, "var(--warn)", 2, 0.3)}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  {cel("Tabela", p.tabela ? money(p.tabela.preco) : "—", p.tabela ? `na comissão ${pctFrac(p.tabela.comissao)}${p.tabela.pela === "padrão" ? "" : p.tabela.pela === "praticada" ? " (praticada)" : " (menor da tabela)"}` : "sem Fórmula base", 0)}
                  {cel("Vitrine hoje", p.vitrineHoje ? money(p.vitrineHoje) : "—",
                    !p.vitrineHoje ? "sem leitura" : difTab == null ? "sem tabela para comparar" : Math.abs(difTab) <= 0.02 ? <span className="text-up">igual à tabela</span> : <span className={difTab > 0 ? "text-down" : "text-warn"}>{pctTxt(difTab * 100)} sobre a tabela</span>, 0)}
                  {cel("Vendido", p.vendidoAgora ? money(p.vendidoAgora) : "—", `antes ${p.vendidoAntes ? money(p.vendidoAntes) : "—"} · ${p.unidadesAntes} → ${p.unidadesAgora} un.`, 1)}
                  {cel("Vendeu mais a", p.maisVendeu ? money(p.maisVendeu.preco) : "—", p.maisVendeu ? `${p.maisVendeu.unidades} un. nestes dias` : "sem venda", 2)}
                  {cel("Recorde", p.pico ? money(p.pico.preco) : "—", p.pico ? `${p.pico.unidades} un. · ${p.pico.rotulo.split(" · ")[1] ?? p.pico.rotulo}` : "sem histórico", 2)}
                  {cel("Comissão", pctFrac(p.comissaoPraticada), p.comissaoPraticada == null ? "praticada: sem dado" : `praticada · tabela ${pctFrac(p.tabela?.comissao)}`, 2)}
                </div>
              </div>
            );
          })}
          <p className="text-[12px] text-ink-3 md:col-span-2">
            <span style={{ color: "var(--line-2)" }}>●</span> tabela · <span className="text-brand">●</span> vitrine hoje · <span className="text-ink">●</span> vendido · <span className="text-up">●</span> vendeu mais · <span className="text-warn">●</span> recorde
          </p>
        </div>
      ),
    });
  }

  /* Altas e potencial */
  const altas = por("S4").filter((x) => x.id === "G29");
  const potencial = por("S4").filter((x) => x.id === "G14");
  if (altas.length || potencial.length) {
    slides.push({
      id: "altas", kicker: `${n(slides.length)} · O que funcionou`, titulo: altas.length ? `${altas.length} produto${altas.length === 1 ? "" : "s"} somaram +${moneyShort(altas.reduce((a, x) => a + x.impacto, 0))}` : "Quem pode vender mais",
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
      id: "preco", kicker: `${n(slides.length)} · Preço`, titulo: convites.length ? `${convites.length} convite${convites.length === 1 ? "" : "s"} de promoção abaixo do preço de hoje` : "Onde o preço mudou",
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
      id: "estoque", kicker: `${n(slides.length)} · Estoque`, titulo: (() => { const v = [...est.filter((x) => x.id !== "G11").reduce((m, x) => m.set(x.item?.sku ?? x.texto, Math.max(m.get(x.item?.sku ?? x.texto) ?? 0, x.impacto)), new Map<string, number>()).values()].reduce((a, v) => a + v, 0); return v > 0 ? `Faltou produto: ${moneyShort(v)} em jogo` : "Produto que vai acabar"; })(),
      passos: ["Rupturas no período, anúncios que vendiam e foram pausados ou zerados, e o que deve acabar nos próximos 7 dias."],
      corpo: () => (
        <div className="flex flex-col gap-4">
          {est.slice(0, 6).map((x, i) => {
            const cob = x.id === "G11" ? Number(x.numeros.coberturaDias) : 0;
            return (
              <div key={i} className="rounded-r2 border border-line bg-panel p-4 acm-sobe" style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="flex flex-wrap justify-between gap-2"><span className="text-[15px] font-semibold text-ink">{x.item?.titulo}</span><span className={`text-[13px] font-semibold ${x.id === "G11" ? "text-warn" : "text-down"}`}>{x.nome}</span></div>
                {x.id !== "G31" && <div className="mt-2 grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }, (_, k) => {
                    const vazio = x.id === "G10" ? k < Number(x.numeros.diasSemEstoque) : k >= Math.floor(cob);
                    return <span key={k} className={`h-6 rounded-[4px] acm-pop ${vazio ? "bg-down-wash border border-down" : "bg-up-wash"}`} style={{ animationDelay: `${0.3 + k * 0.08 + i * 0.15}s` }} />;
                  })}
                </div>}
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
      id: "promocoes", kicker: `${n(slides.length)} · Promoções`, titulo: certo + errado ? `${certo} promoç${certo === 1 ? "ão deu" : "ões deram"} certo, ${errado} não` : "Promoções no período",
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

  /* Lucro (só com custo conhecido em boa parte da receita) */
  const lucro = por("S10");
  const total = lucro.find((x) => x.id === "G30");
  if (total) {
    const vend = lucro.filter((x) => x.id === "G23");
    slides.push({
      id: "lucro", kicker: `${n(slides.length)} · Lucro`, titulo: "Vendeu. E quanto sobrou?",
      passos: ["Contribuição: o que sobra depois de comissão, frete, impostos e custo da mercadoria.", vend.length ? "Produtos que venderam mais e sobraram menos." : "Nenhum produto vendeu mais sobrando menos."],
      corpo: (passo) => (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="acm-sobe">
            <span className="label">Contribuição no período</span>
            <div className="num text-[44px] font-bold leading-none text-ink"><Contador valor={Number(total.numeros.margem)} /></div>
            <p className="mt-2 text-[14px] text-ink-2">{total.texto}</p>
            <div className="mt-3"><Ir g={total} /></div>
          </div>
          <P n={1} passo={passo}>{vend.length ? <Ranking itens={vend.slice(0, 5)} cor="var(--down)" passo={9} /> : null}</P>
        </div>
      ),
    });
  }

  /* Operação: reputação e cancelamentos */
  const op11 = por("S11");
  if (op11.length || d.reputacao.length) {
    const canc = d.cancelamentos;
    const tx = (c: { receita: number; cancelado: number }) => (c.receita + c.cancelado > 0 ? c.cancelado / (c.receita + c.cancelado) : null);
    slides.push({
      id: "operacao", kicker: `${n(slides.length)} · Operação`, titulo: op11.length ? "A operação está pondo a conta em risco?" : "A operação aguentou?",
      passos: ["Reputação de cada conta: reclamações, cancelamentos e atrasos, antes e agora.", "Cancelamentos do período, em valor."],
      corpo: (passo) => (
        <div className="flex flex-col gap-4">
          {d.reputacao.map((c, i) => (
            <div key={c.conta} className="rounded-r2 border border-line bg-panel p-4 acm-sobe" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[15px] font-semibold text-ink">{c.conta}</span>
                <span className="text-[13px] text-ink-2">nível {nivel(c.agora?.nivel)}{c.antes?.nivel && c.antes.nivel !== c.agora?.nivel ? ` (antes ${nivel(c.antes.nivel)})` : ""}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {(["reclamacoes", "cancelamentos", "atrasos"] as const).map((k, j) => {
                  const a = c.antes?.[k] ?? null, b = c.agora?.[k] ?? null;
                  const pior = a != null && b != null && b > a * 1.2 && b >= 0.005;
                  return (
                    <div key={k} className="acm-pop" style={{ animationDelay: `${0.2 + i * 0.15 + j * 0.1}s` }}>
                      <div className="label">{k === "reclamacoes" ? "reclamações" : k}</div>
                      <div className={`num text-[18px] font-bold ${pior ? "text-down" : "text-ink"}`}>{pctFrac(b)}</div>
                      <div className="text-[12px] text-ink-3">antes {pctFrac(a)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <P n={1} passo={passo} className="rounded-r2 border border-line bg-panel-2 p-4">
            {canc ? (
              <div className="text-[14px] text-ink">
                Cancelado: <b className="num">{money(canc.agora.cancelado)}</b> em {canc.agora.pedidosCancelados} pedidos ({pctFrac(tx(canc.agora))} da receita) · antes {money(canc.antes.cancelado)} ({pctFrac(tx(canc.antes))})
              </div>
            ) : <span className="text-ink-3">sem dado de cancelamento</span>}
            {op11.map((x, i) => <p key={i} className="mt-2 text-[13px] font-semibold text-down">{x.nome}: {x.texto}</p>)}
            <div className="mt-3"><Ir g={{ destino: "/vendas/cancelamentos" }} /></div>
          </P>
        </div>
      ),
    });
  }

  /* Mídia */
  const midia = por("S9");
  if (midia.length) {
    const cortar = midia.filter((x) => x.id === "G16"), subir = midia.filter((x) => x.id === "G17");
    slides.push({
      id: "midia", kicker: `${n(slides.length)} · Mídia`, titulo: subir.length && cortar.length ? `Dá para subir verba em ${subir.length}; ${cortar.length} gastaram sem vender` : subir.length ? `Dá para subir verba em ${subir.length} anúncio${subir.length === 1 ? "" : "s"}` : `${cortar.length} anúncio${cortar.length === 1 ? "" : "s"} gastaram sem vender`,
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
      id: "agora", kicker: `${n(slides.length)} · Próximos passos`, titulo: acoes.length ? `${acoes.length} coisa${acoes.length === 1 ? "" : "s"} para fazer, da maior para a menor` : "O que fazer agora",
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
          <li className="mt-2"><PerguntarIA pergunta={`Resuma o que mudou no Mercado Livre entre ${dataBr(d.de)} e ${dataBr(d.ate)} e o que devo fazer primeiro.`} /></li>
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
