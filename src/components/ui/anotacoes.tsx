"use client";

import * as React from "react";
import { Button } from "./primitives";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Anotações em qualquer coisa.
 *
 * A versão anterior só existia na análise de anúncio. O problema não era
 * a falta de telas: era que o motivo de um número quase nunca está no
 * número. "Caiu porque o fornecedor atrasou" é conhecimento que mora na
 * cabeça de alguém e some quando essa pessoa sai de férias.
 *
 * Fica em `localStorage` por enquanto, com uma limitação que precisa ser
 * dita em voz alta: **some ao trocar de navegador e ninguém mais do time
 * vê.** O destino é a tabela `anotacoes`, e o formato aqui já é o dela —
 * `entidade` + `entidadeId` — para a migração ser troca de fonte, não
 * reescrita.
 */

export type Anotacao = {
  id: string;
  entidade: string;
  entidadeId: string;
  data: string;
  texto: string;
  criadoEm: string;
};

const CHAVE = "anotacoes";

function ler(): Anotacao[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as Anotacao[];
  } catch {
    return [];
  }
}

function gravar(lista: Anotacao[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // Anônimo ou cheio. Perder a anotação é ruim, quebrar a tela é pior.
  }
}

export function useAnotacoes(entidade: string, entidadeId: string) {
  const [todas, setTodas] = React.useState<Anotacao[]>([]);

  React.useEffect(() => setTodas(ler()), []);

  const minhas = React.useMemo(
    () =>
      todas
        .filter((a) => a.entidade === entidade && a.entidadeId === entidadeId)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [todas, entidade, entidadeId]
  );

  const adicionar = React.useCallback(
    (texto: string, data: string) => {
      const limpo = texto.trim();
      if (!limpo) return;
      const nova: Anotacao = {
        // Sem Date.now() sozinho: duas anotações no mesmo milissegundo
        // dariam a mesma chave e o React reclamaria de duplicata.
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        entidade,
        entidadeId,
        data,
        texto: limpo,
        criadoEm: new Date().toISOString(),
      };
      const lista = [...ler(), nova];
      gravar(lista);
      setTodas(lista);
    },
    [entidade, entidadeId]
  );

  const remover = React.useCallback((id: string) => {
    const lista = ler().filter((a) => a.id !== id);
    gravar(lista);
    setTodas(lista);
  }, []);

  return { anotacoes: minhas, adicionar, remover };
}

export function Anotacoes({
  entidade,
  entidadeId,
  titulo = "Anotações",
  className,
}: {
  entidade: string;
  entidadeId: string;
  titulo?: string;
  className?: string;
}) {
  const { anotacoes, adicionar, remover } = useAnotacoes(entidade, entidadeId);
  const [texto, setTexto] = React.useState("");
  const [data, setData] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">{titulo}</span>
        {anotacoes.length > 0 && (
          <span className="num text-[11px] text-ink-3">{anotacoes.length}</span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          adicionar(texto, data);
          setTexto("");
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-start"
      >
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          aria-label="Data da anotação"
          className="num h-9 px-2 rounded-r1 bg-panel border border-line text-[12.5px] text-ink outline-none focus:border-brand shrink-0"
        />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="O que aconteceu?"
          className="h-9 px-2.5 flex-1 min-w-0 rounded-r1 bg-panel border border-line text-[13px] text-ink outline-none focus:border-brand"
        />
        <Button
          type="submit"
          variant="default"
          disabled={!texto.trim()}
          className="h-9 shrink-0 max-sm:w-full"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" strokeWidth={2} />
          Anotar
        </Button>
      </form>

      {anotacoes.length === 0 ? (
        <p className="text-[12px] text-ink-3 leading-relaxed">
          Nada anotado ainda. O motivo de um número quase nunca está no
          número — quem registra hoje economiza a investigação de amanhã.
        </p>
      ) : (
        <ul className="flex flex-col">
          {anotacoes.map((a) => (
            <li
              key={a.id}
              className="group flex items-start gap-2.5 py-2 border-b border-line last:border-0"
            >
              <span className="num text-[11px] text-ink-3 mt-[2px] shrink-0 w-[68px]">
                {new Date(a.data + "T12:00:00").toLocaleDateString("pt-BR")}
              </span>
              <span className="text-[12.5px] text-ink-2 leading-relaxed flex-1 min-w-0">
                {a.texto}
              </span>
              <button
                onClick={() => remover(a.id)}
                aria-label="Remover anotação"
                className="shrink-0 text-ink-3 hover:text-down opacity-0 group-hover:opacity-100 focus:opacity-100 mt-[2px]"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-ink-3">
        Guardado só neste navegador. Ao migrar para o banco, passa a ser
        visível para o time.
      </p>
    </div>
  );
}
