"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, Badge, EmptyState } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { TERMOS, SECOES_GLOSSARIO, type Termo } from "@/mock/sistema";
import { Search, X, SearchX, MapPin } from "lucide-react";

export default function Glossario() {
  const [busca, setBusca] = React.useState("");
  const [secao, setSecao] = React.useState("Todas");

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return TERMOS.filter((t) => {
      if (secao !== "Todas" && t.secao !== secao) return false;
      if (!q) return true;
      return (
        t.termo.toLowerCase().includes(q) ||
        (t.sigla ?? "").toLowerCase().includes(q) ||
        t.definicao.toLowerCase().includes(q) ||
        (t.calculo ?? "").toLowerCase().includes(q) ||
        t.onde.toLowerCase().includes(q)
      );
    });
  }, [busca, secao]);

  const porSecao = React.useMemo(
    () =>
      SECOES_GLOSSARIO.map((s) => ({
        secao: s,
        termos: filtrados.filter((t) => t.secao === s),
      })).filter((g) => g.termos.length > 0),
    [filtrados]
  );

  return (
    <>
      <PageHeader
        title="Glossário"
        description="O que cada indicador significa, como é calculado e onde encontrar"
        filters={
          <>
            <div className="relative shrink-0 w-full sm:w-80">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3 pointer-events-none" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar métrica, sigla ou fórmula"
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

            <Segmented
              options={["Todas", ...SECOES_GLOSSARIO]}
              value={secao}
              onChange={setSecao}
            />

            <span className="num text-[12px] text-ink-3 shrink-0 ml-auto hidden md:block">
              {filtrados.length} de {TERMOS.length}
            </span>
          </>
        }
      />

      <PageBody>
        {porSecao.length === 0 ? (
          <Panel>
            <EmptyState
              icon={SearchX}
              title="Nenhum termo encontrado"
              description={`Nada corresponde a "${busca}". Tente a sigla ou parte da definição.`}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setBusca("");
                    setSecao("Todas");
                  }}
                >
                  Limpar busca
                </Button>
              }
            />
          </Panel>
        ) : (
          porSecao.map((g) => (
            <Panel key={g.secao} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 h-11 border-b border-line bg-panel-2">
                <h2 className="text-[13px] font-semibold text-ink">{g.secao}</h2>
                <span className="num text-[11px] text-ink-3">
                  {g.termos.length}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {g.termos.map((t) => (
                  <li key={t.id} className="px-4 py-3.5">
                    <VerbeteGlossario t={t} />
                  </li>
                ))}
              </ul>
            </Panel>
          ))
        )}
      </PageBody>
    </>
  );
}

function VerbeteGlossario({ t }: { t: Termo }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-x-6 gap-y-2">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="text-[13px] font-semibold text-ink">{t.termo}</h3>
          {t.sigla && <Badge tone="brand">{t.sigla}</Badge>}
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-[13px] text-ink-2 leading-relaxed">{t.definicao}</p>

        {t.calculo && (
          <p className="num text-[12px] text-ink bg-panel-3 border border-line rounded-r1 px-2 py-1 mt-2 inline-block">
            {t.calculo}
          </p>
        )}

        {t.leitura && (
          <p className="text-[12px] text-ink-3 mt-2 leading-relaxed">
            <span className="font-semibold text-ink-2">Como ler: </span>
            {t.leitura}
          </p>
        )}

        <p className="flex items-center gap-1.5 text-[11px] text-ink-3 mt-2">
          <MapPin className="w-3 h-3 shrink-0" strokeWidth={2} />
          {t.onde}
        </p>
      </div>
    </div>
  );
}
