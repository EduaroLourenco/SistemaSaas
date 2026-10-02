"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { createBrowserClient } from "@supabase/ssr";

/**
 * O botão que transforma o convite em acesso.
 *
 * `aceitar_convite` roda como a pessoa logada: é `auth.uid()` que vira o
 * membro. Por isso o aceite é daqui, com a sessão do navegador, e não de
 * uma rota com chave de serviço — que aceitaria em nome de qualquer um.
 */
export default function AceitarConvite({
  token,
  empresa,
  email,
  papel,
  meuEmail,
}: {
  token: string;
  empresa: string;
  email: string;
  papel: string;
  meuEmail: string;
}) {
  const router = useRouter();
  const [erro, setErro] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  const outroEmail = meuEmail.toLowerCase() !== email.toLowerCase();

  async function aceitar() {
    setErro(null);
    setOcupado(true);
    try {
      const sb = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { error } = await sb.rpc("aceitar_convite", { p_token: token });
      if (error) {
        setErro(error.message);
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 bg-canvas">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[18px] font-semibold text-ink">Entrar em {empresa}</h1>
          <p className="text-[13px] text-ink-2 leading-relaxed">
            Você entra como <b className="text-ink">{papel}</b>.
          </p>
        </div>

        {outroEmail && (
          <p className="text-[12px] text-warn leading-relaxed">
            O convite é para <b>{email}</b> e você está logado como <b>{meuEmail}</b>. Se o
            sistema recusar, saia e entre com o e-mail do convite.
          </p>
        )}

        {erro && <p className="text-[12.5px] text-down leading-relaxed">{erro}</p>}

        <Button variant="primary" onClick={aceitar} disabled={ocupado}>
          {ocupado ? "Entrando…" : "Aceitar convite"}
        </Button>
      </div>
    </main>
  );
}
