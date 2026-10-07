"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { Button } from "@/components/ui/primitives";
import { Loader2, MailCheck } from "lucide-react";

/**
 * Cadastro da empresa que contrata.
 *
 * O nome da empresa vai no metadado do usuário, não numa chamada logo em
 * seguida: quando a confirmação de e-mail está ligada, não existe sessão
 * ao fim deste formulário, e uma chamada aqui morreria sem autenticação.
 * Quem cria a organização é `/comecar`, no primeiro acesso com sessão.
 */
export default function Cadastro() {
  const router = useRouter();
  const busca = useSearchParams();

  /*
   * Vindo de um convite, o e-mail chega preenchido e `destino` diz para onde
   * voltar depois de confirmar. Digitar outro e-mail aqui não é impedido:
   * quem recusa é `aceitar_convite`, e a mensagem de lá é mais exata do que
   * um palpite desta tela.
   */
  const convidado = busca.get("email") ?? "";
  const destino = busca.get("destino");
  /* Quem veio de um convite e JÁ tem conta volta para o convite depois de
     entrar — sem isto o link do convite se perde no meio do caminho. */
  const paraLogin = destino ? "/entrar?destino=" + encodeURIComponent(destino) : "/entrar";

  const [nome, setNome] = React.useState("");
  const [empresa, setEmpresa] = React.useState("");
  const [email, setEmail] = React.useState(convidado);
  const [senha, setSenha] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [confirme, setConfirme] = React.useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha precisa de pelo menos 8 caracteres.");
      return;
    }
    setEnviando(true);

    const sb = clienteNavegador();
    const { data, error } = await sb.auth.signUp({
      email,
      password: senha,
      options: {
        data: { full_name: nome.trim(), empresa: empresa.trim() },
        // Volta ao convite depois de confirmar, em vez de cair na raiz e
        // deixar a pessoa procurando o link no e-mail outra vez.
        ...(destino ? { emailRedirectTo: window.location.origin + destino } : {}),
      },
    });

    if (error) {
      setErro(
        error.message.toLowerCase().includes("already")
          ? "Já existe conta com esse e-mail. Entre, ou use outro endereço."
          : error.message
      );
      setEnviando(false);
      return;
    }

    // Com confirmação de e-mail ligada, `session` vem nula: a pessoa ainda
    // não está dentro, e mandá-la para o sistema mostraria tela de login.
    if (!data.session) {
      setConfirme(true);
      setEnviando(false);
      return;
    }

    router.refresh();
    router.push("/comecar");
  }

  if (confirme) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-ground">
        <div className="w-full max-w-[340px]">
          <MailCheck className="w-7 h-7 text-brand" strokeWidth={1.75} />
          <h1 className="text-[19px] font-semibold text-ink tracking-tight mt-4">
            Confirme seu e-mail
          </h1>
          <p className="text-[13px] text-ink-2 mt-1.5">
            Mandamos um link para <span className="font-medium text-ink">{email}</span>.
            Abra o link e a empresa <span className="font-medium text-ink">{empresa}</span> é
            criada no primeiro acesso.
          </p>
          <Link
            href={paraLogin}
            className="text-[13px] font-medium text-brand hover:underline mt-5 inline-block"
          >
            Ir para o login
          </Link>
        </div>
      </main>
    );
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
          Criar conta da empresa
        </h1>
        <p className="text-[13px] text-ink-2 mt-1 mb-6">
          Você entra como proprietário e convida o time depois.
        </p>

        <form onSubmit={criar} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="label">Seu nome</span>
            <input
              required
              autoFocus
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="h-10 px-3 rounded-r1 bg-panel border border-line text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="label">Nome da empresa</span>
            <input
              required
              autoComplete="organization"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              className="h-10 px-3 rounded-r1 bg-panel border border-line text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="label">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 px-3 rounded-r1 bg-panel border border-line text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="label">Senha</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="h-10 px-3 rounded-r1 bg-panel border border-line text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash"
            />
            <span className="text-[12px] text-ink-3">Pelo menos 8 caracteres.</span>
          </label>

          {erro && (
            <p
              role="alert"
              className="text-[12.5px] text-down bg-down-wash border border-down/20 rounded-r1 px-2.5 py-2"
            >
              {erro}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={enviando} className="h-10 mt-1 justify-center">
            {enviando ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Criando
              </>
            ) : (
              "Criar conta"
            )}
          </Button>
        </form>

        <p className="text-[12.5px] text-ink-3 mt-5">
          Já tem conta?{" "}
          <Link href={paraLogin} className="font-medium text-brand hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
