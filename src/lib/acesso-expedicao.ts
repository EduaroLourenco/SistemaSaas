/**
 * O que os perfis de tela única podem abrir: Expedição (Envios) e
 * Acompanhamento (Pedidos).
 *
 * A lista é de permissão: tela ou API nova nasce fechada para esses perfis.
 * O cookie só serve para a moldura da tela; quem decide é o banco.
 */

export const COOKIE_EXPEDICAO = "gerizo_expedicao";
export const TELA_EXPEDICAO = "/mercado-livre/envios";

export type PerfilRestrito = "expedicao" | "acompanhamento";

const COMUNS = ["/api/atualizar", "/api/operacao", "/api/sair", "/_next"];
export const TELA_DO_PERFIL: Record<PerfilRestrito, string> = {
  expedicao: TELA_EXPEDICAO,
  acompanhamento: "/mercado-livre/pedidos",
};
const LIBERADAS: Record<PerfilRestrito, string[]> = {
  expedicao: [TELA_EXPEDICAO, "/api/envios", ...COMUNS],
  acompanhamento: [TELA_DO_PERFIL.acompanhamento, "/api/pedidos", ...COMUNS],
};

export const rotaDoPerfil = (perfil: PerfilRestrito, caminho: string) =>
  LIBERADAS[perfil].some((r) => caminho === r || caminho.startsWith(`${r}/`));



