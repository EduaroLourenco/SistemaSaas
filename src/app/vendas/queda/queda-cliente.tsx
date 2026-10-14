"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { COLUNAS_QUEDA, colunaTexto, ordenarFiltrarQueda, type ColunaQueda } from "@/lib/queda-filtros";
import { EstoqueProduto } from "@/components/painel/estoque-produto";
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

/** Dias entre dois dias, as duas pontas contadas. */
function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 86400000) + 1;
}

/** O período de comparação colado antes de `de`, do mesmo tamanho. */
function colado(de: string, dias: number) {
  const ateAnt = somarDias(de, -1);
  return { de, deAnt: somarDias(ateAnt, -(dias - 1)), ateAnt };
}

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
  const [mostrar, setMostrar] = React.useState<Mostrar>(dados.skuFiltro ? "todos" : "quedas");
  const [causa, setCausa] = React.useState<string>("");
  const [colunas, setColunas] = React.useState({ coluna: "delta" as ColunaQueda, crescente: true, minimo: "", maximo: "", texto: "", presenca: "todos" });
  const [aberta, setAberta] = React.useState<string | null>(dados.skuFiltro ? dados.linhas[0]?.chave ?? null : null);

  const navegar = (mudar: Partial<{ de: string; ate: string; deAnt: string; ateAnt: string; nivel: Nivel; canais: string[] }>) => {
    const q = new URLSearchParams();
    const de = mudar.de ?? dados.de;
    const ate = mudar.ate ?? dados.ate;
    q.set("de", de);
    q.set("ate", ate);
    q.set("deAnt", mudar.deAnt ?? dados.deAnterior);
    q.set("ateAnt", mudar.ateAnt ?? dados.ateAnterior);
    q.set("nivel", mudar.nivel ?? dados.nivel);
    const canais = mudar.canais ?? dados.recorte;
    if (canais.length) q.set("canais", canais.join(","));
    if (dados.skuFiltro) q.set("sku", dados.skuFiltro);
    router.push(`/vendas/queda?${q}`);
  };

  const periodoAtual = PERIODOS.find((p) => Number(p.value) === dados.dias)?.value ?? "";

  const linhas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = dados.linhas
      .filter((l) => (mostrar === "quedas" ? l.delta < 0 : mostrar === "altas" ? l.delta > 0 : true))
      .filter((l) => !causa || l.causa === causa)
      .filter(
        (l) =>
          !termo ||
          l.codigo.toLowerCase().includes(termo) ||
          l.sku.toLowerCase().includes(termo) ||
          l.titulo.toLowerCase().includes(termo)
      );
    return ordenarFiltrarQueda(filtradas, colunas);
  }, [dados.linhas, busca, mostrar, causa, colunas]);

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
        description={`${dataBr(dados.de)} a ${dataBr(dados.ate)} (${dados.dias} dias) contra ${dataBr(dados.deAnterior)} a ${dataBr(dados.ateAnterior)} (${dados.diasAnterior} dias)${dados.dias === dados.diasAnterior ? "" : " · tamanhos diferentes: compare por dia, não pelo total"}`}
        filters={
          <BarraFiltros>
            <Filtro rotulo="Período">
              <Segmented
                options={PERIODOS}
                value={periodoAtual}
                onChange={(v) => navegar(colado(somarDias(dados.ate, -(Number(v) - 1)), Number(v)))}
              />
            </Filtro>
            {/*
             * Os dois dias, livres. O atalho de período ao lado continua
             * ancorado no "até"; estes dois mexem numa ponta e deixam a
             * outra onde está, que é o que se espera de um intervalo.
             * O período anterior acompanha sozinho: mesmo tamanho, colado
             * antes do "de" — comparar 11 dias com 30 não diria nada.
             */}
            <Filtro rotulo="De">
              <input
                type="date"
                aria-label="Primeiro dia do período"
                max={dados.ate}
                value={dados.de}
                onChange={(e) =>
                  e.target.value &&
                  navegar({
                    ate: dados.ate < e.target.value ? e.target.value : dados.ate,
                    ...colado(e.target.value, diasEntre(e.target.value, dados.ate < e.target.value ? e.target.value : dados.ate)),
                  })
                }
                className="h-10 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink num"
              />
            </Filtro>
            <Filtro rotulo="Até">
              <input
                type="date"
                aria-label="Último dia do período"
                min={dados.de}
                value={dados.ate}
                onChange={(e) =>
                  e.target.value && navegar({ ate: e.target.value, de: dados.de > e.target.value ? e.target.value : dados.de })
                }
                className="h-10 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink num"
              />
            </Filtro>
            <FiltroDivisor />
            {/*
             * O período de comparação, livre.
             *
             * Dia de campanha só se compara com dia de campanha: deduzir
             * "o mesmo tamanho logo antes" não dá conta de setembro contra
             * setembro, nem da semana do aumento contra a semana anterior
             * ao aumento.
             *
             * Mexer no período de cima recoloca este colado antes dele, que
             * é o padrão de sempre; quem quiser outro intervalo mexe aqui
             * depois. Termina antes do "de" por exigência do cálculo — dia
             * nos dois períodos seria contado duas vezes.
             */}
            <Filtro rotulo="Comparar de">
              <input
                type="date"
                aria-label="Primeiro dia do período de comparação"
                max={dados.ateAnterior}
                value={dados.deAnterior}
                onChange={(e) =>
                  e.target.value &&
                  navegar({
                    deAnt: e.target.value,
                    ateAnt: dados.ateAnterior < e.target.value ? e.target.value : dados.ateAnterior,
                  })
                }
                className="h-10 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink num"
              />
            </Filtro>
            <Filtro rotulo="Comparar até">
              <input
                type="date"
                aria-label="Último dia do período de comparação"
                min={dados.deAnterior}
                max={somarDias(dados.de, -1)}
                value={dados.ateAnterior}
                onChange={(e) =>
                  e.target.value &&
                  navegar({
                    ateAnt: e.target.value,
                    deAnt: dados.deAnterior > e.target.value ? e.target.value : dados.deAnterior,
                  })
                }
                className="h-10 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink num"
              />
            </Filtro>
            <FiltroDivisor />
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
                  Abra um produto para conferir seus canais e anúncios.
                </p>
              </Panel>
              <Panel className="p-4 lg:col-span-2">
                <p className="label">Para onde foi a queda</p>
                <p className="num mt-1 text-[13px] text-ink-2">
                  {money(Math.abs(quedaTotal))} perdidos em {count(porCausa.reduce((s, [, x]) => s + x.itens, 0))}{" "}
                  {dados.nivel === "produto" ? "produtos" : "anúncios"} · agrupados pelo principal sinal observado
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

            <Disclosure title="Como ler esta análise">
              <p>Compare períodos de igual duração. A etiqueta destaca um sinal a investigar; não comprova a causa da queda.</p>
              <p className="mt-2">Abra um SKU para separar os canais e, depois, cada anúncio. Sem visitas medidas, a análise usa unidades e preço. Estoque é disponibilidade declarada ao canal; confira os depósitos na tela de estoques.</p>
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
                  onChange={(v) => { setMostrar(v); setColunas((f) => ({ ...f, crescente: v !== "altas" })); }}
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
                <Link className="text-xs text-brand" href={`/produtos?de=${dados.de}&ate=${dados.ate}&canais=${encodeURIComponent(dados.recorte.join(","))}`}>Ver preços por canal →</Link>
              </div>
              <details className="border-b border-line px-4 py-2"><summary className="min-h-9 cursor-pointer text-xs font-medium text-ink-2">Ordenar e filtrar qualquer coluna · {COLUNAS_QUEDA.find(([c]) => c === colunas.coluna)?.[1]}</summary>
                <div className="flex flex-wrap items-end gap-2 py-2">
                  <label className="text-xs text-ink-3">Coluna<Select aria-label="Coluna para ordenar e filtrar" value={colunas.coluna} onChange={(e) => setColunas({ ...colunas, coluna:e.target.value as ColunaQueda, minimo:"",maximo:"",texto:"" })}>{COLUNAS_QUEDA.map(([c,n]) => <option key={c} value={c}>{n}</option>)}</Select></label>
                  <Select aria-label="Sentido da ordenação" value={colunas.crescente ? "asc" : "desc"} onChange={(e) => setColunas({ ...colunas, crescente:e.target.value === "asc" })}><option value="asc">Crescente</option><option value="desc">Decrescente</option></Select>
                  <Select aria-label="Presença de dados" value={colunas.presenca} onChange={(e) => setColunas({ ...colunas,presenca:e.target.value })}><option value="todos">Todos os registros</option><option value="com">Com informação</option><option value="sem">Sem informação</option></Select>
                  {colunaTexto(colunas.coluna) ? <input aria-label="Filtrar texto da coluna" placeholder="Contém…" value={colunas.texto} onChange={(e) => setColunas({ ...colunas,texto:e.target.value })} className="h-10 max-w-full rounded-r1 border border-line bg-panel px-3 text-sm" /> : (["minimo","maximo"] as const).map((k) => <input key={k} aria-label={k === "minimo" ? "Valor mínimo" : "Valor máximo"} placeholder={k === "minimo" ? "Mínimo" : "Máximo"} inputMode="decimal" value={colunas[k]} onChange={(e) => setColunas({ ...colunas,[k]:e.target.value })} className="h-10 w-28 rounded-r1 border border-line bg-panel px-3 text-sm" />)}
                  <button type="button" className="min-h-10 px-2 text-xs text-brand" onClick={() => setColunas({coluna:"delta",crescente:true,minimo:"",maximo:"",texto:"",presenca:"todos"})}>Limpar</button>
                </div>
              </details>

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
        className="grid w-full grid-cols-[1rem_minmax(0,1fr)] items-start gap-2 px-4 py-3 text-left hover:bg-panel-2 md:grid-cols-[1rem_minmax(0,2fr)_repeat(5,minmax(0,1fr))_9rem] md:items-center md:gap-3"
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
          <span className="text-ink-3"> · estoque </span>
          <Estoque l={l} />
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
        <Coluna rotulo="estoque hoje" valor={<Estoque l={l} />} />
        <span className="hidden md:flex justify-end">
          <Badge tone={TOM[l.causa]}>{l.causa}</Badge>
        </span>
      </button>

      {aberta && <Detalhe l={l} dados={dados} />}
    </li>
  );
}

/**
 * Estoque de hoje, não do período.
 *
 * Zerado em vermelho porque muda a ação: "caiu e ainda não tem produto" se
 * resolve no abastecimento, "caiu e já reabasteceu" se resolve esperando ou
 * olhando o posicionamento que o anúncio perdeu enquanto estava parado.
 */
function Estoque({ l }: { l: LinhaQueda }) {
  if (l.estoqueAtual == null) return <span className="text-[11px] text-ink-3">ver por origem</span>;
  return (
    <span className={cn("num text-[13px]", l.estoqueAtual === 0 ? "font-semibold text-down" : "text-ink-2")}>
      {count(l.estoqueAtual)}
    </span>
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

export function Detalhe({ l, dados }: { l: LinhaQueda; dados: DadosQueda }) {
  const [aba, setAba] = React.useState("resumo");
  const [anuncios, setAnuncios] = React.useState<LinhaQueda[] | null>(null);
  const [anuncioAberto, setAnuncioAberto] = React.useState<string | null>(null);
  const [serie, setSerie] = React.useState<DiaQueda[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [diaEscolhido, setDiaEscolhido] = React.useState("");

  React.useEffect(() => {
    let vivo = true;
    setSerie(null);
    setAnuncios(null);
    setErro(null);
    const q = new URLSearchParams({ chave: l.chave, de: dados.deAnterior, ate: dados.ate, inicioAtual: dados.de });
    if (dados.recorte.length) q.set("canais", dados.recorte.join(","));
    fetch(`/api/queda?${q}`)
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (r.ok) { setSerie(j.dias); setAnuncios(j.anuncios ?? []); }
        else setErro(j.erro ?? "Não consegui carregar o dia a dia.");
      })
      .catch((e) => vivo && setErro(String(e)));
    return () => {
      vivo = false;
    };
  }, [l.chave, dados.de, dados.deAnterior, dados.ate, dados.recorte]);

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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label={`Análise de ${l.codigo}`}>
          {[{ id: "resumo", nome: "Resumo" }, ...(l.nivel === "produto" ? [{ id: "anuncios", nome: `Canais e anúncios${anuncios ? ` (${anuncios.length})` : ""}` }] : []), { id: "evolucao", nome: "Evolução" }, { id: "estoques", nome: "Estoques" }].map((a) => <button key={a.id} type="button" aria-pressed={aba === a.id} onClick={() => setAba(a.id)} className={cn("min-h-11 rounded-lg px-3 py-2 text-xs font-medium", aba === a.id ? "bg-brand text-white" : "text-ink-2 hover:bg-panel-3")}>{a.nome}</button>)}
        </div>
      </div>
      {aba === "resumo" && <>
      <Disclosure title={`Leitura dos dados · ${l.causa}`}>
        <p className="text-[13px] leading-relaxed text-ink"><Badge tone={TOM[l.causa]}>{l.causa}</Badge> <span className="ml-1">{l.explicacao}</span></p>
        <p className="mt-3 text-xs text-ink-2"><strong>Conferir agora: </strong>{l.causa === "sem estoque" ? "saldos e disponibilidade em cada origem." : l.causa === "preço subiu" || l.causa === "vendeu mais barato" ? "preço, promoções e margem do anúncio." : l.causa === "perdeu visitas" ? "investimento, exposição e posição do anúncio no canal." : l.causa === "conversão caiu" || l.causa === "parou de vender" ? "oferta, frete, prazo e disponibilidade." : "quais canais e anúncios concentraram a mudança."}</p>
      </Disclosure>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Numero rotulo="Receita" antes={money(l.antes.receita)} agora={money(l.agora.receita)} />
        <Numero rotulo="Unidades" antes={count(l.antes.unidades)} agora={count(l.agora.unidades)} />
        <Numero rotulo="Unidades por dia" antes={(l.antes.unidades/dados.diasAnterior).toLocaleString("pt-BR", { maximumFractionDigits:2 })} agora={(l.agora.unidades/dados.dias).toLocaleString("pt-BR", { maximumFractionDigits:2 })} />
        <Numero rotulo="Conversão (unidades / visitas)" antes={l.antes.conversao == null ? "sem medição" : pct(l.antes.conversao,2)} agora={l.agora.conversao == null ? "sem medição" : pct(l.agora.conversao,2)} extra={`Base: ${pct(l.agora.cobertura * 100,0)} das unidades com visitas no dia`} />
        <Numero
          rotulo="Visitas"
          antes={l.antes.visitas != null ? count(l.antes.visitas) : "—"}
          agora={l.agora.visitas != null ? count(l.agora.visitas) : "—"}
          extra={varPct(l.agora.visitas,l.antes.visitas) == null ? undefined : `Variação ${pct(varPct(l.agora.visitas,l.antes.visitas)!,1)}`}
        />
        {/* Preço: o anunciado existe mesmo sem venda; o vendido, só com venda. */}
        <Numero
          rotulo="Preço anunciado (médio)"
          antes={l.antes.precoVitrine != null ? money(l.antes.precoVitrine) : "sem registro"}
          agora={l.agora.precoVitrine != null ? money(l.agora.precoVitrine) : "sem registro"}
          extra={l.precoAtual != null ? `${l.precoAtualOrigem === "cadastro" ? "Cadastro (cheio)" : "Última oferta"}: ${money(l.precoAtual)}${l.precoAtualData ? ` · ${dataBr(l.precoAtualData)}` : ""}` : undefined}
        />
        <Numero
          rotulo="Preço vendido (médio)"
          antes={l.antes.precoVendido != null ? money(l.antes.precoVendido) : "sem venda"}
          agora={l.agora.precoVendido != null ? money(l.agora.precoVendido) : "sem venda"}
        />
        {/* A disputa do catálogo entra como número porque é ela que separa
            "preço espantou o clique" de "perdeu exposição". */}
        {l.catalogo && (
          <Numero
            rotulo="Ganhou o catálogo"
            agora={`${l.catalogo.agora.ganhando} de ${l.catalogo.agora.dias} dias`}
            antes={`${l.catalogo.antes.ganhando} de ${l.catalogo.antes.dias} dias`}
          />
        )}
        {/* Estoque é de AGORA, por isso a segunda linha diz os dias zerados
            do período em vez de um "antes" que não existe. */}
        <Numero
          rotulo="Disponível no anúncio"
          agora={
            l.estoqueAtual != null
                ? count(l.estoqueAtual)
                : "ver por origem"
          }
          antes={
            l.diasComEstoque + l.diasSemEstoque > 0
              ? `${l.diasSemEstoque} de ${l.diasComEstoque + l.diasSemEstoque} dias zerado`
              : "sem retrato diário"
          }
          rotuloAntes=""
        />
      </div>

      {fatores.length > 0 && l.delta < 0 && (
        <div>
          <p className="label mb-1.5">Variação estimada por fator</p>
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
      <Disclosure title="Como os fatores explicam a diferença em reais"><p>Receita = unidades × preço médio vendido. Quando todas as vendas têm visitas registradas, também vale visitas × conversão × preço. A conta distribui {money(l.delta)} conforme a variação proporcional de cada fator; parcelas positivas compensam as negativas. Não é dinheiro perdido medido separadamente nem prova de causa.</p><p className="mt-2">Sem cobertura completa de visitas, usamos unidades e preço. Conversão usa apenas unidades nos anúncios e dias com visitas medidas. O preço médio anunciado pertence ao período; a última oferta exibe a data da consulta.</p></Disclosure>
      </>}
      {aba === "estoques" && <EstoqueProduto sku={l.sku} anuncio={l.nivel === "anuncio" ? l.codigo : undefined} />}

      {aba === "anuncios" && (
        <div>
          <p className="mb-3 text-xs text-ink-3">Cada análise usa apenas os dados daquele canal e daquela conta.</p>
          {erro ? <p role="alert" className="text-xs text-down">{erro}</p> : !anuncios ? <p className="text-xs text-ink-3" aria-busy="true">Carregando anúncios…</p> : !anuncios.length ? <p className="text-xs text-ink-3">Nenhum anúncio com vendas vinculado a este SKU no recorte.</p> : <ul className="space-y-2">{anuncios.map((a) => <li key={a.chave} className="overflow-hidden rounded-xl border border-line bg-panel">
            <button type="button" aria-expanded={anuncioAberto === a.chave} onClick={() => setAnuncioAberto(anuncioAberto === a.chave ? null : a.chave)} className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left hover:bg-panel-3">
              <div className="min-w-0"><p className="text-xs font-semibold text-brand">{a.onde}</p><p className="num mt-1 text-xs text-ink">{a.codigo}</p><p className="mt-1 text-[11px] text-ink-3">{a.agora.visitas == null ? "Pedidos e preços vendidos" : "Pedidos, visitas e dados do anúncio"}</p></div>
              <div className="text-right"><Badge tone={TOM[a.causa]}>{a.causa}</Badge><p className={cn("num mt-2 text-sm font-semibold", a.delta < 0 ? "text-down" : "text-up")}>{a.delta > 0 ? "+" : ""}{money(a.delta)}</p><p className="text-[11px] text-ink-3">Abrir análise {anuncioAberto === a.chave ? "−" : "+"}</p></div>
            </button>
            {anuncioAberto === a.chave && <Detalhe key={a.chave} l={a} dados={dados} />}
          </li>)}</ul>}
        </div>
      )}

      {aba === "evolucao" && <div>
        <p className="label mb-1.5">
          Dia a dia · barras = receita · {temVitrine ? "laranja = preço anunciado · " : ""}roxo = preço vendido no dia
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
              <ComposedChart data={serie} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} onClick={(e) => { if (e.activeLabel) setDiaEscolhido(String(e.activeLabel)); }}>
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
                {/* Anunciado: retratos com buracos entre eles (o semanal, o catálogo),
                    por isso pontos ligados só onde há dias seguidos. Vendido: só em dia
                    com venda, e ligar os pontos inventaria uma tendência. */}
                {temVitrine && (
                  <Line
                    yAxisId="p"
                    dataKey="precoVitrine"
                    stroke="var(--warn)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "var(--warn)" }}
                    isAnimationActive={false}
                  />
                )}
                <Line
                  yAxisId="p"
                  dataKey="precoVendido"
                  stroke="var(--s4)"
                  strokeOpacity={0}
                  dot={{ r: 3, fill: "var(--s4)" }}
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
        <div className="mt-3 flex flex-wrap items-center gap-2"><p className="text-[11px] text-ink-3">Clique em um pico ou escolha o dia. Cinza: período anterior.</p><input type="date" aria-label="Dia do detalhe" min={dados.deAnterior} max={dados.ate} value={diaEscolhido} onChange={(e) => setDiaEscolhido(e.target.value)} onBlur={(e) => setDiaEscolhido(e.target.value)} className="min-h-10 rounded-r1 border border-line bg-panel px-2 text-xs" /></div>
        {serie?.filter((d) => d.data === diaEscolhido).map((d) => <div key={d.data} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4" aria-live="polite">
          <Numero rotulo={`Vendas · ${dataBr(d.data)}`} agora={money(d.receita)} antes={`${count(d.unidades)} unidades`} rotuloAntes="" />
          <Numero rotulo="Preço vendido" agora={d.precoVendido == null ? "sem venda" : money(d.precoVendido)} antes="média do dia" rotuloAntes="" />
          <Numero rotulo="Preço anunciado" agora={d.precoVitrine == null ? "sem registro" : money(d.precoVitrine)} antes="menor registro do dia" rotuloAntes="" />
          <Numero rotulo="Visitas" agora={d.visitas == null ? "sem medição" : count(d.visitas)} antes={l.onde} rotuloAntes="" />
        </div>)}
      </div>}
    </div>
  );
}

function Numero({
  rotulo,
  antes,
  agora,
  extra,
  rotuloAntes = "antes ",
}: {
  rotulo: string;
  antes: string;
  agora: string;
  extra?: string;
  /** "" para a segunda linha que não é comparação com o período anterior. */
  rotuloAntes?: string;
}) {
  return (
    <div className="min-w-0 rounded-r1 border border-line bg-panel px-3 py-2">
      <p className="text-[11px] text-ink-3">{rotulo}</p>
      <p className="num break-words text-[13px] font-semibold text-ink">{agora}</p>
      <p className="num break-words text-[11px] text-ink-3" title={antes}>
        {rotuloAntes}
        {antes}
      </p>
      {extra && <p className="num break-words text-[11px] font-medium text-ink-2">{extra}</p>}
    </div>
  );
}
