"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Panel, PanelHeader } from "@/components/ui/primitives";
import type { ContaCanal, Erp } from "@/lib/dados/canais";

/**
 * Aba ERP: de qual sistema de gestão vêm os pedidos dos canais sem API.
 *
 * Fica separada de Canais porque ERP não é onde se vende — é de onde vem o
 * pedido de vários canais ao mesmo tempo. O trabalho que só a empresa sabe
 * fazer é dizer de qual canal é cada loja do Bling; até isso, os pedidos da
 * loja ficam parados, de propósito.
 */
export function ErpPainel({
  erp,
  contas,
  quando,
}: {
  erp: Erp | null;
  contas: ContaCanal[];
  quando: (iso: string | null) => string | null;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);

  async function ligar(loja: string, conta: string) {
    setSalvando(loja);
    setAviso(null);
    try {
      const r = await fetch("/api/bling/lojas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loja, conta }),
      });
      const j = (await r.json().catch(() => ({}))) as { erro?: string; aviso?: string; pedidos?: number };
      if (!r.ok) setAviso(j.erro ?? "Não consegui salvar.");
      else if (j.aviso) setAviso(`Ligação salva, mas a leitura falhou: ${j.aviso}`);
      else if (conta) setAviso(`Loja ${loja} ligada. ${j.pedidos ?? 0} pedidos dos últimos 30 dias gravados.`);
      router.refresh();
    } finally {
      setSalvando(null);
    }
  }

  const lojas = [...new Set([...Object.keys(erp?.lojas ?? {}), ...Object.keys(erp?.pendentes ?? {})])].sort(
    (a, b) => Number(a) - Number(b)
  );
  const nomeConta = (c: ContaCanal) => `${c.canalNome} · ${c.nome}`;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader
          title="Bling"
          hint="Pedidos, produtos e estoque, por API. Acesso somente leitura: nada é alterado no Bling."
          action={
            <a
              href="/api/bling/conectar"
              className={
                "inline-flex h-9 items-center rounded-r1 border px-3 text-[12px] font-medium whitespace-nowrap transition-colors " +
                (erp?.conectado
                  ? "border-line-2 bg-panel text-ink hover:bg-panel-3"
                  : "border-brand bg-brand text-brand-ink hover:bg-brand-2")
              }
            >
              {erp?.conectado ? "Reconectar" : "Conectar Bling"}
            </a>
          }
        />
        <div className="px-5 py-4 flex flex-col gap-1.5 text-[13px]">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={erp?.erro ? "down" : erp?.conectado ? "up" : "neutral"}>
              {erp?.erro ? "Com erro" : erp?.conectado ? "Conectado" : "Não conectado"}
            </Badge>
            {erp?.empresa?.nome && (
              <span className="text-ink-2">
                {erp.empresa.nome}
                {erp.empresa.cnpj && <span className="num text-ink-3"> · {erp.empresa.cnpj}</span>}
              </span>
            )}
            {quando(erp?.sincronizadaEm ?? null) && (
              <span className="num text-[12px] text-ink-3">sync {quando(erp?.sincronizadaEm ?? null)}</span>
            )}
          </div>
          {erp?.erro && <p className="text-[12.5px] text-down">{erp.erro}</p>}
          {!erp?.conectado && (
            <p className="text-[12.5px] text-ink-2">
              Quem conecta precisa ser administrador da conta no Bling. A autorização vale para a empresa inteira.
            </p>
          )}
        </div>
      </Panel>

      {erp?.conectado && (
        <Panel>
          <PanelHeader
            title="Lojas do Bling"
            hint="Cada loja virtual cadastrada no Bling é um canal. Diga qual é qual: pedido de loja sem canal fica parado, para não cair no canal errado."
          />
          {aviso && <p className="px-5 pt-3 text-[12.5px] text-ink-2">{aviso}</p>}
          {lojas.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-ink-3">Nenhuma loja com pedido no período lido.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left label">
                    <th className="px-5 py-2 font-semibold">Loja no Bling</th>
                    <th className="px-3 py-2 font-semibold">Pedido de exemplo</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                    <th className="px-5 py-2 font-semibold">Canal no sistema</th>
                  </tr>
                </thead>
                <tbody>
                  {lojas.map((loja) => {
                    const pend = erp.pendentes[loja];
                    const ligada = erp.lojas[loja] ?? "";
                    return (
                      <tr key={loja} className="border-t border-line">
                        <td className="px-5 py-2.5 num">{loja === "0" ? "0 (sem loja: venda direta)" : loja}</td>
                        <td className="px-3 py-2.5 num text-ink-2">{pend?.exemplo ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          {pend ? (
                            <Badge tone="warn">{pend.pedidos} pedido(s) parado(s)</Badge>
                          ) : (
                            <Badge tone="up">Ligada</Badge>
                          )}
                        </td>
                        <td className="px-5 py-2.5">
                          <select
                            className="h-9 rounded-r1 border border-line-2 bg-panel-2 px-2 text-[13px] min-w-56"
                            value={ligada}
                            disabled={salvando === loja}
                            onChange={(e) => ligar(loja, e.target.value)}
                          >
                            <option value="">Escolha o canal…</option>
                            {contas.map((c) => (
                              <option key={c.id} value={c.id}>
                                {nomeConta(c)}
                              </option>
                            ))}
                          </select>
                          {salvando === loja && <span className="ml-2 text-[12px] text-ink-3">gravando…</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-5 py-3 text-[12px] text-ink-3 border-t border-line">
            Canal que não aparece na lista? Cadastre a conta na aba Contas de venda. Pedido de conta que já entra pela API
            do próprio canal (Mercado Livre, VTEX) é ignorado aqui, para não contar em dobro.
          </p>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Outros ERPs" />
        <div className="px-5 py-4 flex flex-col gap-2 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span>Vtrina</span>
            <Link href="/importar" className="text-[12.5px] font-medium text-brand hover:underline">
              por planilha, em Importar
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}
