"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./primitives";
import { baixarCsv, type Coluna as ColunaCsv } from "@/lib/exportar";
import { Download, ChevronRight } from "lucide-react";

/**
 * Tabela que vira cartão no celular.
 *
 * Rolagem horizontal funciona e é a saída fácil, mas no telefone ela
 * esconde justamente as colunas da direita — que costumam ser as
 * calculadas, as que motivaram a tabela existir. Em tela estreita cada
 * linha vira um cartão: as colunas marcadas como `chave` ficam à vista, o
 * resto abre ao toque.
 *
 * A exportação sai daqui, e não de um botão solto na página, para uma
 * garantia estrutural: ela recebe as MESMAS linhas já filtradas e
 * ordenadas que estão sendo desenhadas. Não há caminho pelo qual o CSV
 * discorde da tela.
 */

export type Coluna<T> = {
  id: string;
  cabecalho: string;
  /** O que desenhar. */
  celula: (linha: T) => React.ReactNode;
  /** Valor cru para o CSV. Sem isto, a coluna não é exportada. */
  bruto?: (linha: T) => string | number | null | undefined;
  /** Aparece no cartão do celular sem precisar expandir. */
  chave?: boolean;
  alinhar?: "esq" | "dir";
  larguraClasse?: string;
};

export function Tabela<T>({
  linhas,
  colunas,
  chave,
  nomeExportacao,
  vazio,
  onLinhaClick,
  className,
}: {
  linhas: T[];
  colunas: Coluna<T>[];
  chave: (linha: T) => string;
  /** Sem isto, não há botão de exportar. */
  nomeExportacao?: string;
  vazio?: React.ReactNode;
  onLinhaClick?: (linha: T) => void;
  className?: string;
}) {
  const exportaveis = React.useMemo(
    () =>
      colunas
        .filter((c) => c.bruto)
        .map<ColunaCsv<T>>((c) => ({
          cabecalho: c.cabecalho,
          valor: c.bruto!,
        })),
    [colunas]
  );

  if (!linhas.length && vazio) return <>{vazio}</>;

  return (
    <div className={className}>
      {nomeExportacao && exportaveis.length > 0 && (
        <div className="flex justify-end mb-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => baixarCsv(nomeExportacao, linhas, exportaveis)}
            title={`Exporta as ${linhas.length} linhas visíveis, com os filtros atuais`}
          >
            <Download className="w-3 h-3" strokeWidth={2.25} />
            Exportar {linhas.length}
          </Button>
        </div>
      )}

      {/* ── tela larga: tabela ── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              {colunas.map((c) => (
                <th
                  key={c.id}
                  className={cn(
                    "label py-2 px-2 first:pl-0 last:pr-0 whitespace-nowrap",
                    c.alinhar === "dir" ? "text-right" : "text-left",
                    c.larguraClasse
                  )}
                >
                  {c.cabecalho}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr
                key={chave(l)}
                onClick={onLinhaClick ? () => onLinhaClick(l) : undefined}
                className={cn(
                  "border-b border-line last:border-0",
                  onLinhaClick && "cursor-pointer hover:bg-panel-2"
                )}
              >
                {colunas.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "py-2 px-2 first:pl-0 last:pr-0 text-[13px] text-ink-2",
                      c.alinhar === "dir" && "text-right"
                    )}
                  >
                    {c.celula(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── celular: um cartão por linha ── */}
      <div className="sm:hidden flex flex-col gap-2">
        {linhas.map((l) => (
          <Cartao
            key={chave(l)}
            linha={l}
            colunas={colunas}
            onClick={onLinhaClick}
          />
        ))}
      </div>
    </div>
  );
}

function Cartao<T>({
  linha,
  colunas,
  onClick,
}: {
  linha: T;
  colunas: Coluna<T>[];
  onClick?: (linha: T) => void;
}) {
  const [aberto, setAberto] = React.useState(false);
  const principais = colunas.filter((c) => c.chave);
  // Sem nenhuma marcada, as duas primeiras servem — melhor que um cartão
  // vazio que obriga a expandir tudo para ler qualquer coisa.
  const visiveis = principais.length ? principais : colunas.slice(0, 2);
  const ocultas = colunas.filter((c) => !visiveis.includes(c));

  return (
    <div className="panel px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          {visiveis.map((c) => (
            <div key={c.id} className="min-w-0">
              <span className="label block mb-0.5">{c.cabecalho}</span>
              <div className="text-[13px] text-ink min-w-0">
                {c.celula(linha)}
              </div>
            </div>
          ))}
        </div>

        {onClick && (
          <button
            onClick={() => onClick(linha)}
            aria-label="Abrir"
            className="shrink-0 w-8 h-8 -mr-1 flex items-center justify-center text-ink-3"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {ocultas.length > 0 && (
        <>
          {aberto && (
            <div className="mt-2.5 pt-2.5 border-t border-line grid grid-cols-2 gap-x-3 gap-y-2">
              {ocultas.map((c) => (
                <div key={c.id} className="min-w-0">
                  <span className="label block mb-0.5">{c.cabecalho}</span>
                  <div className="text-[12.5px] text-ink-2 min-w-0">
                    {c.celula(linha)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setAberto((v) => !v)}
            className="mt-2 text-[12px] text-ink-3 hover:text-ink-2 h-8 -mb-1"
          >
            {aberto ? "Menos" : `Mais ${ocultas.length} campos`}
          </button>
        </>
      )}
    </div>
  );
}
