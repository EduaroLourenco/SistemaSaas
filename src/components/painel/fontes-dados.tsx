"use client";

import * as React from "react";
import Link from "next/link";
import { Panel, Badge } from "@/components/ui/primitives";
import { count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DadosFontes, Fonte } from "@/lib/dados/fontes";
import { Database, Upload, PencilLine, ArrowRight } from "lucide-react";

/**
 * Até quando cada fonte vai.
 *
 * Responde o que vem antes de qualquer número: posso confiar no que estou
 * vendo? Um painel que desenha a semana toda quando a planilha só cobre
 * até terça não está errado — está incompleto, e na tela as duas coisas
 * se parecem demais.
 *
 * A coluna que decide é a COBERTURA, não a data de importação. Subir hoje
 * uma planilha que termina na semana passada deixa a importação recente e
 * o dado velho; mostrar só a importação daria uma sensação de atualidade
 * que o número não tem.
 */

/** Acima disto o dado atrasou o bastante para mudar uma decisão. */
const ATRASO_ATENCAO = 2;
const ATRASO_GRAVE = 5;

export function FontesDados({ dados }: { dados: DadosFontes }) {
  const alerta =
    dados.piorAtraso !== null && dados.piorAtraso >= ATRASO_ATENCAO;

  return (
    <Panel className={cn("p-4", alerta && "border-warn/30")}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <span className="flex items-center gap-2 min-w-0">
          <Database className="w-4 h-4 text-ink-3 shrink-0" strokeWidth={2} />
          <p className="text-[13px] font-semibold text-ink">Fontes de dados</p>
          {dados.piorAtraso !== null && (
            <Badge tone={tomDoAtraso(dados.piorAtraso)}>
              {frase(dados.piorAtraso)}
            </Badge>
          )}
        </span>
        <Link
          href="/importar"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline underline-offset-2 shrink-0"
        >
          Importar
          <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
        </Link>
      </div>

      {/* tela larga: tabela */}
      <div className="hidden sm:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className="label text-left py-1.5 pr-2">Fonte</th>
              <th className="label text-left py-1.5 px-2">Abastece</th>
              <th className="label text-right py-1.5 pl-2 whitespace-nowrap">
                Atualizado até
              </th>
            </tr>
          </thead>
          <tbody>
            {dados.fontes.map((f) => (
              <tr key={f.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-2 align-top">
                  <span className="flex items-center gap-1.5">
                    {f.origem === "manual" ? (
                      <PencilLine
                        className="w-3 h-3 text-ink-3 shrink-0"
                        strokeWidth={2}
                      />
                    ) : (
                      <Upload
                        className="w-3 h-3 text-ink-3 shrink-0"
                        strokeWidth={2}
                      />
                    )}
                    <span className="text-[13px] text-ink font-medium">
                      {f.nome}
                    </span>
                  </span>
                  {f.registros > 0 && (
                    <span className="num text-[11px] text-ink-3 ml-4.5">
                      {count(f.registros)} registros
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 text-[12px] text-ink-2 align-top leading-snug">
                  {f.alimenta}
                </td>
                <td className="py-2 pl-2 text-right align-top whitespace-nowrap">
                  <Cobertura fonte={f} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* celular: um bloco por fonte */}
      <div className="sm:hidden flex flex-col gap-2.5">
        {dados.fontes.map((f) => (
          <div key={f.id} className="border-b border-line last:border-0 pb-2.5 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] text-ink font-medium min-w-0">
                {f.nome}
              </span>
              <Cobertura fonte={f} />
            </div>
            <p className="text-[12px] text-ink-2 leading-snug mt-0.5">
              {f.alimenta}
            </p>
          </div>
        ))}
      </div>

      <p className="text-[11.5px] text-ink-3 leading-relaxed mt-3">
        A data é até onde o <span className="font-medium text-ink-2">dado</span>{" "}
        vai, não quando foi importado. Subir hoje uma planilha que termina na
        semana passada não deixa o painel atualizado.
      </p>
    </Panel>
  );
}

function Cobertura({ fonte }: { fonte: Fonte }) {
  if (!fonte.cobertura) {
    return (
      <span className="text-[12px] text-ink-3">
        {fonte.origem === "manual" ? "nada lançado" : "não importado"}
      </span>
    );
  }

  const t = tomDoAtraso(fonte.atrasoDias ?? 0);

  return (
    <span className="inline-flex flex-col items-end">
      <span
        className={cn(
          "num text-[13px] font-semibold",
          t === "down" && "text-down",
          t === "warn" && "text-warn",
          t === "up" && "text-ink"
        )}
      >
        {dataBr(fonte.cobertura)}
      </span>
      <span className="text-[11px] text-ink-3">
        {frase(fonte.atrasoDias ?? 0)}
      </span>
    </span>
  );
}

function tomDoAtraso(dias: number): "up" | "warn" | "down" {
  if (dias >= ATRASO_GRAVE) return "down";
  if (dias >= ATRASO_ATENCAO) return "warn";
  return "up";
}

function frase(dias: number): string {
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

function dataBr(iso: string) {
  return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}
