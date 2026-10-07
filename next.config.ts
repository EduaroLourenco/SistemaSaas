import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
     * Cache do navegador para telas dinâmicas: voltar a uma tela aberta nos
     * últimos 2 minutos não vai ao banco de novo. O padrão desta versão é 0
     * — toda navegação refazia todas as consultas.
     *
     * Seguro em multiempresa porque mora no navegador de cada pessoa, e o
     * que muda o dado limpa o cache: trocar de empresa no seletor, importar
     * planilha e salvar formulário chamam router.refresh().
     */
    staleTimes: {
      dynamic: 120,
    },
  },
};

export default nextConfig;
