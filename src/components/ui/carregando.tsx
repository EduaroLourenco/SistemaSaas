"use client";

import { cn } from "@/lib/utils";
import { NOME_GDF3, useGdf3 } from "@/lib/marca-gdf3";

/**
 * Espera dentro da área que está carregando: a marca, clara, ao fundo.
 *
 * Menu e topo continuam visíveis e usáveis. O limite de Suspense também é
 * necessário: sem ele o React aborta a navegação com o erro #441.
 *
 * `compacto` serve a um bloco da página, e não prende a abertura do sistema.
 */
export function Carregando({ compacto = false, sobre = false }: { compacto?: boolean; sobre?: boolean }) {
  const gdf3 = useGdf3();
  return (
    <div
      className={cn("gerizo-espera", compacto && "compacta", sobre && "sobre")}
      role="status"
      aria-busy={compacto ? undefined : "true"}
    >
      <span aria-hidden="true">{gdf3 ? NOME_GDF3 : "gerizo."}</span>
      <span className="sr-only">Carregando dados</span>
    </div>
  );
}
