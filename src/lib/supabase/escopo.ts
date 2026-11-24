import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Operacao } from "@/lib/dados/operacao";

/**
 * A sessão e a empresa de quem pediu uma tela em cache.
 *
 * Dentro de `unstable_cache` o Next proíbe ler cookie. `clienteServidor()`
 * e `operacaoPadrao()` olham aqui primeiro: com escopo, o cliente usa o
 * token do próprio usuário (o RLS continua valendo) e a empresa já
 * resolvida fora do cache. Ver `src/lib/cache-tela.ts`.
 */
export const escopoCache = new AsyncLocalStorage<{ token: string; operacao: Operacao }>();
