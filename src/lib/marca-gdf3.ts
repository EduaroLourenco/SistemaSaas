"use client";

import * as React from "react";

/* Probel e Imprimil usam "GDF3 by Gerizo" no lugar da marca. O Wordmark
   descobre a empresa ativa e grava aqui; a tela de carregamento (que abre
   antes de a empresa ser conhecida) lê o último valor. */
const CHAVE = "gerizo:gdf3";
const EVENTO = "gerizo:gdf3-mudou";
export const NOME_GDF3 = "GDF3 by Gerizo";

export const ehGdf3 = (texto: string) => /probel|imprimil/i.test(texto);

export function gravarGdf3(v: boolean) {
  try {
    localStorage.setItem(CHAVE, v ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(EVENTO));
}

export function useGdf3() {
  const [v, setV] = React.useState(false);
  React.useEffect(() => {
    const ler = () => {
      try {
        setV(localStorage.getItem(CHAVE) === "1");
      } catch {}
    };
    ler();
    window.addEventListener(EVENTO, ler);
    return () => window.removeEventListener(EVENTO, ler);
  }, []);
  return v;
}

/* Troca "Gerizo" por "GDF3 by Gerizo" no título da aba e mantém assim
   quando o Next reescreve o título a cada navegação. */
export function useTituloGdf3(ativo: boolean) {
  React.useEffect(() => {
    if (!ativo) return;
    const t = document.querySelector("title");
    if (!t) return;
    const ajustar = () => {
      if (!/GDF3 by/.test(document.title)) document.title = document.title.replace(/Gerizo/g, NOME_GDF3);
    };
    ajustar();
    const obs = new MutationObserver(ajustar);
    obs.observe(t, { childList: true, characterData: true, subtree: true });
    return () => {
      obs.disconnect();
      document.title = document.title.replace(NOME_GDF3, "Gerizo");
    };
  }, [ativo]);
}
