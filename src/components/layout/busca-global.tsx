"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { NAV, NAV_FOOTER } from "@/lib/nav";
import { ANUNCIOS_ANALISE } from "@/mock/analise";
import { CANAIS } from "@/mock";
import { TERMOS } from "@/mock/sistema";
import { Search, CornerDownLeft, X } from "lucide-react";

/**
 * Busca global — abre com `/` ou Ctrl+K.
 *
 * O ponto dela não é achar tela: o menu já faz isso. É digitar um MLB ou
 * um SKU de qualquer lugar do sistema e cair direto no anúncio, sem passar
 * por Anúncios → Análise → filtrar → procurar na tabela.
 */

type Achado = {
  tipo: "anuncio" | "tela" | "canal" | "termo";
  rotulo: string;
  detalhe: string;
  href: string;
};

const ROTULO_TIPO: Record<Achado["tipo"], string> = {
  anuncio: "Anúncio",
  tela: "Tela",
  canal: "Canal",
  termo: "Glossário",
};

/** Índice montado uma vez: telas, anúncios, canais e termos do glossário. */
function montarIndice(): Achado[] {
  const telas: Achado[] = [
    ...NAV.flatMap((g) =>
      g.href
        ? [{ tipo: "tela" as const, rotulo: g.label, detalhe: "", href: g.href }]
        : (g.items ?? []).map((i) => ({
            tipo: "tela" as const,
            rotulo: i.label,
            detalhe: g.label,
            href: i.href,
          }))
    ),
    ...NAV_FOOTER.map((g) => ({
      tipo: "tela" as const,
      rotulo: g.label,
      detalhe: "",
      href: g.href ?? "/",
    })),
  ];

  const anuncios: Achado[] = ANUNCIOS_ANALISE.map((a) => ({
    tipo: "anuncio" as const,
    rotulo: a.titulo,
    detalhe: `${a.mlb} · ${a.sku} · ${a.conta}`,
    href: `/anuncios/analise?anuncio=${a.mlb}`,
  }));

  const canais: Achado[] = CANAIS.map((c) => ({
    tipo: "canal" as const,
    rotulo: c.nome,
    detalhe: "Vendas por canal",
    href: "/vendas/canais",
  }));

  const termos: Achado[] = TERMOS.map((t) => ({
    tipo: "termo" as const,
    rotulo: t.termo + (t.sigla ? ` (${t.sigla})` : ""),
    detalhe: t.definicao,
    href: "/glossario",
  }));

  return [...anuncios, ...telas, ...canais, ...termos];
}

export function BuscaGlobal() {
  const router = useRouter();
  const [aberta, setAberta] = React.useState(false);
  const [termo, setTermo] = React.useState("");
  const [ativo, setAtivo] = React.useState(0);
  const campo = React.useRef<HTMLInputElement>(null);

  const indice = React.useMemo(montarIndice, []);

  // `/` e Ctrl+K abrem. `/` só quando não se está digitando em outro campo.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando =
        alvo?.tagName === "INPUT" ||
        alvo?.tagName === "TEXTAREA" ||
        alvo?.isContentEditable;

      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !digitando)) {
        e.preventDefault();
        setAberta(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (aberta) {
      setTermo("");
      setAtivo(0);
      // espera a folha montar para focar
      const t = setTimeout(() => campo.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [aberta]);

  const achados = React.useMemo(() => {
    const q = termo.trim().toLowerCase();
    if (!q) return indice.filter((a) => a.tipo === "tela").slice(0, 8);

    const pontua = (a: Achado) => {
      const r = a.rotulo.toLowerCase();
      const d = a.detalhe.toLowerCase();
      // Começo do rótulo vale mais que meio; anúncio vale mais que glossário.
      let p = 0;
      if (r.startsWith(q)) p += 100;
      else if (r.includes(q)) p += 60;
      if (d.includes(q)) p += 30;
      if (a.tipo === "anuncio") p += 15;
      if (a.tipo === "tela") p += 10;
      return p;
    };

    return indice
      .map((a) => ({ a, p: pontua(a) }))
      .filter((x) => x.p > 0)
      .sort((x, y) => y.p - x.p)
      .slice(0, 12)
      .map((x) => x.a);
  }, [termo, indice]);

  function ir(a: Achado) {
    setAberta(false);
    router.push(a.href);
  }

  function onKeyCampo(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => Math.min(i + 1, achados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && achados[ativo]) {
      e.preventDefault();
      ir(achados[ativo]);
    } else if (e.key === "Escape") {
      setAberta(false);
    }
  }

  return (
    <>
      {/* gatilho no topo */}
      <button
        onClick={() => setAberta(true)}
        className="hidden lg:flex items-center gap-2 h-7 w-64 px-2.5 rounded-r1 border border-line text-ink-3 hover:bg-panel-3 transition-colors"
      >
        <Search className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[12px] flex-1 text-left">Buscar anúncio, tela, termo</span>
        <span className="num text-[10px] px-1 rounded-[3px] bg-panel-3 border border-line">
          /
        </span>
      </button>

      <button
        onClick={() => setAberta(true)}
        aria-label="Buscar"
        className="lg:hidden w-8 h-8 rounded-r1 flex items-center justify-center text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors"
      >
        <Search className="w-4 h-4" />
      </button>

      {aberta && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4">
          <div
            className="absolute inset-0"
            style={{ background: "var(--veil)" }}
            onClick={() => setAberta(false)}
          />

          <div
            className="relative w-full max-w-xl bg-panel border border-line rounded-r3 overflow-hidden"
            style={{ boxShadow: "var(--sh-3)" }}
          >
            <div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-line">
              <Search className="w-4 h-4 text-ink-3 shrink-0" />
              <input
                ref={campo}
                value={termo}
                onChange={(e) => {
                  setTermo(e.target.value);
                  setAtivo(0);
                }}
                onKeyDown={onKeyCampo}
                placeholder="MLB, SKU, título, tela ou termo do glossário"
                className="flex-1 h-full bg-transparent text-[14px] text-ink placeholder:text-ink-3 outline-none"
              />
              <button
                onClick={() => setAberta(false)}
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-r1 text-ink-3 hover:bg-panel-3 hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {achados.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[13px] text-ink-2">
                  Nada encontrado para{" "}
                  <span className="num text-ink">{termo}</span>
                </p>
                <p className="text-[12px] text-ink-3 mt-1">
                  Tente o código do anúncio, o SKU ou parte do título.
                </p>
              </div>
            ) : (
              <ul className="max-h-[52vh] overflow-y-auto py-1">
                {achados.map((a, i) => (
                  <li key={`${a.tipo}-${a.href}-${a.rotulo}`}>
                    <button
                      onClick={() => ir(a)}
                      onMouseEnter={() => setAtivo(i)}
                      className={
                        "w-full text-left px-3.5 py-2 flex items-center gap-3 transition-colors " +
                        (i === ativo ? "bg-brand-wash" : "hover:bg-panel-2")
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={
                            "block text-[13px] truncate " +
                            (i === ativo ? "text-brand font-medium" : "text-ink")
                          }
                        >
                          {a.rotulo}
                        </span>
                        {a.detalhe && (
                          <span className="num block text-[11px] text-ink-3 truncate">
                            {a.detalhe}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.04em] font-semibold text-ink-3 shrink-0">
                        {ROTULO_TIPO[a.tipo]}
                      </span>
                      {i === ativo && (
                        <CornerDownLeft
                          className="w-3.5 h-3.5 text-brand shrink-0"
                          strokeWidth={2}
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-4 px-3.5 h-9 border-t border-line bg-panel-2">
              <span className="num text-[11px] text-ink-3">↑ ↓ navegar</span>
              <span className="num text-[11px] text-ink-3">↵ abrir</span>
              <span className="num text-[11px] text-ink-3">esc fechar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
