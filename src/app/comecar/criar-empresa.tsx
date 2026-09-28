"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { Button } from "@/components/ui/primitives";
import { Loader2 } from "lucide-react";

const CAMPO =
  "h-10 px-3 rounded-r1 bg-panel border border-line text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-wash";

export function CriarEmpresa({ sugestao }: { sugestao: string }) {
  const router = useRouter();
  const [nome, setNome] = React.useState(sugestao);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);

    const sb = clienteNavegador();
    const { error } = await sb.rpc("criar_organizacao", { p_nome: nome.trim() });

    if (error) {
      // Sem a migração 20 a função não existe, e o erro genérico do
      // PostgREST não ajudaria ninguém a descobrir isso.
      setErro(
        error.code === "PGRST202" || error.code === "42883"
          ? "Falta rodar db/20_cadastro_e_convites.sql no banco."
          : error.message
      );
      setEnviando(false);
      return;
    }

    router.refresh();
    router.push("/");
  }

  return (
    <form onSubmit={criar} className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1.5">
        <span className="label">Nome da empresa</span>
        <input
          required
          autoFocus
          autoComplete="organization"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={CAMPO}
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

      <Button type="submit" variant="primary" disabled={enviando} className="h-10 justify-center">
        {enviando ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Criando
          </>
        ) : (
          "Criar empresa"
        )}
      </Button>
    </form>
  );
}
