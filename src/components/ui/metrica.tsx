import * as React from "react";
import { cn } from "@/lib/utils";
import { Delta } from "./primitives";
import type { Comparacao } from "@/lib/comparar";

/**
 * Um número que domina, o resto que apoia.
 *
 * O padrão anterior dava o mesmo peso visual a tudo, e um painel sem
 * hierarquia obriga a ler o conteúdo inteiro só para descobrir onde
 * olhar. Aqui existe um valor principal, grande, e as comparações vivem
 * abaixo dele em corpo menor — a leitura acontece antes da leitura.
 *
 * As bases vêm de `comparar()`, que devolve `variacao: null` quando a
 * base é zero. Esse caso vira "estreia", não "+100%": sair do nada não é
 * crescimento, e fingir que é polui todo relatório que some percentuais.
 */
export function Metrica({
  rotulo,
  valor,
  comparacao,
  /** true quando cair é bom — custo, tarifa, tempo de entrega. */
  inverso = false,
  detalhe,
  destaque,
  className,
}: {
  rotulo: string;
  valor: string;
  comparacao?: Comparacao;
  inverso?: boolean;
  detalhe?: string;
  /** Cor da barrinha lateral, para amarrar o painel a uma série. */
  destaque?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5 mb-1">
        {destaque && (
          <span
            className="w-2 h-2 rounded-[2px] shrink-0"
            style={{ background: destaque }}
          />
        )}
        <span className="label truncate">{rotulo}</span>
      </div>

      <p className="num text-[22px] leading-none font-semibold text-ink tabular-nums truncate">
        {valor}
      </p>

      {comparacao && comparacao.bases.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
          {comparacao.bases.map((b) => (
            <span key={b.rotulo} className="inline-flex items-center gap-1">
              {b.variacao === null ? (
                <span className="text-[11px] text-ink-3">estreia</span>
              ) : (
                <Delta value={b.variacao} inverse={inverso} />
              )}
              <span className="text-[11px] text-ink-3">{b.rotulo}</span>
            </span>
          ))}
        </div>
      )}

      {detalhe && (
        <p className="text-[11px] text-ink-3 mt-1 truncate">{detalhe}</p>
      )}
    </div>
  );
}

/* ── Cor semântica em tabela ─────────────────────────────────── */

export type Regra = {
  /** Devolve o tom, ou null para deixar neutro. */
  (v: number): "up" | "down" | "warn" | null;
};

/**
 * Pinta a célula quando o número merece ser notado.
 *
 * A tentação é colorir tudo — e aí nada se destaca, que é o mesmo que não
 * colorir nada. A regra prática: se mais de um quinto das linhas acende,
 * o limiar está frouxo.
 */
export function Celula({
  valor,
  texto,
  regra,
  className,
}: {
  valor: number;
  texto: string;
  regra?: Regra;
  className?: string;
}) {
  const tom = regra?.(valor) ?? null;

  return (
    <span
      className={cn(
        "num tabular-nums",
        tom === "up" && "text-up font-semibold",
        tom === "down" && "text-down font-semibold",
        tom === "warn" && "text-warn font-semibold",
        !tom && "text-ink-2",
        className
      )}
    >
      {texto}
    </span>
  );
}

/** Regras prontas, para o limiar ser o mesmo em todo o sistema. */
export const REGRAS = {
  /** Vermelho abaixo de zero. Margem, lucro, saldo. */
  negativo: ((v) => (v < 0 ? "down" : null)) as Regra,
  /** Variação: forte para cada lado, ruído fica neutro. */
  variacao: ((v) => (v <= -5 ? "down" : v >= 5 ? "up" : null)) as Regra,
  /** Variação invertida — custo que sobe é ruim. */
  variacaoInversa: ((v) => (v >= 5 ? "down" : v <= -5 ? "up" : null)) as Regra,
  /** Distância do alvo: amarelo perto, vermelho longe. */
  desvio: ((v) => {
    const a = Math.abs(v);
    return a >= 15 ? "down" : a >= 7 ? "warn" : null;
  }) as Regra,
  /** Atingimento de meta, em porcentagem. */
  meta: ((v) => (v >= 100 ? "up" : v < 80 ? "down" : "warn")) as Regra,
};
