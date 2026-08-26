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
import { Segmented, Select, Field, FilterSheet } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { ChartTooltip, AXIS, GRID, Legend } from "@/components/ui/chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  MONITORES_FRETE as __MONITORES_FRETE,
  FRETE_12_SEMANAS as __FRETE_12_SEMANAS,
  RESUMO_REGIOES as __RESUMO_REGIOES,
  RESUMO_FRETE as __RESUMO_FRETE,
  VARIACAO_MES as __VARIACAO_MES,
  MODALIDADES as __MODALIDADES,
  REGIOES as __REGIOES,
  FAIXAS_CEP as __FAIXAS_CEP,
  CANAIS_MONITORADOS as __CANAIS_MONITORADOS,
  REGIAO_KEY as __REGIAO_KEY,
  REGIAO_COR as __REGIAO_COR,
  type MonitorFrete,
  type Modalidade,
} from "@/mock/monitoramento";
import {
  CANAL_NOMES as __CANAL_NOMES,
  CANAL_CORES as __CANAL_CORES,
} from "@/mock";
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
import { Search, RefreshCw, X, SearchX, SlidersHorizontal } from "lucide-react";

import { zerar } from "@/mock/zerar";

/*
 * Esta tela ainda não tem fonte de dados. Os números vêm zerados de
 * propósito: com a maior parte da plataforma já lendo o banco, número
 * de exemplo com cara de real é pior que campo vazio — não há como
 * saber, olhando, se aquilo é a operação ou é enfeite.
 *
 * A estrutura fica — rótulos, canais, colunas — para mostrar o que a
 * tela vai exibir quando o dado chegar.
 */
const MONITORES_FRETE = zerar(__MONITORES_FRETE);
const FRETE_12_SEMANAS = zerar(__FRETE_12_SEMANAS);
const RESUMO_REGIOES = zerar(__RESUMO_REGIOES);
const RESUMO_FRETE = zerar(__RESUMO_FRETE);
const VARIACAO_MES = zerar(__VARIACAO_MES);
const MODALIDADES = zerar(__MODALIDADES);
const REGIOES = zerar(__REGIOES);
const FAIXAS_CEP = zerar(__FAIXAS_CEP);
const CANAIS_MONITORADOS = zerar(__CANAIS_MONITORADOS);
const REGIAO_KEY = zerar(__REGIAO_KEY);
const REGIAO_COR = zerar(__REGIAO_COR);
const CANAL_NOMES = zerar(__CANAL_NOMES);
const CANAL_CORES = zerar(__CANAL_CORES);


export default function MonitoramentoFretes() {
  const [busca, setBusca] = React.useState("");
  const [canal, setCanal] = React.useState("Todos");
  const [modalidade, setModalidade] = React.useState<Modalidade | "Todas">("Todas");
  const [regiao, setRegiao] = React.useState("Todas");
  const [faixa, setFaixa] = React.useState("Todas");
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return MONITORES_FRETE.filter((m) => {
      if (canal !== "Todos" && m.canal !== canal) return false;
      if (modalidade !== "Todas" && m.modalidade !== modalidade) return false;
      if (regiao !== "Todas" && m.regiao !== regiao) return false;
      if (faixa !== "Todas" && m.faixaId !== faixa) return false;
      if (!q) return true;
      return (
        m.produto.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.mlb.toLowerCase().includes(q) ||
        m.faixaRotulo.toLowerCase().includes(q)
      );
    });
  }, [busca, canal, modalidade, regiao, faixa]);

  const filtrosAtivos =
    (canal !== "Todos" ? 1 : 0) +
    (modalidade !== "Todas" ? 1 : 0) +
    (regiao !== "Todas" ? 1 : 0) +
    (faixa !== "Todas" ? 1 : 0);

  function limpar() {
    setBusca("");
    setCanal("Todos");
    setModalidade("Todas");
    setRegiao("Todas");
    setFaixa("Todas");
  }

  // As faixas oferecidas acompanham a região escolhida — oferecer Bahia
  // enquanto o filtro está no Sul só produziria tabela vazia.
  const faixasDisponiveis = React.useMemo(
    () =>
      regiao === "Todas"
        ? FAIXAS_CEP
        : FAIXAS_CEP.filter((f) => f.regiao === regiao),
    [regiao]
  );

  const colunas: Column<MonitorFrete>[] = [
    {
      key: "produto",
      header: "Produto",
      mobile: "title",
      sticky: true,
      width: "260px",
      sortValue: (m) => m.produto,
      cell: (m) => (
        <span className="min-w-0 block">
          <span className="font-medium text-ink truncate max-w-[220px] block">
            {m.produto}
          </span>
          <span className="num block text-[11px] text-ink-3 mt-0.5">
            {m.sku} · {m.classe}
          </span>
        </span>
      ),
    },
    {
      key: "canal",
      header: "Canal",
      mobile: "subtitle",
      width: "130px",
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
      key: "modalidade",
      header: "Modalidade",
      width: "110px",
      sortValue: (m) => m.modalidade,
      cell: (m) => <Badge tone="neutral">{m.modalidade}</Badge>,
    },
    {
      key: "faixa",
      header: "Destino",
      width: "190px",
      sortValue: (m) => m.faixaRotulo,
      cell: (m) => (
        <span className="min-w-0 block">
          <span className="text-ink truncate block">{m.faixaRotulo}</span>
          <span className="num block text-[11px] text-ink-3">{m.faixa}</span>
        </span>
      ),
    },
    {
      key: "freteAtual",
      header: "Frete atual",
      align: "right",
      mobile: "metric",
      width: "120px",
      sortValue: (m) => m.freteAtual,
      cell: (m) => (
        <span className="num font-semibold text-ink">{money(m.freteAtual)}</span>
      ),
    },
    {
      key: "freteAnterior",
      header: "Anterior",
      align: "right",
      width: "110px",
      sortValue: (m) => m.freteAnterior,
      cell: (m) => <span className="num text-ink-3">{money(m.freteAnterior)}</span>,
    },
    {
      key: "variacao",
      header: "Variação",
      align: "right",
      mobile: "metric",
      width: "110px",
      sortValue: (m) => m.variacao,
      // inverse: frete caindo é bom
      cell: (m) => <Delta value={m.variacao} inverse />,
    },
    {
      key: "prazoDias",
      header: "Prazo",
      align: "right",
      mobile: "metric",
      width: "100px",
      sortValue: (m) => m.prazoDias,
      cell: (m) => (
        <span className="flex items-center justify-end gap-1.5">
          <span className="num text-ink">{m.prazoDias} d</span>
          {m.prazoDias !== m.prazoAnterior && (
            <Badge tone={m.prazoDias < m.prazoAnterior ? "up" : "warn"}>
              <span className="num">
                {m.prazoDias < m.prazoAnterior ? "−" : "+"}
                {Math.abs(m.prazoDias - m.prazoAnterior)}
              </span>
            </Badge>
          )}
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
        title="Monitoramento de fretes"
        breadcrumb="Monitoramento"
        description={`${RESUMO_FRETE.linhas} combinações de produto, modalidade e destino · última varredura ${RESUMO_FRETE.ultimaVarredura}`}
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
            <Button size="sm" variant="primary">
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Varrer agora</span>
            </Button>
          </>
        }
        filters={
          <>
            <div className="relative shrink-0 w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Produto, SKU ou destino"
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
                className="w-40"
              >
                <option value="Todos">Todos os canais</option>
                {CANAIS_MONITORADOS.map((c) => (
                  <option key={c} value={c}>
                    {CANAL_NOMES[c]}
                  </option>
                ))}
              </Select>

              <Segmented<Modalidade | "Todas">
                options={["Todas", ...MODALIDADES]}
                value={modalidade}
                onChange={setModalidade}
              />

              <Select
                value={regiao}
                onChange={(e) => {
                  setRegiao(e.target.value);
                  setFaixa("Todas");
                }}
                className="w-36"
              >
                <option value="Todas">Todas as regiões</option>
                {REGIOES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>

              <Select
                value={faixa}
                onChange={(e) => setFaixa(e.target.value)}
                className="w-44"
              >
                <option value="Todas">Todas as faixas de CEP</option>
                {faixasDisponiveis.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.rotulo}
                  </option>
                ))}
              </Select>
            </div>

            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {filtrados.length} de {MONITORES_FRETE.length}
            </span>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Produtos acompanhados"
            value={count(RESUMO_FRETE.produtos)}
            hint={`${RESUMO_FRETE.linhas} combinações`}
          />
          <StatTile
            label="Faixas de CEP"
            value={count(RESUMO_FRETE.faixas)}
            hint="cobrindo as 5 regiões"
          />
          <StatTile
            label="Frete médio"
            value={money(RESUMO_FRETE.freteMedio)}
            delta={VARIACAO_MES}
            inverse
            hint="vs. mês anterior"
            spark={RESUMO_FRETE.serieMedia}
          />
          <StatTile
            label="Prazo médio"
            value={`${RESUMO_FRETE.prazoMedio.toLocaleString("pt-BR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })} dias`}
            hint="da postagem à entrega"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <Panel className="xl:col-span-2 overflow-hidden">
            <PanelHeader
              title="Frete médio por região"
              hint="12 semanas"
              action={
                <span className="num text-[12px] text-ink-2 hidden sm:block">
                  média {money(RESUMO_FRETE.freteMedio)}
                </span>
              }
            />
            <div className="h-[260px] px-2 pt-3 pb-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={FRETE_12_SEMANAS}
                  margin={{ top: 4, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="semana" {...AXIS} minTickGap={8} />
                  <YAxis
                    {...AXIS}
                    width={56}
                    tickFormatter={(v: number) => money(v)}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--line-2)", strokeWidth: 1 }}
                    content={<ChartTooltip formatter={(v) => money(v)} />}
                  />
                  {REGIOES.map((r) => (
                    <Line
                      key={r}
                      type="monotone"
                      dataKey={REGIAO_KEY[r]}
                      name={r}
                      stroke={REGIAO_COR[r]}
                      strokeWidth={1.75}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="px-4 py-3 border-t border-line">
              <Legend
                items={REGIOES.map((r) => ({ label: r, color: REGIAO_COR[r] }))}
              />
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Regiões" hint="frete, prazo e participação" />
            <ul className="divide-y divide-line">
              {RESUMO_REGIOES.map((r) => (
                <li key={r.regiao} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-[2px] shrink-0"
                        style={{ background: r.cor }}
                      />
                      <span className="text-[13px] font-medium text-ink truncate">
                        {r.regiao}
                      </span>
                    </span>
                    <span className="num text-[13px] font-semibold text-ink shrink-0">
                      {money(r.freteMedio)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1.5">
                    <span className="flex items-center gap-2">
                      <Delta value={r.variacao} inverse />
                      <span className="num text-[11px] text-ink-3">
                        {r.prazoMedio.toLocaleString("pt-BR", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })} d
                      </span>
                    </span>
                    <span className="num text-[11px] text-ink-3">
                      {pct(r.participacao)} dos pedidos
                    </span>
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-panel-3 overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${r.participacao}%`, background: r.cor }}
                    />
                  </div>
                  <p className="text-[11px] text-ink-3 mt-1.5">
                    {r.ufs.join(" · ")} — {pct(r.subsidiado)} com frete bancado
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Combinações monitoradas"
            hint="produto × modalidade × destino"
          />
          <DataTable
            columns={colunas}
            rows={filtrados}
            rowKey={(m) => m.id}
            defaultSort={{ key: "variacao", dir: "desc" }}
            empty={
              <EmptyState
                icon={SearchX}
                title="Nenhuma combinação encontrada"
                description="Ajuste a busca ou limpe os filtros de canal, modalidade e destino."
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

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={limpar}
          applyLabel={`Ver ${filtrados.length} linhas`}
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

          <Field label="Modalidade">
            <Select
              value={modalidade}
              onChange={(e) => setModalidade(e.target.value as Modalidade | "Todas")}
              className="h-11"
            >
              <option value="Todas">Todas as modalidades</option>
              {MODALIDADES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Região">
            <Select
              value={regiao}
              onChange={(e) => {
                setRegiao(e.target.value);
                setFaixa("Todas");
              }}
              className="h-11"
            >
              <option value="Todas">Todas as regiões</option>
              {REGIOES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Faixa de CEP">
            <Select
              value={faixa}
              onChange={(e) => setFaixa(e.target.value)}
              className="h-11"
            >
              <option value="Todas">Todas as faixas</option>
              {faixasDisponiveis.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.rotulo}
                </option>
              ))}
            </Select>
          </Field>
        </FilterSheet>
      )}
    </>
  );
}
