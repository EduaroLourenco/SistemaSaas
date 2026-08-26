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
import { Select, Field, Sheet, FilterSheet, KeyValue } from "@/components/ui/controls";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  FORNECEDORES as __FORNECEDORES,
  CATEGORIAS_FORNECEDOR as __CATEGORIAS_FORNECEDOR,
  formatarCnpj as __formatarCnpj,
  type Fornecedor,
} from "@/mock/financeiro";
import { money, count } from "@/lib/format";
import {
  Download,
  Search,
  X,
  SearchX,
  SlidersHorizontal,
  Mail,
  Plus,
} from "lucide-react";

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
const FORNECEDORES = zerar(__FORNECEDORES);
const CATEGORIAS_FORNECEDOR = zerar(__CATEGORIAS_FORNECEDOR);
const formatarCnpj = zerar(__formatarCnpj);


const STATUS_TOM = {
  "Em dia": "up",
  "A vencer": "warn",
  Atrasado: "down",
} as const;

/** dd/mm a partir do ISO; "—" passa direto. */
function dataCurta(iso: string) {
  if (!iso.includes("-")) return iso;
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function Fornecedores() {
  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState("Todas");
  const [status, setStatus] = React.useState("Todos");
  const [selecionado, setSelecionado] = React.useState<Fornecedor | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return FORNECEDORES.filter((f) => {
      if (categoria !== "Todas" && f.categoria !== categoria) return false;
      if (status !== "Todos" && f.status !== status) return false;
      if (!q) return true;
      return (
        f.razaoSocial.toLowerCase().includes(q) ||
        f.nomeFantasia.toLowerCase().includes(q) ||
        f.cnpj.includes(q.replace(/\D/g, "")) ||
        f.contato.toLowerCase().includes(q)
      );
    });
  }, [busca, categoria, status]);

  const resumo = React.useMemo(
    () => ({
      total: FORNECEDORES.length,
      compradoAno: FORNECEDORES.reduce((s, f) => s + f.totalAno, 0),
      emAberto: FORNECEDORES.reduce((s, f) => s + f.emAberto, 0),
      atrasados: FORNECEDORES.filter((f) => f.status === "Atrasado").length,
    }),
    []
  );

  const filtrosAtivos =
    (categoria !== "Todas" ? 1 : 0) + (status !== "Todos" ? 1 : 0);

  function limpar() {
    setBusca("");
    setCategoria("Todas");
    setStatus("Todos");
  }

  const colunas: Column<Fornecedor>[] = [
    {
      key: "razaoSocial",
      header: "Fornecedor",
      mobile: "title",
      sticky: true,
      width: "250px",
      sortValue: (f) => f.razaoSocial,
      cell: (f) => (
        <span className="min-w-0 block">
          <span className="font-medium text-ink truncate block max-w-[220px]">
            {f.razaoSocial}
          </span>
          <span className="num block text-[11px] text-ink-3 mt-0.5">
            {formatarCnpj(f.cnpj)}
          </span>
        </span>
      ),
    },
    {
      key: "categoria",
      header: "Categoria",
      mobile: "subtitle",
      width: "140px",
      sortValue: (f) => f.categoria,
      cell: (f) => <Badge tone="neutral">{f.categoria}</Badge>,
    },
    {
      key: "contato",
      header: "Contato",
      width: "180px",
      sortValue: (f) => f.contato,
      cell: (f) => <span className="text-ink-2 truncate">{f.contato}</span>,
    },
    {
      key: "condicao",
      header: "Condição",
      width: "120px",
      sortValue: (f) => f.condicao,
      cell: (f) => <span className="num text-ink-2">{f.condicao}</span>,
    },
    {
      key: "totalAno",
      header: "Comprado no ano",
      align: "right",
      mobile: "metric",
      width: "160px",
      sortValue: (f) => f.totalAno,
      cell: (f) => (
        <span className="num font-semibold text-ink">{money(f.totalAno)}</span>
      ),
    },
    {
      key: "emAberto",
      header: "Em aberto",
      align: "right",
      mobile: "metric",
      width: "140px",
      sortValue: (f) => f.emAberto,
      cell: (f) =>
        f.emAberto > 0 ? (
          <span className="num text-ink">{money(f.emAberto)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: "proximoVencimento",
      header: "Próximo venc.",
      align: "right",
      width: "130px",
      sortValue: (f) => f.proximoVencimento,
      cell: (f) => (
        <span className="num text-ink-2">{dataCurta(f.proximoVencimento)}</span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      mobile: "metric",
      width: "120px",
      sortValue: (f) => f.status,
      cell: (f) => <Badge tone={STATUS_TOM[f.status]}>{f.status}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Fornecedores"
        breadcrumb="Financeiro"
        description="Terceiros, matéria-prima e serviços"
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
              <Download className="w-3.5 h-3.5" />
              Exportar
            </Button>
            <Button size="sm" variant="primary">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Novo fornecedor</span>
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
                placeholder="Razão social, CNPJ ou contato"
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
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-44"
              >
                <option value="Todas">Todas as categorias</option>
                {CATEGORIAS_FORNECEDOR.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-36"
              >
                <option value="Todos">Todas as situações</option>
                <option value="Em dia">Em dia</option>
                <option value="A vencer">A vencer</option>
                <option value="Atrasado">Atrasado</option>
              </Select>
            </div>

            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {filtrados.length} de {FORNECEDORES.length}
            </span>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Fornecedores" value={count(resumo.total)} hint="ativos" />
          <StatTile
            label="Comprado no ano"
            value={money(resumo.compradoAno)}
            delta={8.6}
          />
          <StatTile label="Em aberto" value={money(resumo.emAberto)} />
          <StatTile
            label="Em atraso"
            value={count(resumo.atrasados)}
            delta={resumo.atrasados > 0 ? 100 : 0}
            inverse
            hint="fornecedores"
          />
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Cadastro"
            hint="clique numa linha para ver o histórico de compras"
          />
          <DataTable
            columns={colunas}
            rows={filtrados}
            rowKey={(f) => f.id}
            defaultSort={{ key: "totalAno", dir: "desc" }}
            onRowClick={setSelecionado}
            empty={
              <EmptyState
                icon={SearchX}
                title="Nenhum fornecedor encontrado"
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
        <Sheet
          title={selecionado.razaoSocial}
          subtitle={`${formatarCnpj(selecionado.cnpj)} · ${selecionado.categoria}`}
          onClose={() => setSelecionado(null)}
          footer={
            <>
              <Button className="flex-1 max-sm:h-11">
                <Mail className="w-3.5 h-3.5" />
                Enviar e-mail
              </Button>
              <Button variant="primary" className="flex-1 max-sm:h-11">
                Novo pedido
              </Button>
            </>
          }
        >
          <div className="px-4 py-3 flex flex-wrap gap-1.5 border-b border-line">
            <Badge tone={STATUS_TOM[selecionado.status]}>{selecionado.status}</Badge>
            <Badge tone="neutral">{selecionado.condicao}</Badge>
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line">
            {[
              { l: "Comprado no ano", v: money(selecionado.totalAno) },
              { l: "Em aberto", v: money(selecionado.emAberto) },
            ].map((x) => (
              <div key={x.l} className="px-4 py-3">
                <p className="label">{x.l}</p>
                <p className="num text-[17px] font-semibold text-ink mt-1 leading-none">
                  {x.v}
                </p>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-b border-line">
            <p className="label mb-1">Contato</p>
            <KeyValue label="Responsável" value={selecionado.contato} />
            <KeyValue label="E-mail" value={selecionado.email} />
            <KeyValue label="Condição de pagamento" value={selecionado.condicao} />
            <KeyValue
              label="Próximo vencimento"
              value={dataCurta(selecionado.proximoVencimento)}
            />
          </div>

          <div className="px-4 py-3.5">
            <p className="label mb-2">Últimas compras</p>
            <ul className="flex flex-col divide-y divide-line border border-line rounded-r2 overflow-hidden">
              {selecionado.compras.map((c) => (
                <li
                  key={c.numero}
                  className="px-3 py-2.5 bg-panel flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="num block text-[12px] text-ink">{c.numero}</span>
                    <span className="num block text-[11px] text-ink-3">
                      {dataCurta(c.data)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Badge
                      tone={
                        c.status === "Recebido"
                          ? "up"
                          : c.status === "Em trânsito"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {c.status}
                    </Badge>
                    <span className="num text-[13px] font-medium text-ink">
                      {money(c.valor)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Sheet>
      )}

      {filtrosAbertos && (
        <FilterSheet
          onClose={() => setFiltrosAbertos(false)}
          onClear={limpar}
          applyLabel={`Ver ${filtrados.length} fornecedores`}
        >
          <Field label="Categoria">
            <Select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="h-11"
            >
              <option value="Todas">Todas as categorias</option>
              {CATEGORIAS_FORNECEDOR.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Situação">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-11"
            >
              <option value="Todos">Todas as situações</option>
              <option value="Em dia">Em dia</option>
              <option value="A vencer">A vencer</option>
              <option value="Atrasado">Atrasado</option>
            </Select>
          </Field>
        </FilterSheet>
      )}
    </>
  );
}
