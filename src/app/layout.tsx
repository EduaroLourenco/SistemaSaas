import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { CarregandoGerizo } from "@/components/layout/carregando-gerizo";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Gerizo · Inteligência de mercado", template: "%s · Gerizo" },
  description: "Gerizo — Inteligência de mercado para e-commerce e marketplaces",
  /*
   * Os ícones vêm dos arquivos de convenção (app/icon.png e
   * app/apple-icon.png, o "g." oficial). Na tela inicial do celular o nome
   * é só "gerizo" — sem isto o iPhone usava o título inteiro e cortava em
   * "Gerizo·Intelig…" — e o app abre em tela cheia, sem a barra do Safari.
   */
  appleWebApp: { capable: true, title: "gerizo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#14171f" },
  ],
};

/** Aplica o tema salvo antes da primeira pintura — evita piscar. */
const noFlash = `
(function(){try{
  var t=localStorage.getItem("tema");
  if(t) document.documentElement.setAttribute("data-theme",t);
  var d=localStorage.getItem("densidade");
  if(d) document.documentElement.setAttribute("data-density",d);
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        {/* Fora da moldura: precisa valer no /entrar, que não tem menu. */}
        <CarregandoGerizo />
      </body>
    </html>
  );
}
