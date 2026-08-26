"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge, Delta } from "@/components/ui/primitives";
import { Segmented, Checkbox, SectionTitle } from "@/components/ui/controls";
import { AXIS, GRID } from "@/components/ui/chart";
import {
  SLIDES as __SLIDES,
  FORMATOS as __FORMATOS,
  ROTEIRO_PADRAO as __ROTEIRO_PADRAO,
  type FormatoDeck,
  type Slide,
} from "@/mock/relatorios";
import { money, moneyShort, count, pct } from "@/lib/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Play, ChevronLeft, ChevronRight, X, Presentation } from "lucide-react";

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
const SLIDES = zerar(__SLIDES);
const FORMATOS = zerar(__FORMATOS);
const ROTEIRO_PADRAO = zerar(__ROTEIRO_PADRAO);


function valorFormatado(s: Slide) {
  if (s.formato === "money") return money(s.valor);
  if (s.formato === "pct") return pct(s.valor);
  return count(s.valor);
}

export default function Apresentacao() {
  const [formato, setFormato] = React.useState<FormatoDeck>("diaria");
  const [selecionados, setSelecionados] = React.useState<string[]>(
    ROTEIRO_PADRAO.diaria
  );
  const [emTelaCheia, setEmTelaCheia] = React.useState(false);

  function trocarFormato(f: FormatoDeck) {
    setFormato(f);
    setSelecionados(ROTEIRO_PADRAO[f]);
  }

  function alternar(id: string) {
    setSelecionados((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  }

  // Mantém a ordem canônica dos slides, não a ordem de clique.
  const roteiro = React.useMemo(
    () => SLIDES.filter((s) => selecionados.includes(s.id)),
    [selecionados]
  );

  const descricaoFormato = FORMATOS.find((f) => f.value === formato)!.descricao;

  return (
    <>
      <PageHeader
        title="Apresentação"
        breadcrumb="Relatórios"
        description="Roteiro de reunião em tela cheia, recalculado a cada abertura"
        actions={
          <Button
            size="sm"
            variant="primary"
            disabled={roteiro.length === 0}
            onClick={() => setEmTelaCheia(true)}
          >
            <Play className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Iniciar apresentação</span>
            <span className="sm:hidden">Iniciar</span>
          </Button>
        }
        filters={
          <Segmented<FormatoDeck>
            options={FORMATOS.map((f) => ({ value: f.value, label: f.label }))}
            value={formato}
            onChange={trocarFormato}
          />
        }
      />

      <PageBody>
        <Panel className="px-4 py-3">
          <p className="text-[12px] text-ink-2">
            <span className="font-semibold text-ink">Formato: </span>
            {descricaoFormato}
          </p>
        </Panel>

        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-3">
          <Panel className="overflow-hidden h-fit">
            <PanelHeader
              title="Indicadores"
              hint="marque o que entra"
              action={
                <span className="num text-[12px] text-ink-2">
                  {roteiro.length}/{SLIDES.length}
                </span>
              }
            />
            <ul className="divide-y divide-line">
              {SLIDES.map((s) => (
                <li key={s.id} className="px-4 py-2.5">
                  <Checkbox
                    checked={selecionados.includes(s.id)}
                    onChange={() => alternar(s.id)}
                    label={s.titulo}
                  />
                </li>
              ))}
            </ul>
            <div className="px-4 py-3 border-t border-line flex gap-2">
              <Button
                size="sm"
                onClick={() => setSelecionados(SLIDES.map((s) => s.id))}
              >
                Todos
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelecionados([])}>
                Nenhum
              </Button>
            </div>
          </Panel>

          <div className="space-y-3">
            <SectionTitle
              title="Prévia do roteiro"
              hint={
                roteiro.length === 0
                  ? "Marque ao menos um indicador para montar a apresentação."
                  : `${roteiro.length} slides, na ordem em que vão aparecer.`
              }
            />

            {roteiro.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roteiro.map((s, i) => (
                  <div key={s.id} className="panel panel-1 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="num text-[11px] font-semibold text-ink-3">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="text-[13px] font-semibold text-ink truncate">
                            {s.titulo}
                          </span>
                        </span>
                        <span className="block text-[11px] text-ink-3 mt-0.5">
                          {s.subtitulo}
                        </span>
                      </span>
                      <Delta value={s.delta} inverse={s.inverso} />
                    </div>

                    <p className="num text-[20px] font-semibold text-ink mt-3 leading-none">
                      {valorFormatado(s)}
                    </p>
                    <p className="text-[12px] text-ink-2 mt-2 leading-relaxed">
                      {s.comentario}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PageBody>

      {emTelaCheia && roteiro.length > 0 && (
        <ModoApresentacao slides={roteiro} onSair={() => setEmTelaCheia(false)} />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Modo tela cheia
   ══════════════════════════════════════════════════════════════ */

function ModoApresentacao({
  slides,
  onSair,
}: {
  slides: Slide[];
  onSair: () => void;
}) {
  const [i, setI] = React.useState(0);
  const s = slides[i];

  const avancar = React.useCallback(
    () => setI((v) => Math.min(v + 1, slides.length - 1)),
    [slides.length]
  );
  const voltar = React.useCallback(() => setI((v) => Math.max(v - 1, 0)), []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") avancar();
      else if (e.key === "ArrowLeft") voltar();
      else if (e.key === "Escape") onSair();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [avancar, voltar, onSair]);

  const formatarEixo = (v: number) =>
    s.formato === "money" ? moneyShort(v) : count(v);

  return (
    <div className="fixed inset-0 z-50 bg-ground flex flex-col">
      {/* topo */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-8 h-14 shrink-0">
        <span className="flex items-center gap-2 min-w-0">
          <Presentation className="w-4 h-4 text-ink-3 shrink-0" strokeWidth={1.75} />
          <span className="text-[12px] text-ink-3 truncate">
            Reunião · 25 de agosto de 2026
          </span>
        </span>
        <button
          onClick={onSair}
          className="w-9 h-9 rounded-r1 flex items-center justify-center text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors"
          aria-label="Sair da apresentação"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* slide */}
      <div className="flex-1 min-h-0 px-4 sm:px-8 pb-4 flex flex-col justify-center max-w-6xl w-full mx-auto">
        <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-brand">
          {s.titulo}
        </p>
        <p className="text-[14px] text-ink-3 mt-1">{s.subtitulo}</p>

        <div className="flex items-end gap-4 flex-wrap mt-5">
          <p className="num text-[clamp(2.5rem,9vw,5.5rem)] font-semibold text-ink leading-[0.95]">
            {valorFormatado(s)}
          </p>
          <span className="mb-2 flex items-center gap-2">
            <Delta value={s.delta} inverse={s.inverso} className="text-[16px]" />
            <span className="text-[13px] text-ink-3">vs. período anterior</span>
          </span>
        </div>

        <div className="h-[clamp(140px,26vh,280px)] mt-6 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            {s.tipo === "linha" ? (
              <LineChart
                data={s.serie}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid {...GRID} />
                <XAxis dataKey="rotulo" {...AXIS} minTickGap={20} />
                <YAxis {...AXIS} width={56} tickFormatter={formatarEixo} />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="var(--s1)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <BarChart
                data={s.serie}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid {...GRID} />
                <XAxis
                  dataKey="rotulo"
                  {...AXIS}
                  interval={0}
                  tick={{ ...AXIS.tick, fontFamily: "var(--f-ui)" }}
                />
                <YAxis {...AXIS} width={56} tickFormatter={formatarEixo} />
                <Bar
                  dataKey="valor"
                  fill="var(--s1)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        <p className="text-[clamp(0.8125rem,1.6vw,1rem)] text-ink-2 mt-5 max-w-3xl leading-relaxed">
          {s.comentario}
        </p>
      </div>

      {/* rodapé */}
      <div className="shrink-0">
        <div className="h-0.5 bg-panel-3">
          <div
            className="h-full bg-brand transition-[width] duration-200"
            style={{ width: `${((i + 1) / slides.length) * 100}%` }}
          />
        </div>
        <div
          className="flex items-center justify-between gap-3 px-4 sm:px-8 h-14"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <span className="num text-[13px] text-ink-3">
            {i + 1} / {slides.length}
          </span>
          <span className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={voltar}
              disabled={i === 0}
              className="h-9 w-9 px-0 sm:w-auto sm:px-3"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Anterior</span>
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={avancar}
              disabled={i === slides.length - 1}
              className="h-9 w-9 px-0 sm:w-auto sm:px-3"
            >
              <span className="hidden sm:inline">Próximo</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </span>
        </div>
      </div>

      {/* toque nas metades da tela — só no celular */}
      <button
        onClick={voltar}
        aria-label="Slide anterior"
        className="sm:hidden absolute left-0 top-14 bottom-14 w-1/3"
      />
      <button
        onClick={avancar}
        aria-label="Próximo slide"
        className="sm:hidden absolute right-0 top-14 bottom-14 w-1/3"
      />
    </div>
  );
}
