"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { BarraFiltros, Filtro } from "@/components/layout/barra-filtros";
import { Panel, Badge, Delta, EmptyState } from "@/components/ui/primitives";
import { money, moneyShort, pct, count, nomeDoDia } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarDays, Trophy, TrendingDown, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { Pagination, usePagination } from "@/components/ui/pagination";
import type { GrupoRecorte } from "@/lib/recorte";
import type { DadosDia, DiaLinha, DiaCanal, DiaProduto } from "@/lib/dados/dia";

/**
 * A visão do dia.
 *
 * ── O calendário é o miolo ──
 *
 * Uma lista de dias em tabela não responde "qual semana foi melhor" — o
 * olho não agrupa linha por linha. Em grade, com as colunas sendo os dias
 * da semana, o padrão salta: segunda fraca, fim de semana forte, a semana
 * em que mexeram no preço.
 *
 * ── Verde e vermelho são meta, não receita ──
 *
 * A cor diz se o dia bateu a meta, não se vendeu muito. Dia de R$ 40 mil
 * com meta de R$ 50 mil é vermelho mesmo sendo o segundo melhor do mês —
 * e é essa a leitura que importa para quem cobra resultado.
 */

const br = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** "hoje às 13:04", "ontem às 01:02" ou "09/09 às 13:05" — sempre em Brasília. */
function quando(iso: string) {
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);
  const d = new Date(iso);
  const dia = fmt(d, { day: "2-digit", month: "2-digit" });
  const hora = fmt(d, { hour: "2-digit", minute: "2-digit" });
  const hoje = fmt(new Date(), { day: "2-digit", month: "2-digit" });
  const ontem = fmt(new Date(Date.now() - 86_400_000), { day: "2-digit", month: "2-digit" });
  const rotulo = dia === hoje ? "hoje" : dia === ontem ? "ontem" : dia;
  return `${rotulo} às ${hora}`;
}

function textoAtualizacao(a: DadosDia["atualizacao"]) {
  if (!a) return null;
  const ref = a.ok ? a.em : a.ultimaOk;
  if (!ref) return "canal ainda sem sincronização concluída";
  return `atualizado ${quando(ref)}${a.ok && a.automatica ? " (automático)" : ""}`;
}

/**
 * Faixa de aviso quando a última sincronização falhou.
 *
 * Fica acima dos números, e não num rodapé, porque o que ela diz muda a
 * leitura de tudo abaixo: o dia pode estar incompleto.
 */
function AvisoFalha({ a }: { a: DadosDia["atualizacao"] }) {
  if (!a || a.ok) return null;
  return (
    <div className="panel bg-warn-wash border-transparent px-3 py-2.5 mb-3 flex gap-2.5">
      <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-px" strokeWidth={2} />
      <p className="text-[12px] text-ink-2">
        <span className="font-semibold text-ink">
          A sincronização de {quando(a.em)} falhou.
        </span>{" "}
        {a.ultimaOk
          ? `Os números abaixo são de ${quando(a.ultimaOk)} e podem estar incompletos.`
          : "Nenhuma sincronização foi concluída ainda."}
        {a.erro && <span className="block text-ink-3 mt-0.5">{a.erro}</span>}
      </p>
    </div>
  );
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesDe = (iso: string) => iso.slice(0, 7);
function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function DiaCliente({ dados }: { dados: DadosDia }) {
  const router = useRouter();
  const detalhe = React.useRef<HTMLDivElement>(null);
  const rolarParaDia = React.useRef(false);

  /*
   * Tudo vive na URL: dia, mês e canais. "Olha o dia 12 só no marketplace"
   * vira um link. Navegação sem rolar para o topo: quem clicou num dia
   * quer ver o dia, não o começo da página.
   */
  function navegar(p: { data?: string; mes?: string; canais?: string[] }) {
    const q = new URLSearchParams();
    if (p.data) q.set("data", p.data);
    else if (p.mes) q.set("mes", p.mes);
    const canais = p.canais ?? dados.canaisSelecionados;
    if (canais.length) q.set("canal", canais.join(","));
    router.push(`/vendas/dia${q.toString() ? "?" + q : ""}`, { scroll: false });
  }
  const abrirDia = (data: string) => {
    rolarParaDia.current = true;
    navegar({ data });
  };
  React.useEffect(() => {
    if (rolarParaDia.current) {
      rolarParaDia.current = false;
      detalhe.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [dados.hoje?.data]);

  const filtros = dados.opcoes.length > 0 && (
    <BarraFiltros>
      <Filtro rotulo="Canais" composto>
        <SeletorCanais
          grupos={dados.opcoes}
          selecionados={dados.canaisSelecionados}
          aoAplicar={(canais) => navegar({ data: dados.hoje?.data, canais })}
        />
      </Filtro>
    </BarraFiltros>
  );

  if (dados.vazio || !dados.hoje) {
    return (
      <>
        <PageHeader title="Dia" breadcrumb="Vendas" filters={filtros || undefined} />
        <PageBody>
          <Panel className="p-6">
            <EmptyState
              icon={CalendarDays}
              title="Sem movimento registrado"
              description={
                dados.canaisSelecionados.length
                  ? "Os canais escolhidos não têm venda no período. Escolha outros no seletor acima, ou sincronize-os."
                  : "Importe os lançamentos ou sincronize o canal para a visão do dia aparecer."
              }
            />
          </Panel>
        </PageBody>
      </>
    );
  }

  const h = dados.hoje;
  const mesAtual = mesDe(h.data);
  const podeVoltar = dados.primeiraData ? mesAtual > mesDe(dados.primeiraData) : false;
  const podeAvancar = dados.ultimaData ? mesAtual < mesDe(dados.ultimaData) : false;
  const irMes = (n: number) => navegar({ mes: somarMes(mesAtual, n) });

  return (
    <>
      <PageHeader
        title="Dia"
        breadcrumb="Vendas"
        description={[`${nomeDoDia(h.diaSemana)}, ${br(h.data)}`, textoAtualizacao(dados.atualizacao)]
          .filter(Boolean)
          .join(" · ")}
        filters={filtros || undefined}
      />

      <PageBody>
        <AvisoFalha a={dados.atualizacao} />

        {/* ── O mês em calendário: escolhe o dia ── */}
        <Panel className="overflow-hidden mb-3">
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-line flex-wrap">
            <button
              type="button"
              onClick={() => irMes(-1)}
              disabled={!podeVoltar}
              aria-label="Mês anterior"
              className="flex h-9 w-9 items-center justify-center rounded-r1 text-ink-2 hover:bg-panel-3 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {/* Só a primeira letra: "capitalize" fazia "Outubro De 2026". */}
            <p className="min-w-[150px] text-center text-[15px] font-semibold text-ink">
              {dados.mesRotulo.charAt(0).toUpperCase() + dados.mesRotulo.slice(1)}
            </p>
            <button
              type="button"
              onClick={() => irMes(1)}
              disabled={!podeAvancar}
              aria-label="Próximo mês"
              className="flex h-9 w-9 items-center justify-center rounded-r1 text-ink-2 hover:bg-panel-3 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {dados.comMeta > 0 && (
              <Badge tone={dados.bateram >= dados.comMeta / 2 ? "up" : "warn"}>
                {dados.bateram} de {dados.comMeta} dias na meta
              </Badge>
            )}
            <span className="hidden lg:inline text-[12px] text-ink-3 ml-auto">
              verde bateu a meta · vermelho não · toque no dia para abrir
            </span>
          </div>
          <Calendario
            dias={dados.mes}
            foco={h.data}
            aoEscolher={abrirDia}
            aoArrastar={(n) => (n < 0 ? podeVoltar : podeAvancar) && irMes(n)}
          />
          <p className="lg:hidden px-3 pb-3 text-[12px] text-ink-3">
            Arraste para o lado para trocar de mês · toque no dia para abrir
          </p>
        </Panel>

        {/* ── O dia escolhido ── */}
        <div ref={detalhe} className="scroll-mt-[calc(var(--topbar)+12px)]">
          <p className="mb-2 text-[17px] font-semibold text-ink">
            {nomeDoDia(h.diaSemana)}, {br(h.data)}
            {h.parcial && <span className="ml-2 text-[13px] font-normal text-ink-3">sem movimento registrado</span>}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-px bg-line border border-line rounded-r2 overflow-hidden mb-3">
            <Cartao
              k="Receita líquida"
              v={money(h.receitaLiquida)}
              sub={h.valorCancelado > 0 ? `${moneyShort(h.valorCancelado)} cancelados` : "sem cancelamento"}
            />
            <Cartao
              k="Meta do dia"
              v={h.meta > 0 ? money(h.meta) : "—"}
              sub={
                h.meta > 0
                  ? h.sobraMeta >= 0
                    ? `sobrou ${moneyShort(h.sobraMeta)}`
                    : `faltou ${moneyShort(-h.sobraMeta)}`
                  : dados.metaPorConta
                    ? "meta é do canal inteiro"
                    : "sem meta para o dia"
              }
              tom={h.bateu === null ? undefined : h.bateu ? "up" : "down"}
            />
            <Cartao k="Pedidos" v={count(h.pedidosValidos)} sub={`${count(h.pedidos)} no total`} />
            <Cartao k="Ticket médio" v={h.ticket != null ? money(h.ticket) : "—"} sub="líquida ÷ válidos" />
            <Cartao
              k="Conversão"
              v={h.conversao != null ? pct(h.conversao, 2) : "—"}
              sub={h.visitas > 0 ? `${count(h.visitas)} visitas` : "sem visita registrada"}
            />
            <Cartao
              k="Ads"
              v={h.ads > 0 ? money(h.ads) : "—"}
              sub={
                h.ads > 0 && h.receitaLiquida > 0
                  ? `TACoS ${pct((h.ads / h.receitaLiquida) * 100, 1)}`
                  : "sem investimento"
              }
            />
          </div>

          {/* ── Contra o quê ── */}
          <Panel className="px-4 py-3 mb-3">
            <p className="text-[12px] text-ink-3 mb-2">
              {nomeDoDia(h.diaSemana)}, {br(h.data)} comparada com
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
              {dados.comparacoes.map((c) => (
                <div key={c.rotulo} className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[12px] text-ink-2 truncate">{c.rotulo}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="num text-[15px] text-ink">{c.receita != null ? money(c.receita) : "—"}</span>
                    {c.variacao != null && <Delta value={c.variacao} />}
                  </div>
                </div>
              ))}
            </div>
            <Disclosure title="Por que comparar com o mesmo dia da semana" className="mt-2.5">
              A comparação com a mesma {nomeDoDia(h.diaSemana)} evita a conclusão errada mais comum: segunda sempre
              parece ruim ao lado de domingo.
            </Disclosure>
          </Panel>

          <PorCanal linhas={dados.porCanal} />
          <ProdutosDoDia produtos={dados.produtos} />
        </div>

        {/* ── Melhor e pior ── */}
        {dados.melhor && dados.pior && dados.melhor.data !== dados.pior.data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Destaque icone={Trophy} titulo="Melhor dia do mês" dia={dados.melhor} tom="up" aoAbrir={() => abrirDia(dados.melhor!.data)} />
            <Destaque icone={TrendingDown} titulo="Pior dia do mês" dia={dados.pior} tom="down" aoAbrir={() => abrirDia(dados.pior!.data)} />
          </div>
        )}
      </PageBody>
    </>
  );
}

function Cartao({
  k,
  v,
  sub,
  tom,
}: {
  k: string;
  v: string;
  sub?: string;
  tom?: "up" | "down";
}) {
  return (
    <div className="bg-panel px-3.5 py-2.5 flex flex-col gap-0.5 min-w-0">
      <span className="label">{k}</span>
      <span
        className={cn(
          "num text-[17px] sm:text-[19px] font-semibold whitespace-nowrap",
          tom === "up" && "text-up",
          tom === "down" && "text-down",
          !tom && "text-ink"
        )}
      >
        {v}
      </span>
      {sub && <span className="text-[12px] text-ink-3">{sub}</span>}
    </div>
  );
}

/**
 * O mês em grade de 7 colunas, começando no domingo.
 *
 * Os dias antes do primeiro do mês entram como célula vazia, senão a
 * primeira semana desalinha das demais e o padrão semanal — que é o que
 * a grade existe para mostrar — deixa de se ver.
 *
 * Cada dia: receita, e onde há espaço pedidos e conversão. No celular a
 * célula fica só com o dia, o ponto da meta e a receita curta — 7 colunas
 * em 390px dão ~48px por dia. Arrastar para o lado troca de mês.
 */
function Calendario({
  dias,
  foco,
  aoEscolher,
  aoArrastar,
}: {
  dias: DiaLinha[];
  foco: string;
  aoEscolher: (data: string) => void;
  aoArrastar: (direcao: -1 | 1) => void;
}) {
  const toque = React.useRef<{ x: number; y: number } | null>(null);
  if (!dias.length) {
    return <p className="px-4 py-6 text-center text-[13px] text-ink-3">Sem movimento neste mês.</p>;
  }

  const vazias = dias[0].diaSemana;
  const maior = Math.max(...dias.map((d) => d.receitaLiquida), 1);

  return (
    <div
      className="p-2 sm:p-3 touch-pan-y select-none"
      onTouchStart={(e) => (toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = toque.current;
        toque.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        // Gesto claramente horizontal: para a esquerda avança, para a direita volta.
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) aoArrastar(dx < 0 ? 1 : -1);
      }}
    >
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
          <div key={d} className="label text-center pb-1">
            {d}
          </div>
        ))}

        {Array.from({ length: vazias }).map((_, i) => (
          <div key={`vazio-${i}`} />
        ))}

        {dias.map((d) => {
          const altura = Math.round((d.receitaLiquida / maior) * 22);
          return (
            <button
              key={d.data}
              onClick={() => aoEscolher(d.data)}
              aria-label={`${br(d.data)}: ${d.receitaLiquida > 0 ? money(d.receitaLiquida) : "sem movimento"}`}
              className={cn(
                "text-left rounded-r1 border p-1 sm:p-1.5 min-h-[56px] sm:min-h-[84px] flex flex-col gap-0.5 transition-colors min-w-0",
                "hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand",
                d.data === foco ? "border-brand bg-brand-wash" : "border-line bg-panel",
                d.parcial && "opacity-45"
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="num text-[12px] text-ink-3">{d.data.slice(8, 10)}</span>
                {d.bateu !== null && (
                  <span
                    className={cn("w-1.5 h-1.5 rounded-full shrink-0", d.bateu ? "bg-up" : "bg-down")}
                    aria-label={d.bateu ? "bateu a meta" : "não bateu a meta"}
                  />
                )}
              </div>

              {/* receita: curta no celular ("37,5k"), completa a partir do sm */}
              <span className="num text-[12px] font-semibold text-ink leading-tight truncate">
                {d.receitaLiquida > 0 ? (
                  <>
                    <span className="sm:hidden">{compacto(d.receitaLiquida)}</span>
                    <span className="hidden sm:inline">{moneyShort(d.receitaLiquida)}</span>
                  </>
                ) : (
                  "—"
                )}
              </span>

              {!d.parcial && d.pedidosValidos > 0 && (
                <span className="hidden sm:block num text-[12px] text-ink-2 leading-tight truncate">
                  {count(d.pedidosValidos)} ped{d.conversao != null ? ` · ${pct(d.conversao, 1)}` : ""}
                </span>
              )}

              {d.meta > 0 && (
                <span className="hidden lg:block num text-[12px] text-ink-3 leading-tight truncate">
                  meta {moneyShort(d.meta)}
                </span>
              )}

              {/* barrinha proporcional: dá o perfil do mês de relance */}
              <div className="mt-auto h-[3px] bg-line rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", d.bateu === null ? "bg-ink-3" : d.bateu ? "bg-up" : "bg-down")}
                  style={{ width: `${Math.max(2, altura * 4)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "37,5k" — receita que cabe numa célula de 48px. */
function compacto(v: number) {
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: v >= 10000 ? 0 : 1 })}k`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/* ══ Seletor de vários canais ══════════════════════════════════
 *
 * Caixas de marcar em vez de um select: a pergunta da visão do dia é
 * "e só estes canais?", que um canal por vez não responde. Aplica ao
 * fechar, numa navegação só — marcar três canais não dispara três cargas.
 */
function SeletorCanais({
  grupos,
  selecionados,
  aoAplicar,
}: {
  grupos: GrupoRecorte[];
  selecionados: string[];
  aoAplicar: (valores: string[]) => void;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [marcados, setMarcados] = React.useState<string[]>(selecionados);
  const caixa = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setMarcados(selecionados), [selecionados]);
  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const todas = grupos.flatMap((g) => g.opcoes).filter((o) => o.valor);
  const nome = (v: string) => todas.find((o) => o.valor === v)?.rotulo ?? v;
  const rotulo =
    selecionados.length === 0
      ? "Todos os canais"
      : selecionados.length === 1
        ? nome(selecionados[0])
        : `${selecionados.length} canais`;
  const alternar = (v: string) =>
    setMarcados((m) => (m.includes(v) ? m.filter((x) => x !== v) : [...m, v]));

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        className="flex h-10 w-[260px] max-w-full items-center justify-between gap-2 rounded-r1 border border-line-2 bg-panel px-3 text-[13px] text-ink"
      >
        <span className="truncate">{rotulo}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" />
      </button>
      {aberto && (
        <div className="absolute left-0 top-11 z-50 w-[min(320px,calc(100vw-32px))] rounded-r2 border border-line bg-panel shadow-[var(--sh-3)]">
          <div className="max-h-[50vh] overflow-y-auto p-2">
            {grupos.map((g, gi) => {
              const opcoes = g.opcoes.filter((o) => o.valor);
              if (!opcoes.length) return null;
              return (
                <div key={gi} className="py-1">
                  {g.rotulo && <p className="px-2 pb-1 text-[12px] font-semibold text-ink-3">{g.rotulo}</p>}
                  {opcoes.map((o) => (
                    <label
                      key={o.valor}
                      className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-r1 px-2 text-[13px] text-ink hover:bg-panel-3"
                    >
                      <input
                        type="checkbox"
                        checked={marcados.includes(o.valor)}
                        onChange={() => alternar(o.valor)}
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                      {o.rotulo}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line p-2">
            <button
              type="button"
              onClick={() => setMarcados([])}
              className="h-9 rounded-r1 px-3 text-[13px] text-ink-2 hover:bg-panel-3"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                aoAplicar(marcados);
              }}
              className="h-9 rounded-r1 bg-brand px-4 text-[13px] font-medium text-brand-ink hover:bg-brand-2"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ O dia por canal ═════════════════════════════════════════
 * Tabela no desktop, cartões no celular: oito colunas não cabem em 390px,
 * e rolar uma tabela de lado no telefone esconde metade da linha.
 */
function PorCanal({ linhas }: { linhas: DiaCanal[] }) {
  if (!linhas.length) return null;
  const nome = (l: DiaCanal) => (l.conta && l.conta !== "Conta principal" ? `${l.canal} · ${l.conta}` : l.canal);
  return (
    <Panel className="overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-line">
        <p className="text-[15px] font-semibold text-ink">Por canal</p>
        <p className="text-[12px] text-ink-3">o dia aberto em cada conta, com visita e mídia onde o canal informa</p>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[12px] font-semibold text-ink-2">
              <th className="px-4 py-2 text-left">Canal</th>
              <th className="px-3 py-2 text-right">Receita líquida</th>
              <th className="px-3 py-2 text-right">Pedidos</th>
              <th className="px-3 py-2 text-right">Ticket</th>
              <th className="px-3 py-2 text-right">Visitas</th>
              <th className="px-3 py-2 text-right">Conversão</th>
              <th className="px-3 py-2 text-right">Ads</th>
              <th className="px-3 py-2 text-right">TACoS</th>
              <th className="px-4 py-2 text-right">Cancelado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.contaId} className="border-t border-line">
                <td className="px-4 py-2.5 font-medium text-ink">{nome(l)}</td>
                <td className="num px-3 py-2.5 text-right font-semibold">{money(l.receitaLiquida)}</td>
                <td className="num px-3 py-2.5 text-right">{count(l.pedidosValidos)}</td>
                <td className="num px-3 py-2.5 text-right">{l.ticket != null ? money(l.ticket) : "—"}</td>
                <td className="num px-3 py-2.5 text-right">{l.visitas > 0 ? count(l.visitas) : "—"}</td>
                <td className="num px-3 py-2.5 text-right">{l.conversao != null ? pct(l.conversao, 2) : "—"}</td>
                <td className="num px-3 py-2.5 text-right">{l.ads > 0 ? money(l.ads) : "—"}</td>
                <td className="num px-3 py-2.5 text-right">{l.tacos != null ? pct(l.tacos, 1) : "—"}</td>
                <td className="num px-4 py-2.5 text-right text-ink-2">
                  {l.valorCancelado > 0 ? `${money(l.valorCancelado)} · ${l.cancelados}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden divide-y divide-line">
        {linhas.map((l) => (
          <li key={l.contaId} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[14px] font-medium text-ink">{nome(l)}</span>
              <span className="num text-[15px] font-semibold text-ink">{money(l.receitaLiquida)}</span>
            </div>
            <div className="num mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 text-[12px] text-ink-2">
              <span>{count(l.pedidosValidos)} pedidos</span>
              <span>{l.visitas > 0 ? `${count(l.visitas)} visitas` : "sem visita"}</span>
              <span>{l.conversao != null ? `conv. ${pct(l.conversao, 2)}` : "conv. —"}</span>
              <span>{l.ticket != null ? `ticket ${moneyShort(l.ticket)}` : "ticket —"}</span>
              <span>{l.ads > 0 ? `ads ${moneyShort(l.ads)}` : "sem ads"}</span>
              <span>{l.tacos != null ? `TACoS ${pct(l.tacos, 1)}` : "TACoS —"}</span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ══ Produtos do dia ═════════════════════════════════════════ */
function ProdutosDoDia({ produtos }: { produtos: DiaProduto[] }) {
  const { visible, pagination } = usePagination(produtos, 10);
  return (
    <Panel className="overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-line">
        <p className="text-[15px] font-semibold text-ink">Produtos mais vendidos no dia</p>
        <p className="text-[12px] text-ink-3">pedidos válidos do dia, nos canais escolhidos, por receita</p>
      </div>
      {produtos.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">
          Nenhum item de pedido registrado neste dia. Canal que entra por lançamento manual tem receita, mas não produto.
        </p>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[12px] font-semibold text-ink-2">
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Canais</th>
                  <th className="px-3 py-2 text-right">Unidades</th>
                  <th className="px-3 py-2 text-right">Pedidos</th>
                  <th className="px-4 py-2 text-right">Receita</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.sku + p.titulo} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <span className="block max-w-[360px] truncate font-medium text-ink" title={p.titulo}>
                        {p.titulo || "—"}
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-ink-3">{p.sku}</td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-2">{p.canais.join(", ")}</td>
                    <td className="num px-3 py-2.5 text-right">{count(p.unidades)}</td>
                    <td className="num px-3 py-2.5 text-right">{count(p.pedidos)}</td>
                    <td className="num px-4 py-2.5 text-right font-semibold">{money(p.receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden divide-y divide-line">
            {visible.map((p) => (
              <li key={p.sku + p.titulo} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-[13px] font-medium leading-snug text-ink">{p.titulo || p.sku}</span>
                  <span className="num shrink-0 text-[14px] font-semibold text-ink">{money(p.receita)}</span>
                </div>
                <p className="num mt-1 text-[12px] text-ink-3">
                  {p.sku} · {count(p.unidades)} un · {count(p.pedidos)} pedido(s) · {p.canais.join(", ")}
                </p>
              </li>
            ))}
          </ul>
          <Pagination {...pagination} />
        </>
      )}
    </Panel>
  );
}

function Destaque({
  icone: Icone,
  titulo,
  dia,
  tom,
  aoAbrir,
}: {
  icone: React.ElementType;
  titulo: string;
  dia: DiaLinha;
  tom: "up" | "down";
  aoAbrir: () => void;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-start gap-2.5">
        <Icone
          className={cn("w-4 h-4 shrink-0 mt-0.5", tom === "up" ? "text-up" : "text-down")}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-ink-3">{titulo}</p>
          <button
            onClick={aoAbrir}
            className="text-[15px] font-semibold text-ink hover:text-brand transition-colors"
          >
            {nomeDoDia(dia.diaSemana)}, {br(dia.data)}
          </button>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[12px] text-ink-2">
            <span className="num">{money(dia.receitaLiquida)}</span>
            <span className="num">{count(dia.pedidosValidos)} pedidos</span>
            {dia.conversao != null && (
              <span className="num">conversão {pct(dia.conversao, 2)}</span>
            )}
            {dia.ticket != null && <span className="num">ticket {money(dia.ticket)}</span>}
          </div>
        </div>
      </div>
    </Panel>
  );
}
