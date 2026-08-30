"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Panel, Button, Badge } from "./primitives";
import { Select } from "./controls";
import { count } from "@/lib/format";
import type { Exclusao } from "@/lib/dados/exclusoes";
import { EyeOff, Plus, RotateCcw, Loader2, X } from "lucide-react";

/**
 * Descartar um período da análise, sem apagar nada do banco.
 *
 * O caso que motivou: um lote de 129 pedidos entrou num dia só, quase
 * todos cancelados, e sozinho levou o cancelamento da semana a 63%. O
 * dado é verdadeiro — apagar seria falsificar — mas ele descreve um
 * evento de sistema, não a operação.
 *
 * ── Três decisões que valem explicar ──
 *
 * O painel fica ABERTO quando há exclusão ativa. Recolhido, quem chega na
 * tela não descobre que está vendo um recorte, e o número passa a mentir
 * com aparência de precisão.
 *
 * O motivo é OBRIGATÓRIO. Exclusão sem justificativa vira folclore: em
 * seis meses ninguém sabe por que aquele dia sumiu e ninguém ousa
 * reverter.
 *
 * Reverter é UM CLIQUE, e a tela diz isso. Como nada foi apagado, voltar
 * atrás não tem custo — e saber disso é o que faz alguém se sentir à
 * vontade para excluir quando deve.
 */

export function PainelExclusoes({
  exclusoes,
  canais,
  removidas,
  totalOriginal,
}: {
  exclusoes: Exclusao[];
  canais: { id: string; nome: string }[];
  /** Quantas linhas saíram da análise. Vem do servidor. */
  removidas?: number;
  totalOriginal?: number;
}) {
  const router = useRouter();
  const ativo = exclusoes.length > 0;

  const [aberto, setAberto] = React.useState(ativo);
  const [data, setData] = React.useState("");
  const [dataFim, setDataFim] = React.useState("");
  const [canal, setCanal] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function aplicar() {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch("/api/exclusoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dataInicio: data,
          dataFim: dataFim || data,
          canalId: canal || null,
          motivo,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.erro ?? "Não consegui aplicar.");
        return;
      }
      setData("");
      setDataFim("");
      setCanal("");
      setMotivo("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha de rede.");
    } finally {
      setSalvando(false);
    }
  }

  async function reverter(id: string) {
    await fetch(`/api/exclusoes?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const pode = /^\d{4}-\d{2}-\d{2}$/.test(data) && motivo.trim().length >= 3;

  return (
    <Panel className={ativo ? "p-4 border-warn/30" : "p-4"}>
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center justify-between gap-3 w-full text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <EyeOff
            className={ativo ? "w-4 h-4 text-warn shrink-0" : "w-4 h-4 text-ink-3 shrink-0"}
            strokeWidth={2}
          />
          <span className="text-[13px] font-semibold text-ink">
            Períodos fora da análise
          </span>
          {ativo && (
            <Badge tone="warn">
              {count(exclusoes.length)}
              {removidas ? ` · ${count(removidas)} linhas` : ""}
            </Badge>
          )}
        </span>
        <span className="text-[12px] text-ink-3 shrink-0">
          {aberto ? "Recolher" : ativo ? "Ver" : "Excluir um período"}
        </span>
      </button>

      {ativo && (
        <p className="text-[12px] text-ink-2 leading-relaxed mt-2">
          Os números desta tela <span className="font-semibold text-ink">não</span>{" "}
          incluem o que está listado abaixo.
          {removidas && totalOriginal ? (
            <>
              {" "}
              <span className="num">{count(removidas)}</span> de{" "}
              <span className="num">{count(totalOriginal)}</span> registros
              foram deixados de fora — nada foi apagado do banco.
            </>
          ) : (
            <> Nada foi apagado do banco.</>
          )}
        </p>
      )}

      {aberto && (
        <>
          {exclusoes.length > 0 && (
            <ul className="flex flex-col mt-3 border-t border-line pt-2.5">
              {exclusoes.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-3 py-2 border-b border-line last:border-0"
                >
                  <span className="min-w-0">
                    <span className="num text-[12.5px] text-ink font-medium">
                      {e.dataInicio === e.dataFim
                        ? dataBr(e.dataInicio)
                        : `${dataBr(e.dataInicio)} — ${dataBr(e.dataFim)}`}
                    </span>
                    <span className="text-[12.5px] text-ink-2">
                      {" · "}
                      {e.canal ?? "todos os canais"}
                      {e.conta ? ` · ${e.conta}` : ""}
                    </span>
                    <span className="block text-[11.5px] text-ink-3 mt-0.5">
                      {e.motivo}
                    </span>
                  </span>
                  <button
                    onClick={() => reverter(e.id)}
                    className="shrink-0 inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
                    title="Volta a contar na análise"
                  >
                    <RotateCcw className="w-3 h-3" strokeWidth={2.25} />
                    Reverter
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 pt-3 border-t border-line">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="label">Data</span>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="num h-9 px-2 rounded-r1 bg-panel border border-line text-[12.5px] text-ink outline-none focus:border-brand"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="label">
                  Até <span className="text-ink-3 font-normal">(opcional)</span>
                </span>
                <input
                  type="date"
                  value={dataFim}
                  min={data || undefined}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="num h-9 px-2 rounded-r1 bg-panel border border-line text-[12.5px] text-ink outline-none focus:border-brand"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="label">Canal</span>
                <Select value={canal} onChange={(e) => setCanal(e.target.value)}>
                  <option value="">Todos os canais</option>
                  {canais.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="label">Motivo</span>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: lote de teste do hub"
                  className="h-9 px-2.5 rounded-r1 bg-panel border border-line text-[13px] text-ink outline-none focus:border-brand"
                />
              </label>
            </div>

            {erro && (
              <p className="text-[12px] text-down mt-2" role="alert">
                {erro}
              </p>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap mt-3">
              <p className="text-[11.5px] text-ink-3 leading-relaxed max-w-md">
                Nada é apagado. A linha continua no banco e volta a contar
                assim que você reverter — por isso excluir aqui é barato.
              </p>
              <Button
                variant="primary"
                disabled={!pode || salvando}
                onClick={aplicar}
                className="max-sm:w-full max-sm:h-11"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Aplicando
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                    Aplicar exclusão
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function dataBr(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}
