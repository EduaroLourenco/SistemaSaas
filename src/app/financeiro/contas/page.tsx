"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import {
  Button,
  Panel,
  PanelHeader,
  Badge,
  EmptyState,
} from "@/components/ui/primitives";
import { Tabs, Checkbox } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/data-table";
import { CONTAS, RESUMO_CONTAS, HOJE, type Conta, type Faixa } from "@/mock/financeiro";
import { money, count } from "@/lib/format";
import { Download, Check, CheckCheck, CircleAlert } from "lucide-react";

type Aba = "vencidas" | "hoje" | "sete" | "mes" | "todas";

const ABAS: { value: Aba; label: string; faixas: Faixa[] | null }[] = [
  { value: "vencidas", label: "Vencidas", faixas: ["vencida"] },
  { value: "hoje", label: "Vencem hoje", faixas: ["hoje"] },
  { value: "sete", label: "Próximos 7 dias", faixas: ["sete_dias"] },
  { value: "mes", label: "Este mês", faixas: ["vencida", "hoje", "sete_dias", "mes"] },
  { value: "todas", label: "Todas", faixas: null },
];

const FAIXA_TOM: Record<Faixa, "down" | "warn" | "neutral" | "info"> = {
  vencida: "down",
  hoje: "warn",
  sete_dias: "neutral",
  mes: "neutral",
  futura: "info",
};

const FAIXA_ROTULO: Record<Faixa, string> = {
  vencida: "vencida",
  hoje: "vence hoje",
  sete_dias: "a vencer",
  mes: "este mês",
  futura: "futura",
};

/** dd/mm/aaaa a partir do ISO. */
function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Dias de atraso, positivo quando já venceu. */
function diasAtraso(vencimento: string) {
  const [ay, am, ad] = HOJE.split("-").map(Number);
  const [by, bm, bd] = vencimento.split("-").map(Number);
  return Math.round(
    (Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000
  );
}

export default function ContasAPagar() {
  const [aba, setAba] = React.useState<Aba>("vencidas");
  const [pagas, setPagas] = React.useState<string[]>([]);
  const [marcadas, setMarcadas] = React.useState<string[]>([]);

  const contas = React.useMemo(
    () => CONTAS.map((c) => ({ ...c, pago: pagas.includes(c.id) })),
    [pagas]
  );

  const contagem = React.useMemo(() => {
    const m = {} as Record<Aba, number>;
    for (const a of ABAS) {
      m[a.value] = a.faixas
        ? contas.filter((c) => a.faixas!.includes(c.faixa)).length
        : contas.length;
    }
    return m;
  }, [contas]);

  const linhas = React.useMemo(() => {
    const def = ABAS.find((a) => a.value === aba)!;
    return def.faixas ? contas.filter((c) => def.faixas!.includes(c.faixa)) : contas;
  }, [contas, aba]);

  const totalAba = linhas.reduce((s, c) => s + (c.pago ? 0 : c.valor), 0);

  function alternarMarca(id: string) {
    setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  function pagarMarcadas() {
    setPagas((p) => Array.from(new Set([...p, ...marcadas])));
    setMarcadas([]);
  }

  const colunas: Column<Conta>[] = [
    {
      key: "marcar",
      header: "",
      width: "36px",
      cell: (c) => (
        <span onClick={(e) => e.stopPropagation()} className="flex">
          <Checkbox
            checked={marcadas.includes(c.id)}
            onChange={() => alternarMarca(c.id)}
          />
        </span>
      ),
    },
    {
      key: "vencimento",
      header: "Vencimento",
      mobile: "subtitle",
      width: "170px",
      sortValue: (c) => c.vencimento,
      cell: (c) => (
        <span className="flex items-center gap-2">
          <span
            className={
              "num " + (c.faixa === "vencida" && !c.pago ? "text-down font-semibold" : "text-ink-2")
            }
          >
            {dataBr(c.vencimento)}
          </span>
          {!c.pago && c.faixa === "vencida" && (
            <Badge tone="down">
              <span className="num">{diasAtraso(c.vencimento)}d</span>
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "descricao",
      header: "Descrição",
      mobile: "title",
      sticky: true,
      width: "300px",
      sortValue: (c) => c.descricao,
      cell: (c) => (
        <span className="min-w-0 block">
          <span
            className={
              "font-medium truncate block max-w-[270px] " +
              (c.pago ? "text-ink-3 line-through" : "text-ink")
            }
          >
            {c.descricao}
          </span>
          <span className="block text-[11px] text-ink-3 mt-0.5 truncate">
            {c.fornecedor}
          </span>
        </span>
      ),
    },
    {
      key: "categoria",
      header: "Categoria",
      width: "200px",
      sortValue: (c) => c.categoria,
      cell: (c) => <span className="text-ink-2 truncate">{c.categoria}</span>,
    },
    {
      key: "documento",
      header: "Documento",
      width: "130px",
      sortValue: (c) => c.documento,
      cell: (c) => <span className="num text-ink-3">{c.documento}</span>,
    },
    {
      key: "valor",
      header: "Valor",
      align: "right",
      mobile: "metric",
      width: "140px",
      sortValue: (c) => c.valor,
      cell: (c) => (
        <span
          className={
            "num font-semibold " + (c.pago ? "text-ink-3" : "text-ink")
          }
        >
          {money(c.valor)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      mobile: "metric",
      width: "130px",
      sortValue: (c) => (c.pago ? "pago" : c.faixa),
      cell: (c) =>
        c.pago ? (
          <Badge tone="up">
            <Check className="w-3 h-3 mr-0.5" strokeWidth={3} />
            paga
          </Badge>
        ) : (
          <Badge tone={FAIXA_TOM[c.faixa]}>{FAIXA_ROTULO[c.faixa]}</Badge>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        breadcrumb="Financeiro"
        description="Agenda por vencimento · 25 de agosto de 2026"
        actions={
          <Button size="sm" variant="primary">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Total a pagar" value={money(RESUMO_CONTAS.total)} />
          <StatTile
            label="Vencido"
            value={money(RESUMO_CONTAS.vencido)}
            delta={RESUMO_CONTAS.vencido > 0 ? 100 : 0}
            inverse
            hint={`${contagem.vencidas} contas`}
          />
          <StatTile
            label="Vence hoje"
            value={money(RESUMO_CONTAS.hoje)}
            hint={`${contagem.hoje} contas`}
          />
          <StatTile
            label="Próximos 7 dias"
            value={money(RESUMO_CONTAS.seteDias)}
            hint={`${contagem.sete} contas`}
          />
        </div>

        {RESUMO_CONTAS.vencido > 0 && (
          <Panel className="bg-down-wash border-transparent px-4 py-3 flex gap-2.5">
            <CircleAlert className="w-4 h-4 text-down shrink-0 mt-px" strokeWidth={2} />
            <p className="text-[12px] text-ink-2">
              <span className="font-semibold text-ink">
                {money(RESUMO_CONTAS.vencido)} em atraso
              </span>{" "}
              distribuídos em {contagem.vencidas} contas. Juros e multa não estão
              considerados nestes valores.
            </p>
          </Panel>
        )}

        <Panel className="overflow-hidden">
          <Tabs<Aba>
            tabs={ABAS.map((a) => ({
              value: a.value,
              label: a.label,
              count: contagem[a.value],
            }))}
            value={aba}
            onChange={setAba}
          />

          {marcadas.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 h-11 border-b border-line bg-brand-wash">
              <span className="num text-[12px] text-brand font-medium">
                {marcadas.length} selecionadas ·{" "}
                {money(
                  linhas
                    .filter((c) => marcadas.includes(c.id))
                    .reduce((s, c) => s + c.valor, 0)
                )}
              </span>
              <span className="flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={pagarMarcadas}>
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar {marcadas.length} como pagas
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMarcadas([])}>
                  Limpar
                </Button>
              </span>
            </div>
          )}

          <DataTable
            columns={colunas}
            rows={linhas}
            rowKey={(c) => c.id}
            defaultSort={{ key: "vencimento", dir: "asc" }}
            empty={
              <EmptyState
                icon={Check}
                title="Nada nesta faixa"
                description="Nenhuma conta com vencimento no período selecionado."
              />
            }
          />

          {linhas.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 h-10 border-t border-line bg-panel-2">
              <span className="text-[12px] font-semibold text-ink">
                {linhas.length} contas em aberto
              </span>
              <span className="num text-[13px] font-semibold text-ink">
                {money(totalAba)}
              </span>
            </div>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
