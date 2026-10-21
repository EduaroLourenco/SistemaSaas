"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A capa do anúncio, onde ele for listado.
 *
 * ── Por que existe ──
 *
 * A Probel tem 256 SKUs de colchão com nome quase idêntico — "Colchão
 * Casal Mola Ensacada Probel Bari" e "Colchão Casal Mola Ensacada Probel
 * Excede Premium" diferem na décima palavra. Numa lista de MLB, SKU e
 * título, achar a linha certa é leitura de caractere. A capa resolve
 * antes do texto, e é assim que o próprio canal lista.
 *
 * ── Por que a foto não vem com a linha ──
 *
 * Dezoito telas listam anúncio, cada uma com a própria carga e o próprio
 * tipo. A foto não entra em conta nenhuma, então ela viaja à parte: um
 * mapa MLB → URL buscado uma vez por aba, e cada tela só acrescenta esta
 * etiqueta. `src` continua aceito para quem já tem a URL em mãos.
 *
 * ── Por que <img> e não next/image ──
 *
 * next/image exige declarar o domínio remoto no build e passa a imagem
 * pelo otimizador do servidor. Estas já chegam em 180px do CDN do canal:
 * otimizar uma miniatura custa uma viagem a mais para economizar nada.
 *
 * ── O que faz quando não há foto ──
 *
 * Desenha o quadrado vazio, do mesmo tamanho. Sem ele a linha desalinha
 * quando um anúncio no meio da lista não tem capa, e a tabela serrilha.
 */

/* ── O mapa, buscado uma vez por aba ──
   Módulo e não contexto: nenhuma tela precisa passar provider, e as
   dezoito compartilham a mesma promessa. */
let promessa: Promise<Record<string, string>> | null = null;
let mapa: Record<string, string> = {};
const ouvintes = new Set<() => void>();

function carregar() {
  promessa ??= fetch("/api/anuncios/fotos")
    .then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { fotos?: Record<string, string> };
      return j.fotos ?? {};
    })
    .then((f) => {
      mapa = f;
      for (const o of ouvintes) o();
      return f;
    })
    .catch(() => {
      /*
       * Resposta ruim NÃO fica memorizada.
       *
       * A promessa é guardada no módulo para as dezoito telas dividirem
       * uma busca só. Guardar também o fracasso — um 401 durante a
       * renovação da sessão, uma queda de rede na primeira tela aberta —
       * deixava a aba inteira sem foto até recarregar, e sem nada na tela
       * dizendo por quê: o quadrado vazio é o mesmo de "este anúncio não
       * tem capa".
       *
       * Mapa vazio com resposta 200 é resposta de verdade (empresa sem
       * foto sincronizada) e continua valendo, senão cada linha da tabela
       * pediria de novo.
       */
      promessa = null;
      return {};
    });
  return promessa;
}

function usarFoto(mlb: string | null | undefined): string | null {
  const chave = mlb?.trim().toUpperCase();
  const [, redesenhar] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!chave) return;
    ouvintes.add(redesenhar);
    void carregar();
    return () => void ouvintes.delete(redesenhar);
  }, [chave, redesenhar]);
  return chave ? (mapa[chave] ?? null) : null;
}

export function FotoAnuncio({
  src,
  mlb,
  alt,
  tamanho = 34,
  className,
}: {
  /** URL pronta. Quando existe, dispensa o mapa. */
  src?: string | null;
  /** Código do anúncio; a URL sai do mapa compartilhado. */
  mlb?: string | null;
  alt?: string;
  tamanho?: number;
  className?: string;
}) {
  const doMapa = usarFoto(src ? null : mlb);
  /* O CDN responde 404 em anúncio encerrado há muito tempo; sem isto o
     navegador desenha o ícone de imagem quebrada dentro da tabela. */
  const [quebrou, setQuebrou] = React.useState(false);
  const url = (src?.trim() || doMapa) ?? null;
  const estilo = { width: tamanho, height: tamanho } as const;

  if (!url || quebrou) {
    return (
      <span
        aria-hidden
        style={estilo}
        className={cn(
          "shrink-0 rounded-r1 border border-line bg-panel-2",
          className,
        )}
      />
    );
  }

  return (
    <img
      src={url}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      width={tamanho}
      height={tamanho}
      style={estilo}
      onError={() => setQuebrou(true)}
      className={cn(
        "shrink-0 rounded-r1 border border-line bg-panel object-contain",
        className,
      )}
    />
  );
}
