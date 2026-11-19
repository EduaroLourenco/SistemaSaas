"use client";

import { DemoLink as Link } from "@/lib/demo/runtime";
import { ArrowRight } from "lucide-react";
import { PontosDeAtencao } from "@/app/mercado-livre/termometro-blocos";
import type { DadosTermometro } from "@/lib/dados/termometro";
import type { DadosEnvios } from "@/lib/dados/envios-meli";
import { somarDias } from "@/lib/planejamento/modelo";
import { diaSP } from "@/lib/planejamento/canal";
import { count } from "@/lib/format";
import { cn } from "@/lib/utils";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

function Cartao({ href, numero, rotulo, detalhe, tom }: { href: string; numero: string; rotulo: string; detalhe?: string; tom?: "down" | "warn" }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col gap-1 rounded-r2 border border-line bg-panel p-4 hover:border-line-2 hover:bg-panel-2">
      <span className="flex items-start justify-between gap-2">
        <span className={cn("num text-[36px] font-semibold leading-10 tracking-tight", tom === "down" ? "text-down" : tom === "warn" ? "text-warn" : "text-ink")}>{numero}</span>
        <ArrowRight aria-hidden className="mt-2 h-4 w-4 text-ink-3 group-hover:text-ink" />
      </span>
      <span className="text-[14px] font-medium text-ink-2">{rotulo}</span>
      {detalhe && <span className="num text-[12.5px] text-ink-3">{detalhe}</span>}
    </Link>
  );
}

/** O que precisa de ação hoje e o que vem nos próximos dias. */
export function BlocoOperacao({ termometro: t, envios }: { termometro: DadosTermometro | null; envios: DadosEnvios | null }) {
  const hoje = t?.hoje ?? envios?.hoje;
  if (!hoje) return null;

  const lista = envios?.envios ?? [];
  const atrasados = lista.filter((e) => e.dias != null && e.dias < 0).length;
  const paraHoje = lista.filter((e) => e.dias === 0).length;
  const amanha = lista.filter((e) => e.dias === 1).length;

  const canal = t?.noCanal ?? [];
  const relampagoHoje = canal.filter((p) => p.grupo === "relampago" && p.dia === hoje);
  const anunciosRelampago = relampagoHoje.reduce((s, p) => s + (p.anuncios ?? 0), 0);
  const noAr = canal.filter((p) => p.situacao === "no-ar" && ["consultor", "meli", "nossa"].includes(p.grupo));
  const limite = somarDias(hoje, 3);
  const acabando = noAr.filter((p) => p.diaFim <= limite).length;

  const proximos = Array.from({ length: 7 }, (_, i) => {
    const d = somarDias(hoje, i + 1);
    const relampago = canal.filter((p) => p.grupo === "relampago" && p.dia === d).reduce((s, p) => s + (p.anuncios ?? 0), 0);
    const eventos = [
      ...noAr.filter((p) => p.diaFim === d).map((p) => `termina ${p.nome}`),
      ...canal.filter((p) => p.grupo !== "relampago" && p.grupo !== "automatica" && p.grupo !== "cupom" && p.dia === d).map((p) => `começa ${p.nome}`),
      ...(t?.campanhas ?? []).filter((c) => c.inicio === d).map((c) => `começa ${c.titulo}`),
    ];
    return { d, relampago, eventos };
  });

  return (
    <>
      <section aria-label="Operação de hoje" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {envios && envios.contas.length > 0 && (
          envios.geradoEm && diaSP(Date.parse(envios.geradoEm)) === hoje ? (
            <Cartao
              href="/mercado-livre/envios"
              numero={count(atrasados + paraHoje)}
              rotulo="para despachar hoje"
              detalhe={[atrasados && `${atrasados} atrasados`, amanha && `${amanha} amanhã`].filter(Boolean).join(" · ") || undefined}
              tom={atrasados ? "down" : paraHoje ? "warn" : undefined}
            />
          ) : (
            /* Retrato de ontem chamaria de atrasado o que já pode ter saído. */
            <Cartao
              href="/mercado-livre/envios"
              numero="—"
              rotulo="envios sem leitura hoje"
              detalhe={`leitura ${br(diaSP(Date.parse(envios.geradoEm)))} ${hora(envios.geradoEm)}`}
            />
          )
        )}
        {t && t.contas.length > 0 && (
          <>
            <Cartao
              href="/planejamento"
              numero={count(anunciosRelampago)}
              rotulo="anúncios em relâmpago hoje"
              detalhe={relampagoHoje[0] ? `${hora(relampagoHoje[0].inicio)} às ${hora(relampagoHoje[0].fim)}` : "sem janela hoje"}
            />
            <Cartao
              href="/planejamento"
              numero={count(noAr.length)}
              rotulo="promoções no ar"
              detalhe={acabando ? `${acabando} terminam em até 3 dias` : undefined}
              tom={acabando ? "warn" : undefined}
            />
          </>
        )}
      </section>

      {t && t.contas.length > 0 && (
        <details className="min-w-0 rounded-r2 border border-line bg-panel px-4 py-3 shadow-[var(--sh-1)]">
          <summary className="cursor-pointer text-[14px] font-medium text-ink">Próximos 7 dias <span className="ml-2 text-[12px] font-normal text-ink-3">{proximos.filter(p => p.relampago || p.eventos.length).length ? `${proximos.filter(p => p.relampago || p.eventos.length).length} dias com ações` : "Sem ações agendadas"}</span></summary>
          <ul className="mt-3 divide-y divide-line">
            {proximos.map(({ d, relampago, eventos }) => (
              <li key={d} className="min-w-0">
                <Link href="/planejamento" className="grid min-h-12 grid-cols-[76px_minmax(0,1fr)] items-start gap-3 rounded-r1 py-3 hover:bg-panel-2">
                  <span className="text-[12px] text-ink-3">
                    {DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]} · <span className="num">{br(d)}</span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]">{relampago > 0 && <span className="text-[13px] font-medium text-ink">{count(relampago)} em relâmpago</span>}{eventos.map((e, i) => <span key={`${i}-${e}`} className="text-[12px] leading-4 text-ink-2">{e}</span>)}{!relampago && !eventos.length && <span className="text-[12px] text-ink-3">Sem ações</span>}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {t && <PontosDeAtencao atencao={t.atencao} />}
    </>
  );
}

