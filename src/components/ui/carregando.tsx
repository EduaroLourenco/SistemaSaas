import { Panel } from "@/components/ui/primitives";

/**
 * Esqueleto de tela enquanto o servidor busca os dados.
 *
 * Existe por necessidade técnica, não estética: sem um limite de Suspense
 * na rota, o React aborta a navegação com o erro #441 — "componente
 * suspendeu respondendo a uma entrada síncrona". Foi o que aparecia no
 * console ao entrar em Preço ideal, que é a tela mais pesada.
 *
 * Desenha a moldura da tela, não um giro no meio da tela: a pessoa vê
 * onde as coisas vão aparecer, e a troca não pisca quando chegam.
 */
export function Carregando({ blocos = 3 }: { blocos?: number }) {
  return (
    <div className="px-4 md:px-6 py-4 flex flex-col gap-3" aria-busy="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Panel key={i} className="h-[92px] animate-pulse bg-panel-2" />
        ))}
      </div>
      {Array.from({ length: blocos }, (_, i) => (
        <Panel key={i} className="h-[220px] animate-pulse bg-panel-2" />
      ))}
      <span className="sr-only">Carregando dados</span>
    </div>
  );
}
