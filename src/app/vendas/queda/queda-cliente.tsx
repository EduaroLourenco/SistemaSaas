"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { BarraFiltros, Filtro, FiltroDivisor } from "@/components/layout/barra-filtros";
import { Panel, Badge, EmptyState } from "@/components/ui/primitives";
import { Segmented, Select } from "@/components/ui/controls";
import { SeletorCanais } from "@/components/ui/seletor-canais";
import { Disclosure } from "@/components/ui/disclosure";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { AXIS, GRID } from "@/components/ui/chart";
import { money, moneyShort, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Causa, DadosQueda, DiaQueda, LinhaQueda, Nivel } from "@/lib/dados/queda";

/**
 * Por que caiu: produto ou anúncio, período contra o anterior.
 *
 * A pergunta é "foi preço?". A tela responde em três camadas, da mais
 * curta à mais detalhada: a causa numa palavra (a pílula), a causa numa
 * frase (ao abrir a linha) e o dia a dia (o gráfico), que mostra QUANDO o
 * preço mudou e o que a venda fez depois.
 */

const TOM: Record<Causa, "down" | "warn" | "info" | "neutral" | "up"> = {
  "sem estoque": "down",
  pausado: "down",
  "parou de vender": "down",
  "preço subiu": "warn",
  "vendeu mais barato": "warn",
  "perdeu visitas": "info",
  "conversão caiu": "info",
  "vendeu menos": "neutral",
  cresceu: "up",
  "estável": "neutral",
};

const PERIODOS = [
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
];

type Mostrar = "quedas" | "altas" | "todos";

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const varPct = (agora: number | null, antes: number | null) =>
  agora != null && antes != null && antes > 0 ? ((agora - antes) / antes) * 100 : null;

function somarDias(iso: string, d: number) {
  const t = new Date(iso + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}

/** Variação em %, colorida: verde sobe, vermelho cai. `inverso` para preço. */
function Var({ v, inverso }: { v: number | null; inverso?: boolean }) {
  if (v == null) return <span className="text-ink-3">—</span>;
  const ruim = inverso ? v > 0 : v < 0;
  const forte = Math.abs(v) >= 3;
  return (
    <span className={cn("num", forte ? (ruim ? "text-down" : "text-up") : "text-ink-3")}>
      {v > 0 ? "+" : ""}
      {v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
    </span>
  );
}

export default function QuedaCliente({ dados }: { dados: DadosQueda }) {
  const router = useRouter();
  const [busca, setBusca] = React.useState("");
  const [mostrar, setMostrar] = React.useState<Mostrar>("quedas");
  const [causa, setCausa] = React.useState<string>("");
  const [ordem, setOrdem] = React.useState<"reais" | "pct">("reais");
  const [aberta, setAberta] = React.useState<string | null>(null);

  const navegar = (mudar: Partial<{ de: string; ate: string; nivel: Nivel; canais: string[] }>) => {
    const q = new URLSearchParams();
    const de = mudar.de ?? dados.de;
    const ate = mudar.ate ?? dados.ate;
    q.set("de", de);
    q.set("ate", ate);
    q.set("nivel", mudar.nivel ?? dados.nivel);
    const canais = mudar.canais ?? dados.recorte;
    if (canais.length) q.set("canais", canais.join(","));
    router.push(`/vendas/queda?${q}`);
  };

  const periodoAtual = PERIODOS.find((p) => Number(p.value) === dados.dias)?.value ?? "";

  const linhas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return dados.linhas
      .filter((l) => (mostrar === "quedas" ? l.delta < 0 : mostrar === "altas" ? l.delta > 0 : true))
      .filter((l) => !causa || l.causa === causa)
      .filter(
        (l) =>
          !termo ||
          l.codigo.toLowerCase().includes(termo) ||
          l.sku.toLowerCase().includes(termo) ||
          l.titulo.toLowerCase().includes(termo)
      )
      .sort((a, b) =>
        ordem === "pct"
          ? (a.deltaPct ?? (a.delta < 0 ? -100 : 100)) - (b.deltaPct ?? (b.delta < 0 ? -100 : 100)) || a.delta - b.delta
          : mostrar === "altas"
            ? b.delta - a.delta
            : a.delta - b.delta
      );
  }, [dados.linhas, busca, mostrar, causa, ordem]);

  const { visible, pagination } = usePagination(linhas, 25);

  /* Para onde foi a queda: a soma das quedas por causa. */
  const porCausa = React.useMemo(() => {
    const m = new Map<Causa, { valor: number; itens: number }>();
    for (const l of dados.linhas) {
      if (l.delta >= 0) continue;
      const x = m.get(l.causa) ?? { valor: 0, itens: 0 };
      x.valor += l.delta;
      x.itens += 1;
      m.set(l.causa, x);
    }
    return [...m.entries()].sort((a, b) => a[1].valor - b[1].valor);
  }, [dados.linhas]);
  const quedaTotal = porCausa.reduce((s, [, x]) => s + x.valor, 0);
  const variacao = dados.totalAgora - dados.totalAntes;

  const causasPresentes = [...new Set(dados.linhas.map((l) => l.causa))];

  return (
    <>
      <PageHeader
        title="Por que caiu"
        breadcrumb="Vendas"
        description={`${dataBr(dados.de)} a ${dataBr(dados.ate)} contra ${dataBr(dados.deAnterior)} a ${dataBr(dados.ateAnterior)} · ${dados.dias} dias`}
        filters={
          <BarraFiltros>
            <Filtro rotulo="Período">
              <Segmented
                options={PERIODOS}
                value={periodoAtual}
                onChange={(v) => navegar({ de: somarDias(dados.ate, -(Number(v) - 1)) })}
              />
            </Filtro>
            <Filtro rotulo="Até">
              <input
                type="date"
                value={dados.ate}
                onChange={(e) =>
                  e.target.value && navegar({ ate: e.target.value, de: somarDias(e.target.value, -(dados.dias - 1)) })
                }
                className="h-10 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink"
              />
            </Filtro>
            <Filtro rotulo="Canais" composto>
              <SeletorCanais grupos={dados.opcoes} selecionados={dados.recorte} aoAplicar={(c) => navegar({ canais: c })} />
            </Filtro>
            <FiltroDivisor />
            <Filtro rotulo="Olhar por">
              <Segmented
                options={[
                  { value: "produto" as Nivel, label: "Produto (SKU)" },
                  { value: "anuncio" as Nivel, label: "Anúncio" },
                ]}
                value={dados.nivel}
                onChange={(v) => navegar({ nivel: v })}
              />
            </Filtro>
          </BarraFiltros>
        }
      />
      <PageBody>
        {dados.vazio ? (
          <Panel>
            <EmptyState
              icon={Search}
              title="Nenhuma venda nos dois períodos"
              description="Amplie o período ou escolha outros canais."
            />
          </Panel>
        ) : (
          <>
            {/* ── O resumo: quanto mudou, e para onde foi a queda ── */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Panel className="p-4">
                <p className="label">Receita no recorte</p>
                <p className="num mt-1 text-[24px] font-semibold text-ink">{money(dados.totalAgora)}</p>
                <p className="num mt-1 text-[13px] text-ink-2">
                  antes {money(dados.totalAntes)} ·{" "}
                  <span className={variacao < 0 ? "text-down" : "text-up"}>
                    {variacao > 0 ? "+" : "−"}
                    {money(Math.abs(variacao))}
                    {dados.totalAntes > 0 && ` (${pct((variacao / dados.totalAntes) * 100)})`}
                  </span>
                </p>
                <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
                  O total pode subir e ainda haver itens caindo: a tela separa um do outro. Abaixo, só o que caiu.
                </p>
              </Panel>
              <Panel className="p-4 lg:col-span-2">
                <p className="label">Para onde foi a queda</p>
                <p className="num mt-1 text-[13px] text-ink-2">
                  {money(Math.abs(quedaTotal))} perdidos em {count(porCausa.reduce((s, [, x]) => s + x.itens, 0))}{" "}
                  {dados.nivel === "produto" ? "produtos" : "anúncios"} que caíram, pela causa principal de cada um
                </p>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {porCausa.map(([c, x]) => (
                    <li key={c}>
                      <button
                        type="button"
                        onClick={() => {
                          setCausa(causa === c ? "" : c);
                          setMostrar("quedas");
                        }}
                        className={cn(
                          "grid w-full grid-cols-[1fr_auto] sm:grid-cols-[9rem_1fr_auto] items-center gap-3 rounded-r1 px-1.5 py-1 text-left hover:bg-panel-3",
                          causa === c && "bg-panel-3"
                        )}
                      >
                        <Badge tone={TOM[c]}>{c}</Badge>
                        <span className="hidden sm:block h-2 rounded-full bg-panel-3">
                          <span
                            className="block h-2 rounded-full bg-down/70"
                            style={{ width: `${quedaTotal ? (x.valor / quedaTotal) * 100 : 0}%` }}
                          />
                        </span>
                        <span className="num text-[12px] text-ink-2">
                          {moneyShort(Math.abs(x.valor))} · {x.itens}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <Disclosure title="Como a causa é escolhida">
              <p>
                Receita = <strong>visitas × conversão × preço</strong>. A variação de cada fator entre o período
                anterior e o atual diz quanto da diferença em reais ele explica, e a soma dos três fecha exatamente na
                diferença. Canal sem visita registrada (loja própria, marketplaces sem API de visita) é lido como{" "}
                <strong>unidades × preço</strong>.
              </p>
              <p className="mt-2">
                A causa segue esta ordem: <strong>sem estoque</strong> (metade ou mais dos dias acompanhados zerado, e a
                queda veio desse anúncio) → <strong>pausado</strong> → <strong>preço subiu</strong> (preço +4% ou mais
                e conversão −10% ou mais; sem visita, unidades −10%) → <strong>parou de vender</strong> → o fator que
                mais tirou receita.
              </p>
              <p className="mt-2">
                Preço de <strong>vitrine</strong> é o anunciado no dia, lido da API do Mercado Livre na sincronização
                diária
                {dados.vitrineDesde ? ` (desde ${dataBr(dados.vitrineDesde)})` : " (começa a ser gravado após a migração 33)"}.
                Preço <strong>vendido</strong> é receita ÷ unidades dos pedidos, e vale para todos os canais. A causa
                usa a vitrine quando os dois períodos têm, e o vendido quando não.
              </p>
            </Disclosure>

            {/* ── A lista ── */}
            <Panel className="overflow-hidden">
              <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
                <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-r1 border border-line bg-panel px-3 h-10">
                  <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder={dados.nivel === "produto" ? "SKU ou nome do produto" : "MLB, SKU ou título"}
                    aria-label="Buscar"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
                  />
                </label>
                <Segmented
                  options={[
                    { value: "quedas" as Mostrar, label: "Caíram" },
                    { value: "altas" as Mostrar, label: "Subiram" },
                    { value: "todos" as Mostrar, label: "Todos" },
                  ]}
                  value={mostrar}
                  onChange={setMostrar}
                />
                <div className="w-[180px]">
                  <Select value={causa} onChange={(e) => setCausa(e.target.value)} aria-label="Causa">
                    <option value="">Todas as causas</option>
                    {causasPresentes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <Segmented
                  options={[
                    { value: "reais" as const, label: "Maior em R$" },
                    { value: "pct" as const, label: "Maior em %" },
                  ]}
                  value={ordem}
                  onChange={setOrdem}
                />
              </div>

              {linhas.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-ink-3">Nada neste filtro.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {visible.map((l) => (
                    <Linha
                      key={l.chave}
                      l={l}
                      aberta={aberta === l.chave}
                      alternar={() => setAberta(aberta === l.chave ? null : l.chave)}
                      dados={dados}
                    />
                  ))}
                </ul>
              )}
              <Pagination {...pagination} />
            </Panel>
          </>
        )}
      </PageBody>
    </>
  );
}

/* ══ Uma linha ═══════════════════════════════════════════════ */

function Linha({
  l,
  aberta,
  alternar,
  dados,
}: {
  l: LinhaQueda;
  aberta: boolean;
  alternar: () => void;
  dados: DadosQueda;
}) {
  const vitrine = l.antes.precoVitrine != null && l.agora.precoVitrine != null;
  const precoAntes = vitrine ? l.antes.precoVitrine : l.antes.precoVendido;
  const precoAgora = vitrine ? l.agora.precoVitrine : l.agora.precoVendido;
  const Seta = aberta ? ChevronDown : ChevronRight;

  return (
    <li>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberta}
        className="grid w-full grid-cols-[1rem_minmax(0,1fr)] items-start gap-2 px-4 py-3 text-left hover:bg-panel-2 md:grid-cols-[1rem_minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_9rem] md:items-center md:gap-3"
      >
        <Seta className="mt-0.5 h-4 w-4 text-ink-3 md:mt-0" aria-hidden />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="num text-[13px] font-semibold text-ink">{l.codigo}</span>
            <Badge tone={l.curva === "A" ? "brand" : "neutral"}>{l.curva}</Badge>
            <span className="md:hidden">
              <Badge tone={TOM[l.causa]}>{l.causa}</Badge>
            </span>
          </span>
          <span className="block truncate text-[12px] text-ink-2" title={l.titulo}>
            {l.titulo || "—"}
          </span>
          <span className="block truncate text-[12px] text-ink-3">{l.onde}</span>
        </span>

        {/* Celular: um resumo em linha. Desktop: colunas. */}
        <span className="col-start-2 num text-[12px] text-ink-2 md:hidden">
          {money(l.antes.receita)} → {money(l.agora.receita)} ·{" "}
          <span className={l.delta < 0 ? "text-down" : "text-up"}>{money(l.delta)}</span>
        </span>

        <span className="hidden md:block text-right">
          <span className={cn("num block text-[13px] font-semibold", l.delta < 0 ? "text-down" : "text-up")}>
            {l.delta > 0 ? "+" : ""}
            {moneyShort(l.delta)}
          </span>
          <span className="num block text-[12px] text-ink-3">
            {moneyShort(l.antes.receita)} → {moneyShort(l.agora.receita)}
          </span>
        </span>
        <Coluna rotulo="visitas" valor={<Var v={varPct(l.agora.visitas, l.antes.visitas)} />} />
        <Coluna
          rotulo="conversão"
          valor={
            l.antes.conversao != null || l.agora.conversao != null ? (
              <span className="num text-[12px] text-ink-2">
                {l.antes.conversao != null ? pct(l.antes.conversao, 2) : "—"} →{" "}
                {l.agora.conversao != null ? pct(l.agora.conversao, 2) : "—"}
              </span>
            ) : (
              <span className="text-ink-3">—</span>
            )
          }
        />
        <Coluna
          rotulo={vitrine ? "preço vitrine" : "preço vendido"}
          valor={<Var v={varPct(precoAgora, precoAntes)} inverso />}
        />
        <span className="hidden md:flex justify-end">
          <Badge tone={TOM[l.causa]}>{l.causa}</Badge>
        </span>
      </button>

      {aberta && <Detalhe l={l} dados={dados} />}
    </li>
  );
}

function Coluna({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <span className="hidden md:block text-right">
      <span className="block text-[13px]">{valor}</span>
      <span className="block text-[11px] text-ink-3">{rotulo}</span>
    </span>
  );
}

/* ══ O detalhe: a frase, a conta e o dia a dia ═══════════════ */

function Detalhe({ l, dados }: { l: LinhaQueda; dados: DadosQueda }) {
  const [serie, setSerie] = React.useState<DiaQueda[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams({ chave: l.chave, de: dados.deAnterior, ate: dados.ate });
    if (dados.recorte.length) q.set("canais", dados.recorte.join(","));
    fetch(`/api/queda?${q}`)
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (r.ok) setSerie(j.dias);
        else setErro(j.erro ?? "Não consegui carregar o dia a dia.");
      })
      .catch((e) => vivo && setErro(String(e)));
    return () => {
      vivo = false;
    };
  }, [l.chave, dados.deAnterior, dados.ate, dados.recorte]);

  const fatores = [
    { nome: "visitas", valor: l.efeito.visitas },
    { nome: "conversão", valor: l.efeito.conversao },
    { nome: "unidades", valor: l.efeito.unidades },
    { nome: "preço", valor: l.efeito.preco },
  ].filter((f): f is { nome: string; valor: number } => f.valor != null && Math.abs(f.valor) >= 1);

  const temVitrine = serie?.some((d) => d.precoVitrine != null);
  const temVisita = serie?.some((d) => d.visitas != null);

  return (
    <div className="flex flex-col gap-4 bg-panel-2 px-4 pb-4 pt-1 md:pl-10">
      <p className="text-[13px] leading-relaxed text-ink">
        <Badge tone={TOM[l.causa]}>{l.causa}</Badge> <span className="ml-1">{l.explicacao}</span>
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Receita" antes={money(l.antes.receita)} agora={money(l.agora.receita)} />
        <Numero rotulo="Unidades" antes={count(l.antes.unidades)} agora={count(l.agora.unidades)} />
        <Numero
          rotulo="Visitas"
          antes={l.antes.visitas != null ? count(l.antes.visitas) : "—"}
          agora={l.agora.visitas != null ? count(l.agora.visitas) : "—"}
        />
        <Numero
          rotulo={l.antes.precoVitrine != null ? "Preço vitrine (médio)" : "Preço vendido (médio)"}
          antes={money((l.antes.precoVitrine ?? l.antes.precoVendido) || 0)}
          agora={money((l.agora.precoVitrine ?? l.agora.precoVendido) || 0)}
        />
      </div>

      {fatores.length > 0 && l.delta < 0 && (
        <div>
          <p className="label mb-1.5">De onde veio a diferença de {money(l.delta)}</p>
          <div className="flex flex-wrap gap-2">
            {fatores.map((f) => (
              <span key={f.nome} className="rounded-r1 border border-line bg-panel px-2.5 py-1 text-[12px] text-ink-2">
                {f.nome}{" "}
                <span className={cn("num font-semibold", f.valor < 0 ? "text-down" : "text-up")}>
                  {f.valor > 0 ? "+" : "−"}
                  {money(Math.abs(f.valor))}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {l.partes.length > 1 && (
        <div>
          <p className="label mb-1.5">Onde caiu</p>
          <ul className="flex flex-col gap-1">
            {l.partes.slice(0, 8).map((p) => (
              <li key={p.codigo + p.onde} className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="min-w-0 truncate text-ink-2">
                  {p.onde}
                  {p.codigo !== p.onde && <span className="num text-ink-3"> · {p.codigo}</span>}
                </span>
                <span className="num shrink-0">
                  <span className="text-ink-3">
                    {moneyShort(p.antes)} → {moneyShort(p.agora)}
                  </span>{" "}
                  <span className={p.delta < 0 ? "text-down" : "text-up"}>
                    {p.delta > 0 ? "+" : ""}
                    {moneyShort(p.delta)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="label mb-1.5">
          Dia a dia · barras = receita · {temVitrine ? "linha = preço de vitrine" : "pontos = preço vendido no dia"}
          {temVisita ? " · pontilhado = visitas" : ""}
        </p>
        {erro ? (
          <p className="text-[12px] text-down">{erro}</p>
        ) : !serie ? (
          <p className="text-[12px] text-ink-3" aria-busy="true">
            Carregando…
          </p>
        ) : (
          <div className="h-[220px] rounded-r1 border border-line bg-panel p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <ReferenceArea yAxisId="r" x1={dados.deAnterior} x2={dados.ateAnterior} fill="var(--panel-3)" fillOpacity={0.6} />
                <XAxis dataKey="data" {...AXIS} tickFormatter={dataBr} minTickGap={24} />
                <YAxis yAxisId="r" {...AXIS} width="auto" tickFormatter={(v) => moneyShort(Number(v))} />
                <YAxis yAxisId="p" orientation="right" {...AXIS} width="auto" tickCount={3} tickFormatter={(v) => money(Number(v))} domain={["auto", "auto"]} />
                {temVisita && <YAxis yAxisId="v" hide />}
                <Tooltip
                  cursor={{ fill: "var(--panel-3)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as DiaQueda;
                    return (
                      <div className="panel px-2.5 py-2 text-[12px]" style={{ boxShadow: "var(--sh-3)" }}>
                        <p className="mb-1 font-semibold text-ink-2">{dataBr(String(label))}</p>
                        <p className="num">receita {money(d.receita)} · {d.unidades} un</p>
                        {d.visitas != null && <p className="num">visitas {count(d.visitas)}</p>}
                        {d.precoVitrine != null && <p className="num">vitrine {money(d.precoVitrine)}</p>}
                        {d.precoVendido != null && <p className="num">vendido {money(d.precoVendido)}</p>}
                        {d.estoque != null && <p className="num">estoque {count(d.estoque)}</p>}
                      </div>
                    );
                  }}
                />
                <Bar yAxisId="r" dataKey="receita" fill="var(--s1)" fillOpacity={0.55} isAnimationActive={false} />
                <Line
                  yAxisId="p"
                  dataKey={temVitrine ? "precoVitrine" : "precoVendido"}
                  stroke="var(--warn)"
                  strokeWidth={2}
                  /* Vitrine é contínua (um retrato por dia). Preço vendido só existe
                     em dia com venda: ligar os pontos inventaria uma tendência. */
                  dot={temVitrine ? false : { r: 3, fill: "var(--warn)" }}
                  connectNulls={!!temVitrine}
                  strokeOpacity={temVitrine ? 1 : 0}
                  isAnimationActive={false}
                />
                {temVisita && (
                  <Line
                    yAxisId="v"
                    dataKey="visitas"
                    stroke="var(--s3)"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-[11px] text-ink-3">A faixa cinza é o período anterior.</p>
      </div>
    </div>
  );
}

function Numero({ rotulo, antes, agora }: { rotulo: string; antes: string; agora: string }) {
  return (
    <div className="min-w-0 rounded-r1 border border-line bg-panel px-3 py-2">
      <p className="text-[11px] text-ink-3">{rotulo}</p>
      <p className="num truncate text-[13px] font-semibold text-ink">{agora}</p>
      <p className="num truncate text-[11px] text-ink-3">antes {antes}</p>
    </div>
  );
}
