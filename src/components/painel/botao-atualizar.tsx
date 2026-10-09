"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * "Atualizar agora": relê as APIs conectadas sem esperar o agendamento.
 *
 * Duas formas do mesmo botão, porque os dois lugares pedem coisas
 * diferentes:
 *   · `compacto` — só o ícone, na barra de cima, visível em toda tela.
 *     Quem está olhando um número e quer o de agora não deve ter de
 *     navegar até Fontes de dados para pedir.
 *   · cheio — em Fontes de dados, com o resultado fonte por fonte: é a
 *     tela de quem quer saber O QUE veio, não só que veio algo.
 *
 * Ao terminar, `router.refresh()` relê os componentes de servidor da tela
 * aberta — sem isso o banco atualizaria e a tela continuaria mostrando o
 * número antigo até alguém recarregar à mão.
 */

type Fonte = { fonte: string; ok: boolean; detalhe?: string; erro?: string };
type Resposta = { fontes?: Fonte[]; segundos?: number; nenhuma?: boolean; erro?: string };

export function BotaoAtualizar({ compacto = false }: { compacto?: boolean }) {
  const router = useRouter();
  const [rodando, setRodando] = React.useState(false);
  const [r, setR] = React.useState<Resposta | null>(null);

  async function atualizar() {
    setRodando(true);
    setR(null);
    try {
      const resp = await fetch("/api/atualizar", { method: "POST" });
      const corpo: Resposta = await resp.json().catch(() => ({}));
      setR(resp.ok ? corpo : { erro: corpo.erro ?? `Não deu para atualizar (HTTP ${resp.status}).` });
      if (resp.ok) router.refresh();
    } catch {
      setR({ erro: "Não consegui falar com o servidor." });
    } finally {
      setRodando(false);
    }
  }

  const falhas = r?.fontes?.filter((f) => !f.ok) ?? [];
  const ok = r?.fontes?.filter((f) => f.ok) ?? [];

  if (compacto) {
    /* Sem painel de resultado aqui: a barra de cima acompanha toda tela, e
       um relatório pendurado nela atrapalharia em todas. O estado vira o
       `title` e a cor do ícone; o detalhe fica em Fontes de dados. */
    const titulo = rodando
      ? "Atualizando…"
      : r?.erro
        ? r.erro
        : r
          ? `Atualizado: ${ok.length} ${ok.length === 1 ? "fonte" : "fontes"}${falhas.length ? `, ${falhas.length} com erro` : ""}`
          : "Atualizar agora — relê as APIs conectadas";
    return (
      <button
        type="button"
        onClick={atualizar}
        disabled={rodando}
        aria-label={titulo}
        title={titulo}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-r1 transition-colors hover:bg-panel-3 disabled:opacity-60",
          r?.erro || falhas.length ? "text-down" : r ? "text-up" : "text-ink-2 hover:text-ink"
        )}
      >
        <RefreshCw className={cn("h-4 w-4", rodando && "animate-spin")} aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={atualizar} disabled={rodando} variant="primary" size="sm">
        <RefreshCw className={cn("h-4 w-4", rodando && "animate-spin")} aria-hidden />
        {rodando ? "Atualizando…" : "Atualizar agora"}
      </Button>
      {rodando && (
        <p className="text-[11px] text-ink-3">Pode levar alguns minutos.</p>
      )}
      {r?.erro && <p className="max-w-[18rem] text-right text-[11px] text-down">{r.erro}</p>}
      {r?.nenhuma && (
        <p className="max-w-[18rem] text-right text-[11px] text-ink-3">
          Nenhuma API conectada nesta empresa — os números entram por planilha.
        </p>
      )}
      {r?.fontes && r.fontes.length > 0 && (
        <ul className="flex flex-col items-end gap-0.5 text-[11px]">
          {r.fontes.map((f) => (
            <li key={f.fonte} className={f.ok ? "text-ink-3" : "text-down"}>
              <span className="font-medium">{f.fonte}</span>: {f.ok ? f.detalhe : f.erro}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
