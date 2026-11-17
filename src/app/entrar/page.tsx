"use client";

import * as React from "react";
import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import { useRouter } from "next/navigation";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { Button } from "@/components/ui/primitives";
import { Loader2, Eye, EyeOff, ArrowUpRight } from "lucide-react";
import { iniciarCarregando } from "@/components/layout/carregando-gerizo";

/**
 * Entrada do sistema.
 *
 * Sem "criar conta" de propósito: acesso aqui é concedido por quem já está
 * dentro, não pedido de fora. Um cadastro aberto num painel de operação é
 * porta que ninguém lembra de fechar.
 */
export default function Entrar() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [mostrarSenha, setMostrarSenha] = React.useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    // Lido aqui, e não com useSearchParams(): aquele hook obriga o Next a
    // desistir da renderização no servidor, e o login — a primeira tela que
    // qualquer pessoa vê — subia em branco até o JavaScript chegar.
    const destino =
      new URLSearchParams(window.location.search).get("destino") || "/";

    const sb = clienteNavegador();
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });

    if (error) {
      // A mensagem do Supabase vem em inglês e é genérica de propósito —
      // não diz se o e-mail existe. Mantemos a discrição, em português.
      setErro(
        error.message.toLowerCase().includes("invalid")
          ? "E-mail ou senha incorretos."
          : error.message
      );
      setEnviando(false);
      return;
    }

    // A Visão geral demora a montar na primeira entrada: a marca segura a
    // espera e some sozinha quando a tela nova chega.
    iniciarCarregando("navegacao");
    // refresh() antes de push() para o middleware enxergar o cookie novo.
    router.refresh();
    router.push(destino);
  }

  return (
    <main className="gerizo-entry gerizo-entry--renewed">
      <section className="gerizo-entry-access">
      <div className="w-full max-w-[380px]">
        {/* Marca oficial: estas telas são as primeiras que o cliente vê. */}
        <div className="mb-12">
          <Brand descriptor />
        </div>

        <h1 className="text-[32px] font-semibold text-ink tracking-tight">
          Entrar
        </h1>
        <p className="text-[13px] text-ink-2 mt-1 mb-6">
          Acesse sua empresa.
        </p>

        <form onSubmit={entrar} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="label">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 px-3 rounded-r1 bg-panel border border-line text-[14px] text-ink
                         outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha" className="label">Senha</label>
            <span className="relative flex">
            <input
              id="senha"
              type={mostrarSenha ? "text" : "password"}
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="h-10 w-full pl-3 pr-12 rounded-r1 bg-panel border border-line text-[14px] text-ink
                         outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash"
            />
            <button type="button" aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"} aria-pressed={mostrarSenha} onClick={() => setMostrarSenha(!mostrarSenha)} className="absolute right-0 top-0 h-10 w-11 grid place-items-center text-ink-2">
              {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            </span>
          </div>

          {erro && (
            <p
              role="alert"
              className="text-[12.5px] text-down bg-down-wash border border-down/20 rounded-r1 px-2.5 py-2"
            >
              {erro}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={enviando}
            className="h-10 mt-1 justify-center"
          >
            {enviando ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Entrando
              </>
            ) : (
              <>Entrar <ArrowUpRight size={17} /></>
            )}
          </Button>
        </form>

        <p className="text-[12px] text-ink-3 mt-6 leading-relaxed">
          Sem acesso? Peça a quem administra a operação — contas são criadas
          por dentro do sistema.
        </p>
        <nav aria-label="Informações legais" className="mt-8 flex gap-5 border-t border-line pt-4 text-[12px] text-ink-3"><Link className="inline-flex min-h-11 items-center hover:text-ink" href="/privacidade">Privacidade</Link><Link className="inline-flex min-h-11 items-center hover:text-ink" href="/termos">Termos de uso</Link></nav>
      </div>
      </section>
      <section className="gerizo-entry-story" aria-labelledby="entry-story-title">
        <p className="text-[14px] font-medium text-ink-2">Inteligência de mercado</p>
        <div>
          <div className="entry-composition" aria-hidden="true"><i /><i /><i /><span /></div>
          <h2 id="entry-story-title">Clareza para<br />cada decisão<span>.</span></h2>
          <p>Sua operação de e-commerce, em perspectiva.</p>
        </div>
        <p className="text-[12px] text-ink-3">Gerizo</p>
      </section>
    </main>
  );
}
