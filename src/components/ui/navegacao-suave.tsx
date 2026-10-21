"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Trocar um filtro sem a tela inteira piscar.
 *
 * ── O problema ──
 *
 * Os filtros destas telas moram na URL — conta, semana, período — e
 * trocar um deles chama `router.push`. Como as páginas são
 * `force-dynamic` e a carga é pesada, o App Router segura a navegação
 * e a tela congela inteira: cabeçalho, filtros, todos os painéis.
 * Quem clicou não sabe se o clique pegou, e clica de novo.
 *
 * ── O que muda ──
 *
 * A navegação entra numa transição do React. O conteúdo ANTIGO fica
 * na tela, interativo, enquanto o novo é preparado — e `carregando`
 * diz quando mostrar que algo está vindo. O aviso fica no bloco que
 * muda, não na página toda.
 *
 * É o mesmo número de requisições; o que muda é a tela não sumir
 * enquanto elas acontecem.
 */
export function useNavegacaoSuave() {
  const router = useRouter();
  const [carregando, iniciar] = React.useTransition();

  const navegar = React.useCallback(
    (url: string) => {
      iniciar(() => {
        /* `scroll: false` porque trocar de filtro não é trocar de
           página: jogar para o topo perde o lugar de quem estava
           lendo a tabela. */
        router.push(url, { scroll: false });
      });
    },
    [router],
  );

  return { navegar, carregando };
}

/**
 * O bloco que está sendo trocado.
 *
 * Esmaece e trava o clique, sem tirar da tela — o número velho
 * continua legível enquanto o novo vem, que é melhor do que um
 * esqueleto cinza no lugar de onde havia informação.
 */
export function Carregando({
  children,
  ativo,
  className,
}: {
  children: React.ReactNode;
  ativo: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative transition-opacity duration-150", ativo && "opacity-50", className)}
      /* Enquanto atualiza, o conteúdo antigo não aceita clique: clicar
         num filtro que já está sendo substituído enfileira navegação
         que ninguém pediu. */
      aria-busy={ativo}
      style={ativo ? { pointerEvents: "none" } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * A faixa fina de progresso no topo do bloco.
 *
 * Um traço que anda, não um spinner centralizado: o spinner no meio
 * do painel tapa justamente o número que a pessoa está esperando.
 */
export function BarraCarregando({ ativo }: { ativo: boolean }) {
  if (!ativo) return null;
  return (
    <div className="h-0.5 w-full overflow-hidden bg-transparent" role="status" aria-label="Atualizando">
      <div className="h-full w-1/3 animate-[desliza_1s_ease-in-out_infinite] rounded-full bg-brand" />
    </div>
  );
}
