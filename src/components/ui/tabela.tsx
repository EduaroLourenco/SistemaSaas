"use client";

import * as React from "react";
import { Pagination, usePagination } from "./pagination";
import { cn } from "@/lib/utils";
import { Button } from "./primitives";
import { baixarCsv, type Coluna as ColunaCsv } from "@/lib/exportar";
import { Download, ChevronRight, ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

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
  const [ordem, setOrdem] = React.useState<{id:string;asc:boolean}|null>(null);
  const [modoTabela, setModoTabela] = React.useState(false);
  const ordenadas = React.useMemo(() => {
    const coluna = colunas.find(c => c.id === ordem?.id);
    if (!ordem || !coluna?.bruto) return linhas;
    return [...linhas].sort((a,b) => {
      const x=coluna.bruto!(a),y=coluna.bruto!(b);
      if(x==null)return y==null?0:1;
      if(y==null)return -1;
      return (typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"pt-BR",{numeric:true}))*(ordem.asc?1:-1);
    });
  },[linhas,colunas,ordem]);
  const ordenar=(id:string)=>setOrdem(atual=>({id,asc:atual?.id===id?!atual.asc:true}));
  const { visible, pagination } = usePagination(ordenadas);
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
      <div className="gerizo-mobile-table-tools sm:hidden">
        <div role="group" aria-label="Visualização dos resultados">
          <button type="button" aria-pressed={!modoTabela} onClick={()=>setModoTabela(false)}>Resumo</button>
          <button type="button" aria-pressed={modoTabela} onClick={()=>setModoTabela(true)}>Tabela</button>
        </div>
        {colunas.some(c=>c.bruto) && <label>Ordenar por<select aria-label="Ordenar resultados por" value={ordem?.id??""} onChange={e=>setOrdem(e.target.value?{id:e.target.value,asc:true}:null)}><option value="">Ordem original</option>{colunas.filter(c=>c.bruto).map(c=><option key={c.id} value={c.id}>{c.cabecalho}</option>)}</select></label>}
        {ordem && <button type="button" onClick={()=>ordenar(ordem.id)} aria-label="Inverter ordenação">{ordem.asc?"Crescente ↑":"Decrescente ↓"}</button>}
      </div>
      {nomeExportacao && exportaveis.length > 0 && (
        <div className="flex justify-end mb-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => baixarCsv(nomeExportacao, ordenadas, exportaveis)}
            title={`Exporta as ${linhas.length} resultados dos filtros atuais`}
          >
            <Download className="w-3 h-3" strokeWidth={2.25} />
            Exportar {linhas.length}
          </Button>
        </div>
      )}

      {/* ── tela larga: tabela ── */}
      <div className={cn("gerizo-table-scroll", modoTabela ? "block" : "hidden sm:block")} tabIndex={0} role="region" aria-label="Tabela de resultados">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              {colunas.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={ordem?.id === c.id ? ordem.asc ? "ascending" : "descending" : undefined}
                  className={cn(
                    "label py-2 px-2 first:pl-0 last:pr-0 whitespace-nowrap",
                    c.alinhar === "dir" ? "text-right" : "text-left",
                    c.larguraClasse
                  )}
                >
                  {c.bruto ? <button type="button" onClick={()=>ordenar(c.id)} className="inline-flex min-h-11 items-center gap-2 text-left text-[14px] font-medium">{c.cabecalho}{ordem?.id===c.id ? ordem.asc ? <ArrowUp size={14}/> : <ArrowDown size={14}/> : <ChevronsUpDown size={14}/>}</button> : c.cabecalho}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => (
              <tr
                key={chave(l)}
                onClick={onLinhaClick ? (event) => {
                  if ((event.target as HTMLElement).closest("a,button,input,select,textarea")) return;
                  onLinhaClick(l);
                } : undefined}
                tabIndex={onLinhaClick ? 0 : undefined}
                onKeyDown={onLinhaClick ? (event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onLinhaClick(l); } } : undefined}
                className={cn(
                  "border-b border-line last:border-0",
                  onLinhaClick && "cursor-pointer hover:bg-panel-2"
                )}
              >
                {colunas.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "py-3 px-3 text-[14px] text-ink-2",
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
      <div className={cn("gerizo-mobile-records sm:hidden flex flex-col", modoTabela && "hidden")}>
        {visible.map((l) => (
          <Cartao
            key={chave(l)}
            linha={l}
            colunas={colunas}
            onClick={onLinhaClick}
          />
        ))}
      </div>
      <Pagination {...pagination} />
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
    <div className="gerizo-mobile-record min-w-0">
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
