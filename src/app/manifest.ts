import type { MetadataRoute } from "next";

/**
 * Manifesto para "Adicionar à tela inicial" (Android e Chrome): nome curto
 * "gerizo" e o "g." oficial sobre fundo branco, abrindo em tela cheia.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gerizo · Inteligência de mercado",
    short_name: "gerizo",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/brand/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
