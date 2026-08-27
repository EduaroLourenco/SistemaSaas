"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { SemFonte } from "@/components/ui/sem-fonte";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosPromocoes } from "@/lib/dados/promocoes";
import { Search } from "lucide-react";

/**
 * Campanhas, montadas do que foi processado.
 *
 * O canal não exporta um identificador estável de campanha — o nome que
 * vem na planilha é a única identidade que existe. Por isso a mesma
 * campanha processada duas vezes soma na mesma linha em vez de duplicar.
 *
 * "Adesão" é a fração de itens que participaram. É o número que diz se a
 * campanha vale a pena: adesão baixa com muitos itens quase no piso
 * significa que faltou pouco, e talvez um desconto extra resolvesse.
 */

export default function Campanhas({ dados }: { dados: DadosPromocoes }) {
  const [busca, setBusca] = React.useState("");
  const [reducao, setReducao] = React.useState("todas");
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");

  const linhas = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dados.campanhas
      .filter((c) => c.itens > 0)
      .filter((c) => {
        if (reducao === "com" && !c.temReducao) return false;
        if (reducao === "sem" && c.temReducao) return false;
        if (de && c.ultimoProcessamento && c.ultimoProcessamento < de) return false;
        if (ate && c.ultimoProcessamento && c.ultimoProcessamento > ate) return false;
        return !q || c.nome.toLowerCase().includes(q);
      })
      .sort((a, b) => b.itens - a.itens);
  }, [dados.campanhas, busca, reducao, de, ate]);

  const totais = React.useMemo(
    () =>
      linhas.reduce(
        (t, c) => ({
          itens: t.itens + c.itens,
          participam: t.participam + c.participam,
        }),
        { itens: 0, participam: 0 }
      ),
    [linhas]
  );

  if (dados.vazio) {
    return (
      <>
        <PageHeader title="Campanhas" breadcrumb="Promoções" />
        <PageBody>
          <SemFonte
            titulo="Nenhuma campanha processada"
            origem="As campanhas saem das planilhas da Central de Promoções: o nome de cada uma vem na própria planilha. Processe uma e ela aparece aqui, com quantos itens participaram e quantos ficaram de fora."
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Campanhas"
        breadcrumb="Promoções"
        description="Adesão por campanha, do que foi processado"
        filters={
          <>
            <Segmented
              options={[
                { value: "todas", label: "Todas" },
                { value: "com", label: "Com redução" },
                { value: "sem", label: "Sem redução" },
              ]}
              value={reducao}
              onChange={setReducao}
            />
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
            <span className="relative shrink-0 w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome da campanha"
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
            title="Adesão por campanha"
            hint="participam sobre itens lidos"
            action={
              <span className="num text-[12px] text-ink-2">
                {count(totais.participam)} de {count(totais.itens)}
                {totais.itens > 0 && (
                  <span className="text-ink-3">
                    {" "}
                    · {pct((totais.participam / totais.itens) * 100)}
                  </span>
                )}
              </span>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-3 py-2 min-w-[260px]">
                    <span className="label">Campanha</span>
                  </th>
                  <th className="text-right px-3 py-2"><span className="label">Itens</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Participam</span></th>
                  <th className="text-right px-3 py-2"><span className="label">Fora</span></th>
                  <th className="text-right px-3 py-2 min-w-[150px]">
                    <span className="label">Adesão</span>
                  </th>
                  <th className="text-right px-3 py-2"><span className="label">Processada em</span></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((c) => {
                  const adesao = c.itens ? (c.participam / c.itens) * 100 : 0;
                  return (
                    <tr key={c.id} className="border-b border-line hover:bg-panel-2">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[12.5px] font-medium text-ink truncate">
                            {c.nome}
                          </span>
                          <Badge tone={c.temReducao ? "brand" : "neutral"}>
                            {c.temReducao ? "com redução" : "sem redução"}
                          </Badge>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num text-ink-2">{count(c.itens)}</td>
                      <td className="px-3 py-2 text-right num text-up font-medium">
                        {count(c.participam)}
                      </td>
                      <td className="px-3 py-2 text-right num text-ink-2">{count(c.fora)}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center justify-end gap-2">
                          <span className="hidden lg:block w-20 h-1.5 rounded-full bg-panel-3 overflow-hidden">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${adesao}%`,
                                background:
                                  adesao >= 70
                                    ? "var(--up)"
                                    : adesao >= 40
                                      ? "var(--warn)"
                                      : "var(--down)",
                              }}
                            />
                          </span>
                          <span
                            className={cn(
                              "num text-[12px]",
                              adesao >= 70 ? "text-up" : adesao >= 40 ? "text-warn" : "text-down"
                            )}
                          >
                            {pct(adesao)}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num text-[12px] text-ink-3">
                        {c.ultimoProcessamento
                          ? c.ultimoProcessamento.split("-").reverse().join("/")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/*
          Itens que ficaram de fora por pouco. É a lista acionável da tela:
          adesão baixa com muitos itens "quase" significa que faltou pouco,
          e um desconto extra na próxima rodada resolveria.
        */}
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Ficaram fora por pouco"
            hint="itens marcados como quase no piso, do menor para o maior"
          />
          <ul className="divide-y divide-line">
            {dados.historico
              .filter((h) => !h.aprovado && h.tags.includes("quase"))
              .slice(0, 12)
              .map((h) => (
                <li key={h.id} className="px-4 py-2.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <p className="text-[12.5px] text-ink truncate">{h.titulo}</p>
                    <p className="num text-[11px] text-ink-3">
                      {h.sku} · {h.mlb} · {h.campanha}
                    </p>
                  </span>
                  <span className="num text-[12px] text-ink-2 shrink-0 text-right">
                    <span className="block">
                      ofertado {h.precoOfertadoML != null ? money(h.precoOfertadoML) : "—"}
                    </span>
                    <span className="block text-ink-3">
                      piso {h.precoPiso != null ? money(h.precoPiso) : "—"}
                    </span>
                  </span>
                </li>
              ))}
            {!dados.historico.some((h) => !h.aprovado && h.tags.includes("quase")) && (
              <li className="px-4 py-6 text-center text-[13px] text-ink-3">
                Nenhum item ficou de fora por pouco nas rodadas processadas.
              </li>
            )}
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}
