"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Segmented } from "@/components/ui/controls";
import { Carregando } from "@/components/ui/carregando";
import type { DadosAcompanhamento } from "@/lib/dados/acompanhamento";
import Deck from "./acompanhamento-meli";
import { TrocaRoteiro } from "./troca-roteiro";

type Recorte = "ontem" | "semana" | "intervalo";

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somar = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/**
 * A aba Apresentação no roteiro "Acompanhamento Mercado Livre".
 *
 * Ontem compara com o mesmo dia da semana anterior; a semana (últimos 7
 * dias fechados) com os 7 anteriores; o intervalo com o período de mesmo
 * tamanho logo antes. Hoje fica de fora dos atalhos: ainda está acontecendo.
 */
export default function PaginaAcompanhamento() {
  const ontem = somar(hojeSP(), -1);
  const [recorte, setRecorte] = React.useState<Recorte>("semana");
  const [de, setDe] = React.useState(somar(ontem, -6));
  const [ate, setAte] = React.useState(ontem);
  const [dados, setDados] = React.useState<DadosAcompanhamento | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregando, setCarregando] = React.useState(true);

  const consulta = React.useMemo(() => {
    if (recorte === "ontem") return { de: ontem, ate: ontem, deAnt: somar(ontem, -7), ateAnt: somar(ontem, -7) };
    if (recorte === "semana") return { de: somar(ontem, -6), ate: ontem };
    const [a, b] = de <= ate ? [de, ate] : [ate, de];
    return { de: a, ate: b };
  }, [recorte, de, ate, ontem]);

  React.useEffect(() => {
    const ctl = new AbortController();
    setCarregando(true);
    setErro(null);
    fetch(`/api/acompanhamento?${new URLSearchParams(consulta as Record<string, string>)}`, { signal: ctl.signal })
      .then(async (r) => {
        // Estouro de tempo na Vercel volta em texto, não em JSON.
        const j = await r.json().catch(() => ({ erro: r.status === 504 ? "A apresentação demorou demais para montar. Tente de novo ou um período menor." : undefined }));
        if (!r.ok) throw new Error(j.erro ?? "Não consegui montar a apresentação.");
        setDados(j);
      })
      .catch((e) => { if (e.name !== "AbortError") setErro(e.message); })
      .finally(() => { if (!ctl.signal.aborted) setCarregando(false); });
    return () => ctl.abort();
  }, [consulta]);

  return (
    <>
      <PageHeader
        title="Apresentação"
        breadcrumb="Relatórios"
        actions={<TrocaRoteiro atual="meli" />}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Recorte>
              options={[{ value: "ontem", label: "Ontem" }, { value: "semana", label: "Semana" }, { value: "intervalo", label: "Intervalo" }]}
              value={recorte}
              onChange={setRecorte}
            />
            {recorte === "intervalo" && (
              <span className="flex items-center gap-2 text-[14px] text-ink-2">
                <input type="date" value={de} max={ontem} onChange={(e) => setDe(e.target.value)} className="h-11 rounded-r1 border border-line bg-panel px-2" aria-label="De" />
                a
                <input type="date" value={ate} max={hojeSP()} onChange={(e) => setAte(e.target.value)} className="h-11 rounded-r1 border border-line bg-panel px-2" aria-label="Até" />
              </span>
            )}
          </div>
        }
      />
      <PageBody>
        {erro ? (
          <p className="rounded-r2 border border-down bg-down-wash p-4 text-[14px] text-ink">{erro}</p>
        ) : !dados ? (
          <Carregando />
        ) : (
          <div className="relative">
            {carregando && <Carregando sobre />}
            {dados.aviso && !dados.gatilhos.length ? <p className="p-4 text-[14px] text-ink-3">{dados.aviso}</p> : <Deck dados={dados} />}
          </div>
        )}
      </PageBody>
    </>
  );
}
