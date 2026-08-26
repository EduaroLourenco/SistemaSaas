"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { Button } from "@/components/ui/primitives";
import { Loader2 } from "lucide-react";

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

    // refresh() antes de push() para o middleware enxergar o cookie novo.
    router.refresh();
    router.push(destino);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-ground">
      <div className="w-full max-w-[340px]">
        <div className="flex items-center gap-2 mb-7">
          <span className="w-7 h-7 rounded-r1 bg-ink text-ground flex items-center justify-center shrink-0">
            <span className="text-[13px] font-bold leading-none">▟</span>
          </span>
          <span className="text-[15px] font-semibold text-ink">Plataforma</span>
        </div>

        <h1 className="text-[19px] font-semibold text-ink tracking-tight">
          Entrar
        </h1>
        <p className="text-[13px] text-ink-2 mt-1 mb-6">
          Acesso à operação de e-commerce.
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

          <label className="flex flex-col gap-1.5">
            <span className="label">Senha</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="h-10 px-3 rounded-r1 bg-panel border border-line text-[14px] text-ink
                         outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash"
            />
          </label>

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
              "Entrar"
            )}
          </Button>
        </form>

        <p className="text-[12px] text-ink-3 mt-6 leading-relaxed">
          Sem acesso? Peça a quem administra a operação — contas são criadas
          por dentro do sistema.
        </p>
      </div>
    </main>
  );
}
