import type { Metadata } from "next";
import { MarketingPage } from "@/components/comercial/marketing-page";

export const metadata: Metadata = { title: "Gerizo — venda com visão de negócio", description: "Vendas, anúncios, promoções, custos e planejamento na mesma operação. Explore as telas do Gerizo com dados fictícios e um guia passo a passo." };
export default function Conheca() { return <MarketingPage />; }
