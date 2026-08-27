"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { SemFonte } from "@/components/ui/sem-fonte";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosPromocoes, ItemHistorico } from "@/lib/dados/promocoes";
import { Search, ChevronRight, ChevronDown } from "lucide-react";

/**
 * Histórico de promoções, por SKU.
 *
 * Cada linha é um SKU, com Clássico e Premium agrupados embaixo — o mesmo
 * produto costuma viver nos dois, e separá-los divide a decisão do mesmo
 * item em duas linhas que ninguém consegue comparar.
 *
 * As quatro colunas de preço ficam lado a lado de propósito: ofertado pelo
 * canal, tabela, piso e com desconto extra. É essa comparação que responde
 * "dava para descontar mais?" sem abrir calculadora.
 */

const CORES_CURVA: Record<string, "up" | "brand" | "neutral"> = {
  A: "up",
  B: "brand",
  C: "neutral",
};

type Grupo = {
  sku: string;
  titulo: string;
  curva: string;
  itens: ItemHistorico[];
  aprovados: number;
  precoPraticado: number | null;
  /** A decisão mais recente do SKU. */
  ultima: ItemHistorico;
};

export default function HistoricoPromocoes({ dados }: { dados: DadosPromocoes }) {
  const [busca, setBusca] = React.useState("");
  const [decisao, setDecisao] = React.useState("todas");
  const [curva, setCurva] = React.useState("todas");
  const [tipo, setTipo] = React.useState("todos");
  const [campanha, setCampanha] = React.useState("todas");
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [limite, setLimite] = React.useState(30);

  const campanhasDisponiveis = React.useMemo(
    () => [...new Set(dados.historico.map((h) => h.campanha))].sort(),
    [dados.historico]
  );

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.historico.filter((h) => {
      if (decisao === "sim" && !h.aprovado) return false;
      if (decisao === "nao" && h.aprovado) return false;
      if (curva !== "todas" && h.curva !== curva) return false;
      if (tipo !== "todos" && h.tipoAnuncio !== tipo) return false;
      if (campanha !== "todas" && h.campanha !== campanha) return false;
      if (de && h.data < de) return false;
      if (ate && h.data > ate) return false;
      if (!q) return true;
      return (
        h.sku.toLowerCase().includes(q) ||
        h.mlb.toLowerCase().includes(q) ||
        h.titulo.toLowerCase().includes(q)
      );
    });
  }, [dados.historico, busca, decisao, curva, tipo, campanha, de, ate]);

  const grupos = React.useMemo(() => {
    const m = new Map<string, Grupo>();
    for (const h of filtrados) {
      const g =
        m.get(h.sku) ??
        ({
          sku: h.sku,
          titulo: h.titulo,
          curva: h.curva,
          itens: [],
          aprovados: 0,
          precoPraticado: h.precoPraticado,
          ultima: h,
        } as Grupo);
      g.itens.push(h);
      if (h.aprovado) g.aprovados++;
      // O histórico vem em ordem decrescente de data, então o primeiro é o
      // mais recente — não precisa reordenar por linha.
      if (h.data > g.ultima.data) g.ultima = h;
      m.set(h.sku, g);
    }
    return [...m.values()].sort((a, b) => b.itens.length - a.itens.length);
  }, [filtrados]);

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Histórico de promoções" breadcrumb="Promoções" />
        <PageBody>
          <SemFonte
            titulo="Nenhuma planilha processada ainda"
            origem="Cada rodada da Central de Promoções grava aqui a decisão de cada item, com o preço ofertado pelo canal, o de tabela, o piso e o com desconto extra. Processe uma planilha e esta tela se preenche."
          />
        </PageBody>
      </>
    );
  }

  const visiveis = grupos.slice(0, limite);

  return (
    <>
      <PageHeader
        title="Histórico de promoções"
        breadcrumb="Promoções"
        description="Cada decisão tomada, com os preços que a sustentaram"
        filters={
          <>
            <Segmented
              options={[
                { value: "todas", label: "Todas" },
                { value: "sim", label: "Participaram" },
                { value: "nao", label: "Fora" },
              ]}
              value={decisao}
              onChange={setDecisao}
            />
            <Segmented
              options={[
                { value: "todas", label: "ABC" },
                { value: "A", label: "A" },
                { value: "B", label: "B" },
                { value: "C", label: "C" },
              ]}
              value={curva}
              onChange={setCurva}
            />
            <Segmented
              options={[
                { value: "todos", label: "Tipo" },
                { value: "Clássico", label: "Clássico" },
                { value: "Premium", label: "Premium" },
              ]}
              value={tipo}
              onChange={setTipo}
            />
            <select
              value={campanha}
              onChange={(e) => setCampanha(e.target.value)}
              className="h-7 px-2 rounded-r1 bg-panel border border-line-2 text-[12.5px]
                         text-ink outline-none focus:border-brand max-w-[200px]"
            >
              <option value="todas">Todas as campanhas</option>
              {campanhasDisponiveis.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="flex items-center gap-1.5 shrink-0">
              <input
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                className="h-7 px-2 rounded-r1 bg-panel border border-line-2 text-[12.5px] text-ink outline-none focus:border-brand"
              />
              <span className="text-[12px] text-ink-3">até</span>
              <input
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                className="h-7 px-2 rounded-r1 bg-panel border border-line-2 text-[12.5px] text-ink outline-none focus:border-brand"
              />
            </span>
            <span className="relative shrink-0 w-full sm:w-52">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="SKU, MLB ou produto"
                className="w-full h-7 pl-8 pr-3 rounded-r1 bg-panel border border-line
                           text-[12.5px] text-ink outline-none focus:border-brand"
              />
            </span>
          </>
        }
      />

      <PageBody>
        <Panel className="overflow-hidden">
          <PanelHeader
            title="SKUs em promoção"
            hint="clique para abrir os anúncios · Clássico e Premium agrupados"
            action={
              <span className="num text-[12px] text-ink-3">
                {grupos.length} SKUs · {filtrados.length} decisões
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="sticky left-0 z-20 bg-panel text-left px-3 py-2 border-r border-line min-w-[230px]">
                    <span className="label">SKU · produto</span>
                  </th>
                  <th className="text-right px-3 py-2"><span className="label">Ofertado ML</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Tabela</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Piso (−5%)</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Com extra</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Praticado</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Decisões</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((g) => {
                  const expandido = aberto === g.sku;
                  const u = g.ultima;
                  return (
                    <React.Fragment key={g.sku}>
                      <tr
                        onClick={() => setAberto(expandido ? null : g.sku)}
                        className="border-b border-line cursor-pointer hover:bg-panel-2"
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-panel text-left px-3 py-2
                                     border-r border-line font-normal"
                        >
                          <span className="flex items-start gap-1.5">
                            {expandido ? (
                              <ChevronDown className="w-3.5 h-3.5 text-ink-3 mt-0.5 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-ink-3 mt-0.5 shrink-0" />
                            )}
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                <span className="num text-[12px] font-semibold text-ink">
                                  {g.sku}
                                </span>
                                {g.curva !== "—" && (
                                  <Badge tone={CORES_CURVA[g.curva]}>{g.curva}</Badge>
                                )}
                              </span>
                              <span className="text-[11.5px] text-ink-2 block truncate max-w-[280px]">
                                {g.titulo}
                              </span>
                            </span>
                          </span>
                        </th>
                        <td className="px-3 py-2 text-right num text-ink-2">
                          {u.precoOfertadoML != null ? money(u.precoOfertadoML) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right num text-ink-2">
                          {u.precoTabela != null ? money(u.precoTabela) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right num text-ink-2">
                          {u.precoPiso != null ? money(u.precoPiso) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right num text-brand font-medium">
                          {u.precoComExtra != null ? money(u.precoComExtra) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right num font-semibold text-ink">
                          {g.precoPraticado != null ? money(g.precoPraticado) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="num text-[12px] text-ink-2">
                            {g.aprovados}/{g.itens.length}
                          </span>
                        </td>
                      </tr>

                      {expandido &&
                        g.itens.map((h) => (
                          <tr key={h.id} className="border-b border-line bg-panel-2">
                            <th
                              scope="row"
                              className="sticky left-0 z-10 bg-panel-2 text-left px-3 py-1.5
                                         border-r border-line font-normal"
                            >
                              <span className="flex items-center gap-1.5 pl-5">
                                <span className="num text-[11.5px] text-ink-2">{h.mlb}</span>
                                <Badge tone={h.tipoAnuncio === "Premium" ? "brand" : "neutral"}>
                                  {h.tipoAnuncio}
                                </Badge>
                                <Badge tone={h.aprovado ? "up" : "down"}>
                                  {h.aprovado ? "participa" : "fora"}
                                </Badge>
                              </span>
                              <span className="block pl-5 text-[10.5px] text-ink-3">
                                {h.campanha} · {h.data.split("-").reverse().join("/")} ·{" "}
                                {h.tipoCampanha}
                                {h.motivo ? ` · ${h.motivo}` : ""}
                              </span>
                            </th>
                            <td className="px-3 py-1.5 text-right num text-[12px] text-ink-2">
                              {h.precoOfertadoML != null ? money(h.precoOfertadoML) : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right num text-[12px] text-ink-2">
                              {h.precoTabela != null ? money(h.precoTabela) : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right num text-[12px] text-ink-2">
                              {h.precoPiso != null ? money(h.precoPiso) : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right num text-[12px] text-brand">
                              {h.precoComExtra != null ? money(h.precoComExtra) : "—"}
                            </td>
                            <td colSpan={2} className="px-3 py-1.5 text-right">
                              {h.tags.length > 0 && (
                                <span className="flex items-center justify-end gap-1">
                                  {h.tags.map((t) => (
                                    <Badge key={t} tone="warn">
                                      {t.replace(/_/g, " ")}
                                    </Badge>
                                  ))}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {grupos.length > limite && (
            <button
              onClick={() => setLimite((l) => l + 50)}
              className={cn(
                "w-full py-2.5 text-[12.5px] text-ink-2 hover:text-ink",
                "hover:bg-panel-2 border-t border-line"
              )}
            >
              Mostrar mais {Math.min(50, grupos.length - limite)}
            </button>
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader title="Processamentos" hint="cada rodada da Central de Promoções" />
          <ul className="divide-y divide-line">
            {dados.processamentos.map((p) => (
              <li key={p.id} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <p className="text-[12.5px] text-ink truncate">
                    {p.arquivos.length ? p.arquivos.join(", ") : "—"}
                  </p>
                  <p className="num text-[11px] text-ink-3">
                    {p.quando.split("-").reverse().join("/")}
                    {p.descontoExtra > 0 && ` · desconto extra ${pct(p.descontoExtra * 100)}`}
                  </p>
                </span>
                <span className="num text-[12px] text-ink-2 shrink-0">
                  {count(p.aprovados)} de {count(p.lidos)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}
