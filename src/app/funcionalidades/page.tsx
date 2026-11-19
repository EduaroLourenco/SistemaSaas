import type { Metadata } from "next";
import { FeatureCatalogue } from "@/components/comercial/feature-catalogue";

export const metadata: Metadata = { title: "Funcionalidades do Gerizo", description: "Conheça as áreas do Gerizo, veja os vídeos de cada funcionalidade e explore a demonstração com dados fictícios." };
export default async function Funcionalidades({ searchParams }: { searchParams: Promise<{ video?: string; categoria?: string }> }) {
  const query = await searchParams;
  return <FeatureCatalogue initialId={query.video} initialCategory={query.categoria}/>;
}
