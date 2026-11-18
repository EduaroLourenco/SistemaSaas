import type { Metadata } from "next";
import { MarketingPage } from "@/components/comercial/marketing-page";

export const metadata: Metadata = { title: "Gerizo — clareza para decidir, ritmo para operar", description: "Conheça o Gerizo e explore uma operação de demonstração com vendas, anúncios, promoções, financeiro e envios." };
export default function Conheca() { return <MarketingPage />; }
