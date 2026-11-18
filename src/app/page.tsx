import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { clienteServidor } from "@/lib/supabase/servidor";
import { MarketingPage } from "@/components/comercial/marketing-page";

/** Visitantes veem o site comercial. A sessão válida mantém a entrada na
 * rotina, com a verificação de empresa e o acesso por usuário existentes. */
export const dynamic = "force-dynamic";

export default async function Pagina() {
  const cookieStore = await cookies();
  const temSessao = cookieStore.getAll().some(c => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!temSessao) return <MarketingPage />;
  const sb = await clienteServidor();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return <MarketingPage />;
  const { data: membros } = await sb.from("membros").select("organizacao_id").limit(1);
  if (!membros?.length) redirect("/comecar");

  /* A entrada é o dia. A análise de 30 dias mora em /vendas/periodo. */
  redirect("/vendas/dia");
}
