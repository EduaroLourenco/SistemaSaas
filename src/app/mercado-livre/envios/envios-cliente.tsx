"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { DadosEnvios, EnvioMeli } from "@/lib/dados/envios-meli";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "São Paulo — pronta entrega" → "São Paulo"; "2ª conta — venda a prazo" → "A prazo". */
const curto = (n: string) => (/prazo/i.test(n) ? "A prazo" : /são paulo/i.test(n) ? "São Paulo" : n);

function limiteBr(e: EnvioMeli) {
  if (!e.limite) return null;
  const d = new Date(e.limite.slice(0, 10) + "T12:00:00");
  const dia = `${DIAS[d.getDay()]} ${e.limite.slice(8, 10)}/${e.limite.slice(5, 7)}`;
  return e.origem === "canal" ? `${dia} · ${e.limite.slice(11, 13)}h` : dia;
}

const compraBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Dias({ dias }: { dias: number | null }) {
  if (dias == null) return <span className="text-[13px] text-ink-3">sem prazo</span>;
  const tom = dias < 0 ? "text-down" : dias <= 1 ? "text-warn" : "text-ink";
  const rotulo = dias < 0 ? "atrasado" : dias === 0 ? "hoje" : dias === 1 ? "dia" : "dias";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("num text-[28px] font-bold leading-none tracking-[-0.03em]", tom)}>
        {dias < 0 ? `−${-dias}` : dias === 0 ? "0" : dias}
      </span>
      <span className={cn("text-[12px] font-semibold", tom)}>{rotulo}</span>
    </span>
  );
}

type Chave = "dias" | "limite" | "pedido" | "conta" | "situacao";

export default function EnviosCliente({ dados }: { dados: DadosEnvios }) {
  const [conta, setConta] = React.useState("");
  const [ordem, setOrdem] = React.useState<{ chave: Chave; asc: boolean }>({ chave: "dias", asc: true });

  const lista = React.useMemo(() => {
    const base = dados.envios.filter((e) => !conta || e.conta === conta);
    const val = (e: EnvioMeli) =>
      ordem.chave === "dias" || ordem.chave === "limite"
        ? (e.limite ?? "9999")
        : ordem.chave === "pedido" ? e.pedido : ordem.chave === "conta" ? e.conta : e.situacao;
    return [...base].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (ordem.asc ? 1 : -1);
    });
  }, [dados.envios, conta, ordem]);

  const n = (f: (d: number) => boolean) => lista.filter((e) => e.dias != null && f(e.dias)).length;
  const resumo = [
    { r: "Atrasados", v: n((d) => d < 0), tom: "text-down" },
    { r: "Hoje", v: n((d) => d === 0), tom: "text-warn" },
    { r: "Amanhã", v: n((d) => d === 1), tom: "text-warn" },
    { r: "Depois", v: n((d) => d >= 2), tom: "text-ink" },
  ];

  const ordenar = (chave: Chave) => setOrdem((o) => ({ chave, asc: o.chave === chave ? !o.asc : true }));
  const Cab = ({ chave, children, className }: { chave: Chave; children: React.ReactNode; className?: string }) => (
    <button type="button" onClick={() => ordenar(chave)} className={cn("flex items-center gap-1 text-left", className)}>
      {children}
      {ordem.chave === chave && (ordem.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );

  const COLS = "md:grid-cols-[110px_130px_1fr_150px_110px_170px]";

  return (
    <>
      <PageHeader
        title="Envios Mercado Livre"
        badge={<span className="num text-[12px] text-ink-3">
          leitura das {new Date(dados.geradoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
        </span>}
      />
      <PageBody>
        {/* Uma faixa de filtro acima de tudo que ela recorta */}
        <div className="mb-4 flex flex-wrap gap-2">
          {["", ...dados.contas].map((c) => (
            <button
              key={c || "todas"}
              type="button"
              onClick={() => setConta(c)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-[14px] font-semibold",
                conta === c ? "border-brand bg-brand-wash text-brand" : "border-line bg-panel text-ink-2"
              )}
            >
              {c ? curto(c) : "Todas"}
            </button>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {resumo.map((s) => (
            <Panel key={s.r} className="px-4 py-3">
              <div className="text-[12px] font-medium text-ink-3">{s.r}</div>
              <div className={cn("num text-[48px] font-bold leading-none tracking-[-0.04em]", s.v ? s.tom : "text-ink-3")}>{s.v}</div>
            </Panel>
          ))}
        </div>

        {dados.falhas.map((f) => (
          <div key={f.conta} className="mb-3 rounded-lg bg-down-wash px-4 py-2 text-[14px] text-down">
            {curto(f.conta)}: {f.motivo}
          </div>
        ))}

        <Panel className="overflow-hidden">
          <div className={cn("hidden gap-4 border-b border-line px-4 py-2.5 text-[12px] font-semibold text-ink-3 md:grid", COLS)}>
            <Cab chave="dias">Restam</Cab>
            <Cab chave="limite">Enviar até</Cab>
            <span>Produto</span>
            <Cab chave="pedido">Pedido</Cab>
            <Cab chave="conta">Conta</Cab>
            <Cab chave="situacao">Situação</Cab>
          </div>

          {lista.length === 0 && (
            <div className="px-4 py-10 text-center text-[15px] text-ink-3">Nenhum envio pendente</div>
          )}

          {lista.map((e) => (
            <div
              key={e.pedido}
              className={cn("grid items-start gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-b-0", COLS)}
            >
              <div className="flex items-center justify-between md:block">
                <Dias dias={e.dias} />
                <span className="text-[14px] font-semibold text-ink md:hidden">{limiteBr(e) ?? "—"}</span>
              </div>
              <div className="hidden text-[14px] font-semibold text-ink md:block">{limiteBr(e) ?? "—"}</div>
              <div className="min-w-0">
                {e.itens.map((i, k) => (
                  <div key={k} className="text-[14px] leading-snug text-ink">
                    <span className="num font-semibold">{i.quantidade}×</span> {i.titulo}
                    {i.sku && <span className="num text-ink-3"> · {i.sku}</span>}
                  </div>
                ))}
              </div>
              <div className="num text-[13px] text-ink-2">
                {e.pedido}
                <div className="text-ink-3">compra {compraBr(e.compra)}</div>
              </div>
              <div className="text-[14px] text-ink-2">{curto(e.conta)}</div>
              <div>
                <Badge tone={e.dias != null && e.dias < 0 ? "down" : "neutral"}>{e.situacao}</Badge>
              </div>
            </div>
          ))}
        </Panel>
      </PageBody>
    </>
  );
}
