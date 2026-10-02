import "server-only";
import { RECURSOS as FINANCEIROS } from "./cadastros-financeiros";
import { RECURSOS_CANAL } from "./cadastros-canal";

/**
 * Todo cadastro que a rota genérica atende.
 *
 * A rota fica em `/api/cadastros/[recurso]` e resolve operação, permissão e
 * validação num lugar só. Um cadastro novo entra declarando seus campos
 * aqui, não escrevendo outra rota — rota nova é onde se esquece a checagem
 * de operação, que é a que impede gravar na empresa do vizinho.
 */
export const RECURSOS = { ...FINANCEIROS, ...RECURSOS_CANAL };
