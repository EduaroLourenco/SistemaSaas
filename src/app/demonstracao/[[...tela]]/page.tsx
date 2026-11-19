import type { Metadata } from "next";
import DemoRealRenderer from "@/components/demo-real/renderer";
import { DEMO_PREFIX, ROTAS_DEMO, LEGADO_DEMO } from "@/lib/demo/rotas";
import { notFound, redirect } from "next/navigation";

export const metadata: Metadata = { title: "Explore o Gerizo — demonstração", description: "Explore uma operação fictícia com dois canais e dados de exemplo. Nenhuma conta de cliente é acessada.", robots: { index: false, follow: true } };

export default async function Demonstracao({ params, searchParams }: { params: Promise<{ tela?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ tela }, query] = await Promise.all([params, searchParams]);
  if (tela?.[0] !== "sistema") {
    const rota = !tela?.length ? "/vendas/dia" : LEGADO_DEMO[tela[0]];
    if (!rota || (tela?.length ?? 0) > 1) notFound();
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (typeof value === "string") q.set(key, value);
    redirect(DEMO_PREFIX + rota + (q.size ? "?" + q : ""));
  }
  const rota = "/" + tela.slice(1).join("/");
  if (rota === "/") redirect(DEMO_PREFIX + "/vendas/dia" + (query.tour === "1" ? "?tour=1" : ""));
  if (!(ROTAS_DEMO as readonly string[]).includes(rota)) notFound();
  return <DemoRealRenderer iniciarTour={query.tour === "1"} />;
}
