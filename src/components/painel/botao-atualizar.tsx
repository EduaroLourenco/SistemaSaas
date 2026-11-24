"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useGerizoRouter as useRouter } from "@/lib/demo/runtime";
import { AlertCircle, Check, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/controls";
import { atualizador, estadoInicial, type EstadoAtualizacao } from "@/lib/atualizacao-cliente";
import { BLOCOS, TEMPO_TUDO, type Bloco } from "@/lib/atualizacao-blocos";
import { cn } from "@/lib/utils";

const lerServidor = () => estadoInicial;

/*
 * De qual leitura vem o dado da tela aberta — é o horário dela que o relógio
 * mostra. Tela sem leitura própria (cadastros, configurações) não mostra
 * relógio: um horário de outra fonte ali seria um "atualizado" falso.
 */
const TELAS: [RegExp, Bloco][] = [
  [/^\/mercado-livre\/envios/, "envios"],
  [/^\/anuncios\/trafego-pago/, "publicidade"],
  [/^\/financeiro/, "financeiro"],
  [/^\/(anuncios|produtos|promocoes)(\/|$)/, "anuncios"],
  [/^\/(vendas|mercado-livre|relatorios|planejamento|alertas)(\/|$)/, "vendas"],
];
function blocoDaTela(caminho: string) {
  const tela = caminho.replace(/^\/demonstracao\/sistema/, "") || "/";
  const id = TELAS.find(([re]) => re.test(tela))?.[1];
  return id ? BLOCOS.find((b) => b.id === id) ?? null : null;
}

export function BotaoAtualizar({ compacto = false }: { compacto?: boolean }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const estado = React.useSyncExternalStore(atualizador.assinar, atualizador.ler, lerServidor);
  const [aberto, setAberto] = React.useState(false);
  const rodando = Boolean(estado.pedido?.ativo);
  const falhas = Boolean(estado.pedido && !rodando && estado.pedido.etapas.some((e) => e.estado === "falhou" || e.avisos?.length));

  React.useEffect(() => {
    atualizador.carregar();
    // Celular bloqueado congela o relógio da página: ao voltar, relê na hora.
    const voltar = () => { if (document.visibilityState === "visible") atualizador.recarregar(); };
    document.addEventListener("visibilitychange", voltar);
    /* O relógio do topo mostra a última leitura: sem reler, ficava no horário
       em que a aba abriu (16:54 com vendas lidas às 17:24, em 24/11). */
    const relogio = setInterval(voltar, 120_000);
    const sair = atualizador.aoTerminar(() => router.refresh());
    return () => { document.removeEventListener("visibilitychange", voltar); clearInterval(relogio); sair(); };
  }, [router]);

  const bloco = blocoDaTela(pathname);
  const ultima = bloco ? estado.ultima[bloco.id] : undefined;
  const relogio = ultima ? `${bloco!.nome} · ${hora(ultima.em)}${ultima.falhou ? " · falhou" : ""}` : null;

  return <>
    {compacto ? <button
      type="button"
      onClick={() => setAberto(true)}
      aria-label={rodando ? "Ver andamento da atualização" : relogio ? `Atualizar. ${relogio}` : "Atualizar"}
      title={rodando ? "Atualizando…" : relogio ? `Dados de ${relogio}. Clique para atualizar.` : "Atualizar"}
      className={cn("flex h-9 min-w-9 items-center justify-center gap-2 rounded-r1 px-2 transition-colors hover:bg-panel-3", falhas || ultima?.falhou ? "text-warn" : "text-ink-2 hover:text-ink")}
    >
      {relogio && !rodando && <span className="num whitespace-nowrap text-[12px]">{relogio}</span>}
      <RefreshCw className={cn("h-4 w-4", rodando && "animate-spin")} aria-hidden />
    </button> : <Button onClick={() => setAberto(true)} variant="primary" size="sm">
      <RefreshCw className={cn("h-4 w-4", rodando && "animate-spin")} aria-hidden />
      {rodando ? "Ver andamento" : "Atualizar"}
    </Button>}
    {aberto && <Sheet title={rodando ? "Atualizando" : "Atualizar"} subtitle={estado.empresa} onClose={() => setAberto(false)}>
      <Painel estado={estado} />
    </Sheet>}
  </>;
}

const hora = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hm = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return dia === hoje ? `hoje ${hm}` : `${dia.slice(0, 5)} ${hm}`;
};

function Painel({ estado }: { estado: EstadoAtualizacao }) {
  const [marcados, setMarcados] = React.useState<Set<Bloco>>(new Set());
  const { pedido, enviando, erro } = estado;
  const rodando = Boolean(pedido?.ativo);
  const alternar = (b: Bloco) => setMarcados((m) => {
    const n = new Set(m);
    if (n.has(b)) n.delete(b); else n.add(b);
    return n;
  });
  const pedir = (blocos: Bloco[]) => { void atualizador.pedir(blocos).then(() => setMarcados(new Set())); };

  return <div className="space-y-4 p-5">
    {erro && <p role="alert" className="rounded-r1 border border-line bg-panel-2 p-3 text-[13px] text-down">{erro}</p>}

    {!rodando && <>
      <button
        type="button"
        disabled={enviando}
        onClick={() => pedir(BLOCOS.map((b) => b.id))}
        className="flex min-h-14 w-full items-center justify-between rounded-r2 bg-brand px-5 text-[16px] font-semibold text-brand-ink disabled:opacity-60"
      >
        Atualizar tudo <span className="text-[12px] font-normal opacity-85">{TEMPO_TUDO}</span>
      </button>
      <p className="text-center text-[12px] text-ink-3">ou escolha</p>
      <div className="grid grid-cols-2 gap-2.5">
        {BLOCOS.map((b) => {
          const sim = marcados.has(b.id);
          const u = estado.ultima[b.id];
          return <button
            key={b.id}
            type="button"
            aria-pressed={sim}
            onClick={() => alternar(b.id)}
            className={cn("relative min-h-[76px] rounded-r2 border-[1.5px] p-3 text-left transition-colors",
              sim ? "border-brand bg-brand-wash" : "border-line bg-panel hover:border-line-2")}
          >
            <span aria-hidden className={cn("absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-[6px] border-[1.5px]",
              sim ? "border-brand bg-brand text-brand-ink" : "border-line")}>
              {sim && <Check className="h-3.5 w-3.5" />}
            </span>
            <b className="block pr-6 text-[15px]">{b.nome}</b>
            <span className={cn("num text-[12px]", u?.falhou ? "text-warn" : "text-ink-3")}>
              {u ? `${hora(u.em)}${u.falhou ? " · falhou" : ""}` : "sem leitura"} · {b.tempo}
            </span>
          </button>;
        })}
      </div>
      <button
        type="button"
        disabled={!marcados.size || enviando}
        onClick={() => pedir(BLOCOS.map((b) => b.id).filter((id) => marcados.has(id)))}
        className="min-h-12 w-full rounded-r2 border-[1.5px] border-brand bg-panel text-[15px] font-semibold text-brand disabled:border-line disabled:text-ink-3"
      >
        {enviando ? "Pedindo…" : marcados.size ? `Atualizar ${marcados.size} bloco${marcados.size > 1 ? "s" : ""}` : "Escolha um bloco"}
      </button>
    </>}

    {pedido && <section aria-live="polite" className={cn(!rodando && "border-t border-line pt-4")}>
      <p className="mb-1 text-[12px] text-ink-3">{rodando ? "pedido" : "último pedido"} · {hora(pedido.criadoEm)}</p>
      <ul className="divide-y divide-line">
        {pedido.etapas.map((e) => {
          const aviso = e.estado === "falhou" || Boolean(e.avisos?.length);
          const Icone = e.estado === "atualizando" ? RefreshCw : aviso ? AlertCircle : e.estado === "concluida" ? Check : Clock;
          const status = e.estado === "atualizando" ? "rodando…" : e.estado === "aguardando" ? (e.detalhe ?? "na fila") : e.detalhe;
          return <li key={e.id} className="flex items-start gap-3 py-2.5">
            <Icone aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", e.estado === "atualizando" && "animate-spin text-brand", aviso ? "text-warn" : e.estado === "concluida" ? "text-up" : "text-ink-3")} />
            <div className="min-w-0 break-words text-[13px]">
              <p className="font-medium">{e.fonte}</p>
              <p className={cn("mt-0.5 text-[12px]", aviso ? "text-warn" : "text-ink-3")}>{status}</p>
              {e.avisos?.map((a, i) => <p key={i} className="mt-1 text-[12px] text-warn">{a}</p>)}
            </div>
          </li>;
        })}
      </ul>
      {rodando && <p className="mt-3 rounded-r1 bg-up-wash px-3 py-2.5 text-[13px] text-up">Pode fechar. Continua no servidor.</p>}
    </section>}

    {!estado.carregado && <p className="text-[13px] text-ink-3">Carregando…</p>}
  </div>;
}
