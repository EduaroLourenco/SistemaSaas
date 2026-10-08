"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { iniciarCarregando, encerrarCarregando } from "./carregando-gerizo";

/**
 * Em qual empresa e operação a sessão está.
 *
 * Quinze rotas de API resolvem a operação pelo servidor, e antes disso a
 * escolha era automática — "a que tem mais canais cadastrados". Com uma
 * empresa só ninguém sentia; com duas, subir a planilha de uma gravaria os
 * pedidos dentro da outra, sem erro nenhum. Este seletor é o que torna a
 * escolha explícita.
 *
 * Trocar grava um cookie no servidor e chama `router.refresh()`: as telas
 * são componentes de servidor, então quem tem de recarregar são elas, não
 * este botão. Sem o refresh o cookie muda e a tela continua mostrando a
 * empresa anterior — que é pior do que não ter seletor, porque mente.
 *
 * Com uma operação só o componente não desenha nada. Não há o que trocar, e
 * um menu de um item só ocupa espaço e sugere um problema que não existe.
 */

type Operacao = {
  id: string;
  nome: string;
  canais: number;
  organizacaoId: string;
  empresa: string;
};

export function SeletorEmpresa() {
  const router = useRouter();
  const [atual, setAtual] = React.useState<string | null>(null);
  const [lista, setLista] = React.useState<Operacao[]>([]);
  const [aberto, setAberto] = React.useState(false);
  const [trocando, setTrocando] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const caixa = React.useRef<HTMLDivElement>(null);
  /*
   * A troca recarrega os dados da tela inteira no mesmo endereço. A marca
   * de carregamento cobre essa espera e sai quando o refresh termina — a
   * transição sabe quando, o router.refresh() sozinho não avisa.
   */
  const [recarregando, iniciarTransicao] = React.useTransition();
  const aguardando = React.useRef(false);
  React.useEffect(() => {
    if (aguardando.current && !recarregando) {
      aguardando.current = false;
      encerrarCarregando();
    }
  }, [recarregando]);

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/operacao")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d?.id) return;
        setAtual(d.id as string);
        setLista((d.operacoes ?? []) as Operacao[]);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  if (lista.length < 2) return null;

  const escolhida = lista.find((o) => o.id === atual) ?? null;

  /* Agrupa por empresa: o nome da operação sozinho não diz de quem é. */
  const porEmpresa = new Map<string, Operacao[]>();
  for (const o of lista) {
    const k = o.empresa || "Sem empresa";
    if (!porEmpresa.has(k)) porEmpresa.set(k, []);
    porEmpresa.get(k)!.push(o);
  }
  const umaEmpresaSo = porEmpresa.size === 1;

  async function trocar(id: string) {
    if (id === atual) {
      setAberto(false);
      return;
    }
    setTrocando(id);
    setErro(null);
    iniciarCarregando("manual");
    try {
      const r = await fetch("/api/operacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setErro(d?.erro ?? "Não consegui trocar.");
        encerrarCarregando();
        return;
      }
      setAtual(id);
      setAberto(false);
      // Quem mostra a empresa fora daqui (o rodapé do menu) relê ao ouvir isto.
      window.dispatchEvent(new Event("gerizo:operacao-trocada"));
      aguardando.current = true;
      iniciarTransicao(() => router.refresh());
    } catch {
      setErro("Não consegui trocar.");
      encerrarCarregando();
    } finally {
      setTrocando(null);
    }
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={escolhida ? `Trocar empresa: ${escolhida.empresa} · ${escolhida.nome}` : "Trocar empresa"}
        title={escolhida ? `${escolhida.empresa} · ${escolhida.nome}` : "Trocar de empresa"}
        className="h-10 w-[42px] md:w-auto md:max-w-[220px] px-2 rounded-r1 flex items-center justify-center gap-1.5 text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden md:block text-[12px] font-medium truncate">
          {escolhida ? escolhida.empresa || escolhida.nome : "Empresa"}
        </span>
        <ChevronDown className="hidden md:block w-3.5 h-3.5 shrink-0" />
      </button>

      {aberto && (
        <div
          role="listbox"
          aria-label="Empresas e operações"
          className="fixed left-3 right-3 top-[var(--topbar)] z-50 max-h-[60dvh] overflow-y-auto rounded-r2 bg-panel border border-line shadow-lg py-1 md:absolute md:left-0 md:right-auto md:top-full md:mt-1 md:w-[272px]"
        >
          {erro && (
            <p className="px-3 py-2 text-[12px] text-down">{erro}</p>
          )}
          {[...porEmpresa.entries()].map(([empresa, ops]) => (
            <div key={empresa}>
              {!umaEmpresaSo && (
                <p className="px-3 pt-2 pb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                  {empresa}
                </p>
              )}
              {ops.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === atual}
                  disabled={trocando != null}
                  onClick={() => trocar(o.id)}
                  className={cn(
                    "w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-panel-3 transition-colors disabled:opacity-50",
                    o.id === atual && "bg-panel-2"
                  )}
                >
                  <Check
                    className={cn(
                      "w-3.5 h-3.5 shrink-0",
                      o.id === atual ? "text-ink" : "text-transparent"
                    )}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] text-ink truncate">{o.nome}</span>
                    {/*
                      Zero some em vez de virar "nenhum canal". Para o admin
                      da plataforma a contagem só enxerga as empresas de que
                      ele é membro — nas outras viria zero, e escrever
                      "nenhum canal" numa loja que tem canais seria mentira.
                    */}
                    {o.canais > 0 && (
                      <span className="block text-[12px] text-ink-3">
                        {o.canais === 1 ? "1 canal" : `${o.canais} canais`}
                      </span>
                    )}
                  </span>
                  {trocando === o.id && (
                    <span className="text-[12px] text-ink-3">trocando…</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
