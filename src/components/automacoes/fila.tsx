"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Panel, Button, Badge, EmptyState } from "@/components/ui/primitives";
import { money, count } from "@/lib/format";
import type { Fila, LinhaFila } from "@/lib/dados/fila-aprovacao";
import type { PromocaoAberta } from "@/lib/dados/automacoes";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * A fila de aprovação.
 *
 * "Aceitar automaticamente... mas que eu confiro e vejo o produto e
 * promoção antes de aceitar." As duas metades só convivem se quem decide
 * for separado de quando sai: a regra decide e escreve aqui, o envio
 * espera o aceite.
 *
 * O ganho está em GERAR, não nesta tela: hoje ele abre promoção por
 * promoção para descobrir o que cabe. A fila chega pronta e ele só tira.
 *
 * Gerar é uma promoção por chamada, quatro ao mesmo tempo — é o mesmo
 * cuidado dos contadores: as 36 de uma vez estouram a cota e nenhuma
 * volta.
 */

const ROTULO_DECISAO: Record<string, { texto: string; tom: "up" | "info" }> = {
  aceitar: { texto: "aceitar", tom: "up" },
  reescrever: { texto: "reescrever preço", tom: "info" },
};

const diasAte = (iso: string | null) =>
  iso == null ? null : Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);

export function FilaAprovacao({
  fila,
  promocoes,
  podeEscrever,
}: {
  fila: Fila;
  promocoes: PromocaoAberta[];
  /** Alguma conta autorizou o sistema a escrever no canal. */
  podeEscrever: boolean;
}) {
  const router = useRouter();
  const [marcados, setMarcados] = React.useState<Set<string>>(new Set());
  const [gerando, setGerando] = React.useState<{ feitas: number; total: number } | null>(null);
  const [recado, setRecado] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const porPromocao = React.useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; prazo: string | null; linhas: LinhaFila[] }>();
    for (const l of fila.linhas) {
      const chave = l.contaCanalId + l.promocao;
      const g = m.get(chave) ?? {
        chave,
        nome: promocoes.find((p) => p.contaId === l.contaCanalId && p.codigo === l.promocao)?.nome ?? l.promocao,
        prazo: l.prazo,
        linhas: [],
      };
      g.linhas.push(l);
      m.set(chave, g);
    }
    /* Prazo na frente: é o que decide a ordem de olhar. Sem prazo vai
       para o fim, não para o começo. */
    return [...m.values()].sort((a, b) => {
      const x = diasAte(a.prazo) ?? 9999;
      const y = diasAte(b.prazo) ?? 9999;
      return x - y;
    });
  }, [fila.linhas, promocoes]);

  async function gerar() {
    setErro(null);
    setRecado(null);
    const alvo = promocoes;
    if (!alvo.length) return;
    setGerando({ feitas: 0, total: alvo.length });

    const fila4 = [...alvo];
    let decididos = 0;
    let falhas = 0;
    const proxima = async (): Promise<void> => {
      const p = fila4.shift();
      if (!p) return;
      try {
        const r = await fetch("/api/automacoes/fila", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conta: p.contaId,
            promocao: p.codigo,
            tipo: p.tipo,
            nome: p.nome,
            prazo: p.prazo ?? p.fim ?? null,
          }),
        });
        const j = await r.json();
        if (!r.ok) {
          falhas += 1;
          if (!erro) setErro(j.erro ?? "não consegui gerar");
        } else {
          decididos += j.decididos ?? 0;
        }
      } catch {
        falhas += 1;
      }
      setGerando((g) => (g ? { ...g, feitas: g.feitas + 1 } : g));
      return proxima();
    };
    await Promise.all(Array.from({ length: 4 }, proxima));

    setGerando(null);
    setRecado(
      `${count(decididos)} decisões na fila${falhas ? ` · ${falhas} promoções não responderam` : ""}`
    );
    router.refresh();
  }

  async function decidir(estado: "aprovada" | "descartada") {
    if (!marcados.size) return;
    setErro(null);
    const r = await fetch("/api/automacoes/fila", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao: "decidir", ids: [...marcados], estado }),
    });
    const j = await r.json();
    if (!r.ok) {
      setErro(j.erro ?? "não consegui gravar");
      return;
    }
    setRecado(
      `${count(j.mudadas)} ${estado === "aprovada" ? "aprovadas" : "descartadas"}` +
        (estado === "aprovada" ? " · o envio ao canal continua desligado" : "")
    );
    setMarcados(new Set());
    router.refresh();
  }

  const marcarGrupo = (linhas: LinhaFila[], ligar: boolean) =>
    setMarcados((antes) => {
      const n = new Set(antes);
      for (const l of linhas) if (ligar) n.add(l.id);
        else n.delete(l.id);
      return n;
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={gerar} disabled={!!gerando || !promocoes.length}>
          <RefreshCw size={15} className={gerando ? "animate-spin" : undefined} />
          {gerando
            ? `Gerando… ${gerando.feitas} de ${gerando.total}`
            : `Gerar fila das ${count(promocoes.length)} promoções`}
        </Button>
        {marcados.size > 0 && (
          <>
            <span className="text-[12.5px] text-ink-2">
              <b className="font-mono text-ink">{count(marcados.size)}</b> marcados
            </span>
            <Button onClick={() => decidir("aprovada")}>Aprovar</Button>
            <Button onClick={() => decidir("descartada")}>Descartar</Button>
            <Button onClick={() => setMarcados(new Set())}>Limpar</Button>
          </>
        )}
        {recado && <span className="text-[12.5px] text-ink-2">{recado}</span>}
      </div>

      {(fila.faltaMigracao || erro) && (
        <Panel className="mt-4 border-warn/40 bg-warn-wash/40">
          <div className="flex items-start gap-2 p-4 text-[13px]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
            <p>{erro ?? fila.faltaMigracao}</p>
          </div>
        </Panel>
      )}

      {!fila.linhas.length && !fila.faltaMigracao && (
        <div className="mt-4">
          <EmptyState
            title="A fila está vazia"
            description="Gerar roda as suas regras em cima do que o canal convidou e deixa aqui o que elas decidiram. Nada é enviado."
          />
        </div>
      )}

      {porPromocao.map((g) => {
        const todos = g.linhas.every((l) => marcados.has(l.id));
        const dias = diasAte(g.prazo);
        return (
          <Panel key={g.chave} className="mt-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <input
                type="checkbox"
                checked={todos}
                onChange={(e) => marcarGrupo(g.linhas, e.target.checked)}
                aria-label={`Marcar os ${g.linhas.length} de ${g.nome}`}
                className="size-4 accent-[var(--brand)]"
              />
              <b className="text-[13.5px] text-ink">{g.nome}</b>
              <span className="font-mono text-[12.5px] text-ink-3">{count(g.linhas.length)} itens</span>
              {dias != null && (
                <Badge tone={dias < 0 ? "neutral" : dias <= 7 ? "down" : "neutral"}>
                  {dias < 0 ? "venceu" : dias === 0 ? "vence hoje" : `vence em ${dias} dias`}
                </Badge>
              )}
            </div>

            <div className="divide-y divide-line">
              {g.linhas.map((l) => {
                const d = ROTULO_DECISAO[l.decisao];
                return (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-panel-2"
                  >
                    <input
                      type="checkbox"
                      checked={marcados.has(l.id)}
                      onChange={(e) =>
                        setMarcados((antes) => {
                          const n = new Set(antes);
                          if (e.target.checked) n.add(l.id);
                          else n.delete(l.id);
                          return n;
                        })
                      }
                      className="size-4 shrink-0 accent-[var(--brand)]"
                    />
                    {/*
                      Preço embaixo, não ao lado.
                      No telefone a coluna da direita espremia o título até
                      o texto cavalgar o preço — o print da página solta
                      mostrou isso. Em três linhas, a mesma marcação serve
                      às duas larguras.
                    */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-ink">
                        {l.titulo ?? l.mlb}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-ink-3">
                        {l.sku ?? "sem SKU"} · {l.mlb}
                        {l.regraNome && <span className="font-sans"> · {l.regraNome}</span>}
                      </span>
                      <span className="mt-0.5 block font-mono text-[12.5px] text-ink">
                        {l.precoProposto == null ? "—" : money(l.precoProposto)}
                        {/* O piso do momento: é o que torna a linha
                            explicável depois, quando a Fórmula base já
                            mudou de vigência. */}
                        <span className="text-[11px] text-ink-3">
                          {" · piso "}
                          {l.pisoNaHora == null ? "—" : money(l.pisoNaHora)}
                          {l.folgaUsada != null && ` · folga ${l.folgaUsada}%`}
                        </span>
                      </span>
                    </span>
                    {d && (
                      <span className="shrink-0">
                        <Badge tone={d.tom}>{d.texto}</Badge>
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </Panel>
        );
      })}

      {fila.linhas.length > 0 && (
        <p className="mt-3 text-[12px] text-ink-3">
          {podeEscrever
            ? "Aprovar grava a decisão aqui. O envio ao Mercado Livre é o passo seguinte, em Promoções, e só sai com confirmação."
            : "Nenhuma conta autorizou o sistema a alterar promoções, então nada daqui pode ser enviado ainda."}
        </p>
      )}
    </>
  );
}
