import type { Metadata } from "next";
import DemoApp from "@/components/comercial/demo-app";
import { TELAS_DEMO, type TelaDemo } from "@/lib/demo/modelo";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Explore o Gerizo — demonstração", description: "Explore uma operação fictícia com dois canais e dados de exemplo. Nenhuma conta de cliente é acessada.", robots: { index: false, follow: true } };

export default async function Demonstracao({ params, searchParams }: { params: Promise<{ tela?: string[] }>; searchParams: Promise<{ tour?: string }> }) {
  const [{ tela }, query] = await Promise.all([params, searchParams]);
  const nome = tela?.[0] ?? "hoje";
  if ((tela?.length ?? 0) > 1 || !TELAS_DEMO.some(t => t.id === nome)) notFound();
  return <DemoApp telaInicial={nome as TelaDemo} iniciarTour={query.tour === "1"} />;
}
