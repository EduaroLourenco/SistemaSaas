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
  appleWebApp: {
    capable: true,
    title: "gerizo",
    statusBarStyle: "default",
    /*
     * Imagem de abertura do iPhone: cobre o instante em que o servidor
     * ainda não respondeu nada — antes, branco puro. O iOS só usa a imagem
     * do tamanho exato do aparelho, daí uma por modelo.
     */
    startupImage: [
      [1320, 2868, 440, 956, 3], [1206, 2622, 402, 874, 3], [1290, 2796, 430, 932, 3],
      [1179, 2556, 393, 852, 3], [1284, 2778, 428, 926, 3], [1170, 2532, 390, 844, 3],
      [1125, 2436, 375, 812, 3], [1242, 2688, 414, 896, 3], [828, 1792, 414, 896, 2],
      [750, 1334, 375, 667, 2],
    ].map(([w, h, dw, dh, dpr]) => ({
      url: `/brand/abertura/${w}x${h}.png`,
      media: `(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
    })),
  },
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
