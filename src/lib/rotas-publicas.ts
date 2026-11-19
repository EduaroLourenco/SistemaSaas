/** Páginas comerciais não carregam contexto nem dados de uma empresa. */
export function paginaComercial(caminho: string) {
  return caminho === "/" || caminho === "/conheca" || caminho === "/funcionalidades" || caminho === "/demonstracao" || caminho.startsWith("/demonstracao/");
}
