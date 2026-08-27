import { Panel } from "@/components/ui/primitives";
import { DatabaseZap } from "lucide-react";

/**
 * Tela sem fonte de dados.
 *
 * Substitui o dado de exemplo por uma explicação. Zerar os números
 * mantinha gráfico e tabela desenhados, o que ainda dá a impressão de que
 * a operação está parada — e não é isso: é que ninguém alimentou ainda.
 *
 * Dizer de onde o dado vai vir vale mais que uma tela vazia bonita: é o
 * que responde "o que eu faço para isso funcionar".
 */
export function SemFonte({
  titulo,
  origem,
}: {
  titulo: string;
  /** O que precisa acontecer para a tela ter conteúdo. */
  origem: string;
}) {
  return (
    <Panel className="px-6 py-12 flex flex-col items-center text-center gap-3">
      <span className="w-10 h-10 rounded-r2 bg-panel-3 flex items-center justify-center">
        <DatabaseZap className="w-5 h-5 text-ink-3" strokeWidth={1.8} />
      </span>
      <span className="max-w-[420px]">
        <p className="text-[14px] font-semibold text-ink">{titulo}</p>
        <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">{origem}</p>
      </span>
    </Panel>
  );
}
