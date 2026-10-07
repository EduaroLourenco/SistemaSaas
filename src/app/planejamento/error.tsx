"use client";
export default function Erro({ reset }: { reset: () => void }) {
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-xl font-semibold">
        Não foi possível abrir o planejamento
      </h1>
      <p className="text-ink-2">
        Confira sua conexão e tente novamente. Nenhuma alteração foi feita nas
        campanhas.
      </p>
      <button
        className="px-4 py-2 rounded bg-brand text-brand-ink"
        onClick={reset}
      >
        Tentar novamente
      </button>
    </div>
  );
}
