/**
 * Freio de consumo da API do Mercado Livre.
 *
 * Existe por um motivo específico: esta plataforma usa a MESMA aplicação
 * dos agentes que já rodavam antes dela. O limite de chamadas do Mercado
 * Livre é contado POR APLICAÇÃO, não por sistema — então uma rajada daqui
 * gasta a cota de lá, e os agentes começam a tomar HTTP 429 sem ninguém
 * entender por quê.
 *
 * O freio é deliberadamente conservador. A plataforma é uma tela que um
 * humano abre algumas vezes por dia; os agentes são o que não pode parar.
 * Na dúvida sobre quem espera, é esta plataforma que espera.
 */

/** Teto de chamadas por segundo desta plataforma. */
const POR_SEGUNDO = 4;
/** Rajada tolerada antes de o freio começar a espaçar. */
const BALDE = 8;

const g = globalThis as unknown as {
  __meliLimite?: { fichas: number; ultimo: number; fila: Promise<void> };
};

function estado() {
  g.__meliLimite = g.__meliLimite ?? {
    fichas: BALDE,
    ultimo: Date.now(),
    fila: Promise.resolve(),
  };
  return g.__meliLimite;
}

function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Segura a chamada até haver ficha disponível.
 *
 * As chamadas entram numa fila em série de propósito. Um balde sem fila
 * deixa dez requisições concorrentes lerem `fichas` ao mesmo tempo, todas
 * acharem que sobra e passarem juntas — que é exatamente a rajada que o
 * freio deveria impedir.
 */
export async function aguardarVez(): Promise<void> {
  const e = estado();
  const minha = e.fila.then(async () => {
    const agora = Date.now();
    e.fichas = Math.min(
      BALDE,
      e.fichas + ((agora - e.ultimo) / 1000) * POR_SEGUNDO
    );
    e.ultimo = agora;

    if (e.fichas < 1) {
      const esperaMs = ((1 - e.fichas) / POR_SEGUNDO) * 1000;
      await dormir(esperaMs);
      e.fichas = 1;
      e.ultimo = Date.now();
    }
    e.fichas -= 1;
  });

  // A fila não pode morrer se uma espera falhar.
  e.fila = minha.catch(() => {});
  return minha;
}

/**
 * Caminhos que esta plataforma tem permissão de tocar.
 *
 * Lista de permissão, não de proibição. Uma lista de proibição erra por
 * omissão: basta o Mercado Livre lançar um endpoint novo e ele já nasce
 * liberado. Aqui o que não foi previsto é recusado, e recusar de leve é
 * barato — some no primeiro teste.
 */
const PERMITIDOS = [
  /^\/users\/me$/,
  // /users/{id}/items/search e /users/{id}/items_visits
  /^\/users\/\d+\/items(_visits|\/search)$/,
  // multiget de anúncios e detalhe de um anúncio
  /^\/items$/,
  /^\/items\/[A-Z]{3}\d+(\/shipping_options)?$/i,
  // o site é parâmetro: MLB no Brasil, mas não fica preso a ele
  /^\/sites\/[A-Z]{3}\/search$/,
  // /orders/search e /orders/search/recent
  /^\/orders\/search(\/recent)?$/,
];

export class MeliBloqueado extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "MeliBloqueado";
  }
}

/**
 * Recusa qualquer chamada que não seja leitura prevista.
 *
 * A plataforma compartilha credencial com os agentes, e credencial
 * compartilhada significa que um bug daqui vira estrago lá. Uma escrita
 * acidental num anúncio — preço, estoque, status — não seria um bug desta
 * tela: seria um anúncio errado no ar.
 *
 * Por isso o corte é no cliente, e não na disciplina de quem escreve as
 * rotas. Disciplina esquece; guarda não.
 */
export function autorizarLeitura(caminho: string, metodo = "GET") {
  if (metodo.toUpperCase() !== "GET") {
    throw new MeliBloqueado(
      `Bloqueado: esta plataforma é somente leitura e tentou ${metodo} em ${caminho}. ` +
        "A credencial é compartilhada com os agentes — escrita aqui vira estrago lá."
    );
  }

  const limpo = caminho.split("?")[0];
  if (!PERMITIDOS.some((p) => p.test(limpo))) {
    throw new MeliBloqueado(
      `Bloqueado: ${limpo} não está na lista de leitura permitida. ` +
        "Se for um endpoint legítimo, acrescente em src/lib/meli/limite.ts."
    );
  }
}
