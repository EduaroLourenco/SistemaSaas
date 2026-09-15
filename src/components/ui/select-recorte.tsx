"use client";

import { Select } from "@/components/ui/controls";
import type { GrupoRecorte } from "@/lib/recorte";

/**
 * Seletor de canal e conta.
 *
 * `<select>` nativo com `<optgroup>`: o grupo do Mercado Livre aparece com
 * o título do canal e, dentro dele, "todas as contas" e cada conta. No
 * celular vira a roda nativa do sistema, que é o que o polegar espera.
 */
export function SelectRecorte({
  grupos,
  valor,
  onChange,
  className,
}: {
  grupos: GrupoRecorte[];
  valor: string;
  onChange: (valor: string) => void;
  className?: string;
}) {
  return (
    <Select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      aria-label="Canal ou conta"
    >
      {grupos.map((g, i) =>
        g.rotulo ? (
          <optgroup key={g.rotulo} label={g.rotulo}>
            {g.opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </optgroup>
        ) : (
          g.opcoes.map((o) => (
            <option key={o.valor || `todos-${i}`} value={o.valor}>
              {o.rotulo}
            </option>
          ))
        )
      )}
    </Select>
  );
}
