"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/controls";
import { atualizador, estadoInicial, type EstadoAtualizacao } from "@/lib/atualizacao-cliente";
import { cn } from "@/lib/utils";

const lerServidor = () => estadoInicial;

export function BotaoAtualizar({ compacto = false }: { compacto?: boolean }) {
  const router = useRouter();
  const estado = React.useSyncExternalStore(atualizador.assinar, atualizador.ler, lerServidor);
  const [aberto, setAberto] = React.useState(false);
  const { rodando, iniciou, etapas } = estado;
  const falhas = Boolean(estado.erro || etapas.some((e) => e.estado === "falhou" || e.avisos?.length));

  async function atualizar() {
    setAberto(true);
    await atualizador.executar();
    router.refresh();
  }
  function abrir() {
    if (iniciou) setAberto(true);
    else void atualizar();
  }

  return <>
    {compacto ? <button
      type="button"
      onClick={abrir}
      aria-label={rodando ? "Ver andamento da atualização" : iniciou ? "Ver resultado da atualização" : "Atualizar agora"}
      title={rodando ? "Atualizando fontes…" : iniciou ? "Ver atualização" : "Atualizar agora"}
      className={cn("flex h-9 w-9 items-center justify-center rounded-r1 transition-colors hover:bg-panel-3", falhas ? "text-warn" : iniciou && !rodando ? "text-up" : "text-ink-2 hover:text-ink")}
    >
      <RefreshCw className={cn("h-4 w-4", rodando && "animate-spin")} aria-hidden />
    </button> : <div className="flex flex-col items-end gap-1.5">
      <Button onClick={rodando ? abrir : atualizar} variant="primary" size="sm">
        <RefreshCw className={cn("h-4 w-4", rodando && "animate-spin")} aria-hidden />
        {rodando ? "Ver andamento" : "Atualizar agora"}
      </Button>
      {iniciou && <button type="button" onClick={abrir} className="max-w-full text-right text-[12px] text-ink-2 underline underline-offset-2">
        {rodando ? "Atualização em andamento" : falhas ? "Concluído com pendências · ver detalhes" : "Ver última atualização"}
      </button>}
    </div>}
    {aberto && <Sheet title={rodando ? "Atualizando fontes" : "Atualização das fontes"} subtitle={estado.empresa} onClose={() => setAberto(false)} footer={
      rodando
        ? <p className="text-[12px] text-ink-2">Mantenha esta aba aberta até concluir. Você pode fechar este painel.</p>
        : <Button onClick={atualizar} variant="primary" size="sm"><RefreshCw className="h-4 w-4" aria-hidden />Atualizar novamente</Button>
    }>
      <Resultado estado={estado} />
    </Sheet>}
  </>;
}

function Resultado({ estado }: { estado: EstadoAtualizacao }) {
  const { rodando, etapas, erro } = estado;
  const feitas = etapas.filter((e) => e.estado === "concluida" || e.estado === "falhou").length;
  const ativa = etapas.find((e) => e.estado === "atualizando");
  return <div className="space-y-5 p-5">
    <div role="status" aria-live="polite" className="space-y-2 text-[13px] text-ink-2">
      <p>{rodando ? ativa ? ativa.fonte : "Consultando conexões…" : erro ? "Atualização interrompida" : etapas.some((e) => e.estado === "falhou" || e.avisos?.length) ? "Concluído com pendências" : etapas.length ? "Atualização concluída" : "Nenhuma API conectada nesta empresa."}</p>
      {etapas.length > 0 && <>
        <progress aria-label="Etapas concluídas" value={feitas} max={etapas.length} className="h-2 w-full accent-brand" />
        <p className="num text-[12px] text-ink-3">{feitas} de {etapas.length} etapas</p>
      </>}
    </div>
    {erro && <p role="alert" className="rounded-r1 border border-line bg-panel-2 p-3 text-[13px] text-down">{erro}</p>}
    <ul className="divide-y divide-line">
      {etapas.map((e) => {
        const aviso = e.estado === "falhou" || Boolean(e.avisos?.length);
        const Icone = e.estado === "atualizando" ? RefreshCw : aviso ? AlertCircle : e.estado === "concluida" ? Check : Clock;
        const status = e.estado === "atualizando" ? e.detalhe ? `${e.detalhe} · continuando…` : "Atualizando…" : e.estado === "aguardando" ? "Aguardando" : e.estado === "interrompida" ? "Não iniciada" : e.detalhe;
        return <li key={e.id} className="flex items-start gap-3 py-3 first:pt-0">
          <Icone aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", e.estado === "atualizando" && "animate-spin", aviso ? "text-warn" : e.estado === "concluida" ? "text-up" : "text-ink-3")} />
          <div className="min-w-0 break-words text-[13px]">
            <p className="font-medium">{e.fonte}</p>
            <p className={cn("mt-0.5 text-[12px]", aviso ? "text-warn" : "text-ink-3")}>{status}</p>
            {e.avisos?.map((a, i) => <p key={i} className="mt-1 text-[12px] text-warn">{a}</p>)}
          </div>
        </li>;
      })}
    </ul>
  </div>;
}
