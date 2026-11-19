"use client";

import * as React from "react";
import { DemoLink as Link } from "@/lib/demo/runtime";
import { Panel, PanelHeader, Badge, Button } from "@/components/ui/primitives";
import type { Recomendacao } from "@/lib/dados/recomendacoes";
import { Check, ArrowRight, RotateCcw, CalendarDays } from "lucide-react";

/**
 * Fila de recomendações do dia, em ordem de prioridade.
 *
 * O que é resolvido some da fila e não volta no mesmo dia. A marca fica no
 * navegador, por dia: amanhã a fila é recalculada e o mesmo problema, se
 * persistir, volta a aparecer — resolver não é silenciar para sempre.
 *
 * Guardar por dia e não para sempre é deliberado: um card marcado como
 * resolvido em julho não deve esconder o mesmo problema acontecendo em
 * outubro.
 */

const CHAVE = "recomendacoes-resolvidas";
const chaveResolvidas = () => typeof window !== "undefined" && window.location.pathname.startsWith("/demonstracao/sistema/") ? CHAVE + ":demo" : CHAVE;

const TOM: Record<Recomendacao["severidade"], "down" | "warn" | "info"> = {
  critico: "down",
  atencao: "warn",
  info: "info",
};

const ROTULO: Record<Recomendacao["severidade"], string> = {
  critico: "crítico",
  atencao: "atenção",
  info: "informação",
};

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function lerResolvidas(): Set<string> {
  try {
    const bruto = localStorage.getItem(chaveResolvidas());
    if (!bruto) return new Set();
    const { dia, ids } = JSON.parse(bruto) as { dia: string; ids: string[] };
    // Marca de outro dia não vale: a fila do dia é nova.
    return dia === hoje() ? new Set(ids) : new Set();
  } catch {
    return new Set();
  }
}

export function FilaRecomendacoes({ itens, semDados = false, limiteInicial }: { itens: Recomendacao[]; semDados?: boolean; limiteInicial?: number }) {
  const [resolvidas, setResolvidas] = React.useState<Set<string>>(new Set());
  const [pronto, setPronto] = React.useState(false);
  const [mostrarTodas, setMostrarTodas] = React.useState(false);
  const listaId = React.useId();

  // Só lê o armazenamento depois de montar: no servidor ele não existe, e
  // ler durante a renderização faria o HTML divergir do que o navegador
  // desenha.
  React.useEffect(() => {
    setResolvidas(lerResolvidas());
    setPronto(true);
  }, []);

  function guardar(ids: Set<string>) {
    try {
      localStorage.setItem(
        chaveResolvidas(),
        JSON.stringify({ dia: hoje(), ids: [...ids] })
      );
    } catch {
      // Navegador com armazenamento bloqueado: a fila continua funcionando,
      // só não lembra entre recarregamentos.
    }
  }

  function resolver(id: string) {
    setResolvidas((s) => {
      const p = new Set(s);
      p.add(id);
      guardar(p);
      return p;
    });
  }

  function desfazer() {
    setResolvidas(() => {
      guardar(new Set());
      return new Set();
    });
  }

  const visiveis = pronto ? itens.filter((i) => !resolvidas.has(i.id)) : itens;
  const resolvidasHoje = itens.length - visiveis.length;
  const exibidas = limiteInicial && !mostrarTodas ? visiveis.slice(0, limiteInicial) : visiveis;

  if (!itens.length) {
    return (
      <Panel className="flex flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-5">
        <div>
          <p className="text-[14px] font-semibold text-ink">{semDados ? "Sem dados para avaliar prioridades" : "Nenhuma mudança relevante"}</p>
          <p className="mt-1 text-[14px] text-ink-2">
            {semDados ? "Confira as fontes de vendas para iniciar a análise." : "Nos últimos 7 dias contra os 7 anteriores."}
          </p>
        </div>
        <Link href={semDados ? "/integracoes" : "/planejamento"} className="inline-flex min-h-11 items-center gap-2 text-[14px] font-medium text-brand hover:underline">
          {semDados ? "Ver fontes" : "Abrir planejamento"}<ArrowRight size={16} aria-hidden="true" />
        </Link>
      </Panel>
    );
  }

  // A fila ocupa a largura do painel; as fontes permanecem em Integrações.
  return (
    <Panel className="home-priorities min-w-0 overflow-hidden">
      <PanelHeader
        title="Prioridades"
        hint="7 dias com dados contra os 7 anteriores · todos os canais"
        action={
          <div className="flex flex-wrap items-center gap-3">
          <Link href="/planejamento" className="inline-flex min-h-10 items-center gap-1.5 text-[14px] text-ink-2 hover:text-brand"><CalendarDays size={16} aria-hidden="true" />Planejamento</Link>
          {resolvidasHoje > 0 ? (
            <Button size="sm" variant="ghost" onClick={desfazer}>
              <RotateCcw className="w-3.5 h-3.5" />
              {resolvidasHoje} resolvida{resolvidasHoje > 1 ? "s" : ""}
            </Button>
          ) : <Link href="/alertas" className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap text-[14px] font-medium text-brand hover:underline">Ver alertas <ArrowRight size={16} aria-hidden="true" /></Link>}
          </div>
        }
      />

      {visiveis.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[13px] text-ink-2">
            Tudo resolvido por hoje. A fila volta amanhã com o que mudar.
          </p>
        </div>
      ) : (
        <div id={listaId} className="divide-y divide-line">
          {exibidas.map((r) => (
            <article
              key={r.id}
              className="grid min-w-0 gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(140px,auto)_auto] lg:items-center lg:gap-5"
            >
              <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={TOM[r.severidade]}>{ROTULO[r.severidade]}</Badge>
                <h3 className="min-w-0 text-[14px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
                  {r.titulo}
                </h3>
              </div>
                <p className="text-[14px] leading-relaxed text-ink-2">
                  {r.leitura}
                </p>
              </div>

              <dl className="flex min-w-0 flex-wrap gap-x-5 gap-y-2">
                {r.metricas.map((m) => (
                  <div key={m.rotulo}>
                    <dt className="text-[12px] text-ink-3">{m.rotulo}</dt>
                    <dd className="text-[16px] font-semibold text-ink tabular-nums">
                      {m.valor}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:flex-col lg:items-end">
              <Link
                href={r.destino}
                className="inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-brand hover:underline"
              >
                Investigar
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button type="button" onClick={() => resolver(r.id)} title="Marcar como resolvida até amanhã" aria-label={`Marcar como resolvida até amanhã: ${r.titulo}`} className="inline-flex min-h-11 items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink lg:min-h-9">
                <Check size={14} aria-hidden="true" />Resolver
              </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {limiteInicial && visiveis.length > limiteInicial && <div className="border-t border-line px-4 py-2 sm:px-5"><button type="button" aria-expanded={mostrarTodas} aria-controls={listaId} onClick={() => setMostrarTodas(atual => !atual)} className="inline-flex min-h-11 items-center gap-2 text-[14px] font-medium text-brand hover:underline">{mostrarTodas ? "Mostrar menos" : `Ver as ${visiveis.length} prioridades`}<ArrowRight size={16} aria-hidden="true" /></button></div>}
    </Panel>
  );
}
