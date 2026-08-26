"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import {
  Button,
  Panel,
  PanelHeader,
  Badge,
  Delta,
  EmptyState,
} from "@/components/ui/primitives";
import {
  Segmented,
  Select,
  Field,
  Input,
  Sheet,
  FilterSheet,
  Toggle,
} from "@/components/ui/controls";
import { StatTile, Sparkline } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  MONITORES_PRECO,
  ALERTAS_PRECO,
  RESUMO_PRECO,
  CANAIS_MONITORADOS,
  type MonitorPreco,
} from "@/mock/monitoramento";
import { CANAL_NOMES, CANAL_CORES } from "@/mock";
import { money, count, pct } from "@/lib/format";
import {
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
  Plus,
  RefreshCw,
  X,
  SearchX,
  ExternalLink,
  SlidersHorizontal,
  TrendingDown,
  Radar,
} from "lucide-react";

const SITUACOES = [
  { value: "todos", label: "Todos" },
  { value: "alerta", label: "Com alerta" },
  { value: "abaixo", label: "Estou mais barato" },
  { value: "acima", label: "Estou mais caro" },
] as const;

type Situacao = (typeof SITUACOES)[number]["value"];

export default function MonitoramentoPrecos() {
  const [busca, setBusca] = React.useState("");
  const [canal, setCanal] = React.useState("Todos");
  const [situacao, setSituacao] = React.useState<Situacao>("todos");
  const [selecionado, setSelecionado] = React.useState<MonitorPreco | null>(null);
  const [novoAberto, setNovoAberto] = React.useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return MONITORES_PRECO.filter((m) => {
      if (canal !== "Todos" && m.canal !== canal) return false;
      if (situacao === "alerta" && !m.alertaAberto) return false;
      if (situacao === "abaixo" && m.diferenca >= 0) return false;
      if (situacao === "acima" && m.diferenca <= 0) return false;
      if (!q) return true;
      return (
        m.produto.toLowerCase().includes(q) ||
        m.apelido.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.mlb.toLowerCase().includes(q)
      );
    });
  }, [busca, canal, situacao]);

  const filtrosAtivos = (canal !== "Todos" ? 1 : 0) + (situacao !== "todos" ? 1 : 0);

  function limpar() {
    setBusca("");
    setCanal("Todos");
    setSituacao("todos");
  }

  const colunas: Column<MonitorPreco>[] = [
    {
      key: "produto",
      header: "Produto",
      mobile: "title",
      sticky: true,
      width: "280px",
      sortValue: (m) => m.apelido,
      cell: (m) => (
        <span className="min-w-0 block">
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-ink truncate max-w-[210px]">
              {m.apelido}
            </span>
            {m.alertaAberto && <Badge tone="down">alerta</Badge>}
            {!m.ativo && <Badge tone="neutral">pausado</Badge>}
          </span>
          <span className="num block text-[11px] text-ink-3 mt-0.5">
            {m.mlb} · {m.sku}
          </span>
        </span>
      ),
    },
    {
      key: "canal",
      header: "Canal",
      mobile: "subtitle",
      width: "140px",
      sortValue: (m) => m.canal,
      cell: (m) => (
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-[2px] shrink-0"
            style={{ background: CANAL_CORES[m.canal] }}
          />
          <span className="text-ink-2 truncate">{CANAL_NOMES[m.canal]}</span>
        </span>
      ),
    },
    {
      key: "meuPreco",
      header: "Meu preço",
      align: "right",
      mobile: "metric",
      width: "120px",
      sortValue: (m) => m.meuPreco,
      cell: (m) => (
        <span className="num font-semibold text-ink">{money(m.meuPreco)}</span>
      ),
    },
    {
      key: "menorConcorrente",
      header: "Menor concorrente",
      align: "right",
      mobile: "metric",
      width: "150px",
      sortValue: (m) => m.menorConcorrente,
      cell: (m) => <span className="num">{money(m.menorConcorrente)}</span>,
    },
    {
      key: "diferenca",
      header: "Diferença",
      align: "right",
      mobile: "metric",
      width: "110px",
      sortValue: (m) => m.diferenca,
      // inverse: ficar abaixo do concorrente é bom
      cell: (m) => <Delta value={m.diferenca} inverse />,
    },
    {
      key: "vendedor",
      header: "Vendedor",
      width: "160px",
      sortValue: (m) => m.vendedor,
      cell: (m) => <span className="text-ink-2 truncate">{m.vendedor}</span>,
    },
    {
      key: "spark",
      header: "30 dias",
      align: "right",
      width: "100px",
      cell: (m) => (
        <span className="inline-block w-16 h-6 align-middle">
          <Sparkline data={m.spark} tone={m.diferenca > 0 ? "down" : "up"} />
        </span>
      ),
    },
    {
      key: "ultimaVerificacao",
      header: "Verificado",
      align: "right",
      width: "110px",
      cell: (m) => (
        <span className="text-[12px] text-ink-3">{m.ultimaVerificacao}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Monitoramento de preços"
        breadcrumb="Monitoramento"
        description={`${RESUMO_PRECO.concorrentes} concorrentes rastreados · próxima varredura ${RESUMO_PRECO.proximaVarredura}`}
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
                <span className="num text-[11px]">({filtrosAtivos})</span>
              )}
            </Button>
            <Button size="sm" className="hidden sm:inline-flex">
              <RefreshCw className="w-3.5 h-3.5" />
              Varrer agora
            </Button>
            <Button size="sm" variant="primary" onClick={() => setNovoAberto(true)}>
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Adicionar monitoramento</span>
              <span className="sm:hidden">Adicionar</span>
            </Button>
          </>
        }
        filters={
          <>
            <div className="relative shrink-0 w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Produto, SKU ou MLB"
                className="w-full h-7 pl-8 pr-7 rounded-r1 border border-line bg-panel text-[12px] text-ink placeholder:text-ink-3 focus:border-brand transition-colors"
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

            <div className="hidden md:flex items-center gap-2">
              <Select
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                className="w-44"
              >
                <option value="Todos">Todos os canais</option>
                {CANAIS_MONITORADOS.map((c) => (
                  <option key={c} value={c}>
                    {CANAL_NOMES[c]}
                  </option>
                ))}
              </Select>
              <Segmented<Situacao>
                options={SITUACOES}
                value={situacao}
                onChange={setSituacao}
              />
            </div>

            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {filtrados.length} de {MONITORES_PRECO.length}
            </span>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Produtos monitorados"
            value={count(RESUMO_PRECO.monitorados)}
            hint={`${RESUMO_PRECO.ativos} ativos`}
            spark={RESUMO_PRECO.varreduras}
          />
          <StatTile
            label="Alertas abertos"
            value={count(RESUMO_PRECO.alertas)}
            delta={25}
            inverse
            hint="regra ultrapassada"
          />
          <StatTile
            label="Estou mais barato"
            value={count(RESUMO_PRECO.abaixo)}
            hint={`de ${RESUMO_PRECO.monitorados} produtos`}
          />
          <StatTile
            label="Última varredura"
            value={RESUMO_PRECO.ultimaVarredura}
            hint={`próxima ${RESUMO_PRECO.proximaVarredura}`}
          />
        </div>

        {ALERTAS_PRECO.length > 0 && (
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Alertas recentes"
              hint="concorrente cruzou a regra que você definiu"
              action={<Badge tone="down">{ALERTAS_PRECO.length}</Badge>}
            />
            <ul className="divide-y divide-line">
              {ALERTAS_PRECO.map((a) => (
                <li key={a.id}>
                  <button className="w-full text-left px-4 py-3 flex gap-3 hover:bg-panel-2 transition-colors">
                    <span
                      className={
                        "w-6 h-6 rounded-r1 flex items-center justify-center shrink-0 mt-px " +
                        (a.severidade === "down"
                          ? "bg-down-wash text-down"
                          : a.severidade === "warn"
                            ? "bg-warn-wash text-warn"
                            : "bg-info-wash text-info")
                      }
                    >
                      <TrendingDown className="w-3.5 h-3.5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium text-ink leading-snug">
                        {a.titulo}
                      </span>
                      <span className="block text-[11px] text-ink-3 mt-0.5 truncate">
                        {a.detalhe}
                      </span>
                    </span>
                    <span className="text-[11px] text-ink-3 shrink-0">{a.quando}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Produtos monitorados"
            hint="clique numa linha para ver o histórico e os concorrentes"
          />
          <DataTable
            columns={colunas}
            rows={filtrados}
            rowKey={(m) => m.id}
            defaultSort={{ key: "diferenca", dir: "desc" }}
            onRowClick={setSelecionado}
            empty={
              <EmptyState
                icon={SearchX}
                title="Nenhum monitoramento encontrado"
                description="Ajuste a busca ou limpe os filtros."
                action={
                  <Button size="sm" onClick={limpar}>
                    Limpar filtros
                  </Button>
                }
              />
            }
          />
        </Panel>
      </PageBody>

      {selecionado && (
        <DetalheMonitor m={selecionado} onClose={() => setSelecionado(null)} />
      )}

      {novoAberto && <NovoMonitoramento onClose={() => setNovoAberto(false)} />}

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={limpar}
          applyLabel={`Ver ${filtrados.length} produtos`}
        >
          <Field label="Canal">
            <Select
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="h-11"
            >
              <option value="Todos">Todos os canais</option>
              {CANAIS_MONITORADOS.map((c) => (
                <option key={c} value={c}>
                  {CANAL_NOMES[c]}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <p className="label mb-2">Situação</p>
            <div className="flex flex-col gap-1.5">
              {SITUACOES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSituacao(s.value)}
                  className={
                    "h-11 px-3 rounded-r1 border text-[13px] font-medium text-left transition-colors " +
                    (situacao === s.value
                      ? "border-brand bg-brand-wash text-brand"
                      : "border-line text-ink-2")
                  }
                >
                  {s.label}
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
   Detalhe do monitoramento
   ══════════════════════════════════════════════════════════════ */

function DetalheMonitor({ m, onClose }: { m: MonitorPreco; onClose: () => void }) {
  return (
    <Sheet
      title={m.apelido}
      subtitle={`${m.mlb} · ${m.sku} · ${CANAL_NOMES[m.canal]}`}
      onClose={onClose}
      width="600px"
      footer={
        <>
          <Button className="flex-1 max-sm:h-11">
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir anúncio
          </Button>
          <Button variant="primary" className="flex-1 max-sm:h-11">
            Ajustar meu preço
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-line border-b border-line">
        {[
          { l: "Meu preço", v: money(m.meuPreco) },
          { l: "Menor concorrente", v: money(m.menorConcorrente) },
          { l: "Concorrentes", v: count(m.concorrentes.length) },
          { l: "Regra de alerta", v: pct(m.regraPct) },
        ].map((x) => (
          <div key={x.l} className="px-4 py-3">
            <p className="label">{x.l}</p>
            <p className="num text-[16px] font-semibold text-ink mt-1 leading-none">
              {x.v}
            </p>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="text-[12px] text-ink-3">Diferença para o menor</span>
          <Delta value={m.diferenca} inverse />
        </span>
        <span className="flex items-center gap-2">
          {m.alertaAberto && <Badge tone="down">alerta aberto</Badge>}
          <Badge tone={m.ativo ? "up" : "neutral"}>
            {m.ativo ? "ativo" : "pausado"}
          </Badge>
        </span>
      </div>

      <div className="px-4 py-3.5 border-b border-line">
        <p className="label mb-2">Histórico de preço · 30 dias</p>
        <div className="h-[210px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={m.serie} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="data" {...AXIS} minTickGap={26} />
              <YAxis
                {...AXIS}
                width={56}
                domain={["dataMin - 40", "dataMax + 40"]}
                tickFormatter={(v: number) => money(v)}
              />
              <Tooltip
                cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                content={<ChartTooltip formatter={(v) => money(v)} />}
              />
              <Line
                type="monotone"
                dataKey="meu"
                name="Meu preço"
                stroke="var(--s1)"
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="concorrente"
                name="Menor concorrente"
                stroke="var(--s6)"
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Legend
          className="mt-2"
          items={[
            { label: "Meu preço", color: "var(--s1)" },
            { label: "Menor concorrente", color: "var(--s6)" },
          ]}
        />
      </div>

      <div className="px-4 py-3.5">
        <p className="label mb-2">Concorrentes rastreados</p>
        <ul className="flex flex-col divide-y divide-line border border-line rounded-r2 overflow-hidden">
          {m.concorrentes.map((c, i) => (
            <li key={i} className="px-3 py-2.5 bg-panel">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background:
                        c.reputacao === "Verde"
                          ? "var(--up)"
                          : c.reputacao === "Amarelo"
                            ? "var(--warn)"
                            : "var(--down)",
                    }}
                  />
                  <span className="text-[13px] font-medium text-ink truncate">
                    {c.vendedor}
                  </span>
                  {c.catalogo && <Badge tone="info">catálogo</Badge>}
                </span>
                <span
                  className={
                    "num text-[13px] shrink-0 " +
                    (c.preco < m.meuPreco ? "text-down font-semibold" : "text-ink")
                  }
                >
                  {money(c.preco)}
                </span>
              </div>
              <p className="text-[11px] text-ink-3 mt-1">
                {c.reputacaoDetalhe} · {c.frete} · {c.estoque} · visto {c.visto}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

/* ══════════════════════════════════════════════════════════════
   Novo monitoramento
   ══════════════════════════════════════════════════════════════ */

function NovoMonitoramento({ onClose }: { onClose: () => void }) {
  const [link, setLink] = React.useState("");
  const [apelido, setApelido] = React.useState("");
  const [canal, setCanal] = React.useState<string>("ml");
  const [regra, setRegra] = React.useState("5");
  const [frequencia, setFrequencia] = React.useState("360");
  const [avisar, setAvisar] = React.useState(true);

  return (
    <Sheet
      title="Adicionar monitoramento"
      subtitle="A varredura começa na próxima janela agendada"
      onClose={onClose}
      footer={
        <>
          <Button className="flex-1 max-sm:h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            className="flex-1 max-sm:h-11"
            disabled={!link.trim()}
          >
            Adicionar
          </Button>
        </>
      }
    >
      <div className="px-4 py-4 space-y-4">
        <Field
          label="Link do anúncio"
          hint="Cole o endereço da página do produto no canal."
        >
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://produto.mercadolivre.com.br/MLB-..."
            className="max-sm:h-11"
          />
        </Field>

        <Field label="Apelido" hint="Como este produto aparece nas listas.">
          <Input
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            placeholder="Colchão casal premium"
            className="max-sm:h-11"
          />
        </Field>

        <Field label="Canal">
          <Select
            value={canal}
            onChange={(e) => setCanal(e.target.value)}
            className="max-sm:h-11"
          >
            {CANAIS_MONITORADOS.map((c) => (
              <option key={c} value={c}>
                {CANAL_NOMES[c]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Regra de alerta"
          hint="Avisar quando o concorrente ficar esse percentual abaixo do meu preço."
        >
          <Input
            inputMode="decimal"
            value={regra}
            onChange={(e) => setRegra(e.target.value)}
            className="max-sm:h-11"
          />
        </Field>

        <Field label="Frequência da varredura">
          <Select
            value={frequencia}
            onChange={(e) => setFrequencia(e.target.value)}
            className="max-sm:h-11"
          >
            <option value="60">A cada hora</option>
            <option value="360">A cada 6 horas</option>
            <option value="720">Duas vezes por dia</option>
            <option value="1440">Uma vez por dia</option>
          </Select>
        </Field>

        <div className="pt-1 border-t border-line">
          <div className="pt-3">
            <Toggle
              checked={avisar}
              onChange={setAvisar}
              label="Notificar quando a regra for ultrapassada"
              hint="Aparece no painel e no sino da barra superior."
            />
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="panel bg-panel-2 px-3 py-2.5 flex gap-2.5">
          <Radar className="w-4 h-4 text-ink-3 shrink-0 mt-px" strokeWidth={1.75} />
          <p className="text-[12px] text-ink-2">
            A coleta roda no servidor, não no seu navegador. Você pode fechar o
            sistema que a varredura continua no horário agendado.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
