"use client";

import { linkDoAnuncio } from "@/lib/links";
import { cn } from "@/lib/utils";
import * as React from "react";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import {
  BarraFiltros,
  Filtro,
  FiltroAcoes,
  FiltroDivisor,
} from "@/components/layout/barra-filtros";
import {
  Button,
  Panel,
  Badge,
  Delta,
} from "@/components/ui/primitives";
import {
  Segmented,
  Select,
  Field,
  Input,
  FileDrop,
  Sheet,
  FilterSheet,
  Checkbox,
  Progress,
  SectionTitle,
} from "@/components/ui/controls";
import { AXIS, GRID, Legend } from "@/components/ui/chart";
import { TabelaSemanal } from "@/components/analise/tabela-semanal";
import { TabelaProdutos } from "@/components/analise/tabela-produtos";
import { PainelLentes } from "@/components/analise/painel-lentes";
import { SeletorCanal } from "@/components/ui/seletor-canal";
import { LinhaDoTempo } from "@/components/analise/linha-do-tempo";
import { Elasticidade } from "@/components/analise/elasticidade";
import { CompararAnuncios } from "@/components/analise/comparar";
import type { DadosAnalise } from "@/lib/dados/analise";
import { analisar, LENTES, type AnuncioAnalisado, type Lente } from "@/lib/analise";
import { money, count, pct, delta as fmtDelta, shortDate } from "@/lib/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Search,
  Upload,
  Download,
  X,
  ExternalLink,
  SlidersHorizontal,
  RefreshCw,
  TriangleAlert,
  Package,
} from "lucide-react";

/**
 * Tamanhos de recorte oferecidos. A lista é filtrada pelo que existe de
 * fato no histórico importado — não adianta oferecer 52 semanas quando só
 * há 11 no relatório. O último item é sempre "tudo o que existe".
 */
const RECORTES_POSSIVEIS = [4, 8, 12, 16, 26, 39, 52];

const TIPOS = ["Todos", "Clássico", "Premium"] as const;
const STATUS = ["Todos", "ativo", "pausado"] as const;

/** Cor semântica do desvio de preço. */
function tomDesvio(d: number) {
  const a = Math.abs(d);
  return a < 2 ? "up" : a < 6 ? "warn" : "down";
}

/* ══════════════════════════════════════════════════════════════
   Indicador de preço — praticado contra ideal, numa barra só
   ══════════════════════════════════════════════════════════════ */

function IndicadorPreco({
  praticado,
  ideal,
  compacto = false,
}: {
  praticado: number;
  ideal: number;
  compacto?: boolean;
}) {
  if (!ideal) return <span className="text-ink-3">—</span>;
  const desvio = ((praticado - ideal) / ideal) * 100;
  const tom = tomDesvio(desvio);

  if (compacto) {
    return (
      <span className="inline-flex items-center gap-1.5 justify-end">
        <span className="num text-ink">{money(praticado)}</span>
        <Badge tone={tom}>
          <span className="num">{fmtDelta(desvio)}</span>
        </Badge>
      </span>
    );
  }

  // A régua: o ideal fica no centro, o praticado desloca para os lados.
  const posicao = Math.max(-1, Math.min(1, desvio / 15)); // ±15% satura
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="num text-[19px] font-semibold text-ink leading-none">
          {money(praticado)}
        </span>
        <span className="num text-[13px] text-ink-3">
          ideal {money(ideal)}
        </span>
      </div>
      <div className="relative h-1.5 mt-3 rounded-full bg-panel-3">
        <span className="absolute left-1/2 -top-1 bottom-[-4px] w-px bg-line-2" />
        <span
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-panel"
          style={{
            left: `calc(50% + ${posicao * 46}% - 5px)`,
            background: `var(--${tom})`,
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[12px] text-ink-3">abaixo do ideal</span>
        <Badge tone={tom}>
          <span className="num">{fmtDelta(desvio)}</span>
        </Badge>
        <span className="text-[12px] text-ink-3">acima do ideal</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Página
   ══════════════════════════════════════════════════════════════ */

/** Estado do retrato de preço disparado pelo botão. */
type EstadoPrecos =
  | { fase: "ocioso" }
  | { fase: "buscando" }
  | { fase: "ok"; quando: Date; atualizados: number; comErro: number }
  | { fase: "erro"; mensagem: string; configurado: boolean };

export default function AnaliseAnuncios({ dados }: { dados: DadosAnalise }) {
  const {
    anuncios: ANUNCIOS_ANALISE,
    semanas: SEMANAS,
    importacoes: IMPORTACOES,
  } = dados;

  /*
   * A semana em curso fica FORA do recorte por padrão.
   *
   * Ela tem 2 dias dos 7 e entra duas vezes na conta: na soma do período e
   * na comparação com as N semanas anteriores. O efeito era toda métrica
   * da tela aparecer despencando no começo de cada semana — a S44 com 25
   * vendas contra as 264 da S43 não é queda, é terça-feira.
   *
   * Quem quiser ver o parcial marca a caixa; o rótulo diz quantos dias
   * ele tem, para a leitura não ser confundida com uma semana fechada.
   */
  const EM_CURSO = React.useMemo(
    () => SEMANAS.find((x) => x.parcial) ?? null,
    [SEMANAS]
  );
  const [incluirEmCurso, setIncluirEmCurso] = React.useState(false);
  const BASE = React.useMemo(
    () => (incluirEmCurso ? SEMANAS : SEMANAS.filter((x) => !x.parcial)),
    [SEMANAS, incluirEmCurso]
  );

  /*
   * Opções de recorte que fazem sentido para este histórico. Sempre termina
   * com o total disponível, para o caso de o Eduardo querer olhar tudo.
   */
  const RECORTES = React.useMemo(() => {
    const total = BASE.length;
    const valores = RECORTES_POSSIVEIS.filter((n) => n < total);
    if (total > 0) valores.push(total);
    return valores.map((n) => ({
      value: String(n),
      label: n === total ? `${n} semanas (tudo)` : `${n} semanas`,
    }));
  }, [BASE.length]);

  const [recorte, setRecorte] = React.useState(() =>
    String(Math.min(8, SEMANAS.length || 8))
  );
  /*
   * Destravar a semana em curso encurta a lista de opções em 1, e o valor
   * escolhido pode deixar de existir nela. Clampar aqui evita o <select>
   * em branco sem precisar de efeito para corrigir o estado.
   */
  const nSemanas = Math.min(Number(recorte), BASE.length);
  const [precos, setPrecos] = React.useState<EstadoPrecos>({ fase: "ocioso" });
  const [busca, setBusca] = React.useState("");
  const [conta, setConta] = React.useState("");
  const [tipo, setTipo] = React.useState<(typeof TIPOS)[number]>("Todos");
  const [status, setStatus] = React.useState<(typeof STATUS)[number]>("Todos");
  const [selecionado, setSelecionado] = React.useState<AnuncioAnalisado | null>(null);
  const [marcados, setMarcados] = React.useState<string[]>([]);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  /* A lente é filtro, não aba: ela recorta a mesma tabela. */
  const [lente, setLente] = React.useState<Lente>("todos");
  const [comparando, setComparando] = React.useState(false);

  const selecionadas = React.useMemo(() => BASE.slice(-nSemanas), [BASE, nSemanas]);
  const semanasSelecionadas = React.useMemo(
    () => selecionadas.map((x) => x.semana),
    [selecionadas]
  );
  /* O recorte em datas de verdade. "8 semanas" não diz qual período é. */
  const rotuloPeriodo = selecionadas.length
    ? `${shortDate(selecionadas[0].inicio)} – ${shortDate(
        selecionadas[selecionadas.length - 1].fim
      )}`
    : "sem semana fechada";

  // O join dos relatórios + as métricas derivadas. Recalcula quando o
  // recorte de semanas muda, porque as curvas A são relativas ao recorte.
  const { itens, resumo } = React.useMemo(
    () => analisar(ANUNCIOS_ANALISE, semanasSelecionadas),
    [semanasSelecionadas]
  );

  /*
   * A variação dos cartões: o mesmo resumo nas N semanas ANTERIORES ao
   * recorte. Antes os cinco cartões tinham percentuais fixos no código
   * (11,8%, 6,4%, −2,1%, 9,2%, −15%), sobra de protótipo, e mostravam a
   * mesma "variação" em qualquer recorte. Sem semanas para comparar, o
   * cartão fica sem variação.
   */
  const resumoAnterior = React.useMemo(() => {
    if (!nSemanas || BASE.length < 2 * nSemanas) return null;
    const anteriores = BASE.slice(-2 * nSemanas, -nSemanas).map((x) => x.semana);
    return analisar(ANUNCIOS_ANALISE, anteriores).resumo;
  }, [nSemanas, BASE, ANUNCIOS_ANALISE]);
  const variacaoDe = (atual: number, anterior: number | undefined) =>
    anterior ? ((atual - anterior) / anterior) * 100 : undefined;
  const dicaComparacao = resumoAnterior ? `vs. ${nSemanas} semanas anteriores` : "sem período anterior para comparar";

  // Filtros de atributo (não afetam as médias da carteira, de propósito:
  // "acima da média" tem de significar a média de tudo, não a do filtro).
  /*
   * Contas que aparecem nos anúncios importados. Sai do dado, não de uma
   * lista fixa: quando a 2ª conta do Mercado Livre passar a ter relatório
   * de desempenho, ela entra sozinha no seletor.
   */
  const CONTAS = React.useMemo(() => {
    const vistas = new Map<string, string>();
    for (const i of itens) if (i.conta) vistas.set(i.conta, i.conta);
    return [...vistas.keys()].sort().map((c) => ({ id: c, nome: c }));
  }, [itens]);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (lente !== "todos" && !i.lentes.includes(lente)) return false;
      if (conta && i.conta !== conta) return false;
      if (tipo !== "Todos" && i.tipo !== tipo) return false;
      if (status !== "Todos" && i.status !== status) return false;
      if (!q) return true;
      return (
        i.titulo.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.mlb.toLowerCase().includes(q)
      );
    });
  }, [itens, busca, tipo, status, conta, lente]);

  /**
   * Link direto para um anúncio: `?anuncio=MLB123`.
   *
   * É o que faz a busca global valer a pena — digitar o MLB de qualquer
   * tela e cair com o raio-X já aberto. Lê da URL em vez de
   * `useSearchParams` para não exigir uma fronteira de Suspense só por isso.
   */
  React.useEffect(() => {
    const alvo = new URLSearchParams(window.location.search).get("anuncio");
    if (!alvo) return;
    const achado = itens.find((i) => i.mlb === alvo.toUpperCase());
    if (achado) setSelecionado(achado);
  }, [itens]);

  const filtrosAtivos = (tipo !== "Todos" ? 1 : 0) + (status !== "Todos" ? 1 : 0);

  /**
   * Puxa o preço da vitrine agora, sob demanda.
   * É manual porque o preço anunciado muda pouco dentro da semana — varrer
   * todo dia gastaria chamada sem mudar a leitura.
   */
  async function atualizarPrecos() {
    setPrecos({ fase: "buscando" });
    try {
      const r = await fetch("/api/anuncios/precos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mlbs: itens.map((i) => i.mlb) }),
      });
      const json = await r.json();

      if (!r.ok) {
        setPrecos({
          fase: "erro",
          mensagem: json.erro ?? "Falha ao consultar o canal.",
          configurado: json.configurado !== false,
        });
        return;
      }

      setPrecos({
        fase: "ok",
        quando: new Date(),
        atualizados: json.recebidos - json.comErro,
        comErro: json.comErro,
      });
    } catch {
      setPrecos({
        fase: "erro",
        mensagem: "Não consegui falar com o servidor.",
        configurado: true,
      });
    }
  }

  function limparFiltros() {
    setBusca("");
    setTipo("Todos");
    setStatus("Todos");
  }

  function alternarMarca(mlb: string) {
    setMarcados((m) => (m.includes(mlb) ? m.filter((x) => x !== mlb) : [...m, mlb]));
  }


  return (
    <>
      <PageHeader
        mobileFilters={false}
        title="Anúncios"
        breadcrumb="Mercado Livre"
        actions={
          <>
            <Button
              size="sm"
              className="md:hidden"
              onClick={() => setFiltrosAbertos(true)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filtros
              {filtrosAtivos > 0 && (
                <span className="num text-[12px]">({filtrosAtivos})</span>
              )}
            </Button>
            <Button
              size="sm"
              onClick={atualizarPrecos}
              disabled={precos.fase === "buscando"}
              title="Consulta no canal o preço que está na vitrine agora"
            >
              <RefreshCw
                className={
                  "w-3.5 h-3.5 " + (precos.fase === "buscando" ? "animate-spin" : "")
                }
              />
              <span className="hidden sm:inline">
                {precos.fase === "buscando" ? "Consultando…" : "Atualizar preços"}
              </span>
            </Button>
          </>
        }
        filters={
          <BarraFiltros>
            <Filtro rotulo="Conta">
              <SeletorCanal
                canais={CONTAS}
                valor={conta}
                onChange={setConta}
                rotuloTodos="Todas as contas"
              />
            </Filtro>

            <Filtro rotulo={`Semanas · ${rotuloPeriodo}`}>
              <Select
                value={String(nSemanas)}
                onChange={(e) => setRecorte(e.target.value)}
                className="w-[168px]"
              >
                {RECORTES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Filtro>

            {EM_CURSO && (
              <Filtro composto rotulo="Semana em curso">
                <div className="h-9 flex items-center">
                  <Checkbox
                    checked={incluirEmCurso}
                    onChange={setIncluirEmCurso}
                    label={`incluir · ${EM_CURSO.dias} de 7 dias`}
                  />
                </div>
              </Filtro>
            )}

            <Filtro rotulo="Tipo" className="hidden md:flex">
              <Segmented<(typeof TIPOS)[number]>
                options={TIPOS}
                value={tipo}
                onChange={setTipo}
              />
            </Filtro>

            <Filtro rotulo="Situação" className="hidden md:flex">
              <Segmented<(typeof STATUS)[number]>
                options={STATUS.map((s) => ({
                  value: s,
                  label: s === "Todos" ? "Todos" : s === "ativo" ? "Ativos" : "Pausados",
                }))}
                value={status}
                onChange={setStatus}
              />
            </Filtro>

            <FiltroDivisor />

            <Filtro rotulo="Buscar" className="w-full sm:w-64">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Título, SKU ou MLB"
                  className="w-full h-8 pl-8 pr-7 rounded-r1 border border-line bg-panel text-[12px] text-ink placeholder:text-ink-3 focus:border-brand transition-colors"
                />
                {busca && (
                  <button
                    onClick={() => setBusca("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-ink-3 hover:text-ink"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </Filtro>

            <FiltroAcoes>
              <span className="num text-[12px] text-ink-3 hidden md:block">
                {filtrados.length} de {itens.length}
              </span>
            </FiltroAcoes>
          </BarraFiltros>
        }
      />

      <PageBody>
        {/* ── Retrato de preço ───────────────────────────────── */}
        {precos.fase === "erro" && (
          <Panel
            className={
              "px-4 py-3 flex gap-2.5 border-transparent " +
              (precos.configurado ? "bg-down-wash" : "bg-warn-wash")
            }
          >
            <TriangleAlert
              className={
                "w-4 h-4 shrink-0 mt-px " +
                (precos.configurado ? "text-down" : "text-warn")
              }
              strokeWidth={2}
            />
            <p className="text-[12px] text-ink-2">
              <span className="font-semibold text-ink">
                {precos.configurado
                  ? "Não deu para atualizar. "
                  : "Canal ainda não conectado. "}
              </span>
              {precos.mensagem}
              {!precos.configurado && (
                <>
                  {" "}
                  Enquanto isso a tela usa o preço da última importação de
                  planilha.
                </>
              )}
            </p>
          </Panel>
        )}

        {precos.fase === "ok" && (
          <p className="text-[12px] text-ink-3 -mb-1">
            <span className="num">{count(precos.atualizados)}</span> preços lidos às{" "}
            <span className="num">
              {precos.quando.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {precos.comErro > 0 && (
              <>
                {" · "}
                <span className="num">{precos.comErro}</span> sem resposta
              </>
            )}
          </p>
        )}

        <PainelLentes
          itens={itens}
          lente={lente}
          escolher={setLente}
          periodo={`${nSemanas} semanas (${rotuloPeriodo})`}
        />

        <TabelaProdutos
          itens={filtrados}
          semanas={semanasSelecionadas}
          abrir={setSelecionado}
          marcados={marcados}
          marcar={setMarcados}
          comparar={() => setComparando(true)}
        />
      </PageBody>

      {selecionado && (
        <RaioX item={selecionado} onClose={() => setSelecionado(null)} />
      )}

      {comparando && (
        <CompararAnuncios
          itens={itens.filter((i) => marcados.includes(i.mlb))}
          onClose={() => setComparando(false)}
        />
      )}

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={limparFiltros}
          applyLabel={`Ver ${filtrados.length} anúncios`}
        >
          <Field label={`Semanas analisadas · ${rotuloPeriodo}`}>
            <Select
              value={String(nSemanas)}
              onChange={(e) => setRecorte(e.target.value)}
              className="h-11"
            >
              {RECORTES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          {EM_CURSO && (
            <Checkbox
              checked={incluirEmCurso}
              onChange={setIncluirEmCurso}
              label={`Incluir a semana em curso (${EM_CURSO.semana}, ${EM_CURSO.dias} de 7 dias)`}
            />
          )}

          <div>
            <p className="label mb-2">Tipo de anúncio</p>
            <div className="flex gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={
                    "flex-1 h-11 rounded-r1 border text-[13px] font-medium transition-colors " +
                    (tipo === t
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-2">Situação</p>
            <div className="flex gap-2">
              {STATUS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={
                    "flex-1 h-11 rounded-r1 border text-[13px] font-medium transition-colors capitalize " +
                    (status === s
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {s === "Todos" ? "Todos" : s}
                </button>
              ))}
            </div>
          </div>

        </FilterSheet>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Raio-X do anúncio
   ══════════════════════════════════════════════════════════════ */

/**
 * A dica das duas faixas de semana.
 *
 * Mesma caixa em cima e embaixo: quem passa na semana 40 do preço e na
 * semana 40 da venda espera ler a mesma coisa. Fora do JSX porque dois
 * gráficos a usam.
 */
function DicaSemana({
  active,
  payload,
  label,
  serie,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  serie: { semana: string; intervalo: string }[];
}) {
  if (!active || !payload?.length) return null;
  const s = serie.find((x) => x.semana === label);
  return (
    <div className="panel px-2.5 py-2 min-w-[170px]" style={{ boxShadow: "var(--sh-3)" }}>
      <p className="text-[12px] font-semibold text-ink-2 mb-1.5">
        {s ? `${s.semana} · ${s.intervalo}` : String(label ?? "")}
      </p>
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2 h-2 rounded-[2px] shrink-0"
                style={{ background: p.color }}
              />
              <span className="text-[12px] text-ink-2 truncate">{p.name}</span>
            </span>
            <span className="num text-[12px] font-semibold text-ink">
              {p.name === "Unidades" ? count(Number(p.value)) : money(Number(p.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RaioX({
  item,
  onClose,
}: {
  item: AnuncioAnalisado;
  onClose: () => void;
}) {
  const m = item.metricas;

  const serie = item.semanas.map((w) => ({
    semana: w.semana,
    intervalo: w.intervalo,
    vendas: w.vendas,
    visitas: w.visitas,
    // No gráfico vale o preço pago; sem venda, cai para o da vitrine.
    preco: w.precoRealizado ?? w.precoAnunciado,
    anunciado: w.precoAnunciado,
    ideal: w.precoIdeal,
  }));

  /* A última semana em que houve visita OU venda: é onde a série para. */
  const ultimaSemanaMedida = [...item.semanas]
    .reverse()
    .find((w) => w.visitas > 0 || w.vendas > 0)?.intervalo;

  const diagnosticos = LENTES.filter(
    (l) => l.id !== "todos" && item.lentes.includes(l.id)
  );

  return (
    <Sheet
      title={item.titulo}
      subtitle={`${item.mlb} · ${item.sku} · ${item.conta}${item.status !== "ativo" ? ` · ${item.status}` : ""}`}
      onClose={onClose}
      width="640px"
      footer={
        <>
          <Link className="inline-flex min-h-11 flex-1 items-center justify-center rounded-r1 border border-line px-3 text-xs text-brand" href={`/produtos?sku=${encodeURIComponent(item.sku || item.mlb)}`}>Preços, histórico e estoque</Link>
          {linkDoAnuncio(item.mlb) ? (
            <a
              href={linkDoAnuncio(item.mlb)!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-8 max-sm:h-11 inline-flex items-center justify-center gap-1.5 rounded-r1 border border-line-2 bg-panel text-[13px] text-ink hover:bg-panel-3 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir no Mercado Livre
            </a>
          ) : (
            <Button className="flex-1 max-sm:h-11" onClick={onClose}>
              Fechar
            </Button>
          )}
        </>
      }
    >
      {/* selos */}
      <div className="px-4 py-3 flex flex-wrap gap-1.5 border-b border-line">
        {m.curvaAReceita && <Badge tone="brand">Curva A · receita</Badge>}
        {m.curvaATrafego && <Badge tone="brand">Curva A · tráfego</Badge>}
        <Badge tone="neutral">{item.tipo}</Badge>
        <Badge tone="neutral">{item.categoria}</Badge>
        <Badge tone={item.status === "ativo" ? "up" : "neutral"}>{item.status}</Badge>
        {m.campanhasAtivas > 0 && (
          <Badge tone="info">
            <span className="num">{m.campanhasAtivas}</span>
            <span className="ml-1">em campanha</span>
          </Badge>
        )}
      </div>

      {/* diagnóstico — o que o sistema achou e o que fazer */}
      {diagnosticos.length > 0 && (
        <div className="px-4 py-3 border-b border-line">
          <p className="label mb-2.5">Diagnóstico</p>
          <ul className="flex flex-col gap-2.5">
            {diagnosticos.map((l) => (
              <li key={l.id} className="flex gap-2.5">
                <span
                  className="w-1 rounded-full shrink-0"
                  style={{
                    background:
                      l.id === "converte_bem"
                        ? "var(--up)"
                        : l.id === "acima_tabela" || l.id === "sem_tabela"
                          ? "var(--warn)"
                          : "var(--down)",
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-ink">
                    {l.rotulo}
                  </span>
                  <span className="block text-[12px] text-ink-2 mt-0.5">
                    {item.motivos[l.id]}
                  </span>
                  <span className="block text-[12px] text-ink-3 mt-1">
                    Sugestão: {l.acao}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* números do período */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-line border-b border-line">
        {[
          { l: "Visitas", v: count(m.visitas) },
          { l: "Vendas", v: count(m.vendas) },
          { l: "Conversão", v: pct(m.conversao, 2) },
          { l: "Receita", v: money(m.receita) },
        ].map((x) => (
          <div key={x.l} className="px-4 py-3">
            <p className="label">{x.l}</p>
            <p className="num text-[16px] font-semibold text-ink mt-1 leading-none">
              {x.v}
            </p>
          </div>
        ))}
      </div>

      {/* preço */}
      <div className="px-4 py-3.5 border-b border-line">
        <p className="label mb-3">Aderência de preço</p>
        <IndicadorPreco praticado={m.preco} ideal={m.precoIdeal} />
        <div className="mt-4 pt-3 border-t border-line grid grid-cols-2 gap-y-2">
          <span className="text-[12px] text-ink-3">Comissão do canal</span>
          <span className="num text-[13px] text-ink text-right">
            {pct(m.comissao)}
          </span>
          <span className="text-[12px] text-ink-3">Subsídio acumulado</span>
          <span
            className={
              "num text-[13px] text-right " +
              (m.subsidio > 0 ? "text-down font-semibold" : "text-ink")
            }
          >
            {m.subsidio > 0 ? money(m.subsidio) : "—"}
          </span>
          <span className="text-[12px] text-ink-3">Peso na receita do item</span>
          <span className="num text-[13px] text-ink text-right">
            {m.subsidio > 0 ? pct(m.subsidioPct) : "—"}
          </span>
          <span className="text-[12px] text-ink-3">Elasticidade ao desconto</span>
          <span className="text-[13px] text-right">
            {m.elasticidadePositiva ? (
              <Badge tone="up">positiva</Badge>
            ) : (
              <Badge tone="neutral">não observada</Badge>
            )}
          </span>
        </div>
      </div>

      {/* preço e venda, nas mesmas semanas e em eixos separados */}
      <div className="px-4 py-3.5 border-b border-line">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="label">Preço e venda por semana</p>
          <Delta value={m.tendencia} />
        </div>

        <div className="h-[140px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              {/* O eixo de semana aparece só embaixo: repetir os mesmos
                  rótulos nos dois gasta altura e não acrescenta nada. */}
              <XAxis dataKey="semana" {...AXIS} tick={false} height={4} />
              <YAxis
                {...AXIS}
                width={56}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => money(v)}
              />
              <Tooltip content={<DicaSemana serie={serie} />} cursor={{ stroke: "var(--line-2)" }} />
              <Line
                type="monotone"
                dataKey="preco"
                name="Preço praticado"
                stroke="var(--s3)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ideal"
                name="Preço ideal"
                stroke="var(--ink-3)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="h-[104px] -ml-2 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="semana" {...AXIS} />
              <YAxis {...AXIS} width={56} allowDecimals={false} />
              <Tooltip content={<DicaSemana serie={serie} />} cursor={{ fill: "var(--panel-3)" }} />
              <Bar
                dataKey="vendas"
                name="Unidades"
                fill="var(--s1)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <Legend
          className="mt-2"
          items={[
            { label: "Preço praticado", color: "var(--s3)" },
            { label: "Preço ideal", color: "var(--ink-3)" },
            { label: "Unidades", color: "var(--s1)" },
          ]}
        />
      </div>

      <Elasticidade item={item} />

      {/* o que aconteceu — antes dos números, porque é o que explica */}
      <LinhaDoTempo item={item} />

      {/* histórico semana a semana */}
      {item.status !== "ativo" && (
        <p className="px-4 pb-1 text-[12px] text-ink-3">
          Anúncio {item.status}
          {ultimaSemanaMedida
            ? `: a série para em ${ultimaSemanaMedida} porque anúncio fora do ar não recebe visita.`
            : ": anúncio fora do ar não recebe visita."}
        </p>
      )}
      <TabelaSemanal item={item} />

      <div className="px-4 pb-4">
        {item.semanas.some((w) => w.campanhas.length > 0) && (
          <div>
            <p className="label mb-2">Campanhas no período</p>
            <ul className="flex flex-col gap-1">
              {item.semanas
                .filter((w) => w.campanhas.length > 0)
                .map((w) => (
                  <li
                    key={w.semana}
                    className="flex items-center justify-between gap-3 h-8 px-2.5 rounded-r1 border border-line bg-panel-2"
                  >
                    <span className="num text-[12px] text-ink-3 shrink-0">
                      {w.semana}
                    </span>
                    <span className="text-[12px] text-ink truncate flex-1">
                      {w.campanhas[0].nome}
                    </span>
                    <span className="num text-[12px] text-ink-2 shrink-0">
                      {money(w.campanhas[0].preco)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

