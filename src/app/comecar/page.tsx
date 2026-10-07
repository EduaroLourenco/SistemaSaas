import { Brand } from "@/components/ui/brand";
import { redirect } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { CriarEmpresa } from "./criar-empresa";

export const dynamic = "force-dynamic";

/**
 * Primeiro acesso de quem ainda não pertence a nenhuma empresa.
 *
 * Existe porque quem se cadastra e não tem `membros` cai num sistema que
 * parece quebrado: todas as telas em branco, sem erro, porque o RLS filtra
 * tudo corretamente. Melhor perguntar o que falta do que mostrar o vazio.
 */
export default async function Comecar() {
  const sb = await clienteServidor();
  const { data: sessao } = await sb.auth.getUser();
  if (!sessao?.user) redirect("/entrar?destino=/comecar");

  const { data: membros } = await sb.from("membros").select("organizacao_id").limit(1);
  if (membros?.length) redirect("/");

  const sugestao =
    (sessao.user.user_metadata?.empresa as string | undefined)?.trim() ?? "";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-ground">
      <div className="w-full max-w-[360px]">
        {/* Marca oficial: estas telas são as primeiras que o cliente vê. */}
        <div className="mb-7">
          <Brand descriptor />
        </div>

        <h1 className="text-[19px] font-semibold text-ink tracking-tight">
          Vamos criar sua empresa
        </h1>
        <p className="text-[13px] text-ink-2 mt-1 mb-6">
          Você entra como proprietário. A primeira operação é criada junto, e
          depois você conecta os canais de venda.
        </p>

        <CriarEmpresa sugestao={sugestao} />

        <p className="text-[12px] text-ink-3 mt-6 leading-relaxed">
          Recebeu um convite para uma empresa que já existe? Abra o link do
          convite em vez de criar outra.
        </p>
      </div>
    </main>
  );
}
