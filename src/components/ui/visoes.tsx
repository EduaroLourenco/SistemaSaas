"use client";

import * as React from "react";
import { Button } from "./primitives";
import { Bookmark, Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Visões salvas: um clique para uma combinação de filtros que se repete.
 *
 * Telas com muitos controles têm um custo escondido — a pessoa refaz o
 * mesmo recorte toda segunda-feira. Depois de umas dez vezes ela para de
 * refazer e passa a olhar o recorte errado, porque é o que já estava na
 * tela.
 *
 * Guarda em `localStorage`, por enquanto: é preferência de quem usa, não
 * dado da operação. Quando as visões precisarem ser compartilhadas com o
 * time, mudam para `preferencias_usuario`, que já existe no banco.
 */

export type Visao<F> = { nome: string; filtros: F };

export function useVisoes<F>(chaveTela: string) {
  const chave = `visoes:${chaveTela}`;
  const [visoes, setVisoes] = React.useState<Visao<F>[]>([]);

  // Só depois da montagem: ler localStorage no primeiro render faz o HTML
  // do servidor divergir do cliente, e o React descarta a árvore inteira.
  React.useEffect(() => {
    try {
      const cru = localStorage.getItem(chave);
      if (cru) setVisoes(JSON.parse(cru));
    } catch {
      // Modo anônimo ou armazenamento cheio. Segue sem visões salvas.
    }
  }, [chave]);

  const gravar = React.useCallback(
    (novas: Visao<F>[]) => {
      setVisoes(novas);
      try {
        localStorage.setItem(chave, JSON.stringify(novas));
      } catch {
        /* idem */
      }
    },
    [chave]
  );

  const salvar = React.useCallback(
    (nome: string, filtros: F) => {
      const limpo = nome.trim();
      if (!limpo) return;
      // Mesmo nome sobrescreve: quem salva "Meli 90 dias" duas vezes quis
      // atualizar, não criar um par de gêmeos indistinguíveis.
      gravar([
        ...visoes.filter((v) => v.nome !== limpo),
        { nome: limpo, filtros },
      ]);
    },
    [visoes, gravar]
  );

  const remover = React.useCallback(
    (nome: string) => gravar(visoes.filter((v) => v.nome !== nome)),
    [visoes, gravar]
  );

  return { visoes, salvar, remover };
}

export function BarraVisoes<F>({
  visoes,
  filtrosAtuais,
  onAplicar,
  onSalvar,
  onRemover,
  saoIguais,
}: {
  visoes: Visao<F>[];
  filtrosAtuais: F;
  onAplicar: (f: F) => void;
  onSalvar: (nome: string) => void;
  onRemover: (nome: string) => void;
  /** Comparação rasa não serve para objeto aninhado; a tela decide. */
  saoIguais: (a: F, b: F) => boolean;
}) {
  const [nomeando, setNomeando] = React.useState(false);
  const [nome, setNome] = React.useState("");

  const ativa = visoes.find((v) => saoIguais(v.filtros, filtrosAtuais));

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Bookmark className="w-3.5 h-3.5 text-ink-3 shrink-0" strokeWidth={2} />

      {visoes.map((v) => {
        const atual = ativa?.nome === v.nome;
        return (
          <span
            key={v.nome}
            className={cn(
              "group inline-flex items-center rounded-r1 border text-[12px] h-7",
              atual
                ? "bg-brand-wash border-brand/30 text-brand"
                : "bg-panel border-line-2 text-ink-2 hover:bg-panel-3"
            )}
          >
            <button
              onClick={() => onAplicar(v.filtros)}
              className="pl-2.5 pr-1 h-full font-medium"
            >
              {atual && (
                <Check className="w-3 h-3 inline mr-1 -mt-px" strokeWidth={2.5} />
              )}
              {v.nome}
            </button>
            <button
              onClick={() => onRemover(v.nome)}
              aria-label={`Remover visão ${v.nome}`}
              className="px-1.5 h-full text-ink-3 hover:text-down opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <X className="w-3 h-3" strokeWidth={2.5} />
            </button>
          </span>
        );
      })}

      {nomeando ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSalvar(nome);
            setNome("");
            setNomeando(false);
          }}
          className="inline-flex items-center gap-1"
        >
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => !nome && setNomeando(false)}
            placeholder="Nome da visão"
            className="h-7 px-2 w-[130px] rounded-r1 bg-panel border border-line-2 text-[12px] text-ink outline-none focus:border-brand"
          />
          <Button size="sm" variant="primary" type="submit">
            Salvar
          </Button>
        </form>
      ) : (
        !ativa && (
          <Button size="sm" variant="ghost" onClick={() => setNomeando(true)}>
            <Plus className="w-3 h-3" strokeWidth={2.5} />
            Salvar visão
          </Button>
        )
      )}
    </div>
  );
}
