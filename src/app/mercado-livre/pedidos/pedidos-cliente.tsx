"use client";
import * as React from "react";
import { useGerizoRouter as useRouter } from "@/lib/demo/runtime";
import { atualizador, estadoInicial } from "@/lib/atualizacao-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import type { DadosEnvios } from "@/lib/dados/envios-meli";
import { Painel } from "./painel";
import "./pedidos.css";

const curto = (n: string) => (/prazo/i.test(n) ? "A prazo" : /são paulo/i.test(n) ? "São Paulo" : n);
const lerServidor = () => estadoInicial;

export default function PedidosCliente({ dados }: { dados: DadosEnvios }) {
  const router = useRouter();
  const atualizacao = React.useSyncExternalStore(atualizador.assinar, atualizador.ler, lerServidor);
  const atualizando = atualizacao.enviando || Boolean(atualizacao.pedido?.ativo && atualizacao.pedido.blocos.includes("envios"));
  React.useEffect(() => {
    atualizador.carregar();
    return atualizador.aoTerminar(() => router.refresh());
  }, [router]);
  const [conta, setConta] = React.useState("");
  const todos = [...dados.envios, ...(dados.enviados ?? []), ...(dados.despachados ?? [])].filter((e) => !conta || e.conta === conta);

  return (
    <>
      <PageHeader
        title="Pedidos"
        badge={<span className="text-[12px] text-ink-3">Leitura de {new Date(dados.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
        actions={<Button size="sm" disabled={atualizando} onClick={() => void atualizador.pedir(["envios"])}>
          <RefreshCw size={15} aria-hidden="true" className={cn(atualizando && "animate-spin")} />{atualizando ? "Atualizando…" : "Atualizar"}
        </Button>}
      />
      <PageBody>
        {atualizacao.erro && <p role="alert" className="text-[14px] text-down">{atualizacao.erro}</p>}
        {dados.contas.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por conta">
            {["", ...dados.contas].map((c) => (
              <button key={c || "todas"} type="button" aria-pressed={conta === c} onClick={() => setConta(c)}
                className={cn("min-h-11 rounded-r1 border px-4 py-2 text-[14px] font-medium", conta === c ? "border-brand bg-brand-wash text-brand" : "border-line-2 bg-panel text-ink-2 hover:text-ink")}>
                {c ? curto(c) : "Todas"}
              </button>
            ))}
          </div>
        )}
        {dados.falhas.map((f) => <p key={f.conta} role="status" className="rounded-r1 bg-down-wash p-4 text-[14px] text-down"><b>{f.conta}</b>: {f.motivo}</p>)}
        <Painel envios={todos} contas={dados.contas} status={dados.status} reputacao={(dados.reputacao ?? []).filter((r) => !conta || r.conta === conta)} />
      </PageBody>
    </>
  );
}
