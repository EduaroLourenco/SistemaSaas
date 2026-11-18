/**
 * O que o perfil Expedição pode abrir.
 *
 * A lista é de permissão: tela ou API nova nasce fechada para esse perfil.
 * O cookie só serve para a moldura da tela; quem decide é o banco.
 */

export const COOKIE_EXPEDICAO = "gerizo_expedicao";
export const TELA_EXPEDICAO = "/mercado-livre/envios";

const LIBERADAS = [TELA_EXPEDICAO, "/api/envios", "/api/atualizar", "/api/operacao", "/api/sair", "/_next"];

export const rotaDaExpedicao = (caminho: string) =>
  LIBERADAS.some((r) => caminho === r || caminho.startsWith(`${r}/`));
