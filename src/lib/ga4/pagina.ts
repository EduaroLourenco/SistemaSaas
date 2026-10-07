import { NextResponse } from "next/server";

/** Cookie com a metade secreta do `state` da autorização do Google. */
export const COOKIE_GA4 = "ga4_oauth";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Página simples de resultado da conexão — mesmo desenho da do Mercado
 * Livre. `corpoHtml` já vem montado por quem chama; texto de fora (nome de
 * propriedade, mensagem do Google) passa por `esc` antes.
 */
export function pagina(titulo: string, corpoHtml: string, ok: boolean) {
  const r = new NextResponse(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${esc(titulo)}</title>
     <body style="font:16px/1.6 system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#0f1216;color:#e8ecf1">
       <main style="max-width:34rem;padding:2rem">
         <h1 style="font-size:1.4rem;margin:0 0 .75rem;color:${ok ? "#4ade80" : "#f87171"}">${esc(titulo)}</h1>
         <div style="margin:0 0 1.5rem;color:#b6bec9">${corpoHtml}</div>
         <a href="/integracoes/canais" style="color:#7dd3fc">Voltar para Canais e contas</a>
       </main>
     </body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } }
  );
  r.cookies.delete(COOKIE_GA4);
  return r;
}

export { esc };
