"use client";

import * as React from "react";
import NextLink from "next/link";
import { usePathname as useNextPathname, useRouter as useNextRouter, useSearchParams as useNextSearchParams } from "next/navigation";
import { DEMO_PREFIX, ROTAS_DEMO, caminhoDemo, caminhoLogico } from "./rotas";
export { DEMO_PREFIX, ROTAS_DEMO, caminhoDemo, caminhoLogico } from "./rotas";

const EVENTO_URL = "gerizo:demo-url";
export const EVENTO_REFRESH = "gerizo:demo-refresh";
export const EVENTO_INVESTIGAR_QUEDA = "gerizo:demo:investigar-queda";
export type FocoQuedaDemo = { sku: string; aba: "resumo" | "evolucao" | "estoques" };

export function emDemo() { return typeof window !== "undefined" && caminhoDemo(window.location.pathname); }
export function avisarDemo(mensagem: string) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("gerizo:demo-aviso", { detail: mensagem })); }
export function gerizoReload() { if (emDemo()) window.dispatchEvent(new Event(EVENTO_REFRESH)); else if (typeof window !== "undefined") window.location.reload(); }

export async function gerizoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (emDemo()) {
    // Não existe fallback de rede neste ramo, mesmo para usuários com sessão.
    const { gerizoDemoRequest } = await import("./api");
    return gerizoDemoRequest(input, init);
  }
  return fetch(input, init);
}

function assinarUrl(callback: () => void) {
  window.addEventListener(EVENTO_URL, callback); window.addEventListener("popstate", callback);
  return () => { window.removeEventListener(EVENTO_URL, callback); window.removeEventListener("popstate", callback); };
}
function lerUrl() { return window.location.pathname + window.location.search; }

export function useDemoLocation() {
  const pathname = useNextPathname();
  return React.useSyncExternalStore(assinarUrl, lerUrl, () => pathname);
}
export function useDemoMode() { return caminhoDemo(useDemoLocation().split("?")[0]); }
export function useGerizoPathname() { return caminhoLogico(useDemoLocation().split("?")[0]); }
export function useGerizoSearchParams() {
  const originais = useNextSearchParams();
  const url = useDemoLocation();
  return React.useMemo(() => caminhoDemo(url.split("?")[0]) ? new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "") : originais ?? new URLSearchParams(), [url, originais]);
}

function destino(url: string) {
  const parsed = new URL(url, typeof window === "undefined" ? "https://gerizo.invalid" : window.location.href);
  let path = caminhoLogico(parsed.pathname);
  if (path === "/") path = "/vendas/dia";
  if (!(ROTAS_DEMO as readonly string[]).includes(path)) return null;
  if (typeof window !== "undefined" && parsed.origin !== window.location.origin) return null;
  return DEMO_PREFIX + path + parsed.search + parsed.hash;
}

export function navegarDemo(url: string, replace = false) {
  const para = destino(url);
  if (!para) { avisarDemo("Esta tela está fora deste tour. Explore as áreas principais pelo menu."); return; }
  const estado = { ...window.history.state, gerizoDemo: true };
  if (replace) window.history.replaceState(estado, "", para); else window.history.pushState(estado, "", para);
  window.dispatchEvent(new Event(EVENTO_URL));
}

export function useGerizoRouter() {
  const router = useNextRouter();
  return React.useMemo(() => ({
    ...router,
    push: (url: string, options?: Parameters<typeof router.push>[1]) => { if (emDemo()) { navegarDemo(url); if (options?.scroll !== false) window.scrollTo({top: 0}); } else router.push(url, options); },
    replace: (url: string, options?: Parameters<typeof router.replace>[1]) => { if (emDemo()) navegarDemo(url, true); else router.replace(url, options); },
    refresh: () => { if (emDemo()) window.dispatchEvent(new Event(EVENTO_REFRESH)); else router.refresh(); },
    prefetch: (...args: Parameters<typeof router.prefetch>) => { if (!emDemo()) return router.prefetch(...args); },
    back: () => { if (!emDemo()) return router.back(); if (window.history.state?.gerizoDemo) window.history.back(); else navegarDemo("/vendas/dia", true); },
    forward: () => { if (!emDemo()) router.forward(); },
  }), [router]);
}

function textoHref(href: React.ComponentProps<typeof NextLink>["href"]): string {
  if (typeof href === "string") return href;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(href.query ?? {})) if (value != null) {
    if (Array.isArray(value)) value.forEach(v => query.append(key, String(v))); else query.set(key, String(value));
  }
  return (href.pathname ?? "/") + (query.size ? "?" + query : "") + (href.hash ?? "");
}

async function clicarDestino(event: React.MouseEvent<HTMLAnchorElement>, href: string, replace?: boolean) {
  if (event.defaultPrevented || !emDemo() || href.startsWith("#") || href.startsWith("blob:") || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  if (new URL(href, window.location.href).pathname.startsWith("/api/")) {
    const r = await gerizoFetch(href);
    if (!r.ok) { const data = await r.json().catch(() => null); avisarDemo(data?.erro ?? "Esta ação não está disponível neste exemplo."); return; }
    const url = URL.createObjectURL(await r.blob());
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = r.headers.get("content-disposition")?.match(/filename="?([^";]+)/)?.[1] ?? "gerizo-demonstracao.csv";
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  navegarDemo(href, replace);
}

export const DemoLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof NextLink>>(function DemoLink(props, ref) {
  const demo = useDemoMode();
  if (!demo) return <NextLink {...props} ref={ref} />;
  const { href, children, onClick, replace, prefetch, scroll, shallow, locale, as, onNavigate, legacyBehavior, passHref, ...rest } = props;
  void prefetch; void scroll; void shallow; void locale; void as; void onNavigate; void legacyBehavior; void passHref;
  const texto = textoHref(href);
  const endereco = texto.startsWith("#") || texto.startsWith("blob:") ? texto : destino(texto) ?? "#fora-deste-tour";
  return <a {...rest} ref={ref} href={endereco} onClick={event => { onClick?.(event); void clicarDestino(event, texto, replace); }}>{children}</a>;
});

export const DemoAnchor = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(function DemoAnchor({ href, onClick, ...props }, ref) {
  const demo = useDemoMode();
  const endereco = !demo || !href || href.startsWith("#") || href.startsWith("blob:") ? href : destino(href) ?? "#fora-deste-tour";
  return <a {...props} ref={ref} href={endereco} onClick={event => { onClick?.(event); if (href) void clicarDestino(event, href); }} />;
});
