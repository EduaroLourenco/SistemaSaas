"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Toggle, SectionTitle } from "@/components/ui/controls";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  FORMATOS_EXPORTACAO as __FORMATOS_EXPORTACAO,
  HISTORICO_EXPORTACOES as __HISTORICO_EXPORTACOES,
  AGENDAMENTOS as __AGENDAMENTOS,
  type Exportacao,
} from "@/mock/relatorios";
import { CalendarDays, Download, FileSpreadsheet, RotateCw } from "lucide-react";

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
const FORMATOS_EXPORTACAO = zerar(__FORMATOS_EXPORTACAO);
const HISTORICO_EXPORTACOES = zerar(__HISTORICO_EXPORTACOES);
const AGENDAMENTOS = zerar(__AGENDAMENTOS);


const STATUS_TOM = {
  Concluída: "up",
  Processando: "info",
  Falhou: "down",
} as const;

export default function Exportacoes() {
  const [agendamentos, setAgendamentos] = React.useState(AGENDAMENTOS);

  function alternar(id: string) {
    setAgendamentos((a) =>
      a.map((x) => (x.id === id ? { ...x, ativo: !x.ativo } : x))
    );
  }

  const colunas: Column<Exportacao>[] = [
    {
      key: "arquivo",
      header: "Arquivo",
      mobile: "title",
      sticky: true,
      width: "300px",
      sortValue: (e) => e.arquivo,
      cell: (e) => (
        <span className="flex items-center gap-2.5 min-w-0">
          <FileSpreadsheet
            className="w-4 h-4 text-ink-3 shrink-0"
            strokeWidth={1.75}
          />
          <span className="num text-ink truncate">{e.arquivo}</span>
        </span>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      mobile: "subtitle",
      width: "200px",
      sortValue: (e) => e.tipo,
      cell: (e) => <span className="text-ink-2 truncate">{e.tipo}</span>,
    },
    {
      key: "periodo",
      header: "Período",
      width: "190px",
      sortValue: (e) => e.periodo,
      cell: (e) => <span className="num text-ink-2 truncate">{e.periodo}</span>,
    },
    {
      key: "geradoEm",
      header: "Gerado em",
      align: "right",
      mobile: "metric",
      width: "160px",
      sortValue: (e) => e.geradoEm,
      cell: (e) => <span className="num text-ink-3">{e.geradoEm}</span>,
    },
    {
      key: "tamanho",
      header: "Tamanho",
      align: "right",
      width: "110px",
      sortValue: (e) => e.tamanho,
      cell: (e) => <span className="num text-ink-2">{e.tamanho}</span>,
    },
    {
      key: "status",
      header: "Status",
      mobile: "metric",
      width: "120px",
      sortValue: (e) => e.status,
      cell: (e) => <Badge tone={STATUS_TOM[e.status]}>{e.status}</Badge>,
    },
    {
      key: "acao",
      header: "",
      align: "right",
      width: "110px",
      cell: (e) => (
        <Button size="sm" variant="ghost">
          {e.status === "Falhou" ? (
            <>
              <RotateCw className="w-3.5 h-3.5" />
              Tentar
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              Baixar
            </>
          )}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Exportações"
        breadcrumb="Relatórios"
        description="Gere um arquivo agora ou deixe agendado"
      />

      <PageBody>
        <SectionTitle
          title="Formatos disponíveis"
          hint="O período segue o filtro global da barra superior."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {FORMATOS_EXPORTACAO.map((f) => (
            <div key={f.id} className="panel panel-1 flex flex-col">
              <div className="px-4 pt-3.5 pb-3 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-semibold text-ink">{f.nome}</p>
                  <Badge tone="neutral">{f.extensao}</Badge>
                </div>
                <p className="text-[12px] text-ink-3 mt-1.5 leading-relaxed">
                  {f.descricao}
                </p>
              </div>
              <div className="px-4 pb-3.5 pt-3 border-t border-line flex items-center justify-between gap-3">
                <span className="num text-[11px] text-ink-3">{f.tamanho}</span>
                <Button size="sm" variant="primary">
                  <Download className="w-3.5 h-3.5" />
                  Exportar
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Exportações agendadas"
            hint="rodam no servidor e chegam por e-mail"
            action={
              <span className="num text-[12px] text-ink-2">
                {agendamentos.filter((a) => a.ativo).length} ativas
              </span>
            }
          />
          <ul className="divide-y divide-line">
            {agendamentos.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink truncate">
                      {a.titulo}
                    </span>
                    <span className="block text-[11px] text-ink-3 truncate">
                      {a.descricao}
                    </span>
                    <span className="flex items-center gap-1.5 mt-1">
                      <CalendarDays
                        className="w-3 h-3 text-ink-3 shrink-0"
                        strokeWidth={2}
                      />
                      <span className="num text-[11px] text-ink-3">{a.quando}</span>
                    </span>
                  </span>
                  <Toggle checked={a.ativo} onChange={() => alternar(a.id)} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Histórico"
            hint="arquivos ficam disponíveis por 90 dias"
          />
          <DataTable
            columns={colunas}
            rows={HISTORICO_EXPORTACOES}
            rowKey={(e) => e.id}
            defaultSort={{ key: "geradoEm", dir: "desc" }}
          />
        </Panel>
      </PageBody>
    </>
  );
}
